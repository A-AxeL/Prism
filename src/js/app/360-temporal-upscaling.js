/* ---------- temporal upscaling: render fewer pixels, rebuild a sharp full-resolution image ----------
   Each frame the tracer samples every low-resolution pixel at the same sub-pixel offset (a Halton sequence). For every
   screen pixel this pass gathers the 3×3 nearby samples, weighted by how close each sample landed to the pixel's center,
   and blends them into a full-resolution history that follows the camera (reprojected through the depth). The history is
   kept within the range of the current samples, so moving objects and new views do not leave ghosts. Over a few frames
   the samples fill in detail between the low-resolution pixels. Only the detail layers (direct light, surface color) go
   through here; the soft indirect light stays at low resolution and is multiplied back in by the composite. */
const TAFS=`#version 300 es
precision highp float;
uniform sampler2D uT,uB,uA,uHB,uHA;uniform vec2 uRes,uLow,uJit;uniform vec3 uEye,uFw,uRt,uUp,uPEye,uPFw,uPRt,uPUp;uniform float uTanF,uCap,uK;uniform int uHist,uClamp;
layout(location=0) out vec4 oB;layout(location=1) out vec4 oA;
bool okc(vec3 c){return all(greaterThanEqual(c,vec3(-1e-4)))&&all(lessThan(c,vec3(6e4)));}
void main(){vec2 q=gl_FragCoord.xy,lq=q*uLow/uRes;ivec2 jc=ivec2(floor(lq)),L=ivec2(uLow)-1;
  vec3 sb=vec3(0),sa=vec3(0),nB=vec3(1e9),xB=vec3(-1e9),nA=vec3(1e9),xA=vec3(-1e9);float sw=0.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){ivec2 j=clamp(jc+ivec2(x,y),ivec2(0),L);
    vec3 b=texelFetch(uB,j,0).rgb,a=texelFetch(uA,j,0).rgb;if(!okc(b))b=vec3(0);if(!okc(a))a=vec3(0);
    vec2 d=vec2(j)+uJit-lq;float w=exp(-uK*dot(d,d));sb+=b*w;sa+=a*w;sw+=w;
    if(abs(x)+abs(y)<2){nB=min(nB,b);xB=max(xB,b);nA=min(nA,a);xA=max(xA,a);}}
  float hw=0.;vec3 hb=vec3(0),ha=vec3(0);
  if(uHist==1){float dep=texelFetch(uT,clamp(jc,ivec2(0),L),0).a;
    vec2 p=(q-.5*uRes)/min(uRes.x,uRes.y)*2.;vec3 rd=normalize(uFw+(p.x*uRt+p.y*uUp)*uTanF),dv=uEye+rd*dep-uPEye;float z=dot(dv,uPFw);
    if(z>.01){vec2 sp=vec2(dot(dv,uPRt),dot(dv,uPUp))/z/(2.*uTanF)*min(uRes.x,uRes.y)+.5*uRes;
      if(all(greaterThan(sp,vec2(.5)))&&all(lessThan(sp,uRes-.5))){vec4 B=texture(uHB,sp/uRes),A=texture(uHA,sp/uRes);
        if(okc(B.rgb)&&okc(A.rgb)&&B.a>=0.){hw=min(B.a,uCap);vec3 eb=(xB-nB)*.15+.01,ea=(xA-nA)*.15+.01;
          // moving: keep the history tight to what the samples show; still: a looser fence, wide enough for edges to keep
          // smoothing but tight enough that stale light (e.g. carried across a thin wall while moving) cannot stay
          if(uClamp==0){eb=(xB-nB)*.6+.03;ea=(xA-nA)*.6+.03;}hb=clamp(B.rgb,nB-eb,xB+eb);ha=clamp(A.rgb,nA-ea,xA+ea);}}}}
  float tw=max(hw+sw,1e-6);oB=vec4((hb*hw+sb)/tw,min(hw+sw,uCap));oA=vec4((ha*hw+sa)/tw,1.);}`;
let TAP=null,taRT=[],taPing=0,taValid=false,taFail=false;
const halton=(i,b)=>{let f=1,r=0;while(i>0){f/=b;r+=f*(i%b);i=Math.floor(i/b);}return r;};
const taaOn=()=>S.upscale&&fExt&&!taFail&&S.renderMode==='hybrid'&&!isCosmos()&&S.proj==='persp';
function taTargets(w,h){if(taRT.length&&taRT[0].w===w&&taRT[0].h===h)return;
  taRT.forEach(r=>{r.t.forEach(t=>gl.deleteTexture(t));gl.deleteFramebuffer(r.f);});
  taRT=[0,1].map(()=>{const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);const t=[0,1].map(i=>{const x=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,x);
    gl.texImage2D(gl.TEXTURE_2D,0,i?gl.RGBA8:gl.RGBA16F,w,h,0,gl.RGBA,i?gl.UNSIGNED_BYTE:gl.HALF_FLOAT,null);
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,x,0);return x;});gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);return {f,t,w,h};});
  taValid=false;}
function taauPass(prev,eye,fw,rtv,upv,moving,jit){
  if(!TAP){try{TAP=prog(TAFS);}catch(e){console.error('upscaler:',e);taFail=true;resize();return;}}
  const w=cv.width,h=cv.height;taTargets(w,h);const src=taRT[taPing],dst=taRT[1-taPing],T=rt[ping].t,u=TAP.u;
  gl.bindFramebuffer(gl.FRAMEBUFFER,dst.f);gl.viewport(0,0,w,h);gl.useProgram(TAP.p);
  for(let i=0;i<3;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,T[i]);}
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,src.t[0]);gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,src.t[1]);gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(u.uT,0);gl.uniform1i(u.uB,1);gl.uniform1i(u.uA,2);gl.uniform1i(u.uHB,3);gl.uniform1i(u.uHA,4);
  gl.uniform2f(u.uRes,w,h);gl.uniform2f(u.uLow,W,H);gl.uniform2f(u.uJit,jit[0],jit[1]);gl.uniform1f(u.uTanF,viewTan());
  gl.uniform3fv(u.uEye,eye);gl.uniform3fv(u.uFw,fw);gl.uniform3fv(u.uRt,rtv);gl.uniform3fv(u.uUp,upv);
  gl.uniform3fv(u.uPEye,prev.eye||eye);gl.uniform3fv(u.uPFw,prev.fw||fw);gl.uniform3fv(u.uPRt,prev.rt||rtv);gl.uniform3fv(u.uPUp,prev.up||upv);
  // reconstruction width: about 0.65 screen pixels when still (sharp; the history fills the gaps), half a render pixel while moving
  const sg=moving?.5:Math.min(.5,Math.max(.25,.65*W/w));gl.uniform1f(u.uK,1/(2*sg*sg));
  // still and unchanging: keep averaging indefinitely, so noisy effects (depth of field, rainbow dispersion) settle completely
  gl.uniform1f(u.uCap,moving?5:S.animate?32:4e4);gl.uniform1i(u.uClamp,moving||S.animate?1:0);gl.uniform1i(u.uHist,taValid&&frame>1?1:0);
  gl.drawArrays(gl.TRIANGLES,0,3);taPing=1-taPing;taValid=true;}
