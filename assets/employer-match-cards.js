(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const matchByName = new Map();
  const cardState = new WeakMap();

  const norm = value => String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  const style = document.createElement('style');
  style.textContent = `
    .employer-card.match-enabled{perspective:900px;overflow:visible}
    .employer-card .match-card-inner{display:grid;transform-style:preserve-3d;transition:transform .34s cubic-bezier(.2,.75,.25,1)}
    .employer-card.match-flipped .match-card-inner{transform:rotateY(180deg)}
    .employer-card .match-card-face{grid-area:1/1;min-width:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}
    .employer-card .match-card-back{transform:rotateY(180deg);border:1px solid #30363d;background:#0d1117;padding:13px;box-sizing:border-box}
    .match-trigger,.match-back-button,.match-role-nav button{font:inherit;color:#c9d1d9;background:#161b22;border:1px solid #30363d;border-radius:999px;cursor:pointer}
    .match-trigger{padding:3px 7px;font-size:10px;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap}
    .match-trigger:hover,.match-back-button:hover,.match-role-nav button:hover{border-color:#6e7681;color:#f0f6fc}
    .match-trigger::before{content:'★';margin-right:4px;font-size:9px}
    .match-back-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
    .match-back-button{padding:3px 7px;font-size:10px}
    .match-level{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:#8b949e;margin:0 0 4px}
    .match-role-title{font-size:15px;line-height:1.25;margin:0;color:#f0f6fc}
    .match-role-meta{font-size:11px;color:#8b949e;margin:5px 0 0}
    .match-case{font-size:12px;line-height:1.55;color:#c9d1d9;margin:12px 0}
    .match-role-nav{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px}
    .match-role-nav button{width:28px;height:24px;padding:0}
    .match-role-count{font-size:10px;color:#8b949e}
    .match-links{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
    .match-links a{font-size:10px}
    .sphere-employer .sphere-match-dot{position:absolute;right:6px;top:5px;z-index:4;display:grid;place-items:center;width:16px;height:16px;border-radius:50%;border:1px solid rgba(139,148,158,.65);background:rgba(13,17,23,.86);font-size:9px;color:#e3b341;box-shadow:0 1px 4px rgba(0,0,0,.35)}
    @media(prefers-reduced-motion:reduce){.employer-card .match-card-inner{transition:none}}
  `;
  document.head.appendChild(style);

  function indexMatches(data) {
    matchByName.clear();
    for (const employer of data?.employers || []) {
      if (!employer?.match?.roles?.length) continue;
      for (const name of [employer.name, employer.normalised_name_key, ...(employer.aliases || [])]) {
        const key = norm(name);
        if (key) matchByName.set(key, employer.match);
      }
    }
    queueMicrotask(decorateAll);
  }

  window.fetch = async function matchAwareFetch(input, init) {
    const response = await nativeFetch(input, init);
    const href = typeof input === 'string' ? input : input?.url;
    let pathname = '';
    try { pathname = new URL(href || '', location.href).pathname; } catch (_) {}
    if (response.ok && pathname.endsWith('/employers.json')) {
      response.clone().json().then(indexMatches).catch(() => {});
    }
    return response;
  };

  function matchForCard(card) {
    const title = card.querySelector('h3')?.textContent || card.querySelector('.sphere-employer-name')?.textContent || '';
    return matchByName.get(norm(title));
  }

  function link(label, url) {
    if (!url) return '';
    return `<a class="pill-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
  }

  function renderBack(card, match, index) {
    const roles = match.roles || [];
    const role = roles[index] || roles[0];
    const back = card.querySelector('.match-card-back');
    if (!back || !role) return;
    const level = String(role.match_level || 'strong').replace(/_/g, ' ');
    const sourceState = role.source_state === 'crawler_confirmed' ? 'ATS confirmed' : 'manual match';
    back.innerHTML = `
      <div class="match-back-head">
        <div>
          <p class="match-level">${esc(level)} match · ${esc(sourceState)}</p>
          <h3 class="match-role-title">${esc(role.title)}</h3>
          <p class="match-role-meta">${esc(role.location || '')}</p>
        </div>
        <button type="button" class="match-back-button" aria-label="Show employer card">↩</button>
      </div>
      <p class="match-case">${esc(role.summary || match.summary || '')}</p>
      <div class="match-links">
        ${link('Open role', role.source_url)}
        ${link('Match notes', role.notes_ref || match.notes_ref)}
      </div>
      <div class="match-role-nav">
        <button type="button" class="match-prev" aria-label="Previous matched role" ${roles.length < 2 ? 'disabled' : ''}>‹</button>
        <span class="match-role-count">${index + 1} / ${roles.length}</span>
        <button type="button" class="match-next" aria-label="Next matched role" ${roles.length < 2 ? 'disabled' : ''}>›</button>
      </div>`;

    back.querySelector('.match-back-button')?.addEventListener('click', event => {
      event.stopPropagation();
      card.classList.remove('match-flipped');
    });
    back.querySelector('.match-prev')?.addEventListener('click', event => {
      event.stopPropagation();
      const state = cardState.get(card);
      state.index = (state.index - 1 + roles.length) % roles.length;
      renderBack(card, match, state.index);
    });
    back.querySelector('.match-next')?.addEventListener('click', event => {
      event.stopPropagation();
      const state = cardState.get(card);
      state.index = (state.index + 1) % roles.length;
      renderBack(card, match, state.index);
    });
  }

  function decorateFullCard(card, match) {
    if (card.dataset.matchDecorated === '1') return;
    card.dataset.matchDecorated = '1';
    card.classList.add('match-enabled');

    const inner = document.createElement('div');
    inner.className = 'match-card-inner';
    const front = document.createElement('div');
    front.className = 'match-card-face match-card-front';
    while (card.firstChild) front.appendChild(card.firstChild);
    const back = document.createElement('div');
    back.className = 'match-card-face match-card-back';
    inner.append(front, back);
    card.appendChild(inner);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'match-trigger';
    trigger.textContent = match.roles.length > 1 ? `Match ${match.roles.length}` : 'Match';
    const head = front.querySelector('.employer-card-head') || front;
    head.appendChild(trigger);
    trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      card.classList.toggle('match-flipped');
    });

    cardState.set(card, { index: 0 });
    renderBack(card, match, 0);
  }

  function decorateSphereCard(card, match) {
    if (card.dataset.matchDecorated === '1') return;
    card.dataset.matchDecorated = '1';
    const dot = document.createElement('span');
    dot.className = 'sphere-match-dot';
    dot.textContent = match.roles.length > 1 ? String(match.roles.length) : '★';
    dot.title = match.roles.length > 1 ? `${match.roles.length} matched roles` : 'Good-match role';
    dot.setAttribute('aria-hidden', 'true');
    card.appendChild(dot);
  }

  function decorateAll() {
    for (const card of document.querySelectorAll('.employer-card')) {
      const match = matchForCard(card);
      if (match?.roles?.length) decorateFullCard(card, match);
    }
    for (const card of document.querySelectorAll('.sphere-employer')) {
      const match = matchForCard(card);
      if (match?.roles?.length) decorateSphereCard(card, match);
    }
  }

  new MutationObserver(decorateAll).observe(document.documentElement, { childList: true, subtree: true });
  decorateAll();
})();
