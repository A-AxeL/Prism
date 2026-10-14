
/* ---------- auto exposure: 32×32 log-luminance meter, read back asynchronously (no GPU stall) ---------- */
const meterFS=`#version 300 es
precision highp float;uniform sampler2D uT,uB,uA;uniform int uHyb;uniform float uWs;out vec4 o;
float enc(float x){return clamp((log2(max(x,1e-8))+24.)/40.,0.,1.);}
void main(){float sL=0.,sO=0.;vec3 sC=vec3(0);
 for(int j=0;j<4;j++)for(int i=0;i<4;i++){vec2 uv=(gl_FragCoord.xy-.5+(vec2(i,j)+.5)/4.)/32.;vec4 t=texture(uT,uv);
  vec3 c=uHyb==1?texture(uB,uv).rgb+texture(uA,uv).rgb*t.rgb:uHyb==2?t.rgb*texture(uB,uv).rgb:t.rgb;
  float L=dot(c,vec3(.2126,.7152,.0722));if(!(L>=0.&&L<6e4)){L=0.;c=vec3(0);}sL+=L;sO+=max(L-uWs,0.);sC+=c*min(1.,uWs/max(L,1e-9));}
 // (b, a: the share of red and of blue in the cell's light, clipped at white so the sun does not decide the white balance)
 float sc=sC.r+sC.g+sC.b;o=vec4(enc(sL/16.),enc(sO/16.),sc>0.?sC.r/sc:1./3.,sc>0.?sC.b/sc:1./3.);}`;
let MP=null,meter=null,meterN=0,aeCur=S.exposure,aeTarget=S.exposure,veilT=0,veilCur=0;
// dynamic range: stops between white and the noise floor, and how much of the over-white light scatters (glare)
const DRM={phone:{st:10.5,g:.03},pro:{st:13.5,g:.006},eye:{st:12,g:.04},ideal:{st:0,g:0}};
const drm=()=>DRM[S.drMode]||DRM.pro,meterOn=()=>isAE()||drm().g>0;
function meterKick(){
  if(!meter){MP=prog(meterFS);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,32,32,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
    const pbo=gl.createBuffer();gl.bindBuffer(gl.PIXEL_PACK_BUFFER,pbo);gl.bufferData(gl.PIXEL_PACK_BUFFER,4096,gl.STREAM_READ);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
    meter={f,pbo,sync:null,buf:new Uint8Array(4096)};}
  if(meter.sync)return;
  const T=rt[ping].t,hy=T.length>=3;gl.bindFramebuffer(gl.FRAMEBUFFER,meter.f);gl.viewport(0,0,32,32);gl.useProgram(MP.p);
  for(let i=0;i<3;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,T[Math.min(i,T.length-1)]);}gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(MP.u.uT,0);gl.uniform1f(MP.u.uWs,(S.tonemap==='none'?1:4)/Math.max(expNow(),1e-6));gl.uniform1i(MP.u.uB,T.length>1?1:0);gl.uniform1i(MP.u.uA,hy?2:0);gl.uniform1i(MP.u.uHyb,hy?1:0);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,meter.pbo);gl.readPixels(0,0,32,32,gl.RGBA,gl.UNSIGNED_BYTE,0);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
  meter.sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
}
function meterPoll(){
  if(!meter||!meter.sync)return;
  if(gl.clientWaitSync(meter.sync,0,0)===gl.TIMEOUT_EXPIRED)return;
  gl.deleteSync(meter.sync);meter.sync=null;
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,meter.pbo);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,meter.buf);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
  const b=meter.buf,mode=S.aeMode,vals=[];let s=0,sw=0;
  // veiling glare: a fraction of all the light brighter than white scatters across the whole frame (lens or eye)
  let ov=0;for(let i=0;i<1024;i++){const g=b[i*4+1];if(g>2)ov+=Math.pow(2,g/255*40-24);}veilT=drm().g*ov/1024;
  // like a camera meter, ignore what lies below the sensor's range under the brightest part of the frame (black space, faint stars beside a lit planet)
  let vmax=-24;for(let i=0;i<1024;i++)vmax=Math.max(vmax,b[i*4]/255*40-24);const floor=Math.max(-23.5,vmax-(drm().st||16)+1);
  for(let i=0;i<1024;i++){const v=b[i*4]/255*40-24;if(v<floor)continue;vals.push(v);
    const x=((i&31)+.5)/32-.5,y=((i>>5)+.5)/32-.5,d2=x*x+y*y,w=mode==='center'?Math.exp(-d2/.045):mode==='spot'?(d2<.012?1:0):1;s+=v*w;sw+=w;}
  {let wr=0,wb=0,ws=0;for(let i=0;i<1024;i++){const v=b[i*4]/255*40-24;if(v<floor)continue;const w=Math.min(Math.pow(2,v),Math.pow(2,vmax));wr+=w*b[i*4+2]/255;wb+=w*b[i*4+3]/255;ws+=w;}
    if(ws>0){const r=wr/ws,bl=wb/ws;wbFrame=[r,Math.max(1-r-bl,1e-3),bl];}}
  if(!vals.length)return;
  // auto key (Reinhard): dark scenes are kept dark-ish instead of being pushed to mid-gray
  const avg=sw?s/sw:vals.reduce((a,c)=>a+c,0)/vals.length,La=Math.pow(2,avg),key=Math.max(.05,1.03-2/(2+Math.log10(La+1)));let t=key/La;
  // (the brightest sky that is not the sun itself, kept well under white so its colour survives the white balance and the curve:
  // a sunset glow fills only a few percent of the frame, so a 97th percentile
  // let it burn out to white; the sun's disc fills a cell or two and stays above the 99.5th, free to clip as in a photograph)
  if(mode==="highlight"){vals.sort((a,c)=>a-c);t=Math.min(t,(PE.aeHi??.6)/Math.pow(2,vals[Math.min(vals.length-1,Math.floor(vals.length*.995))]));}
  const t0=t;t=Math.min(t,peExpCap(vmax));if(typeof PE!=='undefined')PE.aeDbg={key,La,t0,t,vmax,n:vals.length,p995:vals.length?Math.pow(2,vals[Math.floor(vals.length*.995)]):0,mode};if(!isFinite(t))return;aeTarget=Math.min(32768,Math.max(1/256,t));
}
const isAE=()=>S.aeMode!=='manual';
function aeStep(dt){{const t=wbTarget();if(!t)wbAuto=null;else if(!wbAuto)wbAuto=t;else{const k=1-Math.exp(-dt/1000*2);let ch=0;wbAuto=wbAuto.map((v,i)=>{const nv=v*Math.pow(t[i]/v,k);ch=Math.max(ch,Math.abs(Math.log(nv/v)));return nv;});if(ch>1e-4)needBlit=true;}}
if(Math.abs(veilT-veilCur)>1e-9){const k=1-Math.exp(-dt/1000*4);veilCur+=(veilT-veilCur)*k;if(Math.abs(veilT-veilCur)<veilT*.002+1e-9)veilCur=veilT;needBlit=true;}
  if(!isAE())return;const r=aeTarget/aeCur;if(Math.abs(Math.log(r))<.003)return;aeCur*=Math.pow(r,1-Math.exp(-dt/1000*S.aeSpeed));needBlit=true;}
