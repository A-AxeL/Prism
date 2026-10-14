/* ---------- loop ---------- */
let moving=false,P={},frame=0,last=performance.now(),total=0,fpsS=60,adaptT=0,simT=0,idle=false;
const SKY={dusk:0,noon:1,night:2,studio:3,void:4},TM={aces:0,reinhard:1,none:2,camera:3},FL={checker:0,mirror:1,matte:2,none:3,wet:4};
function tick(now){
  requestAnimationFrame(tick);
  if(photoJob){photoStep();return;}
  const cap=S.fpsCap==='unlimited'?0:+S.fpsCap;
  if(cap&&now-last<1000/cap-3)return;
  const dt=Math.min(100,Math.max(.5,now-last));last=now;
  ft[hi]=dt;hi=(hi+1)%HIST;fpsS+=(1000/dt-fpsS)*.08;if(!isFinite(fpsS))fpsS=60;
  meterPoll();aeStep(dt);
  if(pending&&!pollBuild(false)){uiFrame();return;}
  if(!pending&&TR&&!broken&&!isCosmos()&&(nLz>0)!==lzBuilt)build();
  if(paused||broken||!TR){if(needBlit&&TR&&!broken&&OUT){blit();needBlit=false;}uiFrame();return;}
  const CO=SCENES[S.scene].cosmos,tF=performance.now();
  camUpdate(dt,CO);
  if(S.animate){simT+=dt/1000;peTick(dt/1000);if(!CO){upload(simT);if(nLz)rebuildBeams();}nudge();}
  const re=reOK()&&camMove&&frame>0&&!(CO&&CO.kind===2),stab=Math.round(1/Math.max(S.tBlend,.2));moving=re;
  if(re&&frame>stab)frame=stab;
  adaptT+=dt;if(S.adaptive&&adaptT>700&&(moved||camMove||S.animate||frame<4)){adaptT=0;
    let ns=S.scale;if(fpsS<S.target-4)ns=Math.max(.2,S.scale-.05);else if(fpsS>S.target+10)ns=Math.min(1,S.scale+.05);
    if(ns!==S.scale){S.scale=+ns.toFixed(2);ctl.scale();resize();}}
  if(!S.accum&&!re)frame=0;
  if(frame>=accCap()&&!re){idle=true;if(needBlit){blit();needBlit=false;}uiFrame();return;}
  idle=false;
  const V=view(CO);LV=V;if(place)placeUpdate();const eye=V.eye,fw=V.fw,rtv=V.rt,upv=V.up;
  if(dofOn())focusUpdate(V,dt);
  if(CO){traceDraw(V,CO,re);ping=1-ping;frame++;moved=false;camMove=false;P={eye,fw,rt:rtv,up:upv};blit();bmHook(tF);if(meterOn()&&(++meterN&3)===0)meterKick();uiFrame();return;}
  const tq=performance.now(),{taa,jit}=traceDraw(V,CO,re);
  if(B_&&B_.sync){if(fFloat)gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,pxf);else gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px1);B_.tr.push(performance.now()-tq);}
  ping=1-ping;frame++;moved=false;camMove=false;if(taa)taauPass(P,eye,fw,rtv,upv,re,jit);P={eye,fw,rt:rtv,up:upv};
  blit();if(meterOn()&&(++meterN&3)===0)meterKick();
  if(B_){if(B_.sync){gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px1);B_.ms.push(performance.now()-tq);}
    if(B_.cap){B_.img=readCanvas();B_.cap=false;}const w=B_.wake;B_.wake=null;if(w)w();}
  bmHook(tF);uiFrame();
}
// laser pass: the primitives as quads into a canvas-sized HDR buffer, added up with blending
let LZPR=null,lzRT=null,lzFail=false;
function drawLasers(w=cv.width,h=cv.height){
  if(!LV||isCosmos()||!nLz||broken||lzFail)return false;
  if(!LZPR){try{LZPR=progVF(LZVS(),LZFS());}catch(e){console.error('laser pass:',e);lzFail=true;return false;}}
  if(!lzRT||lzRT.w!==w||lzRT.h!==h){if(lzRT){gl.deleteTexture(lzRT.t);gl.deleteFramebuffer(lzRT.f);}
    const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);const f=fExt?[gl.RGBA16F,gl.HALF_FLOAT]:[gl.RGBA8,gl.UNSIGNED_BYTE];gl.texImage2D(gl.TEXTURE_2D,0,f[0],w,h,0,gl.RGBA,f[1],null);
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST]])gl.texParameteri(gl.TEXTURE_2D,k,v);
    const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);lzRT={t,f:fb,w,h};}
  const T=rt[ping].t,hy=T.length>=3,u=LZPR.u,full=S.proj==='fisheye'||S.proj==='pano';
  gl.bindFramebuffer(gl.FRAMEBUFFER,lzRT.f);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(LZPR.p);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
  for(let i=0;i<3;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,T[Math.min(i,T.length-1)]);}
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,lzTex);gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(u.uT,0);gl.uniform1i(u.uB,T.length>1?1:0);gl.uniform1i(u.uA,hy?2:0);gl.uniform1i(u.uLzT,3);
  gl.uniform1i(u.uHyb,hy?1:0);gl.uniform1i(u.uDemod,T.length===2?1:0);gl.uniform1i(u.uDepthOK,fExt?1:0);gl.uniform1i(u.uNLz,nLz);gl.uniform1i(u.uFull,full?1:0);
  gl.uniform2f(u.uRes,w,h);gl.uniform2f(u.uRS,W/w,H/h);gl.uniform1f(u.uTanF,viewTan());
  gl.uniform3fv(u.uEye,LV.eye);gl.uniform3fv(u.uFw,LV.fw);gl.uniform3fv(u.uRt,LV.rt);gl.uniform3fv(u.uUp,LV.up);camUniforms(u,w,h);
  gl.drawArraysInstanced(gl.TRIANGLES,0,6,full?1:nLz);gl.disable(gl.BLEND);return true;}
