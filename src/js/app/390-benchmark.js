/* ---------- performance survey: an opt-in benchmark of every scene, preset and method, with an optional upload (before 380, which closes the app scope) ---------- */
// Each test sets a scene, a view, a preset and a few settings at a fixed 1600×900 output (so results compare across
// screens), puts the camera at the scene's own view, waits for the shaders, then sways the camera gently around that view
// (the subject stays in frame) and times every frame until it has enough of them: GPU-bound frame time (the frame is
// read back, so the GPU has finished it). The main figure is the mean of the middle 80% of frames, which stays precise
// in browsers whose timers count whole milliseconds (Firefox). The last frame is checked for a blank picture.
// Nothing is sent unless the user presses Send after seeing exactly what will be sent.
let BM_=null,bmLast=null;
const BM_FIX={adaptive:false,animate:false,autoMove:'off',fpsCap:'unlimited',maxAcc:1e9,accum:true};
const BM_SPOTS={forest:{scene:'blue planet',dir:[0.9130978484451158,0.17364817766693033,0.36891547752548204],name:'Earth forest, on the ground'},
  mars:{scene:'dust world',dir:[0.5,0.3,0.812],name:'Mars, on the ground'}};
const BM_OUT=[1600,900],BM_MIN=90,BM_CAP=25000;   // output size, frames needed per test, longest a test may take (ms)
// Frame time comes from the GPU's own clock (timer queries: exactly the time the GPU spent on the frame, without
// waiting on it and without the screen's refresh rate getting in the way) where the browser offers it; elsewhere
// (Firefox) the frame is read back so the GPU has finished, and the time to that point is counted.
const bmTQ=gl.getExtension('EXT_disjoint_timer_query_webgl2');let bmQ=[],bmQOpen=null,bmUseTQ=!!bmTQ;   // falls back to read-back if the queries never answer
function bmBegin(){if(!BM_||!BM_.rec||!bmUseTQ||bmQOpen)return;bmQOpen=gl.createQuery();gl.beginQuery(bmTQ.TIME_ELAPSED_EXT,bmQOpen);}
function bmPollQ(){while(bmQ.length&&gl.getQueryParameter(bmQ[0],gl.QUERY_RESULT_AVAILABLE)){const q=bmQ.shift(),ns=gl.getQueryParameter(q,gl.QUERY_RESULT);
  if(!gl.getParameter(bmTQ.GPU_DISJOINT_EXT)&&BM_&&BM_.rec)BM_.ms.push(ns/1e6);gl.deleteQuery(q);}}
function bmHook(t0){if(bmTQ){if(bmQOpen){gl.endQuery(bmTQ.TIME_ELAPSED_EXT);bmQ.push(bmQOpen);bmQOpen=null;}bmPollQ();}
  if(!BM_||!BM_.rec)return;
  if(!bmUseTQ){gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px1);BM_.ms.push(performance.now()-t0);}
  if(BM_.snap){BM_.snap=false;BM_.cover=bmCover();}}
// share of the picture that is not black, from a 32×18 grid of the frame just drawn
function bmCover(){const w=cv.width,h=cv.height,b=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);let lit=0,n=0;
  for(let j=0;j<18;j++)for(let i=0;i<32;i++){const k=((Math.floor((j+.5)/18*h))*w+Math.floor((i+.5)/32*w))*4;n++;if(b[k]+b[k+1]+b[k+2]>12)lit++;}return lit/n;}
