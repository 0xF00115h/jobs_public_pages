(function(){"use strict";
const host=document.getElementById("employer-advanced");
if(!host)return;
let tap=null,lastTrustedCardKey=null,lastTrustedCardClickAt=0;
const keyOf=card=>card?.dataset?.key||null;
host.addEventListener("pointerdown",e=>{
  if(e.pointerType==="touch")return;
  if(e.pointerType==="mouse"&&e.button!==0)return;
  const card=e.target.closest(".sphere-employer");
  tap=card?{pointerId:e.pointerId,card,x:e.clientX,y:e.clientY,moved:false}:null;
},true);
host.addEventListener("pointermove",e=>{
  if(!tap||tap.pointerId!==e.pointerId)return;
  if(Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>4)tap.moved=true;
},true);
host.addEventListener("pointercancel",e=>{if(tap?.pointerId===e.pointerId)tap=null},true);
host.addEventListener("click",e=>{
  if(!e.isTrusted)return;
  const card=e.target.closest(".sphere-employer");
  if(!card)return;
  lastTrustedCardKey=keyOf(card);
  lastTrustedCardClickAt=performance.now();
},true);
host.addEventListener("pointerup",e=>{
  if(!tap||tap.pointerId!==e.pointerId)return;
  const current=tap;tap=null;
  if(current.moved||!current.card.isConnected||current.card.classList.contains("filtered"))return;
  const key=keyOf(current.card);
  setTimeout(()=>{
    const nativeWorked=lastTrustedCardKey===key&&performance.now()-lastTrustedCardClickAt<120;
    if(!nativeWorked&&current.card.isConnected&&!current.card.classList.contains("filtered"))current.card.click();
  },0);
},true);
})();
