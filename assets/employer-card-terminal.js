(function(global){"use strict";
if(!global.EmployerSphere||typeof global.EmployerSphere.create!=="function")return;
const originalCreate=global.EmployerSphere.create;
global.EmployerSphere.create=function(opts){
  const api=originalCreate(opts),host=opts.host,baseSetEmployers=api.setEmployers.bind(api),baseSetFilterMatcher=api.setFilterMatcher.bind(api),baseShow=api.show.bind(api),baseHide=api.hide.bind(api),baseDestroy=api.destroy.bind(api);
  let itemMap=new Map(),activeKey=null,writerTimer=0,writerIndex=0,writerText="",writerHolding=false;
  const keyOf=e=>String(e.canonical_id||e.normalised_name_key||e.name);
  const descriptionOf=e=>String(e?.description?.text||"No description available.").trim()||"No description available.";
  function stopWriter(){if(writerTimer){clearTimeout(writerTimer);writerTimer=0}}
  function activeCard(){if(activeKey===null)return null;for(const c of host.querySelectorAll('.sphere-employer'))if(c.dataset.key===activeKey)return c;return null}
  function syncActiveClass(){for(const c of host.querySelectorAll('.sphere-employer'))c.classList.toggle('description-live',c.dataset.key===activeKey&&!c.classList.contains('filtered'));}
  function scheduleNext(delay){stopWriter();writerTimer=setTimeout(writeStep,delay)}
  function writeStep(){const card=activeCard();if(!card||host.hidden||card.classList.contains('filtered')){stopWriter();syncActiveClass();return}const live=card.querySelector('.sphere-description-live');if(!live)return;syncActiveClass();if(writerHolding){writerHolding=false;writerIndex=0;live.textContent='';scheduleNext(240);return}if(writerIndex>=writerText.length){writerHolding=true;scheduleNext(1250);return}const burst=writerText.length>520?3:writerText.length>260?2:1;writerIndex=Math.min(writerText.length,writerIndex+burst);live.textContent=writerText.slice(0,writerIndex);scheduleNext(32)}
  function startWriter(){stopWriter();const card=activeCard();const e=activeKey===null?null:itemMap.get(activeKey);if(!card||!e||host.hidden||card.classList.contains('filtered')){syncActiveClass();return}writerText=descriptionOf(e);writerIndex=0;writerHolding=false;const live=card.querySelector('.sphere-description-live');if(live)live.textContent='';syncActiveClass();scheduleNext(180)}
  function activate(key){activeKey=String(key);startWriter()}
  function decorate(){for(const card of host.querySelectorAll('.sphere-employer')){if(card.querySelector('.sphere-description-bg'))continue;const e=itemMap.get(card.dataset.key);if(!e)continue;const layer=document.createElement('span');layer.className='sphere-description-bg';layer.setAttribute('aria-hidden','true');const staticText=document.createElement('span');staticText.className='sphere-description-static';staticText.textContent=descriptionOf(e);const live=document.createElement('span');live.className='sphere-description-live';layer.append(staticText,live);card.insertBefore(layer,card.firstChild)}syncActiveClass();if(activeKey!==null)startWriter()}
  api.setEmployers=function(next){const arr=Array.isArray(next)?next:[];itemMap=new Map(arr.map(e=>[keyOf(e),e]));baseSetEmployers(next);decorate();if(activeKey!==null&&!itemMap.has(activeKey)){activeKey=null;stopWriter();syncActiveClass()}};
  api.setFilterMatcher=function(matcher){baseSetFilterMatcher(matcher);if(activeKey!==null)startWriter();else syncActiveClass()};
  api.show=function(){baseShow();requestAnimationFrame(()=>{decorate();if(activeKey!==null)startWriter()})};
  api.hide=function(){stopWriter();baseHide()};
  api.destroy=function(){stopWriter();itemMap.clear();baseDestroy()};
  host.addEventListener('click',e=>{const card=e.target.closest('.sphere-employer');if(!card)return;const key=card.dataset.key;setTimeout(()=>{if(!e.defaultPrevented&&key)activate(key)},0)},true);
  return api;
};
})(window);
