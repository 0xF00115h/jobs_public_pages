const state={jobs:[],activeJob:null,activeSection:null};
const $=id=>document.getElementById(id);

function setQuery(jobId,sectionId){
  const p=new URLSearchParams();
  if(jobId)p.set('job',jobId);
  if(sectionId)p.set('section',sectionId);
  history.replaceState(null,'',`${location.pathname}?${p.toString()}`);
}

function renderJobList(){
  const list=$('job-list');
  list.innerHTML='';
  state.jobs.forEach(job=>{
    const b=document.createElement('button');
    b.className=`job-button${state.activeJob?.id===job.id?' active':''}`;
    b.innerHTML=`<span class="company">${job.company}</span><span class="title">${job.title}</span><span class="meta">${job.location} · ${job.status}</span>`;
    b.onclick=()=>selectJob(job.id);
    list.appendChild(b);
  });
}

function selectJob(jobId,requestedSection=null){
  const job=state.jobs.find(j=>j.id===jobId)||state.jobs[0];
  if(!job)return;
  state.activeJob=job;
  state.activeSection=job.sections.find(s=>s.id===requestedSection)||job.sections[0];
  $('empty-state').hidden=true;
  $('job-view').hidden=false;
  $('job-company').textContent=job.company;
  $('job-title').textContent=job.title;
  $('job-meta').textContent=job.location;
  $('job-status').textContent=job.status;
  renderJobList();renderTabs();renderSection();setQuery(job.id,state.activeSection.id);
}

function renderTabs(){
  const tabs=$('section-tabs');
  tabs.innerHTML='';
  state.activeJob.sections.forEach(section=>{
    const b=document.createElement('button');
    b.className=`tab${state.activeSection?.id===section.id?' active':''}`;
    b.textContent=section.label;
    b.onclick=()=>{state.activeSection=section;renderTabs();renderSection();setQuery(state.activeJob.id,section.id)};
    tabs.appendChild(b);
  });
}

function renderSection(){
  const content=$('section-content');
  content.innerHTML='';
  state.activeSection.cards.forEach(card=>{
    const a=document.createElement('article');
    a.className='resource-card';
    const body=card.html?`<div class="generated-content">${card.html}</div>`:(card.description?`<p>${card.description}</p>`:'');
    const links=[];
    (card.links||[]).forEach(l=>links.push(`<a class="pill-link" href="${l.url}">${l.label}</a>`));
    if(card.source_url)links.push(`<a class="pill-link" href="${card.source_url}">Private .md source</a>`);
    if(card.comment_url)links.push(`<a class="pill-link" href="${card.comment_url}">Private issue comment</a>`);
    a.innerHTML=`<h3>${card.title}</h3>${body}${links.length?`<div class="links source-links">${links.join('')}</div>`:''}`;
    content.appendChild(a);
  });
}

async function init(){
  try{
    const r=await fetch('jobs.json',{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const d=await r.json();
    state.jobs=d.jobs||[];
    if(!state.jobs.length)throw new Error('No jobs configured');
    const p=new URLSearchParams(location.search);
    selectJob(p.get('job')||state.jobs[0].id,p.get('section'));
  }catch(e){$('empty-state').textContent=`Could not load dashboard data: ${e.message}`}
}

init();