// the timer's step: about 1 ms in Firefox, a few microseconds elsewhere
const bmTimer=()=>{let m=1e9,a=performance.now();for(let i=0;i<2e5&&m>1e-3;i++){const b=performance.now();if(b>a){m=Math.min(m,b-a);a=b;}}return +m.toFixed(4);};
function bmSuite(full){
  const sc=Object.keys(SCENES).filter(k=>!custOf(k)),pr=Object.keys(PRESETS),T=[];
  const add=(sec,o)=>T.push({sec,preset:'balanced',...o});
  for(const s of sc)add('Scenes',{scene:s});
  for(const v of Object.keys(BM_SPOTS))add('Scenes',{scene:BM_SPOTS[v].scene,view:v});
  for(const s of full?[...sc.map(s=>({scene:s})),{scene:'dust world',view:'mars'},{scene:'blue planet',view:'forest'}]:[{scene:'cornell box'},{scene:'blue planet',view:'forest'}])
    for(const p of pr)if(p!=='balanced')add('Presets',{...s,preset:p});
  for(const s of full?['cornell box','glass temple','optics bench']:['cornell box'])for(const [m] of MODES)add('Methods',{scene:s,set:{renderMode:m}});
  if(full){
    for(const sc2 of [.25,.5,.75,1])add('Features',{scene:'cornell box',set:{scale:sc2}});
    add('Features',{scene:'cornell box',set:{upscale:false}});add('Features',{scene:'cornell box',set:{restir:false}});
    add('Features',{scene:'optics bench',set:{dispersion:true}});add('Features',{scene:'glass temple',set:{bounces:12}});
    add('Features',{scene:'blue planet',view:'forest',set:{clouds:false}});
  }
  return T;
}
const bmLabel=t=>{const parts=[t.view?BM_SPOTS[t.view].name:sceneName(t.scene)];if(t.sec!=='Scenes'||t.preset!=='balanced')parts.push(pName(t.preset));
  for(const [k,v] of Object.entries(t.set||{}))parts.push(k==='renderMode'?(MODES.find(m=>m[0]===v)||[,v])[1]:k==='scale'?`scale ${v}`:`${k} ${v===false?'off':v===true?'on':v}`);return parts.join(' · ');};
const bmSleep=ms=>new Promise(r=>setTimeout(r,ms));
async function bmSettle(maxMs=60000){const t0=performance.now();await bmSleep(50);
  while((pending||document.body.classList.contains('busy')||(isCosmos()&&(!PE.P||PE.fr<5)))&&performance.now()-t0<maxMs)await bmSleep(50);return performance.now()-t0;}
function bmStand(v){const d=BM_SPOTS[v].dir,g=PE.cfg;peProbe(g,d,true);peProbe(g,d,true);
  const hb=Math.max(PE.pr.h,PE.pr.wl),eye=d.map(x=>x*(1+hb+1.7/(g.R*1000)));
  const E=[d[2],0,-d[0]],L=Math.hypot(...E),e1=E.map(x=>x/L);
  S.camMode='fly';changed('camMode');Object.assign(cam,{px:eye[0],py:eye[1],pz:eye[2]});cam.ref=null;flyAim(e1.map((x,i)=>x-d[i]*.05));reset();}
