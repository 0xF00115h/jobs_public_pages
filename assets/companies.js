const companyState={companies:[],activeCompany:null,activeSection:null};
const $=id=>document.getElementById(id);

function setCompanyQuery(companyId,sectionId){
  const p=new URLSearchParams();
  if(companyId)p.set('company',companyId);
  if(sectionId)p.set('section',sectionId);
  history.replaceState(null,'',`${location.pathname}?${p.toString()}`);
}

function renderCompanyList(){
  const list=$('company-list');
  list.innerHTML='';
  companyState.companies.forEach(company=>{
    const b=document.createElement('button');
    b.className=`job-button${companyState.activeCompany?.id===company.id?' active':''}`;
    b.innerHTML=`<span class="company">${company.location||'Company dossier'}</span><span class="title">${company.name}</span><span class="meta">${company.status}</span>`;
    b.onclick=()=>selectCompany(company.id);
    list.appendChild(b);
  });
}

function selectCompany(companyId,requestedSection=null){
  const company=companyState.companies.find(c=>c.id===companyId)||companyState.companies[0];
  if(!company)return;
  companyState.activeCompany=company;
  companyState.activeSection=company.sections.find(s=>s.id===requestedSection)||company.sections[0];
  $('empty-state').hidden=true;
  $('company-view').hidden=false;
  $('company-name').textContent=company.name;
  $('company-location').textContent=company.location||'Curated company';
  $('company-status').textContent=company.status;
  renderCompanyList();renderCompanyTabs();renderCompanySection();setCompanyQuery(company.id,companyState.activeSection?.id);
}

function renderCompanyTabs(){
  const tabs=$('section-tabs');
  tabs.innerHTML='';
  companyState.activeCompany.sections.forEach(section=>{
    const b=document.createElement('button');
    b.className=`tab${companyState.activeSection?.id===section.id?' active':''}`;
    b.textContent=section.label;
    b.onclick=()=>{companyState.activeSection=section;renderCompanyTabs();renderCompanySection();setCompanyQuery(companyState.activeCompany.id,section.id)};
    tabs.appendChild(b);
  });
}

function renderCompanySection(){
  const content=$('section-content');
  content.innerHTML='';
  const section=companyState.activeSection;
  if(!section)return;
  const card=document.createElement('article');
  card.className='resource-card';
  const links=[];
  if(companyState.activeCompany.website)links.push(`<a class="pill-link" href="${companyState.activeCompany.website}">Company website</a>`);
  if(companyState.activeCompany.comment_url)links.push(`<a class="pill-link" href="${companyState.activeCompany.comment_url}">Private curation comment</a>`);
  card.innerHTML=`<h3>${section.label}</h3><div class="generated-content">${section.html||''}</div>${links.length?`<div class="links source-links">${links.join('')}</div>`:''}`;
  content.appendChild(card);
}

async function initCompanies(){
  try{
    const r=await fetch('companies.json',{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const d=await r.json();
    companyState.companies=d.companies||[];
    if(!companyState.companies.length)throw new Error('No companies configured');
    const p=new URLSearchParams(location.search);
    selectCompany(p.get('company')||companyState.companies[0].id,p.get('section'));
  }catch(e){$('empty-state').textContent=`Could not load companies data: ${e.message}`}
}

initCompanies();
