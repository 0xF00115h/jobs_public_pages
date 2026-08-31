(() => {
  'use strict';
  const nativeFetch=window.fetch.bind(window);
  const AAD=new TextEncoder().encode('jobsearch-public-companies:v1');
  const SESSION_KEY='jobsearch-site-key-v1';
  let dataPromise=null;

  const b64=value=>{
    const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
    const padded=text+'='.repeat((4-text.length%4)%4);
    const binary=atob(padded);
    return Uint8Array.from(binary,ch=>ch.charCodeAt(0));
  };
  const b64url=bytes=>{
    let binary='';bytes.forEach(byte=>binary+=String.fromCharCode(byte));
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
  };

  function requestKey(message=''){
    return new Promise((resolve,reject)=>{
      const overlay=document.createElement('div');
      overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
      overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(5,8,12,.94);display:grid;place-items:center;padding:24px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#d8dee9';
      const panel=document.createElement('form');
      panel.style.cssText='width:min(520px,100%);border:1px solid #30363d;background:#0d1117;padding:22px';
      panel.innerHTML=`<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8b949e;margin-bottom:8px">Encrypted site</div><div style="font-size:18px;font-weight:700;margin-bottom:7px">Unlock data</div><div style="font-size:12px;line-height:1.5;color:#8b949e;margin-bottom:16px">Paste the same local site key used by Jobs and Employer Landscape.</div><input name="key" type="password" autocomplete="off" spellcheck="false" style="box-sizing:border-box;width:100%;background:#010409;color:#e6edf3;border:1px solid #30363d;padding:10px 11px;font:inherit"><div data-error style="min-height:18px;margin-top:8px;font-size:11px;color:#f85149">${message}</div><button type="submit" style="background:#21262d;color:#e6edf3;border:1px solid #30363d;padding:8px 13px;font:inherit;cursor:pointer">Unlock</button>`;
      overlay.appendChild(panel);document.body.appendChild(overlay);
      const input=panel.elements.key;const error=panel.querySelector('[data-error]');setTimeout(()=>input.focus(),0);
      panel.addEventListener('submit',event=>{event.preventDefault();try{const key=b64(input.value.trim());if(key.length!==32)throw new Error('Key must decode to 32 bytes.');overlay.remove();resolve(key)}catch(err){error.textContent=err.message||'Invalid key.';input.select()}});
      overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){overlay.remove();reject(new Error('Unlock cancelled'))}});
    });
  }

  async function load(){
    const response=await nativeFetch('../companies-data.enc.json',{cache:'no-store'});
    if(!response.ok)throw new Error(`Could not load encrypted Companies data: HTTP ${response.status}`);
    const envelope=await response.json();
    let stored=null;try{stored=sessionStorage.getItem(SESSION_KEY)}catch(_){}
    let message='';
    while(true){
      let raw=stored?b64(stored):null;stored=null;
      if(!raw||raw.length!==32)raw=await requestKey(message);
      try{
        const key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']);
        const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(envelope.iv),additionalData:AAD,tagLength:128},key,b64(envelope.ciphertext));
        try{sessionStorage.setItem(SESSION_KEY,b64url(raw))}catch(_){}
        return JSON.parse(new TextDecoder().decode(plain));
      }catch(_){try{sessionStorage.removeItem(SESSION_KEY)}catch(_){};message='Incorrect key. Try again.'}
    }
  }

  window.fetch=async function(input,init){
    const href=typeof input==='string'?input:input?.url;
    let filename='';try{filename=new URL(href,location.href).pathname.split('/').pop()}catch(_){}
    if(filename!=='companies.json')return nativeFetch(input,init);
    if(!dataPromise)dataPromise=load();
    const data=await dataPromise;
    return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  };
})();
