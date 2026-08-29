(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const matchByCanonicalId = new Map();
  const matchByLegacyKey = new Map();
  const cardState = new WeakMap();

  const norm = value => String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  const style = document.createElement('style');
  style.textContent = `
    .employer-card.match-enabled{position:relative;perspective:900px;overflow:hidden}
    .employer-card .match-card-inner{position:relative;min-width:0;transform-style:preserve-3d;transition:transform .34s cubic-bezier(.2,.75,.25,1)}
    .employer-card.match-flipped .match-card-inner{transform:rotateY(180deg)}
    .employer-card .match-card-face{min-width:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}
    .employer-card .match-card-front{position:relative}
    .employer-card .match-card-back{position:absolute;inset:0;overflow:auto;transform:rotateY(180deg);border:1px solid #30363d;background:#0d1117;padding:13px;box-sizing:border-box}
    .match-trigger,.match-back-button,.match-role-nav button{font:inherit;color:#c9d1d9;background:#161b22;border:1px solid #30363d;border-radius:999px;cursor:pointer}
    .match-trigger{padding:3px 7px;font-size:10px;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap}
    .match-trigger:hover,.match-back-button:hover,.match-role-nav button:hover{border-color:#6e7681;color:#f0f6fc}
    .match-trigger::before{content:'★';margin-right:4px;font-size:9px}
    .match-back-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
    .match-back-button{padding:3px 7px;font-size:10px}.match-level{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:#8b949e;margin:0 0 4px}
    .match-role-title{font-size:15px;line-height:1.25;margin:0;color:#f0f6fc}.match-role-meta{font-size:11px;color:#8b949e;margin:5px 0 0}
    .match-case{font-size:12px;line-height:1.55;color:#c9d1d9;margin:12px 0}.match-signal-list,.match-caveat-list{font-size:11px;line-height:1.45;color:#c9d1d9;padding-left:18px;margin:8px 0}
    .match-section-label{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#8b949e;margin:10px 0 2px}
    .match-role-nav{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px}.match-role-nav button{width:28px;height:24px;padding:0}.match-role-count{font-size:10px;color:#8b949e}
    .match-links{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.match-links a{font-size:10px}
    .sphere-employer .sphere-match-dot{position:absolute;right:6px;top:5px;z-index:4;display:grid;place-items:center;width:16px;height:16px;border-radius:50%;border:1px solid rgba(139,148,158,.65);background:rgba(13,17,23,.86);font-size:9px;color:#e3b341;box-shadow:0 1px 4px rgba(0,0,0,.35)}
    @media(prefers-reduced-motion:reduce){.employer-card .match-card-inner{transition:none}}
  `;
  document.head.appendChild(style);

  function indexMatches(data) {
    matchByCanonicalId.clear(); matchByLegacyKey.clear();
    for (const employer of data?.employers || []) {
      if (!employer?.match) continue;
      const canonicalId = String(employer.match.employer_canonical_id || '').trim();
      const legacyKey = norm(employer.match.employer_key || employer.normalised_name_key);
      if (canonicalId) addUnique(matchByCanonicalId, canonicalId, employer.match);
      else if (legacyKey) addUnique(matchByLegacyKey, legacyKey, employer.match);
    }
    decorateAll();
  }
  function addUnique(index,key,match){if(!key)return;if(index.has(key)){index.set(key,null);return;}index.set(key,match);}

  window.fetch = async function matchAwareFetch(input, init) {
    const response = await nativeFetch(input, init); const href = typeof input === 'string' ? input : input?.url; let pathname='';
    try{pathname=new URL(href||'',location.href).pathname;}catch(_){}
    if(response.ok&&pathname.endsWith('/employers.json')){try{indexMatches(await response.clone().json());}catch(_){}}
    return response;
  };

  function matchForCard(card){const id=String(card.dataset.employerCanonicalId||'').trim();if(id)return matchByCanonicalId.get(id)||null;const key=norm(card.dataset.employerKey);return key?(matchByLegacyKey.get(key)||null):null;}
  function link(label,url){return url?`<a class="pill-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:'';}
  function list(items, cls){return Array.isArray(items)&&items.length?`<ul class="${cls}">${items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:'';}

  function renderBack(card, match, index) {
    const roles = match.roles || []; const role = roles[index]; const back = card.querySelector('.match-card-back'); if(!back)return;
    const companyOnly = !role;
    const level = String((role?.match_level || match.alignment_level || 'strong')).replace(/_/g,' ');
    const sourceState = role ? (role.source_state === 'crawler_confirmed' ? 'ATS confirmed' : 'manual match') : 'company alignment';
    const title = role?.title || 'Why this company?';
    const meta = role?.location || (match.alignment_type === 'company_resonator' ? 'Company resonator' : 'Curated alignment');
    const summary = role?.summary || match.summary || '';
    const refs = match.notes_refs?.length ? match.notes_refs : [match.notes_ref].filter(Boolean);
    back.innerHTML = `
      <div class="match-back-head"><div><p class="match-level">${esc(level)} · ${esc(sourceState)}</p><h3 class="match-role-title">${esc(title)}</h3><p class="match-role-meta">${esc(meta)}</p></div><button type="button" class="match-back-button" aria-label="Show employer card">↩</button></div>
      <p class="match-case">${esc(summary)}</p>
      ${match.signals?.length?`<p class="match-section-label">Why this company</p>${list(match.signals,'match-signal-list')}`:''}
      ${match.caveats?.length?`<p class="match-section-label">Caveats</p>${list(match.caveats,'match-caveat-list')}`:''}
      <div class="match-links">${link('Open role',role?.source_url)}${refs.slice(0,2).map((url,i)=>link(i?'Evidence':'Match notes',url)).join('')}</div>
      ${companyOnly?'':`<div class="match-role-nav"><button type="button" class="match-prev" aria-label="Previous matched role" ${roles.length<2?'disabled':''}>‹</button><span class="match-role-count">${index+1} / ${roles.length}</span><button type="button" class="match-next" aria-label="Next matched role" ${roles.length<2?'disabled':''}>›</button></div>`}`;
    back.querySelector('.match-back-button')?.addEventListener('click',event=>{event.stopPropagation();card.classList.remove('match-flipped');});
    back.querySelector('.match-prev')?.addEventListener('click',event=>{event.stopPropagation();const state=cardState.get(card);state.index=(state.index-1+roles.length)%roles.length;renderBack(card,match,state.index);});
    back.querySelector('.match-next')?.addEventListener('click',event=>{event.stopPropagation();const state=cardState.get(card);state.index=(state.index+1)%roles.length;renderBack(card,match,state.index);});
  }

  function undecorate(card){card.classList.remove('match-enabled','match-flipped');card.querySelector('.sphere-match-dot')?.remove();const inner=card.querySelector(':scope > .match-card-inner');if(inner){const front=inner.querySelector(':scope > .match-card-front');front?.querySelector('.match-trigger')?.remove();if(front)while(front.firstChild)card.insertBefore(front.firstChild,inner);inner.remove();}delete card.dataset.matchDecorated;cardState.delete(card);}
  function decorateFullCard(card,match){if(card.dataset.matchDecorated==='1')return;card.dataset.matchDecorated='1';card.classList.add('match-enabled');const inner=document.createElement('div');inner.className='match-card-inner';const front=document.createElement('div');front.className='match-card-face match-card-front';while(card.firstChild)front.appendChild(card.firstChild);const back=document.createElement('div');back.className='match-card-face match-card-back';inner.append(front,back);card.appendChild(inner);const trigger=document.createElement('button');trigger.type='button';trigger.className='match-trigger';trigger.textContent=match.roles?.length>1?`Match ${match.roles.length}`:match.roles?.length?'Match':'Aligned';const head=front.querySelector('.employer-card-head')||front;head.appendChild(trigger);trigger.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();card.classList.toggle('match-flipped');});cardState.set(card,{index:0,match});renderBack(card,match,0);}
  function decorateSphereCard(card,match){if(card.dataset.matchDecorated==='1')return;card.dataset.matchDecorated='1';const dot=document.createElement('span');dot.className='sphere-match-dot';dot.textContent=match.roles?.length>1?String(match.roles.length):'★';dot.title=match.roles?.length>1?`${match.roles.length} matched roles`:match.roles?.length?'Good-match role':'Aligned company';dot.setAttribute('aria-hidden','true');card.appendChild(dot);cardState.set(card,{match});}
  function reconcileDecoration(card,match,decorate){if(!match){if(card.dataset.matchDecorated==='1')undecorate(card);return;}if(card.dataset.matchDecorated==='1'&&cardState.get(card)?.match!==match)undecorate(card);decorate(card,match);}
  function decorateAll(){for(const card of document.querySelectorAll('.employer-card'))reconcileDecoration(card,matchForCard(card),decorateFullCard);for(const card of document.querySelectorAll('.sphere-employer'))reconcileDecoration(card,matchForCard(card),decorateSphereCard);}
  new MutationObserver(decorateAll).observe(document.documentElement,{childList:true,subtree:true}); decorateAll();
})();
