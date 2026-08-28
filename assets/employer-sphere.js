(function(global){"use strict";
const identityMatrix="matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const qmul=(a,b)=>{const[ax,ay,az,aw]=a,[bx,by,bz,bw]=b;return[aw*bx+ax*bw+ay*bz-az*by,aw*by-ax*bz+ay*bw+az*bx,aw*bz+ax*by-ay*bx+az*bw,aw*bw-ax*bx-ay*by-az*bz]};
const qnorm=a=>{const m=Math.hypot(...a)||1;return a.map(v=>v/m)};
const qaxis=(axis,angle)=>{const h=angle/2,s=Math.sin(h);return[axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(h)]};
const qdot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];
const qconj=a=>[-a[0],-a[1],-a[2],a[3]];
const qdistance=(a,b)=>2*Math.acos(clamp(Math.abs(qdot(qnorm(a),qnorm(b))),-1,1));
const smoother=t=>t*t*t*(t*(t*6-15)+10);
function qslerp(a,b,t){let bb=b.slice(),dot=qdot(a,bb);if(dot<0){bb=bb.map(v=>-v);dot=-dot}dot=clamp(dot,-1,1);if(dot>.9995)return qnorm(a.map((v,i)=>v+(bb[i]-v)*t));const theta=Math.acos(dot),sinTheta=Math.sin(theta),wa=Math.sin((1-t)*theta)/sinTheta,wb=Math.sin(t*theta)/sinTheta;return qnorm(a.map((v,i)=>v*wa+bb[i]*wb))}
function qmatrix([x,y,z,w]){const x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2,m=[1-(yy+zz),xy+wz,xz-wy,0,xy-wz,1-(xx+zz),yz+wx,0,xz+wy,yz-wx,1-(xx+yy),0,0,0,0,1];return`matrix3d(${m.map(v=>Number(v.toFixed(7))).join(",")})`}

function createEmployerSphere(opts){
  const host=opts.host;
  const esc=opts.escapeHtml;
  const cardHtml=opts.fullCardHtml;
  let items=[],cards=[],layout=null,mode="grid",distribution=1,sphereZoom=1,gridZoom=1,autoSpin=false,selectedKey=null,pan={x:0,y:0},q=[0,0,0,1],homeQ=[0,0,0,1],homeKey=null,suppressClickUntil=0,navAnimation=null;
  const pointers=new Map(); let gesture=null,moved=false,tapKey=null,lastCardTap={key:null,at:0};

  host.innerHTML=`<div class="sphere-controls">
    <div class="sphere-control-group" aria-label="Sphere distribution"><span class="sphere-control-label">Map</span><button type="button" class="sphere-control map active" data-map="1">1</button><button type="button" class="sphere-control map" data-map="2">2</button><button type="button" class="sphere-control map" data-map="3">3</button></div>
    <div class="sphere-control-group" aria-label="Zoom"><button type="button" class="sphere-control zoom-out">Zoom −</button><button type="button" class="sphere-control sphere-zoom-readout zoom-reset">100%</button><button type="button" class="sphere-control zoom-in">Zoom +</button></div>
    <button type="button" class="sphere-control spin">Auto spin</button>
    <button type="button" class="sphere-control home">Home</button>
  </div>
  <div class="sphere-stage" tabindex="0" aria-label="Interactive employer view. Drag to rotate in Sphere or pan in Grid; wheel or pinch to zoom; click for details; double-click a card in Sphere to centre it and set Home.">
    <div class="sphere-scene"><div class="sphere-camera"><div class="sphere-rotor"></div></div></div>
    <div class="sphere-hud"><span class="sphere-hud-chip mode-chip">Grid</span><span class="sphere-hud-chip count-chip">0 cards</span><span class="sphere-hud-chip zoom-chip">Zoom 100%</span><span class="sphere-hud-chip fps-chip">60 fps</span></div>
    <div class="sphere-hint">Drag = pan · wheel/pinch = zoom · click = details</div>
    <aside class="sphere-details" aria-live="polite"><button type="button" class="sphere-control close">Close</button><div class="sphere-details-body"></div></aside>
  </div>`;

  const stage=host.querySelector(".sphere-stage"),camera=host.querySelector(".sphere-camera"),rotor=host.querySelector(".sphere-rotor"),modeChip=host.querySelector(".mode-chip"),countChip=host.querySelector(".count-chip"),zoomChip=host.querySelector(".zoom-chip"),fpsChip=host.querySelector(".fps-chip"),hint=host.querySelector(".sphere-hint"),details=host.querySelector(".sphere-details"),detailsBody=host.querySelector(".sphere-details-body"),spinBtn=host.querySelector(".spin"),homeBtn=host.querySelector(".home"),zoomReset=host.querySelector(".zoom-reset");
  const mapBtns=[...host.querySelectorAll(".map")];

  const keyOf=e=>String(e.canonical_id||e.normalised_name_key||e.name);
  const currentZoom=()=>mode==="sphere"?sphereZoom:gridZoom;
  function setCurrentZoom(z){if(mode==="sphere")sphereZoom=clamp(z,.55,2.2);else gridZoom=clamp(z,.5,5);applyCamera()}
  function computeLayout(){
    const count=Math.max(1,items.length),cols=Math.max(12,Math.round(Math.sqrt(count*1.4))),rows=Math.ceil(count/cols),cardW=130,cardH=84,gapX=10,gapY=10,gridW=cols*(cardW+gapX),gridH=rows*(cardH+gapY),maxLatDeg=distribution===1?58:78,maxLat=maxLatDeg*Math.PI/180,dLon=2*Math.PI/cols,dLat=rows>1?(2*maxLat)/(rows-1):1,horizontalR=cardW/(Math.max(.28,Math.cos(maxLat))*dLon),verticalR=cardH/Math.max(.04,dLat),gridRadius=Math.max(470,horizontalR,verticalR)*1.08,surfaceRadius=Math.sqrt(count*(cardW+gapX)*(cardH+gapY)/(4*Math.PI))*1.15,requiredRadius=distribution===3?Math.max(470,surfaceRadius):gridRadius,radius=1000,sphereCardScale=radius/requiredRadius;
    layout={count:items.length,layoutCount:count,cols,rows,cardW,cardH,gapX,gapY,gridW,gridH,maxLatDeg,radius,sphereCardScale};
  }
  function transforms(index){
    const {layoutCount,cols,rows,cardW,cardH,gapX,gapY,gridW,gridH,maxLatDeg,radius,sphereCardScale}=layout,row=Math.floor(index/cols),col=index%cols,x=(col+.5)*(cardW+gapX)-gridW/2,y=(row+.5)*(cardH+gapY)-gridH/2,stagger=row%2?(cardW+gapX)*.5:0,xs=x+stagger-(row%2?(cardW+gapX)*.25:0);
    let lon,lat;
    if(distribution===3){
      const u=(index+.5)/layoutCount;
      lon=(index*137.507764)%360-180;
      lat=Math.asin(1-2*u)*180/Math.PI;
    }else{
      lon=((col+.5+(row%2?.5:0))/cols)*360-180;
      lat=rows>1?maxLatDeg-(row/(rows-1))*(maxLatDeg*2):0;
    }
    return{row,col,lon,lat,grid:`translate3d(${xs.toFixed(2)}px,${y.toFixed(2)}px,0)`,sphere:`rotateY(${lon.toFixed(3)}deg) rotateX(${(-lat).toFixed(3)}deg) translateZ(${radius.toFixed(2)}px) scale(${sphereCardScale.toFixed(5)})`};
  }
  function fit(){
    const r=stage.getBoundingClientRect(),gridFit=Math.min((r.width*.90)/Math.max(1,layout.gridW),(r.height*.86)/Math.max(1,layout.gridH)),sphereFit=Math.min(r.width,r.height)*.36/layout.radius;
    return{gridFit:Math.max(.08,gridFit),sphereFit:Math.max(.12,sphereFit)};
  }
  function applyCamera(){const f=fit(),z=mode==="sphere"?f.sphereFit*sphereZoom:f.gridFit*gridZoom,tx=mode==="grid"?pan.x:0,ty=mode==="grid"?pan.y:0;camera.style.transform=`translate(${tx}px,${ty}px) scale(${z})`;const pct=Math.round(currentZoom()*100);zoomChip.textContent=`Zoom ${pct}%`;zoomReset.textContent=`${pct}%`}
  function applyRotor(){rotor.style.transform=mode==="sphere"?qmatrix(q):identityMatrix}
  function applyLayout(animate=true){for(let i=0;i<cards.length;i++){const t=transforms(i);cards[i].dataset.row=t.row;cards[i].dataset.col=t.col;cards[i].style.transform=mode==="sphere"?t.sphere:t.grid}applyRotor();applyCamera()}
  function compactCard(e,i){const r=e.research||{},klass=e.canonical_classification?.relevance||"",label=e.canonical_classification?.label||({rf_core:"RF",engineering_adjacent:"ADJ"}[klass]||"—"),domain=e.canonical_domain||"",jobs=Number(r.job_count||0),uk=Number(r.uk_job_count||0);return`<span class="sphere-employer-name">${esc(e.name||"")}</span><span class="sphere-employer-domain">${esc(domain)}</span><span class="sphere-badges"><span class="sphere-badge ${label==="RF"?"rf":label==="ADJ"?"adj":""}">${esc(label)}</span><span class="sphere-badge jobs">Jobs ${jobs}</span>${uk?`<span class="sphere-badge">UK ${uk}</span>`:""}</span>`}
  function renderCards(){
    rotor.innerHTML="";cards=[];const frag=document.createDocumentFragment();
    items.forEach((e,i)=>{const b=document.createElement("button");b.type="button";b.className="sphere-employer";b.dataset.key=keyOf(e);b.dataset.index=String(i);b.setAttribute("aria-label",`${e.name||"Employer"}, ${e.canonical_classification?.label||""}, ${Number(e.research?.job_count||0)} jobs`);b.innerHTML=compactCard(e,i);b.addEventListener("click",ev=>{if(performance.now()<suppressClickUntil){ev.preventDefault();ev.stopPropagation();return}ev.stopPropagation();selectByKey(b.dataset.key)});cards.push(b);frag.appendChild(b)});
    rotor.appendChild(frag);computeLayout();
    if(homeKey&&!items.some(e=>keyOf(e)===homeKey)){homeKey=null;homeQ=[0,0,0,1]}
    if(homeKey){const idx=items.findIndex(e=>keyOf(e)===homeKey);if(idx>=0)homeQ=cardHomeQuaternion(idx)}
    applyLayout(false);countChip.textContent=`${items.length} cards`;updateHomeControl();
  }
  function setItems(next){items=Array.isArray(next)?next.slice():[];clearSelection();renderCards()}
  function setMode(next){const changed=next!==mode;if(changed){cancelNavAnimation();mode=next;autoSpin=false;spinBtn.classList.remove("active");spinBtn.textContent="Auto spin"}modeChip.textContent=next==="sphere"?"Sphere":"Grid";hint.textContent=next==="sphere"?"Drag = rotate · wheel/pinch = zoom · click = details · double-click = centre + set Home":"Drag = pan · wheel/pinch = zoom · click = details";mapBtns.forEach(b=>b.disabled=next!=="sphere");homeBtn.disabled=next!=="sphere";spinBtn.disabled=next!=="sphere";applyLayout(changed)}
  function setDistribution(next){if(next===distribution)return;cancelNavAnimation();distribution=next;mapBtns.forEach(b=>b.classList.toggle("active",Number(b.dataset.map)===next));computeLayout();if(homeKey){const idx=items.findIndex(e=>keyOf(e)===homeKey);if(idx>=0)homeQ=cardHomeQuaternion(idx)}applyLayout(true)}
  function selectByKey(key){selectedKey=key;cards.forEach(c=>c.classList.toggle("selected",c.dataset.key===key));const e=items.find(x=>keyOf(x)===key);if(!e)return;detailsBody.innerHTML=cardHtml(e);details.classList.add("open")}
  function clearSelection(){selectedKey=null;cards.forEach(c=>c.classList.remove("selected"));details.classList.remove("open");detailsBody.innerHTML=""}
  function cancelNavAnimation(){if(!navAnimation)return;cancelAnimationFrame(navAnimation.raf);navAnimation=null;stage.classList.remove("nav-animating")}
  function animateNavigation({targetQ=q,targetSphereZoom=sphereZoom,targetGridZoom=gridZoom,targetPan=pan,duration=1100}){cancelNavAnimation();autoSpin=false;spinBtn.classList.remove("active");spinBtn.textContent="Auto spin";if(matchMedia("(prefers-reduced-motion: reduce)").matches){q=qnorm(targetQ.slice());sphereZoom=targetSphereZoom;gridZoom=targetGridZoom;pan={...targetPan};applyRotor();applyCamera();return}const startQ=q.slice(),startSphereZoom=sphereZoom,startGridZoom=gridZoom,startPan={...pan},t0=performance.now();stage.classList.add("nav-animating");navAnimation={raf:0};const step=now=>{if(!navAnimation)return;const raw=clamp((now-t0)/duration,0,1),e=smoother(raw);q=qslerp(startQ,targetQ,e);sphereZoom=startSphereZoom+(targetSphereZoom-startSphereZoom)*e;gridZoom=startGridZoom+(targetGridZoom-startGridZoom)*e;pan={x:startPan.x+(targetPan.x-startPan.x)*e,y:startPan.y+(targetPan.y-startPan.y)*e};applyRotor();applyCamera();if(raw<1)navAnimation.raf=requestAnimationFrame(step);else{q=qnorm(targetQ.slice());sphereZoom=targetSphereZoom;gridZoom=targetGridZoom;pan={...targetPan};applyRotor();applyCamera();navAnimation=null;stage.classList.remove("nav-animating")}};navAnimation.raf=requestAnimationFrame(step)}
  function cardHomeQuaternion(index){const t=transforms(index),ry=qaxis([0,1,0],t.lon*Math.PI/180),rx=qaxis([1,0,0],-t.lat*Math.PI/180),cardQ=qnorm(qmul(ry,rx));return qnorm(qconj(cardQ))}
  function updateHomeControl(){if(!homeKey){homeBtn.title="Smoothly return to the neutral Home orientation"}else{const e=items.find(x=>keyOf(x)===homeKey);homeBtn.title=`Smoothly return to Home: ${e?.name||homeKey}`}}
  function centreIndexAndSetHome(index){if(mode!=="sphere")return;homeKey=keyOf(items[index]);homeQ=cardHomeQuaternion(index);updateHomeControl();animateNavigation({targetQ:homeQ,targetSphereZoom:sphereZoom,targetGridZoom:gridZoom,targetPan:{x:0,y:0},duration:clamp(650+qdistance(q,homeQ)*310,800,1400)})}
  function resetView(){const target=mode==="sphere"?homeQ:q;animateNavigation({targetQ:target,targetSphereZoom:1,targetGridZoom:1,targetPan:{x:0,y:0},duration:clamp(700+qdistance(q,target)*360,850,1650)})}
  function resetForData(){homeKey=null;homeQ=[0,0,0,1];q=[0,0,0,1];pan={x:0,y:0};sphereZoom=1;gridZoom=1;updateHomeControl()}

  function beginSingle(pointerId){const p=pointers.get(pointerId);if(!p)return;gesture=mode==="sphere"?{type:"rotate",pointerId,startQ:q.slice(),startPt:{...p}}:{type:"pan",pointerId,startPan:{...pan},startPt:{...p}}}
  function beginPinch(){const ps=[...pointers.values()];if(ps.length<2)return;const a=ps[0],b=ps[1],dist=Math.hypot(b.x-a.x,b.y-a.y),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};gesture={type:"pinch",startDist:Math.max(10,dist),startZoom:currentZoom(),startMid:mid,startPan:{...pan}}}
  function resetGesture(){if(pointers.size>=2)beginPinch();else if(pointers.size===1)beginSingle([...pointers.keys()][0]);else gesture=null}
  stage.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse"&&e.button!==0)return;if(e.target.closest(".sphere-details"))return;cancelNavAnimation();const card=e.target.closest(".sphere-employer");tapKey=card?card.dataset.key:null;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});stage.setPointerCapture(e.pointerId);moved=false;stage.classList.add("dragging");resetGesture()});
  stage.addEventListener("pointermove",e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size>=2&&gesture?.type!=="pinch")beginPinch();if(!gesture)return;if(gesture.type==="pinch"){const ps=[...pointers.values()];if(ps.length<2)return;const a=ps[0],b=ps[1],dist=Math.hypot(b.x-a.x,b.y-a.y),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(Math.abs(dist-gesture.startDist)>3||Math.hypot(mid.x-gesture.startMid.x,mid.y-gesture.startMid.y)>3)moved=true;const z=gesture.startZoom*(dist/gesture.startDist);if(mode==="sphere")sphereZoom=clamp(z,.55,2.2);else{gridZoom=clamp(z,.5,5);const scale=Math.max(.2,fit().gridFit*gridZoom);pan.x=gesture.startPan.x+(mid.x-gesture.startMid.x)/scale;pan.y=gesture.startPan.y+(mid.y-gesture.startMid.y)/scale}applyCamera();return}if(e.pointerId!==gesture.pointerId)return;const p=pointers.get(e.pointerId),dx=p.x-gesture.startPt.x,dy=p.y-gesture.startPt.y;if(Math.hypot(dx,dy)>4)moved=true;if(gesture.type==="rotate"){const r=stage.getBoundingClientRect(),dragRadius=Math.max(40,Math.min(r.width,r.height)*.36*sphereZoom),yaw=qaxis([0,1,0],dx/dragRadius),pitch=qaxis([1,0,0],-dy/dragRadius);q=qnorm(qmul(pitch,qmul(yaw,gesture.startQ)));applyRotor()}else{const scale=Math.max(.2,fit().gridFit*gridZoom);pan.x=gesture.startPan.x+dx/scale;pan.y=gesture.startPan.y+dy/scale;applyCamera()}});
  function endPointer(e){if(!pointers.has(e.pointerId))return;const tappedKey=!moved&&e.pointerType!=="touch"?tapKey:null;pointers.delete(e.pointerId);if(moved)suppressClickUntil=performance.now()+260;try{stage.releasePointerCapture(e.pointerId)}catch(_){}if(!pointers.size)stage.classList.remove("dragging");resetGesture();if(tappedKey!==null&&mode==="sphere"){const now=performance.now(),isDouble=lastCardTap.key===tappedKey&&now-lastCardTap.at<450;lastCardTap={key:tappedKey,at:now};if(isDouble){lastCardTap={key:null,at:0};selectByKey(tappedKey);const idx=items.findIndex(x=>keyOf(x)===tappedKey);if(idx>=0)centreIndexAndSetHome(idx)}}}
  stage.addEventListener("pointerup",endPointer);stage.addEventListener("pointercancel",endPointer);
  stage.addEventListener("wheel",e=>{e.preventDefault();cancelNavAnimation();const unit=e.deltaMode===1?16:e.deltaMode===2?stage.clientHeight:1,delta=clamp(e.deltaY*unit,-280,280),factor=Math.exp(-delta*.00155);setCurrentZoom(currentZoom()*factor)},{passive:false});
  stage.addEventListener("click",e=>{if(performance.now()<suppressClickUntil){e.preventDefault();e.stopPropagation();return}if(!e.target.closest(".sphere-employer")&&!e.target.closest(".sphere-details"))clearSelection()});
  stage.addEventListener("keydown",e=>{if(e.target!==stage)return;cancelNavAnimation();let handled=false;if(mode==="sphere"){const step=e.shiftKey?.12:.055;if(e.key==="ArrowLeft"){q=qnorm(qmul(qaxis([0,1,0],-step),q));handled=true}else if(e.key==="ArrowRight"){q=qnorm(qmul(qaxis([0,1,0],step),q));handled=true}else if(e.key==="ArrowUp"){q=qnorm(qmul(qaxis([1,0,0],step),q));handled=true}else if(e.key==="ArrowDown"){q=qnorm(qmul(qaxis([1,0,0],-step),q));handled=true}if(handled)applyRotor()}if(e.key==="+"||e.key==="="){setCurrentZoom(currentZoom()*1.16);handled=true}else if(e.key==="-"||e.key==="_"){setCurrentZoom(currentZoom()/1.16);handled=true}else if(e.key==="0"){resetView();handled=true}if(handled)e.preventDefault()});
  mapBtns.forEach(b=>b.addEventListener("click",()=>setDistribution(Number(b.dataset.map))));
  host.querySelector(".zoom-out").addEventListener("click",()=>{cancelNavAnimation();setCurrentZoom(currentZoom()/1.18)});
  host.querySelector(".zoom-in").addEventListener("click",()=>{cancelNavAnimation();setCurrentZoom(currentZoom()*1.18)});
  zoomReset.addEventListener("click",()=>{cancelNavAnimation();setCurrentZoom(1)});
  spinBtn.addEventListener("click",()=>{cancelNavAnimation();if(mode!=="sphere")return;autoSpin=!autoSpin;spinBtn.classList.toggle("active",autoSpin);spinBtn.textContent=autoSpin?"Stop spin":"Auto spin"});
  homeBtn.addEventListener("click",resetView);
  host.querySelector(".close").addEventListener("click",clearSelection);
  addEventListener("resize",()=>{if(!host.hidden)applyCamera()});

  let frames=0,fpsLast=performance.now();
  function loop(now){frames++;if(now-fpsLast>600){fpsChip.textContent=`${Math.round(frames*1000/(now-fpsLast))} fps`;frames=0;fpsLast=now}if(autoSpin&&mode==="sphere"&&!pointers.size&&!host.hidden){const h=.0017,dq=[0,Math.sin(h),0,Math.cos(h)];q=qnorm(qmul(dq,q));applyRotor()}requestAnimationFrame(loop)}
  requestAnimationFrame(loop);

  return{
    setEmployers(next){setItems(next)},
    setMode(next){setMode(next)},
    show(){host.hidden=false;requestAnimationFrame(()=>{applyLayout(false);stage.focus({preventScroll:true})})},
    hide(){host.hidden=true;autoSpin=false;spinBtn.classList.remove("active");spinBtn.textContent="Auto spin";cancelNavAnimation()},
    resetForData,
    destroy(){cancelNavAnimation();host.innerHTML=""}
  };
}
global.EmployerSphere={create:createEmployerSphere};
})(window);
