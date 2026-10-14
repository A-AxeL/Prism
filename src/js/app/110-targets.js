/* ---------- targets ---------- */
let W=1,H=1,rt=[],ping=0;
const fmt=fExt?[gl.RGBA16F,gl.RGBA,gl.HALF_FLOAT]:[gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE];
// one framebuffer with n color attachments (3 for the hybrid: indirect+depth, base, albedo)
function mkRT(n=1){const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);const ts=[],db=[];
  for(let i=0;i<n;i++){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);const f=(i===2||(n===2&&i===1))?[gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE]:fmt;gl.texImage2D(gl.TEXTURE_2D,0,f[0],W,H,0,f[1],f[2],null);
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,t,0);ts.push(t);db.push(gl.COLOR_ATTACHMENT0+i);}
  gl.drawBuffers(db);return {t:ts,f};}
const isCosmos=()=>!!SCENES[S.scene].cosmos;
const nTargets=()=>isCosmos()?1:S.renderMode==='hybrid'?(fExt?4:3):2;   // hybrid: indirect+depth, base, albedo, light reservoirs
const giN=()=>({'1/1':1,'1/2':2,'1/4':4})[S.giRate]||1;
const isDet=()=>!isCosmos()&&['whitted','raster','sdf'].includes(S.renderMode);
const accCap=()=>isDet()?Math.min(S.maxAcc,32):S.maxAcc;
let dpr=Math.min(devicePixelRatio||1,2),BM_RES=null;   // BM_RES: the benchmark's fixed output size, so results compare across screens
function resize(){
  dpr=Math.min(devicePixelRatio||1,2);
  // with sharp upscaling the screen is drawn at full resolution (capped at about 1.6 megapixels) and the tracer runs at the
  // render scale of that; without it the canvas itself is the render size and the browser stretches it
  const up=S.upscale&&fExt&&!taFail,ow=BM_RES?BM_RES[0]:innerWidth*dpr,oh=BM_RES?BM_RES[1]:innerHeight*dpr,ok=up?Math.min(1,Math.sqrt(1.6e6/(ow*oh))):S.scale;
  const cw=Math.max(16,Math.round(ow*ok)),ch=Math.max(16,Math.round(oh*ok));
  const nw=up?Math.max(16,Math.round(cw*S.scale)):cw,nh=up?Math.max(16,Math.round(ch*S.scale)):ch;
  if(cv.width!==cw||cv.height!==ch){cv.width=cw;cv.height=ch;}
  needBlit=true;
  if(nw===W&&nh===H&&rt.length&&rt[0].t.length===nTargets())return;
  W=nw;H=nh;rt.forEach(r=>{r.t.forEach(t=>gl.deleteTexture(t));gl.deleteFramebuffer(r.f);});rt=[mkRT(nTargets()),mkRT(nTargets())];P={};reset();
}
addEventListener('resize',()=>resize());