// one tracer frame into the other half of the ping-pong targets (the live view and photos both use this)
function traceDraw(V,CO,re){if(CO&&TR&&TR.pe){peFrame(V,CO);return {taa:false,jit:[0,0]};}const eye=V.eye,fw=V.fw,rtv=V.rt,upv=V.up;
  const el=S.sunAngle*Math.PI/180,az=S.sunAz*Math.PI/180;
  const src=rt[ping],dst=rt[1-ping];
  gl.bindFramebuffer(gl.FRAMEBUFFER,dst.f);gl.viewport(0,0,W,H);gl.useProgram(TR.p);const u=TR.u;
  if(CO){camUniforms(u);drawCosmos(u,CO,re,eye,fw,rtv,upv,el,az);return {taa:false,jit:[0,0]};}
  for(let i=0;i<src.t.length;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,src.t[i]);}gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(u.uPrev,0);gl.uniform1i(u.uPrev1,1);gl.uniform1i(u.uPrev2,2);gl.uniform1i(u.uPrev3,3);gl.uniform1i(u.uGiRate,giN());gl.uniform1f(u.uMinA,S.tBlend);gl.uniform1i(u.uCache,(S.ssCache&&frame>0&&P.eye&&S.proj==='persp'&&!photoTile)?1:0);gl.uniform1i(u.uSdfSteps,S.sdfSteps);
  gl.uniform1f(u.uBlend,re?Math.max(S.tBlend,1/(frame+1)):1/(frame+1));gl.uniform1i(u.uReproj,re?1:0);
  const chain=S.renderMode==='hybrid'||S.renderMode==='whitted';
  gl.uniform1i(u.uMaxB,chain?S.bounces+2:(re||S.animate)?Math.min(S.motionBounces,S.bounces):S.renderMode==='path'?Math.max(S.bounces,16):S.bounces);gl.uniform1i(u.uNee,S.renderMode==='path'&&!(re||S.animate)?16:S.neeDepth);gl.uniform1f(u.uFcl,S.renderMode==='path'&&!(re||S.animate)?32:4);   // still path tracing: follow light until Russian roulette ends it, so closed rooms keep their full inter-reflected light
  gl.uniform3fv(u.uPEye,P.eye||eye);gl.uniform3fv(u.uPFw,P.fw||fw);gl.uniform3fv(u.uPRt,P.rt||rtv);gl.uniform3fv(u.uPUp,P.up||upv);
  const taa=taaOn()&&!photoTile,jit=[halton((total&15)+1,2),halton((total&15)+1,3)];gl.uniform1i(u.uTaa,taa?1:0);gl.uniform2f(u.uJit,jit[0],jit[1]);
  gl.uniform1ui(u.uFrame,(total++)>>>0);gl.uniform1i(u.uSpp,S.renderMode==='path'?S.spp:1);
  gl.uniform2f(u.uRes,W,H);gl.uniform3fv(u.uEye,eye);gl.uniform3fv(u.uFw,fw);gl.uniform3fv(u.uRt,rtv);gl.uniform3fv(u.uUp,upv);
  gl.uniform1f(u.uTanF,viewTan());gl.uniform1f(u.uAp,dofOn()?S.aperture:0);gl.uniform1f(u.uFocus,curFocus);camUniforms(u);
  // scene arrays live in the program: only send them again after the scene changed or the program was rebuilt
  if(TR.ver!==sceneVer){TR.ver=sceneVer;
    gl.uniform4fv(u.uS,uS);gl.uniform4fv(u.uC,uC);gl.uniform4fv(u.uM,uM);gl.uniform4fv(u.uG,uG);gl.uniform2iv(u.uGr,uGr);gl.uniform1iv(u.uLi,uLi);gl.uniform1iv(u.uLb,uLb);
    gl.uniform4fv(u.uBp,uBp);gl.uniform4fv(u.uBh,uBh);gl.uniform4fv(u.uBc,uBc);gl.uniform4fv(u.uBm,uBm);
    for(const [k,v] of [['uPrP',uPrP],['uPrM',uPrM],['uPrO',uPrO],['uPrB',uPrB],['uLnB',uLnB],['uLnC',uLnC],['uLnA',uLnA],['uLnS',uLnS],['uLnM',uLnM],['uLnO',uLnO]])gl.uniform4fv(u[k],v);
    gl.uniform3fv(u.uBBmin,uBB.subarray(0,3));gl.uniform3fv(u.uBBmax,uBB.subarray(3,6));gl.uniform3fv(u.uBGa,uBGa);gl.uniform3fv(u.uBGb,uBGb);gl.uniform2iv(u.uBGr,uBGr);}
  if(INST.list.length&&u.uInT){for(const [k,t,un] of [['uInT',instTex,9],['uMeshT',meshTex,10],['uBvhT',bvhTex,11]]){gl.activeTexture(gl.TEXTURE0+un);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(u[k],un);}gl.activeTexture(gl.TEXTURE0);gl.uniform1i(u.uNI,INST.list.length);}
  if(lzBuilt){gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,lzTex);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(u.uLzT,5);gl.uniform1i(u.uNLz,nLz);gl.uniform1i(u.uNSpot,nSpot);}
  gl.uniform3f(u.uSun,Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az));gl.uniform1f(u.uSunOn,S.sun&&Math.sin(el)>.001?1:0);   // a sun below the horizon gives no light
  gl.uniform1i(u.uSky,SKY[S.sky]);gl.uniform1i(u.uFloor,FL[S.floor]);gl.uniform1f(u.uFog,S.fog);
  gl.drawArrays(gl.TRIANGLES,0,3);
  return {taa,jit};}
