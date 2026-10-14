/* ---------- renderer comparison ---------- */
let B_=null;const px1=new Uint8Array(4),pxf=new Float32Array(4);
function readCanvas(){const b=new Uint8Array(cv.width*cv.height*4);gl.readPixels(0,0,cv.width,cv.height,gl.RGBA,gl.UNSIGNED_BYTE,b);return b;}
function psnr(a,b){let s=0,n=0;const w=cv.width,h=cv.height;
  for(let y=1;y<h-1;y+=3)for(let x=1;x<w-1;x+=3)for(let c=0;c<3;c++){let d=0;
    for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const k=((y+j)*w+x+i)*4+c;d+=a[k]-b[k];}d/=9;s+=d*d;n++;}
  const mse=s/n/65025;return mse<=1e-10?99:10*Math.log10(1/mse);}
const cmpOut=()=>$('cmpOut');
function cmpProgress(f,msg){$('cmpProg').hidden=false;$('cmpBar').style.width=Math.round(f*100)+'%';$('cmpMsg').textContent=msg;}
async function runBench(only,REF=192){
  if(B_)return;
  if(openP!=='compare')openPane('compare');
  if(isCosmos()){cmpOut().innerHTML=`<p class="verdict">Comparison works in object scenes only.</p><div class="row-btns"><button class="btn" data-s="cornell box">Cornell Box</button><button class="btn" data-s="dungeon">Dungeon</button><button class="btn" data-s="optics bench">Optics Bench</button></div>`;
    for(const b of cmpOut().querySelectorAll('[data-s]'))b.onclick=()=>{S.scene=b.dataset.s;changed('scene');cmpOut().innerHTML='';runBench();};return;}
  const list=MODES.filter(x=>!only||only.includes(x[0])),total=REF+list.length*80;let done=0;
  const keepS={...S},keepCam={...cam},wasPaused=paused;setPaused(false);
  Object.assign(S,{adaptive:false,animate:false,autoMove:'off',aeMode:'manual',exposure:expNow(),grain:0,proj:'persp',maxAcc:1e9,accum:true,fpsCap:'unlimited',upscale:false});   // like for like: the reference is not upscaled either
  B_={ms:[],tr:[],sync:false,cap:false,wake:null,img:null};
  document.body.classList.add('benching');$('cmpRun').disabled=true;cmpOut().innerHTML='';
  const fd=()=>new Promise(res=>{B_.wake=()=>{done++;res();};});
  const setMode=m=>{S.renderMode=m;build();resize();Object.assign(cam,keepCam);reset();};
  let rows=[],err=null;
  try{
    // the reference is taken where the orbit ends, so the last frame of the moving test can be scored too
    const endPose=()=>{Object.assign(cam,keepCam);if(S.camMode==='fly')cam.lyaw+=.48;else cam.yaw+=.48;};
    S.bounces=Math.max(keepS.bounces,6);S.spp=2;setMode('path');endPose();reset();
    for(let i=0;i<REF;i++){if(i%8===0)cmpProgress(done/total,`Rendering the reference image · ${i*2} of ${REF*2} samples`);if(i===REF-1)B_.cap=true;await fd();}
    const ref=B_.img;if(window.__prismKeep)window.__prismKeep.ref=ref;S.bounces=keepS.bounces;S.spp=keepS.spp;
    for(const [m,name] of list){
      cmpProgress(done/total,`Timing ${name} while the camera moves`);setMode(m);
      B_.ms=[];B_.tr=[];B_.sync=true;for(let i=0;i<48;i++){if(S.camMode==='fly')cam.lyaw+=.01;else cam.yaw+=.01;nudge();if(i===47)B_.cap=true;await fd();}B_.sync=false;
      const qm=psnr(B_.img,ref);if(window.__prismKeep)window.__prismKeep[m+'_move']=B_.img;
      cmpProgress(done/total,`Measuring ${name} standing still`);endPose();reset();
      B_.cap=true;await fd();const q1=psnr(B_.img,ref);
      for(let i=1;i<7;i++)await fd();B_.cap=true;await fd();const q8=psnr(B_.img,ref);
      for(let i=8;i<31;i++)await fd();B_.cap=true;await fd();const q32=psnr(B_.img,ref);if(window.__prismKeep)window.__prismKeep[m]=B_.img;
      const md=a=>{a=a.slice(8).sort((x,y)=>x-y);return a[a.length>>1];};rows.push({m,name,med:md(B_.ms),tr:md(B_.tr),qm,q1,q8,q32});
    }
  }catch(e){err=e;}
  Object.assign(S,keepS);Object.assign(cam,keepCam);B_=null;setPaused(wasPaused);syncAll();build();resize();reset();
  document.body.classList.remove('benching');$('cmpRun').disabled=false;$('cmpProg').hidden=true;$('cmpRun').textContent='Run again';
  if(err||!rows.length){cmpOut().innerHTML=`<p class="verdict">The comparison stopped: ${String(err||'no results were recorded')}.</p>`;return;}
  window.__prismLast=rows;
  const mx=Math.max(...rows.map(r=>r.med)),fast=Math.min(...rows.map(r=>r.med)),qc=q=>q>=35?'q-g':q>=27?'q-w':'q-b';
  const pt=rows.find(r=>r.m==='path'),hy=rows.find(r=>r.m==='hybrid');
  let verdict='';
  if(pt&&hy){const r=pt.med/hy.med,sp=r>=1.05?`${r.toFixed(1)}× faster than`:r>.95?'about as fast as':`${(1/r).toFixed(1)}× slower than`;
    const early=hy.q1>=pt.q8?' Its first frame is already closer to the reference than 8 frames of path tracing.':hy.q1>=pt.q1?' It is closer to the reference than path tracing from the first frame.':'';
    verdict=`<p class="verdict">Prism hybrid ran <b>${sp}</b> path tracing here. While moving it scored <b>${hy.qm.toFixed(1)} dB</b> against ${pt.qm.toFixed(1)} dB; standing still, ${hy.q32.toFixed(1)} dB against ${pt.q32.toFixed(1)} dB after 32 frames.${early}</p>`;}
  const row=r=>`<button class="rr" data-m="${r.m}" aria-pressed="${r.m===S.renderMode}"><span class="rn">${r.name}<small>trace ${r.tr.toFixed(1)} ms · ≈${Math.round(1000/r.med)} fps</small></span>
    <span class="rq" title="Accuracy while moving, then after 1, 8 and 32 still frames (dB)"><b class="mv ${qc(r.qm)}">${r.qm.toFixed(1)}</b><b class="${qc(r.q1)}">${r.q1.toFixed(1)}</b><b class="${qc(r.q8)}">${r.q8.toFixed(1)}</b><b class="${qc(r.q32)}">${r.q32.toFixed(1)}</b></span>
    <span class="rb${r.med===fast?' best':''}"><i style="width:${Math.max(3,r.med/mx*70)}%"></i>${r.med.toFixed(1)} ms</span></button>`;
  cmpOut().innerHTML=`${verdict}<div class="legend"><span>GPU time per frame</span><span>Accuracy · moving · 1 · 8 · 32</span></div>
    <div class="res">${rows.map(row).join('')}</div>
    <p class="fine">${sceneName(S.scene)} at ${W}×${H}. Tap a method to switch to it. Accuracy is PSNR against a ${REF*2}-sample path-traced reference: above 35 dB looks identical, below 27 dB looks different.</p>`;
  for(const b of cmpOut().querySelectorAll('.rr'))b.onclick=()=>{S.renderMode=b.dataset.m;changed('renderMode');for(const x of cmpOut().querySelectorAll('.rr'))x.setAttribute('aria-pressed',String(x===b));};
  toast('Comparison finished');
}
window.__prism={traceFS:()=>traceFS(),cosmosFS:()=>cosmosFS(),VS,peProbe,peWxAt,peWxMap,peDir,peLandAt,peSrcs,rtF:()=>rt[ping].f,PE,flyAim,peFrame,peCfg,get TR(){return TR;},plApply,projectW:p=>project(p,LV),get bSel(){return bSel;},CUST,SCENES,MESHES,shapeMesh,buildBVH,INST,instHitJS,build,buildScene,S,runBench,changed,ctl,openPane,sceneLights,rebuildBeams,startPlace,commitPlace,lz:()=>({nLz,nSpot,lzBuilt}),lzBuf,cam,nudge,reset,get P(){return P;},get LV(){return LV;}};
const sstep=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const norm=v=>{const l=Math.hypot(...v);return v.map(x=>x/l)},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

syncAll();joyVis();fbBase();setStats(!!UIS.stats);buildScene(true);build();renderLUT();resize();requestAnimationFrame(tick);ensureMeshes(custOf(S.scene));
// phones drop the GPU context when the browser is backgrounded or memory runs short: say so, and start again when it is back
cv.addEventListener('webglcontextlost',e=>{e.preventDefault();broken=true;errEl.style.display='grid';errEl.textContent='Graphics reset by the browser. Restoring…';});
cv.addEventListener('webglcontextrestored',()=>location.reload());
try{navigator.wakeLock&&navigator.wakeLock.request('screen').catch(()=>{});}catch(e){}
})();
