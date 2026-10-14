/* ---------- shader warm-up: compile every scene's shaders once, up front ---------- */
// After the first picture, the sources of every built-in scene and method (and each world with clouds on and off) are
// generated and compiled in the background, a few at a time, into the program caches (PCACHE, PE.cache): switching scene
// or changing a setting then finds its program ready. The browser keeps compiled shaders in its own disk cache, so later
// launches compile from there in a fraction of the time. The first launch (and the first after an update) shows progress.
const WARM=new Map();           // programs compiling now, by key: 'tr|'+source or 'pe|'+name+'|'+key
let warmJobs=null,warmTotal=0,warmDone=0,warmShow=false,warmT0=0;
const warmKey=x=>x.n!==undefined?'pe|'+x.n+'|'+x.key:'tr|'+x.fs;
function warmAdopt(x){if(x&&x.p&&(x.fs!==undefined||x.n!==undefined))WARM.set(warmKey(x),x);}
function warmTake(k){const x=WARM.get(k);if(!x)return null;WARM.delete(k);return x;}
const warmGpu=(()=>{try{const d=gl.getExtension('WEBGL_debug_renderer_info');return d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}catch(e){return '';}})();
const WARM_ID=BUILD+'|'+warmGpu;
// every source the app can build for the built-in and saved scenes, found by stepping through them without drawing
function warmSources(){
  const keep={...S},keepLz=lzBuilt,out=[],seen=new Set();
  const has=k=>seen.has(k)||WARM.has(k)||(k.startsWith('tr|')?PCACHE.has(k.slice(3)):!!(PE.cache&&PE.cache.has(k.slice(3))));
  const add=(o,label)=>{const k=warmKey(o);if(has(k))return;seen.add(k);out.push({...o,label});};
  try{
    for(const sc of Object.keys(SCENES)){
      try{S.scene=sc;const co=SCENES[sc].cosmos,name=sceneName(sc);
        if(co&&peOn()){for(const cl of (co.clouds||co.dust)?[true,false]:[true]){S.clouds=cl;
            for(const [n,[vs,fs]] of Object.entries(peSrcs()))add({n,vs,fs,key:vs.length+':'+fs},name+(cl?'':' · no clouds'));}}
        else if(co)add({fs:cosmosFS()},name);
        else{buildScene(true);for(const [m,mn] of MODES)for(const rs of m==='hybrid'?[true,false]:[keep.restir]){S.renderMode=m;S.restir=rs;add({fs:traceFS()},name+' · '+mn);}}
      }catch(e){console.warn('Prism: could not prepare shaders for',sc,e);}
    }
  }finally{Object.assign(S,keep);lzBuilt=keepLz;if(!isCosmos())buildScene(true);syncAll();}
  return out;
}
function warmLink(j){const v=gl.createShader(gl.VERTEX_SHADER),f=gl.createShader(gl.FRAGMENT_SHADER),p=gl.createProgram();
  gl.shaderSource(v,j.vs||VS);gl.compileShader(v);gl.shaderSource(f,j.fs);gl.compileShader(f);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);
  const x=j.n!==undefined?{n:j.n,key:j.key,p,v,f}:{fs:j.fs,p,v,f};x.label=j.label;WARM.set(warmKey(x),x);}
function warmFinish(x){
  if(!gl.getProgramParameter(x.p,gl.LINK_STATUS)){console.warn('Prism: shader did not compile ('+x.label+')\n'+(gl.getShaderInfoLog(x.f)||'')+(gl.getProgramInfoLog(x.p)||''));
    gl.deleteProgram(x.p);gl.deleteShader(x.v);gl.deleteShader(x.f);return;}
  if(x.n!==undefined)peFinish(x);
  else{gl.deleteShader(x.v);gl.deleteShader(x.f);if(!PCACHE.has(x.fs)){PCACHE.set(x.fs,{p:x.p,u:progU(x.p)});}else gl.deleteProgram(x.p);}}
// once a frame: plan after the first picture, keep a few compiles in flight (one at a time without parallel compiling)
function warmStep(){
  if(warmJobs===null){if(!TR||pending||broken||document.body.classList.contains('benching'))return;
    warmJobs=warmSources();warmTotal=warmJobs.length;warmDone=0;warmT0=performance.now();
    let seenId=null;try{seenId=localStorage.getItem('prism-warm');}catch(e){}
    warmShow=warmTotal>0&&seenId!==WARM_ID;if(warmShow)warmUI();if(!warmTotal)warmEnd();return;}
  // finish whatever has compiled (including builds the app dropped half way, so their work is kept)
  for(const x of [...WARM.values()]){if(pExt&&!gl.getProgramParameter(x.p,pExt.COMPLETION_STATUS_KHR))continue;
    WARM.delete(warmKey(x));warmFinish(x);if(x.label!==undefined)warmDone++;if(!pExt)break;}
  if(!warmTotal)return;
  if(warmDone>=warmTotal){warmEnd();return;}
  // a build the app asked for meanwhile may have taken a job over: count it as done
  const cap=pExt?(warmShow?8:3):1,inFlight=[...WARM.values()].filter(x=>x.label!==undefined).length;
  for(let i=inFlight;i<cap&&warmJobs.length;i++){const j=warmJobs.shift();const k=warmKey(j);
    if(k.startsWith('tr|')?PCACHE.has(j.fs):!!(PE.cache&&PE.cache.has(j.n+'|'+j.key))){warmDone++;i--;continue;}warmLink(j);}
  if(!warmJobs.length&&![...WARM.values()].some(x=>x.label!==undefined))warmDone=warmTotal;
  warmUI();if(warmDone>=warmTotal)warmEnd();
}
function warmUI(){if(!warmShow)return;let e=$('warm');if(!e&&performance.now()-warmT0<1200)return;   // shaders the browser already has finish too fast to need a window
  if(!e){e=document.createElement('div');e.id='warm';e.setAttribute('role','dialog');e.setAttribute('aria-modal','true');e.setAttribute('aria-labelledby','warmT');
    e.innerHTML=`<div class="wcard glass"><h3 id="warmT">Preparing shaders</h3><p>Prism compiles every shader once so scenes and settings switch without pausing. Your browser keeps them, so this only happens on the first launch and after updates.</p>
      <div class="prog"><i id="warmBar"></i></div><div class="wrow"><span id="warmMsg"></span><span id="warmPct"></span></div>
      <div class="row-btns"><button class="btn" id="warmBg" type="button">Continue in background</button></div></div>`;
    document.body.appendChild(e);$('warmBg').onclick=()=>{warmShow=false;e.remove();toast('Shaders keep compiling in the background');};}
  const f=warmTotal?warmDone/warmTotal:1,cur=[...WARM.values()].find(x=>x.label!==undefined);
  $('warmBar').style.width=Math.round(f*100)+'%';$('warmPct').textContent=`${warmDone} of ${warmTotal}`;$('warmMsg').textContent=cur?cur.label:'Finishing';}
function warmEnd(){warmTotal=0;try{localStorage.setItem('prism-warm',WARM_ID);}catch(e){}
  const e=$('warm');if(e){e.remove();toast('Shaders ready');}warmShow=false;
  if(typeof notesMaybe==='function')notesMaybe();}
window.__prismWarm={get state(){return {total:warmTotal,done:warmDone,queued:warmJobs&&warmJobs.length,compiling:[...WARM.values()].map(x=>x.label||'(app build)'),show:warmShow};}};