/* lens glare: the composite renders the scene's light at 1/4 size, a pyramid of 4 more halvings blurs it, and the final
   composite mixes the levels back in. Planets and the black hole have their own glare model in the ray marcher. */
let GP=null,DOWN=null;
function glareK(){return fExt?S.bloom*.08:0;}   // Bloom 100% = 8% of all light scattered by the lens
function glarePyr(w0,h0){
  if(GP&&GP.w===w0&&GP.h===h0)return GP;
  if(GP)GP.L.forEach(l=>{gl.deleteTexture(l.t);gl.deleteFramebuffer(l.f);});
  const L=[];let w=w0,h=h0;
  for(let i=0;i<6;i++){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,w,h,0,gl.RGBA,gl.HALF_FLOAT,null);
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
    const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
    L.push({t,f,w,h});w=Math.max(1,Math.ceil(w/2));h=Math.max(1,Math.ceil(h/2));}
  return GP={w:w0,h:h0,L};}
// render the scene's light into level 0 (w0×h0) and blur it down the pyramid
// off: which pyramid level is the finest glare radius (level 0 is the half-size render)
function glareBuild(w0,h0,lzOn,dst,off){const G=glarePyr(w0,h0);G.off=off;
  for(let i=0;i<5;i++){gl.activeTexture(gl.TEXTURE8+i);gl.bindTexture(gl.TEXTURE_2D,null);}gl.activeTexture(gl.TEXTURE0);   // the composite's glare samplers must not see the level being drawn
  gl.bindFramebuffer(gl.FRAMEBUFFER,G.L[0].f);gl.viewport(0,0,G.w,G.h);gl.useProgram(OUT.p);blitSetup(G.w,G.h,lzOn,1,0,dst);gl.drawArrays(gl.TRIANGLES,0,3);
  if(!DOWN)DOWN=prog(downFS);gl.useProgram(DOWN.p);gl.uniform1i(DOWN.u.uS,0);gl.activeTexture(gl.TEXTURE0);
  for(let i=1;i<6;i++){const a=G.L[i-1],b=G.L[i];gl.bindFramebuffer(gl.FRAMEBUFFER,b.f);gl.viewport(0,0,b.w,b.h);gl.bindTexture(gl.TEXTURE_2D,a.t);gl.uniform2f(DOWN.u.uSt,1/a.w,1/a.h);gl.drawArrays(gl.TRIANGLES,0,3);}}