// warm up (the planet streams in its tiles), then sway the camera around its starting view and time each frame until
// there are enough; time while the tab is hidden (no frames are drawn) is left out
function bmMeasure(t,full){
  const y0=cam.yaw,p0=cam.pitch,ly0=cam.lyaw,lp0=cam.lpitch,fly=S.camMode==='fly';
  const pose=s=>{const a=Math.sin(s*2*Math.PI/6),b=Math.sin(s*2*Math.PI/4.3);
    if(fly){cam.lyaw=ly0+.22*a;cam.lpitch=lp0+.04*b;}else{cam.yaw=y0+.16*a;cam.pitch=p0+.035*b;}nudge();};
  // a timed lap ends once it has enough frames; it then asks the next drawn frame for a blank-picture check (once)
  const run=(ms,rec)=>new Promise(res=>{let tp=performance.now(),el=0,asked=false;const wall=[];BM_.ms=[];BM_.rec=rec;BM_.snap=false;
    const f=now=>{let dt=now-tp;tp=now;if(BM_.hid){BM_.hid=document.hidden;dt=0;}else{el+=dt;if(rec)wall.push(dt);}pose(el/1000);
      if(rec&&bmUseTQ&&el>2000&&!BM_.ms.length){bmUseTQ=false;console.warn('Prism: GPU timer queries gave no results; timing by read-back');}
      const done=el>=ms&&(!rec||BM_.ms.length>=BM_MIN);
      if(rec&&!asked&&(done||el>=BM_CAP)){asked=true;BM_.snap=true;}
      const fin=BM_.stop||(rec?(asked&&!BM_.snap)||el>=BM_CAP+500:done);
      if(fin){BM_.rec=false;BM_.snap=false;res(wall.slice(2));}else requestAnimationFrame(f);};requestAnimationFrame(f);});
  return (async()=>{await run(t.view?3000:1500,false);BM_.cover=1;const wall=await run(full?3500:2500,true);
    const a=BM_.ms.slice(2).sort((x,y)=>x-y),n=a.length,q=f=>n?a[Math.min(n-1,Math.floor(n*f))]:0,mid=a.slice(Math.floor(n*.1),Math.max(Math.floor(n*.1)+1,Math.ceil(n*.9)));
    const w=wall.reduce((s,x)=>s+x,0);
    return {frames:n,typMs:n?+(mid.reduce((s,x)=>s+x,0)/mid.length).toFixed(3):0,medMs:+q(.5).toFixed(2),p90Ms:+q(.9).toFixed(2),p99Ms:+q(.99).toFixed(2),
      avgMs:n?+(a.reduce((s,x)=>s+x,0)/n).toFixed(3):0,fpsScreen:wall.length?+(wall.length*1000/w).toFixed(1):0,cover:+(BM_.cover??1).toFixed(2)};})();
}
async function bmRun(full,limit){
  if(BM_)return;const tests=bmSuite(full).slice(0,limit||1e9),keepS={...S},keepCam={...cam},wasPaused=paused,t00=performance.now();
  BM_={ms:[],rec:false,stop:false,tests,res:[]};wiping=true;BM_RES=BM_OUT;setPaused(false);document.body.classList.add('benching');
  const out=$('bmOut');out.innerHTML='';$('bmQuick').disabled=$('bmFull').disabled=true;$('bmStop').hidden=false;$('bmProg').hidden=false;
  let err=null;
  try{
    for(let i=0;i<tests.length&&!BM_.stop;i++){const t=tests[i];
      $('bmBar').style.width=Math.round(i/tests.length*100)+'%';$('bmMsg').textContent=`${i+1} of ${tests.length} · ${bmLabel(t)}`;
      BM_.phase='scene';if(S.scene!==t.scene){S.scene=t.scene;changed('scene');await bmSettle();}
      Object.assign(S,PRESETS[t.preset],BM_FIX,{renderMode:keepS.renderMode,restir:true,upscale:true,clouds:true},t.set||{});S.preset=t.preset;
      if(S.camMode==='fly'){S.camMode='orbit';changed('camMode');}
      Object.assign(cam,SCENES[t.scene].cam||CAM0);tween=null;inert=null;fbBase();   // the scene's own view, every test
      BM_.phase='build';build();resize();reset();const buildMs=await bmSettle();
      if(t.view){BM_.phase='stand';bmStand(t.view);await bmSettle();}BM_.phase='measure';
      const minLit=SCENES[t.scene].cosmos&&!t.view?.03:.15;   // a planet or black hole in space is mostly black sky
      let r=null;for(let tries=0;tries<2&&!BM_.stop;tries++){r=await bmMeasure(t,full);if(r.frames>=BM_MIN&&r.cover>=minLit)break;}
      if(BM_.stop&&(!r||r.frames<BM_MIN))break;
      BM_.res.push({id:i,sec:t.sec,label:bmLabel(t),scene:t.scene,view:t.view||'orbit',preset:t.preset,mode:S.renderMode,set:t.set||{},res:[W,H],scale:S.scale,
        buildMs:Math.round(buildMs),...r,broken:!!broken||r.frames<BM_MIN||r.cover<minLit,
        why:broken?'shader error':r.frames<BM_MIN?'too few frames ('+r.frames+')':r.cover<minLit?'blank picture':''});
    }
  }catch(e){err=e;console.error(e);}
  const stopped=BM_.stop,res=BM_.res;BM_=null;BM_RES=null;
  // put everything back the way the user had it
  if(S.scene!==keepS.scene){S.scene=keepS.scene;changed('scene');}
  Object.assign(S,keepS);if(S.camMode!=='orbit')changed('camMode');Object.assign(cam,keepCam);syncAll();build();resize();reset();setPaused(wasPaused);
  wiping=false;save();document.body.classList.remove('benching');
  $('bmQuick').disabled=$('bmFull').disabled=false;$('bmStop').hidden=true;$('bmProg').hidden=true;
  if(err&&!res.length){out.innerHTML=`<p class="verdict">The benchmark stopped: ${String(err)}.</p>`;return;}
  try{const sys=await bmSys();
  bmLast={schema:2,output:BM_OUT,timing:bmUseTQ?'gpu-timer':'readback',timerMs:bmUseTQ?0.001:bmTimer(),runId:(crypto.randomUUID?crypto.randomUUID():String(Math.random()).slice(2)),time:new Date().toISOString(),suite:full?'full':'quick',
    complete:!stopped&&!err,durationS:Math.round((performance.now()-t00)/1000),score:bmScore(res),system:sys,results:res};
  bmShow();toast(stopped?'Benchmark stopped':'Benchmark finished');}
  catch(e){console.error(e);out.innerHTML=`<p class="verdict">Could not show the results: ${esc(e.message||e)}.</p>`;}
}
// the score: geometric-mean frame rate over the tests, from the GPU-bound frame time
function bmScore(r){const v=r.filter(x=>x.typMs>0&&!x.broken);return v.length?Math.round(Math.exp(v.reduce((s,x)=>s+Math.log(1000/x.typMs),0)/v.length)):0;}
async function bmSys(){
  const dbg=gl.getExtension('WEBGL_debug_renderer_info'),P=k=>{try{return gl.getParameter(k);}catch(e){return null;}};
  const o={app:{version:VERSION,build:BUILD,shell:window.prismDesktop?'desktop':'web'},
    gpu:{vendor:dbg?P(dbg.UNMASKED_VENDOR_WEBGL):P(gl.VENDOR),renderer:dbg?P(dbg.UNMASKED_RENDERER_WEBGL):P(gl.RENDERER),gl:P(gl.VERSION),glsl:P(gl.SHADING_LANGUAGE_VERSION),
      maxTexture:P(gl.MAX_TEXTURE_SIZE),maxLayers:P(gl.MAX_ARRAY_TEXTURE_LAYERS),floatTargets:fFloat,floatLinear:!!gl.getExtension('OES_texture_float_linear')},
    cpu:{threads:navigator.hardwareConcurrency||null},memory:{gb:navigator.deviceMemory||null},
    display:{w:screen.width,h:screen.height,dpr:devicePixelRatio,canvas:[cv.width,cv.height]},browser:{ua:navigator.userAgent}};
  try{if(navigator.userAgentData)o.browser.client=await navigator.userAgentData.getHighEntropyValues(['platform','platformVersion','architecture','bitness','model','mobile','fullVersionList']);}catch(e){}
  try{if(navigator.gpu){const a=await navigator.gpu.requestAdapter();if(a){const i=a.info||(a.requestAdapterInfo?await a.requestAdapterInfo():{});o.gpu.webgpu={vendor:i.vendor,architecture:i.architecture,device:i.device,description:i.description};}}}catch(e){}
  try{if(window.prismDesktop)o.desktop=await window.prismDesktop.systemInfo();}catch(e){}
  return o;
}
function bmShow(){
  const r=bmLast,out=$('bmOut'),g={};for(const x of r.results)(g[x.sec]=g[x.sec]||[]).push(x);
  const mx=Math.max(...r.results.map(x=>x.typMs),1),fps=ms=>ms>0?Math.round(1000/ms):0;
  const sys=r.system,gpu=(sys.desktop&&sys.desktop.gpu&&sys.desktop.gpu[0]&&sys.desktop.gpu[0].name)||sys.gpu.renderer||'Unknown GPU';
  out.innerHTML=`<p class="verdict">Score <b>${r.score}</b> (typical fps across the tests at 1600×900 output) on ${esc(gpu)}${r.complete?'':' (incomplete run)'}.</p>
  ${Object.entries(g).map(([sec,rows])=>`<h4 class="bmH">${sec}</h4><div class="res">${rows.map(x=>`<div class="rr bm"><span class="rn">${esc(x.label)}<small>${x.broken?'Not counted: '+esc(x.why||'failed'):`${fps(x.typMs)} fps · 1% low ${fps(x.p99Ms)} · ${x.res[0]}×${x.res[1]}`}</small></span>
    <span class="rb"><i style="width:${Math.max(3,x.typMs/mx*70)}%"></i>${x.typMs.toFixed(1)} ms</span></div>`).join('')}</div>`).join('')}
  <h4 class="bmH">Share your results</h4>
  <p class="note">Sending helps tune the presets for hardware like yours. It sends the results above and the device details below, with a random ID. No name, account or location.</p>
  <details class="bmData"><summary>What will be sent</summary><pre>${esc(JSON.stringify(r,null,1))}</pre></details>
  <div class="row-btns"><button class="btn primary" id="bmSend"${BENCH_URL?'':' disabled'}>Send results</button><button class="btn" id="bmCopy">Copy</button></div>
  <p class="fine" id="bmSent">${BENCH_URL?'':'Sending is not set up in this build.'}</p>`;
  $('bmCopy').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(r));toast('Copied');}catch(e){toast('Could not copy');}};
  $('bmSend').onclick=bmSend;
}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
async function bmSend(){const b=$('bmSend'),msg=$('bmSent');if(!bmLast||!BENCH_URL)return;b.disabled=true;msg.textContent='Sending…';
  const body=JSON.stringify(bmLast);
  try{if(window.prismDesktop&&window.prismDesktop.post)await window.prismDesktop.post(BENCH_URL,body);
    else await fetch(BENCH_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body});
    msg.textContent='Sent. Thank you!';b.textContent='Sent';}
  catch(e){msg.textContent='Could not send: '+(e.message||e);b.disabled=false;}}
