/* ---------- performance survey: an opt-in benchmark of every scene, preset and method, with an optional upload (before 380, which closes the app scope) ---------- */
// Each test sets a scene, a view, a preset and a few settings, waits for the shaders, then turns the camera slowly
// and times every frame: GPU-bound frame time (the frame is read back, so the GPU has finished it) and wall-clock fps.
// Nothing is sent unless the user presses Send after seeing exactly what will be sent.
let BM_=null,bmLast=null;
const BM_FIX={adaptive:false,animate:false,autoMove:'off',fpsCap:'unlimited',maxAcc:1e9,accum:true};
const BM_SPOTS={forest:{scene:'blue planet',dir:[0.9130978484451158,0.17364817766693033,0.36891547752548204],name:'Earth forest, on the ground'},
  mars:{scene:'dust world',dir:[0.5,0.3,0.812],name:'Mars, on the ground'}};
function bmHook(t0){if(!BM_||!BM_.rec)return;gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px1);BM_.ms.push(performance.now()-t0);}
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
async function bmRun(full,limit){
  if(BM_)return;const tests=bmSuite(full).slice(0,limit||1e9),keepS={...S},keepCam={...cam},wasPaused=paused,t00=performance.now();
  BM_={ms:[],rec:false,stop:false,tests,res:[]};wiping=true;setPaused(false);document.body.classList.add('benching');
  const out=$('bmOut');out.innerHTML='';$('bmQuick').disabled=$('bmFull').disabled=true;$('bmStop').hidden=false;$('bmProg').hidden=false;
  let err=null;
  try{
    for(let i=0;i<tests.length&&!BM_.stop;i++){const t=tests[i];
      $('bmBar').style.width=Math.round(i/tests.length*100)+'%';$('bmMsg').textContent=`${i+1} of ${tests.length} · ${bmLabel(t)}`;
      if(S.scene!==t.scene){S.scene=t.scene;changed('scene');await bmSettle();}
      Object.assign(S,PRESETS[t.preset],BM_FIX,{renderMode:keepS.renderMode,restir:true,upscale:true,clouds:true},t.set||{});S.preset=t.preset;
      if(!t.view&&S.camMode==='fly'){S.camMode='orbit';changed('camMode');Object.assign(cam,SCENES[t.scene].cam||CAM0);}
      build();resize();reset();const buildMs=await bmSettle();
      if(t.view){bmStand(t.view);await bmSettle();}
      // warm up (the planet streams in its tiles), then measure while the camera turns
      const turn=dt=>{if(S.camMode==='fly')cam.lyaw+=dt*.12;else cam.yaw+=dt*.12;nudge();};
      // time while the tab is hidden (no frames are drawn) is left out and the lap extended
      const lap=ms=>new Promise(res=>{let tp=performance.now(),t0=tp;const wall=[];const f=now=>{let dt=(now-tp)/1000;tp=now;if(BM_.hid){t0+=dt*1000;dt=0;BM_.hid=document.hidden;}else wall.push(dt*1000);turn(dt);
        if(now-t0<ms&&!BM_.stop)requestAnimationFrame(f);else res(wall.slice(2));};requestAnimationFrame(f);});
      await lap(t.view?3000:1500);BM_.ms=[];BM_.rec=true;const wall=await lap(full?3500:2500);BM_.rec=false;
      const a=BM_.ms.slice(2).sort((x,y)=>x-y),q=f=>a.length?a[Math.min(a.length-1,Math.floor(a.length*f))]:0,w=wall.reduce((s,x)=>s+x,0);
      BM_.res.push({id:i,sec:t.sec,label:bmLabel(t),scene:t.scene,view:t.view||'orbit',preset:t.preset,mode:S.renderMode,set:t.set||{},res:[W,H],scale:S.scale,
        buildMs:Math.round(buildMs),frames:a.length,medMs:+q(.5).toFixed(2),p90Ms:+q(.9).toFixed(2),p99Ms:+q(.99).toFixed(2),
        avgMs:a.length?+(a.reduce((s,x)=>s+x,0)/a.length).toFixed(2):0,fpsWall:wall.length?+(wall.length*1000/w).toFixed(1):0,broken:!!broken});
    }
  }catch(e){err=e;console.error(e);}
  const stopped=BM_.stop,res=BM_.res;BM_=null;
  // put everything back the way the user had it
  if(S.scene!==keepS.scene){S.scene=keepS.scene;changed('scene');}
  Object.assign(S,keepS);if(S.camMode!=='orbit')changed('camMode');Object.assign(cam,keepCam);syncAll();build();resize();reset();setPaused(wasPaused);
  wiping=false;save();document.body.classList.remove('benching');
  $('bmQuick').disabled=$('bmFull').disabled=false;$('bmStop').hidden=true;$('bmProg').hidden=true;
  if(err&&!res.length){out.innerHTML=`<p class="verdict">The benchmark stopped: ${String(err)}.</p>`;return;}
  try{const sys=await bmSys();
  bmLast={schema:1,runId:(crypto.randomUUID?crypto.randomUUID():String(Math.random()).slice(2)),time:new Date().toISOString(),suite:full?'full':'quick',
    complete:!stopped&&!err,durationS:Math.round((performance.now()-t00)/1000),score:bmScore(res),system:sys,results:res};
  bmShow();toast(stopped?'Benchmark stopped':'Benchmark finished');}
  catch(e){console.error(e);out.innerHTML=`<p class="verdict">Could not show the results: ${esc(e.message||e)}.</p>`;}
}
// the score: geometric-mean frame rate over the tests, from the GPU-bound frame time
function bmScore(r){const v=r.filter(x=>x.medMs>0&&!x.broken);return v.length?Math.round(Math.exp(v.reduce((s,x)=>s+Math.log(1000/x.medMs),0)/v.length)):0;}
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
  const mx=Math.max(...r.results.map(x=>x.medMs),1),fps=ms=>ms>0?Math.round(1000/ms):0;
  const sys=r.system,gpu=(sys.desktop&&sys.desktop.gpu&&sys.desktop.gpu[0]&&sys.desktop.gpu[0].name)||sys.gpu.renderer||'Unknown GPU';
  out.innerHTML=`<p class="verdict">Score <b>${r.score}</b> (typical fps across the tests) on ${esc(gpu)}${r.complete?'':' (incomplete run)'}.</p>
  ${Object.entries(g).map(([sec,rows])=>`<h4 class="bmH">${sec}</h4><div class="res">${rows.map(x=>`<div class="rr bm"><span class="rn">${esc(x.label)}<small>${x.res[0]}×${x.res[1]} · ${fps(x.medMs)} fps · 1% low ${fps(x.p99Ms)}${x.broken?' · failed':''}</small></span>
    <span class="rb"><i style="width:${Math.max(3,x.medMs/mx*70)}%"></i>${x.medMs.toFixed(1)} ms</span></div>`).join('')}</div>`).join('')}
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
window.__prismBench={run:bmRun,get last(){return bmLast;}};

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