function blit(dst){const ow=dst?dst.w:cv.width,oh=dst?dst.h:cv.height,lzOn=drawLasers(ow,oh);
  // a tiled photo shares one pyramid, made from a small render of the whole frame before the tiles (photoStep)
  const frozen=photoJob&&photoJob.gReady,whole=!photoTile||(photoTile.fw===ow&&photoTile.fh===oh);
  const gk=frozen||whole?glareK():0,lt=fExt&&(frozen||whole)?(S.localTM??.4):0;   // (local tone mapping reads the same blur pyramid)
  if((gk>0||lt>0)&&!frozen)glareBuild(Math.ceil(ow/2),Math.ceil(oh/2),lzOn,dst,0);
  gl.bindFramebuffer(gl.FRAMEBUFFER,dst?dst.f:null);gl.viewport(0,0,ow,oh);gl.useProgram(OUT.p);blitSetup(ow,oh,lzOn,0,gk,dst);
  gl.uniform1f(OUT.u.uLT,lt);
  if(gk>0||lt>0){const G=GP;for(let i=0;i<5;i++){const l=G.L[i+G.off];gl.activeTexture(gl.TEXTURE8+i);gl.bindTexture(gl.TEXTURE_2D,l.t);gl.uniform1i(OUT.u['uG'+i],8+i);gl.uniform2f(OUT.u['uGt'+i],1/l.w,1/l.h);}gl.activeTexture(gl.TEXTURE0);}
  gl.drawArrays(gl.TRIANGLES,0,3);}
function blitSetup(ow,oh,lzOn,raw,gk,dst){
  gl.uniform1i(OUT.u.uRaw,raw);gl.uniform1f(OUT.u.uBM,64/Math.max(expNow(),1e-6));gl.uniform1f(OUT.u.uGk,gk);
  if(photoTile)gl.uniform4f(OUT.u.uView,photoTile.x,photoTile.y,photoTile.fw,photoTile.fh);else gl.uniform4f(OUT.u.uView,0,0,ow,oh);
  const T=rt[ping].t,hy=T.length>=3;
  for(let i=0;i<3;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,T[Math.min(i,T.length-1)]);}gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(OUT.u.uT,0);gl.uniform1i(OUT.u.uB,T.length>1?1:0);gl.uniform1i(OUT.u.uA,hy?2:0);gl.uniform1i(OUT.u.uHyb,hy?1:0);
  const ta=!dst&&hy&&taaOn()&&taValid&&taRT.length;gl.uniform1i(OUT.u.uTaa,ta?1:0);
  if(ta){const r=taRT[taPing];gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,r.t[0]);gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,r.t[1]);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(OUT.u.uXB,6);gl.uniform1i(OUT.u.uXA,7);}
  gl.uniform1i(OUT.u.uDemod,T.length===2?1:0);gl.uniform1i(OUT.u.uNsrc,fExt&&!isDet()?(hy?2:T.length===2?1:0):0);gl.uniform1f(OUT.u.uDnB,fExt&&!isDet()?S.denoise:0);gl.uniform1f(OUT.u.uFade,S.dnFade);
  gl.uniform1f(OUT.u.uNcap,moving?2/S.tBlend-1:1e9);gl.uniform1f(OUT.u.uNmul,hy?1/giN():S.renderMode==='path'?S.spp:1);
  gl.uniform2f(OUT.u.uRes,ow,oh);gl.uniform1f(OUT.u.uExp,expNow());{const v=raw||gk>0?0:veilCur;gl.uniform3f(OUT.u.uVeil,v,v*.97,v*.93);}gl.uniform1f(OUT.u.uBlack,drm().st?(S.tonemap==='none'?1:4)*Math.pow(2,-drm().st):0);gl.uniform3fv(OUT.u.uWB,wbMul());
  gl.uniform1f(OUT.u.uVig,S.vignette);gl.uniform1f(OUT.u.uCA,raw?0:S.chromab*.025);gl.uniform1f(OUT.u.uVt,viewTan());gl.uniform1f(OUT.u.uGrain,S.grain);gl.uniform1f(OUT.u.uSat,S.sat);gl.uniform1f(OUT.u.uSeed,(total*7.13)%97);gl.uniform1i(OUT.u.uTm,TM[S.tonemap]);gl.uniform2f(OUT.u.uTx,1/W,1/H);
  const eff=hy?frame/giN():frame*(S.renderMode==='path'||isCosmos()?S.spp:1);
  gl.uniform1f(OUT.u.uDn,fExt&&!isDet()?S.denoise*Math.max(0,1-Math.sqrt(eff/S.dnFade)):0);
  gl.uniform1i(OUT.u.uLzOn,lzOn?1:0);if(lzOn){gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,lzRT.t);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(OUT.u.uLz,4);}}