paneEl('bench').innerHTML=`<p class="note">Times every scene, preset and method on this device. Keep Prism on screen while it runs. Your settings are restored afterward. You choose whether to send the results.</p>
<div class="row-btns"><button class="btn primary" id="bmQuick">Quick · about 2 min</button><button class="btn" id="bmFull">Full · about 10 min</button><button class="btn" id="bmStop" hidden>Stop</button></div>
<div id="bmProg" hidden><div class="prog"><i id="bmBar"></i></div><div id="bmMsg"></div></div><div id="bmOut"></div>`;
document.addEventListener('visibilitychange',()=>{if(BM_&&document.hidden){BM_.hid=true;toast('Benchmark paused while Prism is hidden');}});
$('bmQuick').onclick=()=>bmRun(false);$('bmFull').onclick=()=>bmRun(true);$('bmStop').onclick=()=>{if(BM_)BM_.stop=true;};
$('goBench').onclick=()=>openPane('bench');
window.__prismBench={run:bmRun,get last(){return bmLast;},get state(){return BM_&&{phase:BM_.phase,rec:BM_.rec,frames:BM_.ms.length,snap:BM_.snap,hid:BM_.hid,stop:BM_.stop,pending:!!pending,frame,idle,busy:document.body.classList.contains('busy')};}};