const expNow=()=>isAE()?aeCur*Math.pow(2,S.ev):S.exposure;
// white balance: correct for a light source of the given color temperature (6500 K is neutral)
function kRGB(k){const t=k/100;const r=t<=66?255:329.698727446*Math.pow(t-60,-.1332047592),g=t<=66?99.4708025861*Math.log(t)-161.1195681661:288.1221695283*Math.pow(t-60,-.0755148492),
  b=t>=66?255:t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307;return [r,g,b].map(v=>Math.min(255,Math.max(1,v))/255);}
function wbMul(){const n=kRGB(6500),c=kRGB(S.wb),m=n.map((v,i)=>v/c[i]),l=.2126*m[0]+.7152*m[1]+.0722*m[2];
  // and, on a planet, adapted (by S.wbAdapt) to the light where the camera is (eased: see aeStep)
  const d=wbAuto?wbAuto:[1,1,1];if(wbAuto)PE.wbG=d;return m.map((v,i)=>v/l*d[i]);}
// the adaptation: the light on a grey card where the camera is (peWB), then, like a camera's auto white balance (S.wbAuto), up to
// half of what is left of the frame's warm or cool cast is taken out too (along the blue-orange axis only, so a green forest or a
// red desert floor does not tint the picture)
let wbFrame=null,wbAuto=null;
function wbTarget(){const a=S.wbAdapt??1,w=a>0&&typeof peOn==='function'&&peOn()?peWB():null;if(!w)return null;let g=w.slice();
  if(wbFrame){const f=wbFrame.map((v,i)=>v*g[i]),t=Math.log(f[2]/f[0]),k=Math.exp(-t*.5*(S.wbAuto??0)*peWBf());g=[g[0]/k,g[1],g[2]*k];}
  const l=.2126*g[0]+.7152*g[1]+.0722*g[2];return g.map(v=>Math.pow(Math.min(3,Math.max(.33,v/l)),a));}
// half-tangent across the short side for an image of w × h, with the field of view measured across the chosen axis
function axisTan(w,h){const t=Math.tan(S.fov*Math.PI/360),m=Math.min(w,h);return S.fovAxis==='vertical'?t*m/h:S.fovAxis==='horizontal'?t*m/w:t;}
// the live view: normally the canvas; in photo mode the photo frame on screen shows exactly what the photo will contain
function viewTan(){if(photoTile)return photoTile.tan;
  if(photoMode){const [pw,ph]=photoDims(),r=photoRect(),hx=axisTan(pw,ph)*pw/Math.min(pw,ph);return hx*Math.min(innerWidth,innerHeight)/r.w;}
  return axisTan(cv.width,cv.height);}
function camUniforms(u,w=W,h=H){
  if(photoTile)gl.uniform4f(u.uView,photoTile.x,photoTile.y,photoTile.fw,photoTile.fh);else gl.uniform4f(u.uView,0,0,w,h);
  gl.uniform1i(u.uProj,{persp:0,fisheye:1,pano:2,ortho:3}[S.proj]||0);gl.uniform1f(u.uFish,S.fishFov*Math.PI/180);
  gl.uniform1f(u.uOrtho,(S.camMode==='orbit'?cam.dist:4)*viewTan());
  gl.uniform1i(u.uBlades,+S.blades);gl.uniform1f(u.uAnam,S.anamorphic?.5:1);gl.uniform1f(u.uBladeRot,.3);
}
