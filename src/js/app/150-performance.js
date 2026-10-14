/* ---------- performance: pill, sparkline, graph card ---------- */
const HIST=180,ft=new Float32Array(HIST);let hi=0;
const gc=$('graph'),gx=gc.getContext('2d'),sp=$('spark'),sx=sp.getContext('2d');
const COL={good:'#7fe3aa',warn:'#ffd36e',bad:'#ff7d7d',accent:'#86d8ff',dim:'#8f98ad'};
const health=ms=>ms<20?'good':ms<36?'warn':'bad';
function drawSpark(){const w=sp.width,h=sp.height,n=44;sx.clearRect(0,0,w,h);sx.beginPath();
  for(let i=0;i<n;i++){const v=ft[(hi+HIST-n+i)%HIST],x=i/(n-1)*w,y=h-2-Math.min(v,50)/50*(h-4);i?sx.lineTo(x,y):sx.moveTo(x,y);}
  sx.strokeStyle=COL.accent;sx.lineWidth=2;sx.stroke();}
function drawGraph(){
  const w=Math.round(gc.clientWidth*dpr),h=Math.round(gc.clientHeight*dpr);if(!w)return;if(gc.width!==w){gc.width=w;gc.height=h;}
  gx.clearRect(0,0,w,h);const maxMs=50;gx.font=`${10*dpr}px JetBrains Mono, monospace`;
  for(const [ms,c] of [[16.7,COL.good],[33.3,COL.warn]]){const y=h-ms/maxMs*h;gx.strokeStyle=c+'55';gx.lineWidth=1;gx.setLineDash([3*dpr,3*dpr]);gx.beginPath();gx.moveTo(0,y);gx.lineTo(w,y);gx.stroke();gx.setLineDash([]);gx.fillStyle=c+'bb';gx.fillText(Math.round(1000/ms)+' fps',3*dpr,y-3*dpr);}
  const path=()=>{gx.beginPath();for(let i=0;i<HIST;i++){const v=ft[(hi+i)%HIST];const x=i/(HIST-1)*w,y=h-Math.min(v,maxMs)/maxMs*h;i?gx.lineTo(x,y):gx.moveTo(x,y);}};
  path();gx.lineTo(w,h);gx.lineTo(0,h);gx.closePath();const g=gx.createLinearGradient(0,0,0,h);g.addColorStop(0,'rgba(134,216,255,.32)');g.addColorStop(1,'rgba(134,216,255,0)');gx.fillStyle=g;gx.fill();
  path();gx.strokeStyle=COL.accent;gx.lineWidth=1.5*dpr;gx.stroke();
  const last=ft[(hi+HIST-1)%HIST],ly=h-Math.min(last,maxMs)/maxMs*h;gx.fillStyle=COL[health(last)];gx.beginPath();gx.arc(w-4*dpr,ly,3.5*dpr,0,7);gx.fill();
  let mn=1e9,mx=0,sm=0,n=0;for(const v of ft)if(v>=2){mn=Math.min(mn,v);mx=Math.max(mx,v);sm+=v;n++;}
  if(n){$('gMin').textContent='min '+mn.toFixed(1);$('gAvg').textContent='avg '+(sm/n).toFixed(1)+' ms';$('gMax').textContent='max '+mx.toFixed(1);}
}
let uiN=0;const dot=document.querySelector('#pill .dot');
function uiFrame(){selRing();
  if(document.body.classList.contains('ui-off'))return;
  afBox();
  if(openP==='camera'&&uiN%6===0){if(UIS.camSub==='move'&&S.camMode==='orbit'){ctl.cDist();ctl.cYaw();ctl.cPitch();ctl.cTy();}
    const V=LV;if(V){const f=n=>n.toFixed(2),yd=Math.round(Math.atan2(V.fw[0],V.fw[2])*180/Math.PI),pd=Math.round(Math.asin(Math.max(-1,Math.min(1,V.fw[1])))*180/Math.PI);
      $('camInfo').innerHTML=`<dt>Position</dt><dd>${V.eye.map(f).join('  ')}</dd><dt>Looking</dt><dd>${yd}° · ${pd>0?'+':''}${pd}°</dd>`+
        (dofOn()?`<dt>Focus</dt><dd>${curFocus.toFixed(2)}${S.focusMode!=='manual'?(Math.abs(curFocus-focusTgt)<focusTgt*.02?' · locked':' · seeking'):''}</dd>`:'')+
        `<dt>Exposure</dt><dd>${expNow().toFixed(2)}× · ${isAE()?'auto':'manual'}</dd>`;}}
  if(uiN%3===0)drawSpark();
  if(!$('stats').hidden)drawGraph();
  if(uiN++%6)return;
  const ms=1000/fpsS;$('pFps').textContent=fpsS.toFixed(0);dot.className='dot '+{good:'',warn:'w',bad:'b'}[health(ms)];
  $('pTag').textContent=pending?'Compiling…':paused?'Paused':isCosmos()?sceneName(S.scene):MODES[MIDX[S.renderMode]][2];
  if($('stats').hidden)return;
  $('sFps').textContent=fpsS.toFixed(0);$('sMs').textContent=ms.toFixed(1)+' ms';
  const co=SCENES[S.scene].cosmos,mr=W*H*S.spp*fpsS*S.bounces/1e6;
  const R=[['Scene',sceneName(S.scene)],['Method',co?'Cosmos ray-marcher':MODES[MIDX[S.renderMode]][1]],['Resolution',`${W}×${H} · ${pct(S.scale)}${taaOn()?` → ${cv.width}×${cv.height}`:''}`],
    ['Frames',`${Math.min(frame,accCap())}${idle?' · settled':''}`],
    ['Contents',co?['Planet and atmosphere','Gas giant and rings','Black hole'][co.kind]:`${SC.length} spheres · ${BX.length} boxes${PR.length?' · '+PR.length+' prisms':''}${LN.length?' · '+LN.length+' lenses':''} · ${LI.length+LB.length} lights`],
    ['Preset',pName(S.preset)],['Buffer',fExt?'16-bit float':'8-bit']];
  if(!co&&S.renderMode==='path')R.push(['Rays',`≈${idle?0:mr.toFixed(0)} M/s`]);
  $('sRows').innerHTML=R.map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join('');
}