/* ---------- updates: the website checks version.json; the desktop app reports what its updater found ---------- */
function updBar(msg,btn,act){let e=$('updBar');if(!e){e=document.createElement('div');e.id='updBar';document.body.appendChild(e);}
  e.innerHTML=`<span>${msg}</span>${btn?`<button class="btn primary" type="button">${btn}</button>`:''}<button class="x" type="button" aria-label="Dismiss">×</button>`;
  if(btn)e.querySelector('.btn').onclick=act;e.querySelector('.x').onclick=()=>e.remove();}
if(window.prismDesktop&&window.prismDesktop.onUpdate)window.prismDesktop.onUpdate(u=>{
  if(u.state==='ready')updBar(`Prism ${esc(u.version)} is ready.`,'Restart to update',()=>window.prismDesktop.install());});
else if(/^https?:$/.test(location.protocol)&&!/^(localhost|127\.|\[::1\])/.test(location.hostname)&&BUILD!=='dev'){
  let shown=false;const chk=async()=>{if(shown||document.hidden)return;try{const v=await (await fetch('version.json?t='+Date.now(),{cache:'no-store'})).json();
    if(v.build&&v.build!==BUILD){shown=true;updBar(`A new version of Prism is out${v.version?' ('+esc(v.version)+')':''}.`,'Reload',()=>location.reload());}}catch(e){}};
  setTimeout(chk,15000);setInterval(chk,30*60000);document.addEventListener('visibilitychange',chk);}
// the website links to the Windows app; the app shows its own version
if(REPO&&!window.prismDesktop)for(const c of document.querySelectorAll('.credit'))c.insertAdjacentHTML('beforeend',` · <a href="https://github.com/${esc(REPO)}/releases/latest" target="_blank" rel="noopener">Windows app</a>`);
