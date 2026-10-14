const PE_GLN='';   // (sph and hu live in PE_GLC)
const PE_HDR=`#version 300 es
precision highp float;precision highp int;precision highp sampler2DArray;precision highp sampler3D;precision highp samplerCube;
`;
// where a tile's texel sits: direct cube mapping for big tiles, a quadratic expansion about the center (in double-precision
// coefficients from the CPU) for small ones, so neighboring texels stay distinct far below float precision
const PE_GLTILE=`
uniform int uMode,uFace;uniform vec3 uC,uT1,uT2,uCss,uCst,uCtt;uniform vec4 uUV;
void tileP(vec2 st,out vec3 P,out vec3 dl){
  if(uMode==0){vec2 uv=uUV.xy+(st*.5+.5)*uUV.zw;P=normalize(FF[uFace]+FU[uFace]*tan(uv.x*PI*.25)+FV[uFace]*tan(uv.y*PI*.25));dl=P-uC;}
  else{dl=uT1*st.x+uT2*st.y+.5*(uCss*st.x*st.x+2.*uCst*st.x*st.y+uCtt*st.y*st.y);P=normalize(uC+dl);}}
`;
// tile generation (pass 0), the height under the camera (pass 1), the coarse height cube for terrain shadows (pass 2)
// two programs from this source: the terrain (tiles, probe, height cube, scatter) and, with wx, the weather and geography
// passes (3, 5, 6, 7), compiled apart so each is smaller and both compile at once
const PE_TGEN=(wx=false)=>PE_HDR+`#define WX ${wx?1:0}
`+PE_GLC()+PE_GLT()+PE_GLTILE+peGLWX()+PE_GLVEG+PE_GLGRASS+PE_GLROCK+`
uniform int uPass,uMO,uKP;uniform vec3 uPu;uniform float uSize,uOffX,uVegE;uniform ivec3 uCellI;uniform ivec2 uBlk;
layout(location=0) out vec4 oA;layout(location=1) out vec4 oB;
vec3 cubeDir(vec2 s){vec3 d;if(uFace==0)d=vec3(1,-s.y,-s.x);else if(uFace==1)d=vec3(-1,-s.y,s.x);else if(uFace==2)d=vec3(s.x,1,s.y);
  else if(uFace==3)d=vec3(s.x,-1,-s.y);else if(uFace==4)d=vec3(s.x,-s.y,1);else d=vec3(-s.x,-s.y,-1);return normalize(d);}
void main(){
#if WX
  if(uPass==6){oA=mix(texture(uWpA,uPu),texture(uWpB,uPu),uWpM);oB=vec4(0);return;}
  // the weather as a latitude-longitude map (tools): longitude grows eastward, as the planet turns
  if(uPass==7){vec2 uv=gl_FragCoord.xy/vec2(2.*uSize,uSize);float lo=radians(uv.x*360.),la=radians(uv.y*180.-90.);vec3 d=vec3(-cos(la)*sin(lo),sin(la),cos(la)*cos(lo));
    oA=mix(texture(uWpA,d),texture(uWpB,d),uWpM);oB=vec4(0);return;}
  if(uPass==3||uPass==5){vec2 s=(gl_FragCoord.xy-vec2(uOffX,0.))/uSize*2.-1.;vec3 P=cubeDir(s);ladder(P,P);
    if(uPass==3){oA=weather(P);oB=vec4(0);return;}
    float land,cl,belt,base;macro(vec3(0),land,cl,belt,base);oA=vec4(land,cl,belt,base);oB=vec4(0);return;}
  oA=vec4(0);oB=vec4(0);
#else
  // Every other pass evaluates the terrain at one to three points. terrain() is written once, in one loop, so the compiler
  // builds it once (on Windows each call site used to be compiled separately, which took minutes).
  // 0: a tile texel; 1: the probe; 2, 4: the coarse height cube; 8 trees, 9 grass, 10 rocks: one slot of a cell (the point
  // and two more a little way off, for the slope)
  bool cube=uPass==2||uPass==4,scat=uPass>=8,clim=uPass<=1||scat;int n=scat?3:1,mo=uPass==1?NOCT-1:uMO;
  vec2 st=vec2(0);vec3 Pc=uPu;vec4 r=vec4(0),r2=vec4(0);
  if(cube){vec2 s=(gl_FragCoord.xy-vec2(uOffX,0.))/uSize*2.-1.;Pc=cubeDir(s);}
  else if(scat){ivec2 q=ivec2(gl_FragCoord.xy)-uBlk;int sl=q.x+q.y*${PE_VC};uint salt=uPass==8?0u:uPass==9?0x6a09e667u:0x3c6ef372u;
    uint h0=hu(uint(uCellI.x)*0x9e3779b9u^uint(uCellI.y)*0x85ebca6bu^uint(uCellI.z)*0xc2b2ae35u^uint(sl)*0x27d4eb2fu^salt),h1=hu(h0^0x5bd1e995u);
    r=vec4(float(h0&255u),float((h0>>8)&255u),float((h0>>16)&255u),float(h0>>24))/255.;r2=vec4(float(h1&255u),float((h1>>8)&255u),float((h1>>16)&255u),float(h1>>24))/255.;
    st=(vec2(q)+(uPass==8?.15+.7*r.xy:.1+.8*r.xy))/${PE_VC/2}.-1.;}
  else if(uPass==0)st=(gl_FragCoord.xy-1.5)/32.-1.;
  TS t;float hs[3];vec3 dls[3],nz=vec3(.5);
  for(int i=0;i<n+uZ0;i++){vec3 P,dl;
    if(uPass==1){P=uPu;dl=vec3(0);}else if(cube){P=Pc;dl=P;}else tileP(st+(i==1?vec2(uVegE,0):i==2?vec2(0,uVegE):vec2(0)),P,dl);
    ladder(dl,P);TS ti=terrain(P,mo,clim&&i==0);hs[i]=ti.h;dls[i]=dl;
    if(i==0){t=ti;
      // patch noises (stands of one kind, tussock patches, scree fields): the octave and seed of each, one lookup in a loop
      if(scat){ivec3 kk=uPass==8?ivec3(0,1,0):uPass==9?ivec3(0,4,3):ivec3(2,3,4),ss=uPass==10?ivec3(44,45,46):ivec3(41,42,43);
        for(int j=0;j<3+uZ0;j++)nz[j]=oct(uKP+kk[j],ss[j]).x*.25+.5;}}}
  if(uPass==1){oA=vec4(t.h,t.wl,t.temp,t.wet);oB=vec4(0);return;}
  if(cube){oA=vec4(max(t.h,t.wl)*uTP.w,0,0,1);oB=vec4(0);return;}
  if(scat){float gs=(hs[1]-t.h)/length(dls[1]-dls[0]),gt=(hs[2]-t.h)/length(dls[2]-dls[0]),slp=1.-inversesqrt(1.+gs*gs+gt*gt),hm=(t.h-t.wl)*uTP.w*1000.;
    // trees: the species, its size and vigour, how closed the forest is
    if(uPass==8){float vig,fcl;int sp=vegPick(t.temp,t.wet,hm,slp,r.z,r.w,r2.w,nz,vig,fcl);
      oA=vec4(st,t.h,0.);oB=vec4(float(sp)/15.,clamp(r2.x*.6+vig*.4,0.,1.),r2.y,(floor(fcl*15.+.5)*16.+floor(r2.z*15.+.5))/255.);return;}
    // grass: the kind, its height, dryness and how full the clump is
    if(uPass==9){vec4 gp=grassPick(t.temp,t.wet,hm,slp,t.rock,nz,r.zw);
      oA=vec4(st,t.h,gp.w);oB=vec4(gp.x/15.,clamp(gp.y*.5,0.,1.),r2.x,gp.z);return;}
    // rocks: the mesh, its size, the climate it weathers in
    vec4 rp=rockPick(t.temp,t.wet,hm,slp,t.rock,nz,vec3(r.zw,r2.y));
    oA=vec4(st,t.h,clamp((t.temp+40.)/80.,0.,1.));oB=vec4(rp.x/15.,clamp(rp.y/6.,0.,1.),r2.x,clamp(t.wet,0.,1.));return;}
  oA=vec4(t.h,t.wl,0,1);oB=vec4(clamp((t.temp+40.)/80.,0.,1.),clamp(t.wet,0.,1.),t.rock,t.ej);
#endif
}`;
// after a tile is made: its slope (as a world vector) and hollowness per texel (pass 0); its height range (pass 1)
const PE_TPOST=()=>PE_HDR+PE_GLC()+PE_GLTILE+`
uniform highp sampler2DArray uTA;uniform int uPass,uSlot;out vec4 o;
float Hh(ivec2 p){p=clamp(p,ivec2(0),ivec2(${PE_TS-1}));return texelFetch(uTA,ivec3(p,uSlot),0).r;}
vec3 tP(vec2 st){vec3 P,dl;tileP(st,P,dl);return uMode==0?P:dl;}
void main(){
  if(uPass==1){float mn=1e9,mx=-1e9;for(int j=1;j<${PE_TS-1};j+=2)for(int i=1;i<${PE_TS-1};i+=2){vec2 a=texelFetch(uTA,ivec3(i,j,uSlot),0).rg;float v=max(a.r,a.g);mn=min(mn,v);mx=max(mx,v);}
    o=vec4(mn,mx,0,1);return;}
  ivec2 p=ivec2(gl_FragCoord.xy);vec2 st=(vec2(p)-1.)/32.-1.;float e=1./32.;
  vec3 es=tP(st+vec2(e,0))-tP(st-vec2(e,0)),et=tP(st+vec2(0,e))-tP(st-vec2(0,e));float ls=length(es),lt=length(et);es/=ls;et/=lt;
  float Ds=(Hh(p+ivec2(1,0))-Hh(p-ivec2(1,0)))/ls,Dt=(Hh(p+ivec2(0,1))-Hh(p-ivec2(0,1)))/lt,c=dot(es,et),k=1./max(1.-c*c,1e-4);
  vec3 g=(Ds-c*Dt)*k*es+(Dt-c*Ds)*k*et;
  float h0=Hh(p),m=0.;for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++)if(i!=0||j!=0)m+=Hh(p+ivec2(i,j)*2);
  o=vec4(g,(m/8.-h0)/(ls+lt));}`;
// atmosphere tables: transmittance (0), multiple scattering (1), sky irradiance (2), sky radiance at sea level (3)
const PE_LUT=()=>PE_HDR+PE_GLC()+PE_GLN+PE_GLA()+`
uniform int uPass,uLayer;uniform vec3 uGA;out vec4 o;
float pS(float r,float mu){float mh=-sqrt(max(0.,1.-1./(r*r)));return smoothstep(-.006,.006,mu-mh);}
vec3 skyM(vec3 p,vec3 d,vec3 sn,int N,bool ms){
  vec2 ta=sph(p,d,uRtop);float tE=ta.y;vec2 tg=sph(p,d,1.);if(tg.x>0.)tE=tg.x;if(tE<=0.)return vec3(0);
  float nu=dot(d,sn),pr=phR(nu),dt=tE/float(N);vec3 pm=scM(nu);vec3 T=vec3(1),L=vec3(0);
  for(int i=0;i<64;i++){if(i>=N)break;float t=(float(i)+.5)*dt;vec3 q=p+d*t;float r=length(q),h=r-1.,mu=dot(q,sn)/r;
    float dR=exp(-h/uHR),dM=exp(-h/uHM);vec3 sT=ext(h),Ts=trans(r,mu)*pS(r,mu);
    vec3 S=(uBR*dR*pr+dM*pm)*Ts;if(ms)S+=(uBR*dR+uBMs*dM)*msL(r,mu);
    vec3 e=exp(-sT*dt);L+=T*(S-S*e)/max(sT,vec3(1e-12));T*=e;}
  return L;}
void main(){vec2 fc=gl_FragCoord.xy;
  if(uPass==0){vec2 uv=(fc-.5)/vec2(255.,63.);float H=sqrt(uRtop*uRtop-1.),rho=H*uv.y,r=sqrt(rho*rho+1.),dn=uRtop-r,dx=rho+H,d=dn+uv.x*(dx-dn),
      mu=d<=0.?1.:clamp((H*H-rho*rho-d*d)/(2.*r*d),-1.,1.);float dt=d/80.;vec3 tau=vec3(0);
    for(int i=0;i<80;i++){float t=(float(i)+.5)*dt,h=max(sqrt(max(r*r+t*t+2.*r*mu*t,0.))-1.,-.002);tau+=ext(h)*dt;}
    o=vec4(exp(-tau),1);return;}
  if(uPass==1){vec2 uv=(fc-.5)/31.;float mus=uv.x*2.-1.,r=1.+max(uv.y,.002)*(uRtop-1.);vec3 sn=vec3(sqrt(max(0.,1.-mus*mus)),mus,0),p=vec3(0,r,0),L2=vec3(0),FM=vec3(0);
    for(int i=0;i<8;i++)for(int j=0;j<8;j++){float ct=1.-2.*(float(i)+.5)/8.,s=sqrt(1.-ct*ct),ph=2.*PI*(float(j)+.5)/8.;vec3 d=vec3(s*cos(ph),ct,s*sin(ph));
      vec2 tg=sph(p,d,1.),ta=sph(p,d,uRtop);bool gnd=tg.x>0.;float tE=gnd?tg.x:ta.y,dt=tE/20.;vec3 T=vec3(1),L=vec3(0),F=vec3(0);
      for(int k=0;k<20;k++){float t=(float(k)+.5)*dt;vec3 q=p+d*t;float rq=length(q),h=rq-1.,mq=dot(q,sn)/rq;
        vec3 sS=uBR*exp(-h/uHR)+uBMs*exp(-h/uHM),sT=ext(h),e=exp(-sT*dt),Ts=trans(rq,mq)*pS(rq,mq);
        L+=T*(sS*Ts/(4.*PI))*(1.-e)/max(sT,vec3(1e-12));F+=T*sS*(1.-e)/max(sT,vec3(1e-12));T*=e;}
      if(gnd){vec3 q=normalize(p+d*tE);float mq=dot(q,sn);L+=T*trans(1.,mq)*pS(1.,mq)*max(mq,0.)*uGA/PI;}
      L2+=L/64.;FM+=F/64.;}
    o=vec4(L2/max(1.-FM,vec3(.05)),1);return;}
  if(uPass==2){vec2 uv=(fc-.5)/vec2(63.,15.);float mus=uv.x*2.-1.,r=1.+uv.y*(uRtop-1.)+1e-6;vec3 sn=vec3(sqrt(max(0.,1.-mus*mus)),mus,0),p=vec3(0,r,0),E=vec3(0);
    for(int i=0;i<8;i++)for(int j=0;j<8;j++){float u1=(float(i)+.5)/8.,u2=(float(j)+.5)/8.,s=sqrt(u1),ph=2.*PI*u2;vec3 d=vec3(s*cos(ph),sqrt(1.-u1),s*sin(ph));E+=skyM(p,d,sn,16,true);}
    o=vec4(E*PI/64.,1);return;}
  vec2 uv=(fc-.5)/31.;float muv=uv.x*uv.x,mus=-.35+1.35*uv.y,ca=1.-2.*float(uLayer)/15.,sa=sqrt(max(0.,1.-ca*ca)),sv=sqrt(1.-muv*muv);
  vec3 sn=vec3(sqrt(max(0.,1.-mus*mus)),mus,0),d=vec3(sv*ca,muv,sv*sa);
  o=vec4(skyM(vec3(0,1.00002,0),d,sn,24,true),1);}`;
// the terrain mesh: one instanced grid per tile
const PE_TERRVS=()=>PE_HDR+PE_GLC()+`
layout(location=0) in vec3 aG;
layout(location=1) in vec4 i0;layout(location=2) in vec4 i1;layout(location=3) in vec4 i2;layout(location=4) in vec4 i3;
layout(location=5) in vec4 i4;layout(location=6) in vec4 i5;layout(location=7) in vec4 i6;layout(location=8) in vec4 i7;layout(location=9) in vec4 i8;
uniform highp sampler2DArray uTA;uniform vec3 uCam,uFw,uRt,uUp;uniform float uTanF,uOrtho,uLogC,uLogF;uniform int uProj;uniform vec4 uView;uniform vec2 uRes,uJ;
out vec2 vTex,vTexP;flat out int vSlot,vPS;out vec3 vRel,vPu;out float vH,vWd,vM;flat out float vLev,vPM;
vec2 hA(vec2 t,int s){ivec2 p=ivec2(floor(t));vec2 f=t-vec2(p);
  vec2 a=texelFetch(uTA,ivec3(p,s),0).rg,b=texelFetch(uTA,ivec3(p+ivec2(1,0),s),0).rg,c=texelFetch(uTA,ivec3(p+ivec2(0,1),s),0).rg,d=texelFetch(uTA,ivec3(p+ivec2(1,1),s),0).rg;
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
void tileV(vec2 st,out vec3 Pu,out vec3 Pr){
  if(i3.w<.5){int f=int(i5.w+.5);vec2 uv=i7.xy+(st*.5+.5)*i7.zw;Pu=normalize(FF[f]+FU[f]*tan(uv.x*PI*.25)+FV[f]*tan(uv.y*PI*.25));Pr=Pu-uCam;}
  else{vec3 dl=i1.xyz*st.x+i2.xyz*st.y+.5*(i3.xyz*st.x*st.x+2.*i4.xyz*st.x*st.y+i5.xyz*st.y*st.y);Pu=normalize(i6.xyz+dl);Pr=i0.xyz+dl;}}
void main(){
  int slot=int(i0.w+.5);vec2 g=aG.xy;
  vec3 Pu,Pr;tileV(g/16.-1.,Pu,Pr);vec2 w0=texelFetch(uTA,ivec3(ivec2(1.+2.*g),slot),0).rg;
  // the far part of each level slides its odd vertices onto the parent's grid, so levels meet without popping
  float m=clamp((length(Pr+Pu*max(w0.x,w0.y))*i2.w-1.3)*2.2,0.,1.);
  // edges: snap fully onto a coarser neighbor's grid, stay put against a finer one
  {int ef=int(i6.w+.5),gx=int(g.x+.5),gy=int(g.y+.5),c=0;
   if(gx==0)c|=1<<(ef&3);if(gx==32)c|=1<<((ef>>2)&3);if(gy==0)c|=1<<((ef>>4)&3);if(gy==32)c|=1<<((ef>>6)&3);
   if((c&2)!=0)m=1.;else if((c&4)!=0)m=0.;}
  // heights (and, in the fragment shader, ground cover and slopes) blend toward the parent tile's by the same amount
  vec2 gm=g-mod(g,2.)*m,tp=1.+32.*i8.yz+gm;vec2 hw=hA(1.+2.*gm,slot);int ps=int(i8.x+.5);if(i8.w>.5)hw=mix(hw,hA(tp,ps),m);float hv=max(hw.x,hw.y);
  tileV(gm/16.-1.,Pu,Pr);vec3 rel=Pr+Pu*(hv-aG.z*i4.w);
  vTex=1.+2.*gm;vTexP=tp;vSlot=slot;vPS=ps;vRel=rel;vPu=Pu;vH=hw.x;vWd=hw.y-hw.x;vLev=i1.w;vM=i8.w>.5?m:0.;vPM=i8.w;
  // the projection that matches the camera rays of the composite (camRay), with this frame's jitter; logarithmic depth
  float x=dot(rel,uRt),y=dot(rel,uUp),z=dot(rel,uFw),s=min(uView.z,uView.w)*.5;vec2 o=.5*uView.zw-uView.xy-uJ+.5;
  if(uProj==3){vec2 px=vec2(x,y)/uOrtho*s+o;gl_Position=vec4(px/uRes*2.-1.,log2(max(1e-12,1.+max(z,0.)*uLogC))*uLogF-1.,1.);if(z<0.)gl_Position.z=-2.;}
  else{vec2 px=vec2(x,y)/uTanF*s+o*z;gl_Position=vec4(px/uRes*2.-vec2(z),(log2(max(1e-12,1.+z*uLogC))*uLogF-1.)*z,z);}}`;
const PE_N3=`float n3(vec3 p){vec3 i=floor(p),f=p-i;f=f*f*(3.-2.*f);i=mod(i,32.);return textureLod(uNoise,(i+f+.5)*.03125,0.).r;}
// rock types, as colour factors on the world's rock colour: dark basalt, pale sandstone (on Mars the light-toned sulfate beds),
// iron-red beds (hematite), pale limestone, grey shale and mudstone, tan granite. Mars is mostly basalt under its dust
vec3 rockTint(float h,bool mars){
  if(mars)return h<.36?vec3(.52,.66,.92):h<.56?vec3(1.3,1.32,1.3):h<.7?vec3(1.04,.8,.88):h<.84?vec3(.92,.98,1.08):vec3(1.12,1.05,.92);
  return h<.17?vec3(.66,.7,.76):h<.37?vec3(1.24,1.12,.94):h<.5?vec3(1.12,.82,.72):h<.68?vec3(1.32,1.32,1.26):h<.84?vec3(.9,.92,.96):vec3(1.12,1.04,.96);}
// which formation a place stands on: the region's bedrock (some 20 km across) with others cropping out between (a few km)
float geoU(vec3 up){return fract((n3(up*uRkm/23.+3.)*.6+n3(up*uRkm/6.+9.)*.4)*2.7);}
`;
const PE_TERRFS=()=>PE_HDR+`#define CLOUDS ${peClouds()?1:0}
`+PE_GLC()+PE_GLN+PE_GLA()+(peClouds()?peGLCLD():'')+PE_GLSH+peGLMat()+`
uniform highp sampler2DArray uTB,uTC;uniform highp sampler3D uNoise,uSky;uniform highp samplerCube uMac,uEnv;uniform float uEnvK,uTreeR,uForest,uGrassR,uDbgG;uniform int uGSh;uniform vec4 uBump;uniform float uMShd;   // (bump sources' strengths, for tuning: terrain octaves, noise, photo relief, stones)

uniform vec3 uCam,uVeg,uDry,uRock,uIce,uSand,uOcean,uLavaC;uniform vec3 uCB[NOCT];uniform float uLava,uCity,uTime,uPix,uDet,uRough,uCap,uCamH;uniform int uNDet,uDbg;uniform vec4 uRip;
in vec2 vTex,vTexP;flat in int vSlot,vPS;in vec3 vRel,vPu;in float vH,vWd,vM;flat in float vLev,vPM;
layout(location=0) out vec4 o;layout(location=1) out vec4 oD;
${PE_N3}
float hMac(vec3 d){return texture(uMac,d).r/uRkm;}
// long shadows of hills and mountains: march toward the sun over the coarse height cube, soft across the sun's disk
float macSh(vec3 P,vec3 up){float h0=max(length(P)-1.,hMac(up))+.25/uRkm;vec3 p0=up*(1.+h0);float t=3./uRkm,res=1.;
  for(int i=0;i<16;i++){vec3 q=p0+uSun*t;float rq=length(q),dh=rq-1.-hMac(q/rq);res=min(res,.5+dh/(t*.0094));if(res<=0.)break;t*=1.38;}
  return smoothstep(0.,1.,res);}
// ground cover from temperature (°C) and rain (0-1), steepness and height
vec3 biome(float T,float W,float sl,float rk,float ej,float nz,float hm,float cap,float geo,out float fo,out float snow){
  float veg=smoothstep(.06,.3,W)*smoothstep(-6.,4.,T);
  fo=smoothstep(.3,.55,W+(nz-.5)*.12+(uForest-1.)*.15)*smoothstep(-1.,7.,T)*(1.-smoothstep(.12,.28,sl))*min(uForest*2.,1.);
  vec3 grass=mix(mix(uDry,uVeg,.45)*1.05,uVeg*1.15,smoothstep(.2,.5,W));
  grass=mix(mix(uVeg,uRock,.55)*.85,grass,smoothstep(-3.,6.,T));
  vec3 fc=mix(uVeg*vec3(.42,.5,.62),uVeg*vec3(.62,.62,.5),smoothstep(5.,20.,T));
  vec3 des=mix(mix(uDry,uRock,.55),uDry,smoothstep(4.,20.,T));des=mix(des,mix(uDry,uRock,.65),smoothstep(.35,.75,nz)*.6);
  des=mix(des,uRock*.75,geo*.8);   // dark rock provinces against bright dust (Mars's dark plains)
  vec3 a=mix(des,grass,veg);a=mix(a,fc*(.85+.3*nz),fo);
  // beaches and shingle just above the water line
  float bch=smoothstep(5.,1.,hm)*(1.-smoothstep(.03,.1,sl));a=mix(a,T>2.?uSand:uRock*.9,bch);fo*=1.-bch;
  float rock=smoothstep(.07,.2,sl+rk*.05+(nz-.5)*.07);a=mix(a,uRock*(.75+.5*nz),rock);fo*=1.-rock;
  a*=1.+ej*.1;
  snow=max(smoothstep(-1.5,-8.,T+(nz-.5)*5.)*smoothstep(.015,.07,W),cap)*(1.-smoothstep(.25,.5,sl));a=mix(a,uIce,snow);fo*=1.-snow;
  return a;}
// a hashed pebble field at one octave: a stone in some cells, as a low dome (height in cell units)
// a hash of an integer cell (an integer mix: sin-based hashes lose precision on some GPUs and print triangles and rows)
float hh3(vec3 c){uvec3 u=uvec3(ivec3(mod(floor(c+.5),32.)));uint h=(u.x*1597334677u)^(u.y*3812015801u)^(u.z*2798796415u);
  h^=h>>15;h*=2246822519u;h^=h>>13;h*=3266489917u;h^=h>>16;return float(h>>8)*(1./16777216.);}
float stoneH(vec3 x,float dens){vec3 c=floor(x),f=x-c;float h=hh3(c);if(h>dens)return 0.;
  vec3 o=vec3(.3)+.4*vec3(hh3(c+7.),hh3(c+13.),hh3(c+21.)),v=(f-o)*(.75+.5*vec3(hh3(c+31.),hh3(c+37.),hh3(c+41.)));float r=.12+.22*hh3(c+3.);
  // some round, some blocky (a blend toward the box norm), all a little squat
  float q=mix(length(v),max(max(abs(v.x),abs(v.y)),abs(v.z))*1.2,hh3(c+47.))/r;return q<1.?r*sqrt(1.-q*q)*(.55+.4*hh3(c+53.)):0.;}
// tree crowns as rounded heights; each of the eight nearest cells may hold a tree, so neighbouring crowns overlap
float crownH(vec3 x){vec3 b=floor(x-.5);float h=0.;
  for(int i=0;i<8;i++){vec3 c=b+vec3(i&1,(i>>1)&1,(i>>2)&1);if(hh3(c+71.)>.9)continue;vec3 o=c+vec3(.25)+.5*vec3(hh3(c+7.),hh3(c+13.),hh3(c+21.));
    float r=.42+.3*hh3(c+3.),q=length(x-o)/r;if(q<1.)h=max(h,r*sqrt(1.-q*q)*(.8+.4*hh3(c+29.)));}
  return h;}
void main(){
  vec3 tc=vec3((vTex+.5)/${PE_TS}.,float(vSlot));vec4 C=texture(uTC,tc),B=texture(uTB,tc);
  if(vPM>.5){vec3 tq=vec3((vTexP+.5)/${PE_TS}.,float(vPS));C=mix(C,texture(uTC,tq),vM);B=mix(B,texture(uTB,tq),vM);}
  float dist=length(vRel);vec3 V=-vRel/dist,P=uCam+vRel;float r=length(P);vec3 up=P/r,Nu=normalize(vPu);vec3 dPx=dFdx(vRel),dPy=dFdy(vRel);
  // flat triangles sit a little inside the curved surface: move the point back along the ray onto it
  float rs=1.+vH+max(vWd,0.);dist=max(dist-clamp((rs-r)/max(dot(V,up),.03),0.,dist*.5),0.);r=max(r,rs);P=up*r;
  vec3 N=normalize(Nu-C.xyz);
  float fp=dist*uPix/max(dot(N,V),.2),Rm=uRkm*1000.;
  // detail finer than the tile: a few octaves of bumps around the camera, faded out where they would shimmer
  vec3 Tx=normalize(cross(Nu,abs(Nu.y)<.95?vec3(0,1,0):vec3(1,0,0))),Ty=cross(Nu,Tx);
  // octaves above the parent's: those the tile has but its parent lacks fade in as the tile's own fade out, so nothing pops
  int mo=int(vLev+.5),k0=vPM>.5?int(vPM+.5):mo+1;vec3 d=vRel,tx=Tx,ty=Ty;for(int i=0;i<NOCT;i++){if(i>=k0)break;d=2.*(Q*d);tx=Q*tx;ty=Q*ty;}
  vec3 gs=vec3(0);float an=0.,aw=0.,rk=B.z;float amp0=uRough*(.35+1.4*rk)/Rm;
  for(int k=k0;k<NOCT;k++){if(k-k0>=uNDet)break;float lam=exp2(-float(k)),fd=clamp(lam/(fp*3.)-1.,0.,1.);if(fd<=0.)break;fd*=k<=mo?vM:1.;
    vec3 x=uCB[k]+d;float n0=n3(x),nx=n3(x+tx*.3),ny=n3(x+ty*.3);
    float a=amp0*pow(lam*Rm*.01,.8)*fd;gs+=(Tx*(nx-n0)+Ty*(ny-n0))/.3*exp2(float(k))*a;an+=(n0-.5)*fd;aw+=fd;
    d=2.*(Q*d);tx=Q*tx;ty=Q*ty;}
  N=normalize(N-gs*uBump.x);
  float lw=1./(uRkm*.37),nz=clamp(.5+an/max(aw,1.)*1.6+(n3(P*uRkm*.37)-.5)*.6*clamp(lw/(fp*3.)-1.,0.,1.),0.,1.);
  // hollows collect water (wetter, greener), but only where it rains at all
  float T=B.x*80.-40.,W=B.y*(1.+max(C.w,0.)*4.),sl=1.-dot(N,Nu);
  float hm=-vWd*Rm,fo,snow;   // height above the water line (m)
  float cap=smoothstep(uCap-.012,uCap+.004,abs(up.y)+(nz-.5)*.03);
  float geo=smoothstep(.42,.62,.65*n3(up*3.1+7.)+.35*n3(up*7.3+1.));
  vec3 alb=biome(T,W,sl,rk,B.w,nz,hm,cap,geo,fo,snow);
  // the rocks' own colours: each region's formation, and on steep faces its beds (warped, 150 m and tens of metres thick and a few
  // metres within them), each bed another rock, so cliffs and mountainsides are banded. Bare soil takes a little of the rock it came from
  float hgtG=uCamH+dot(vRel,Nu)*Rm-dot(vRel,vRel)*Rm*.5;bool mars=uMatSet==1;
  {float rkw=smoothstep(.06,.2,sl+rk*.05+(nz-.5)*.07)*(1.-snow)*(1.-cap),dk=(1.-smoothstep(.06,.3,W))*(1.-rkw)*(1.-snow)*(1.-cap);
    float gu=geoU(up);vec3 tint=rockTint(gu,mars);float bw=smoothstep(.08,.3,sl)*rkw;
    if(bw>0.){float wp=(n3(up*uRkm/.9)-.5)*1.4+(n3(up*uRkm/.17)-.5)*.4;
      for(int s=0;s<3;s++){float sp=s==0?150.:s==1?45.:9.,fb=clamp(sp/(fp*Rm*4.)-1.,0.,1.)*bw;if(fb<=0.)continue;
        // beds blend into one another over their last quarter and wander in thickness along the slope; each is a mix of its
        // rock and the region's, so a face is banded in shades, not painted in stripes
        float x=hgtG/sp+wp*(s==0?.5:s==1?1.:.6)+(n3(up*uRkm/(sp*.0012)+float(s)*7.)-.5)*.6,id=floor(x),fr=fract(x);
        vec3 t0=rockTint(fract(gu+(hh3(vec3(id,float(s)*5.,9.))-.5)*(s==0?.9:s==1?.6:.35)),mars),t1=rockTint(fract(gu+(hh3(vec3(id+1.,float(s)*5.,9.))-.5)*(s==0?.9:s==1?.6:.35)),mars);
        tint=mix(tint,mix(t0,t1,smoothstep(.72,1.,fr)),fb*(s==0?.55:s==1?.4:.25));}}
    alb*=mix(vec3(1),tint,rkw*.85+dk*.35);}
  // Mars: sheets and drifts of dark basaltic sand on the flats, greyer than the dust around them
  float dsd=mars?smoothstep(.5,.74,nz)*(1.-smoothstep(.03,.12,sl))*(1.-cap):0.;alb=mix(alb,alb*vec3(.58,.62,.7),dsd*.85);
  // where 3D trees stand, the ground under them is forest floor (needles, leaf litter, moss); beyond them the canopy pattern
  float n3d=uTreeR>0.?1.-smoothstep(uTreeR*.85,uTreeR,dist):0.;
  if(n3d>0.&&fo>0.){vec3 fl=mix(mix(uDry,uRock,.5)*.5,uVeg*.75,.4+.35*nz);alb=mix(alb,fl,fo*n3d);}
  // ---- the ground up close: rock cracks and strata, grass and dust mottling, wind ripples, pebbles, tree crowns ----
  // Each is a few octaves of the world-anchored noise ladder at metre scales, faded out before it can shimmer
  float ffm=fp*Rm;
  float msh=1.,mus0=dot(Nu,uSun);int dL=-1;vec3 dbgV=vec3(0);   // (dL: the dominant photo layer, for the debug view 8)
  if(ffm<40.&&vWd<=0.&&uNDet>0){   // (out to a 40 m footprint: the photos' big sizes carry far slopes)
    float vg=smoothstep(.06,.3,W)*smoothstep(-6.,4.,T),rw=smoothstep(.07,.2,sl+rk*.05+(nz-.5)*.07)*(1.-snow)*(1.-cap);
    float gw=vg*(1.-fo)*(1.-rw)*(1.-snow),dw=(1.-vg)*(1.-rw)*(1.-snow)*(1.-cap),fw=fo*(1.-rw)*(1.-n3d),ff=fo*n3d*(1.-rw)*(1.-snow),lf=mix(.3,.85,smoothstep(0.,10.,T));
    int kb=min(int(log2(Rm/6.)+.5),NOCT-6);float lb=Rm*exp2(-float(kb));
    float am_pre=1.;vec3 dd=vRel,ax=Tx,ay=Ty,sv=uSun,nv=Nu,dc=vRel;for(int i=0;i<NOCT;i++){if(i>=kb)break;if(i==kb-3)dc=dd;dd=2.*(Q*dd);ax=Q*ax;ay=Q*ay;sv=Q*sv;nv=Q*nv;}
    // stands and clearings tens of metres across, so a forest keeps its grain past the distance where single trees show
    {float l2=lb*8.,w2=clamp(l2/(ffm*3.)-1.,0.,1.);float c1=n3(uCB[kb-3]+dc),c2=n3(uCB[kb-2]+2.*(Q*dc));
      am_pre=1.+w2*(fw*((c1-.5)*.5+(c2-.5)*.35)+gw*(c1-.5)*.3+dw*((c1-.5)*.55+(c2-.5)*.3));}   // (bare ground: bright dust mantles and darker sand sheets)
    vec3 gd=vec3(0),tn=vec3(1);float am=1.;vec3 dd0=dd,ax0=ax,ay0=ay,nv0=nv,sv0=sv;
    // (on Mars a gravel of dark basalt lies everywhere on the dust: more of the drawn stones, larger ones too)
    float smk=uMatOn>.5?(mars?.85:.3):1.,sm2=uMatOn>.5?(mars?.3:0.):.35;   // with the photo materials (which carry their own gravel) the drawn stones are only the odd bigger one
    for(int o=0;o<6;o++){int k=kb+o;float lam=lb*exp2(-float(o)),w=clamp(lam/(ffm*3.)-1.,0.,1.);if(w<=0.)break;
      vec3 x=uCB[k]+dd;float n0=n3(x),nx=n3(x+ax*.3),ny=n3(x+ay*.3);vec2 gr=vec2(nx-n0,ny-n0)/.3;
      // rock: a rough, faceted, blotchy surface
      
      am*=1.+w*(rw*(n0-.5)*.2+gw*(n0-.5)*(o<2?.55:.25)+dw*(n0-.5)*.22+fw*(n0-.5)*(o<2?.12:.25));
      // the forest floor: patchy, mossy in places, strewn with fallen leaves (reddish, brown, yellow, a few still green; fewer
      // where the trees are needle-leaved and the litter is a uniform brown mat)
      if(ff>0.){am*=1.+w*ff*(n0-.5)*(o<2?.5:.3);
        if(o<2)tn*=mix(vec3(1),vec3(.8,1.12,.72),w*ff*smoothstep(.56,.72,n0)*.7);
        if(o>=3){vec3 c=floor(x),f=x-c;if(hh3(c+83.)<lf*(o==3?.5:1.)){vec3 oc=vec3(.2)+.6*vec3(hh3(c+7.),hh3(c+13.),hh3(c+21.)),v=(f-oc)*(.6+.9*vec3(hh3(c+31.),hh3(c+37.),hh3(c+41.)));
          float lq=length(v)/((.13+.17*hh3(c+3.))*(o==3?.6:1.));if(lq<1.){float t2=hh3(c+59.);vec3 lc=t2<.4?vec3(1.15,.85,.6):t2<.75?vec3(.72,.58,.45):t2<.9?vec3(1.3,1.05,.55):vec3(.75,1.,.6);
            tn*=mix(vec3(1),lc,w*ff*smoothstep(1.,.7,lq)*.85);}}}}
      float A=lam*(rw*.09+gw*.025+dw*.03+fw*.03);
      // pebbles and stones on dry and rocky ground, lighter or darker than the soil and shadowed at their feet
      if(o>=2&&(dw+rw)>0.){float dens=(dw*.3+rw*.5)*(.5+nz)*(o==2?sm2:1.)*(1.-vg*.7)*smk;float s0=stoneH(x,dens);
        float sx=stoneH(x+ax*.05,dens),sy=stoneH(x+ay*.05,dens);gd+=(Tx*(sx-s0)+Ty*(sy-s0))/.05*1.3*(dw+rw)*w*uBump.w;   // stone heights are in cell units, so this is their true slope (gd is the height's gradient: N-gd tilts away from the rise)
        // a stone is a darker or paler rock than the dust; dust gathers dark in the hollow at its foot
        vec3 c=floor(x),f=x-c;float ft=hh3(c)<dens?smoothstep(.55,.2,length(f-vec3(.3)-.4*vec3(hh3(c+7.),hh3(c+13.),hh3(c+21.)))/(.12+.22*hh3(c+3.))-.6):0.;
        am*=1.+w*(dw+rw)*(s0>0.?(hh3(c+5.)-.6)*.6:0.);
        if(mars&&s0>0.)tn*=mix(vec3(1),vec3(.62,.66,.74)*(.85+.3*hh3(c+9.)),w*(dw+rw)*.8*smoothstep(0.,.04,s0)*(1.-.6*smoothstep(.1,.24,s0)));}   // (dark grey basalt, dust on its top)
      // tree crowns: a rounded crown in nearly every cell (big trees, then smaller ones between), each its own shade of
      // green, with dark gaps where the light does not reach the floor
      if(o<2&&fw>0.){float s0=crownH(x),sx=crownH(x+ax*.05),sy=crownH(x+ay*.05);gd+=(Tx*(sx-s0)+Ty*(sy-s0))/.05*fw*w*.9;
        vec3 cc=floor(x+.5);float ht=hh3(cc+61.);am*=mix(1.,mix(.45,1.,smoothstep(0.,.25,s0))/.85,fw*w);
        tn*=mix(vec3(1),s0>0.?mix(vec3(.88,.97,.9),vec3(1.08,1.02,.86),ht):vec3(.75,.78,.72),fw*w*.7);}
      gd+=(Tx*gr.x+Ty*gr.y)*A*w/lam*uBump.y;
      dd=2.*(Q*dd);ax=Q*ax;ay=Q*ay;sv=Q*sv;nv=Q*nv;}
    // wind ripples on sand and dust: crests across the wind, a gentle windward slope and a steeper lee, two sizes (a couple of
    // metres, and a few decimetres on top of them), wandering a little. The phase runs from the camera's own (worked out in
    // double precision on the CPU), so it is exact and steady wherever the camera goes
    // (only on loose sand: hot sandy ground on Earth-like worlds, the dust of dry cold ones. They were on all dry ground, dirt
    // and scrub too, and steep enough (some 23°) that a low sun left every lee face dark: a field of stripes at sunset. Real
    // megaripples are gentle, a few degrees on the windward side and about ten on the lee)
    // (and only a few degrees steep, so even a sun a handful of degrees up still lights their lee faces: steeper, a low sun
    // turned the ground into dark stripes)
    float rsk=dw*(mars?1.:smoothstep(10.,24.,T)*smoothstep(.45,.75,nz))*uBump.y;
    if(rsk>0.){vec3 rd=uRip.xyz-Nu*dot(uRip.xyz,Nu);float rl=length(rd);
      if(rl>.1){rd/=rl;float xm=dot(vRel,uRip.xyz)*Rm,wv=(n3(uCB[kb-3]+dc)-.5)*1.6+(n3(uCB[kb]+dd0)-.5)*.5;
        for(int q=0;q<2;q++){float L=q==0?2.4:.48,wq=clamp(L/(ffm*8.)-1.,0.,1.)*rsk*(1.-smoothstep(.03,.1,sl))*(q==0?smoothstep(.3,.6,nz+.15):1.);if(wq<=0.)continue;
          float ph=6.2832*(xm/L+uRip.w*(q==0?1.:5.)+wv*(q==0?1.:2.3)),sl2=cos(ph)+.35*cos(2.*ph);
          gd+=rd*sl2*6.2832*.007*wq*(q==0?1.:.6);am*=1.+wq*.025*sin(ph);}}}
    // layered rock: beds a few metres to tens of metres thick on steep faces, each its own shade, with ledges at their tops
    float hgt=hgtG,wst=rw*smoothstep(.18,.45,sl);
    if(wst>0.){float wp=(n3(P*uRkm*.11)-.5)*1.6+(n3(P*uRkm*.6)-.5)*.5;
      for(int s=0;s<2;s++){float sp=s==0?32.:7.,fw2=clamp(sp*.25/ffm-1.,0.,1.)*wst;if(fw2<=0.)continue;
        float z=hgt/sp+wp*(s==0?1.:.4),id=floor(z),f=z-id;am*=1.+fw2*((hh3(vec3(id,float(s)*7.,3.))-.5)*.32-.18*smoothstep(.85,1.,f));
}}
    // ---- photo textures: this ground's materials from its climate, up to four, blended by their heights (stones stand out of
    // the sand, grass fills the hollows), taken as detail on the ground's own colour; their relief tilts the normal ----
    if(uMatOn>.5){
      float dryk=1.-smoothstep(.18,.42,W),hot=smoothstep(10.,24.,T),sandk=mars?.35+.55*smoothstep(.3,.75,.6*n3(uCB[kb-3]+dc)+.4*n3(uCB[kb-2]+2.*(Q*dc)+3.1)):hot*smoothstep(.3,.7,nz),lushk=smoothstep(.35,.55,W);
      float bch=smoothstep(5.,1.,hm)*(1.-smoothstep(.03,.1,sl)),steep=smoothstep(.25,.45,sl);
      float wm[9];int lm[9];
      wm[0]=gw*lushk*(1.-bch);lm[0]=1;                                                // lush grass
      wm[1]=gw*(1.-lushk)*(1.-dryk)*(1.-bch);lm[1]=0;                                 // grass
      wm[2]=gw*dryk*(1.-bch);lm[2]=2;                                                 // dry grass
      wm[3]=ff;lm[3]=T>9.?4:3;                                                         // forest floor: leaf litter, or needles and moss
      wm[4]=dw*(1.-sandk)*(1.-bch);lm[4]=mars?20:W<.1?7:nz>.5?6:5;                     // dirt, dry ground, cracked mud
      // (Mars: the crusted, cracked ground grades into the loose dust (slot 2 is grass, which Mars has none of), and a thin
      // gravel of basalt lies over all of it, so there are no islands of one texture in another)
      if(mars){float ck=smoothstep(.45,.7,.7*n3(uCB[kb-3]+dc+vec3(7.3,1.9,4.4))+.3*nz);wm[2]=wm[4]*ck;lm[2]=21;wm[4]*=1.-ck;}
      wm[5]=dw*sandk+bch*(1.-snow);lm[5]=mars?19:bch>.5?8:9;                          // beach and desert sand
      wm[6]=rw*steep;lm[6]=mars?23:W>.45?16:W>.22?15:13;                              // cliffs: mossy, lichen-crusted, bare
      wm[7]=rw*(1.-steep);lm[7]=mars?22:nz>.5?14:11;                                  // rocky ground, scree
      if(mars)wm[7]=max(wm[7],dw*(1.-sandk)*(.1+.2*smoothstep(.35,.75,am_pre*.5+nz*.5)));
      wm[8]=snow;lm[8]=17;
      int kt=kb+2;vec3 dT=2.*(Q*(2.*(Q*dd0))),nT=normalize(Q*(Q*nv0)),aT=Q*(Q*ax0),bT=Q*(Q*ay0),xt=uCB[kt]+dT;
      vec3 gx=dPx,gy=dPy;for(int i=0;i<NOCT;i++){if(i>=kt)break;gx=2.*(Q*gx);gy=2.*(Q*gy);}float km=smoothstep(40.,18.,ffm);
      vec3 as[4],gvs[4];float hs[4],ws[4];int nS=0,lsel[4];float hm2=-9.;
      for(int i=0;i<9;i++){if(wm[i]<.03||nS>=4)continue;vec3 a;vec3 gv;float h;matTriG(lm[i],xt,nT,gx,gy,a,gv,h);lsel[nS]=lm[i];as[nS]=a;gvs[nS]=gv;hs[nS]=h;ws[nS]=wm[i];hm2=max(hm2,wm[i]+h*.6);nS++;}
      if(nS>0){vec3 R=vec3(0),G=vec3(0);float wt=0.;
        float dW=-1.;
        for(int j=0;j<4;j++){if(j>=nS)break;float w=max(ws[j]+hs[j]*.6-hm2+(mars?.6:.25),0.);   // (Mars: gravel and dust grade into each other, no islands)
R+=as[j]*w;G+=gvs[j]*w;wt+=w;if(w>dW){dW=w;dL=lsel[j];}}
        R/=max(wt,1e-4);G/=max(wt,1e-4);
        // the pebbles' and grains' own shadows, close by (the fine size of the main layer, on level-ish ground)
        if(dL>=0&&uMShd>0.){vec3 an=abs(nT);float fz=(1.-smoothstep(.02,.05,ffm))*smoothstep(.55,.7,max(an.x,max(an.y,an.z)))*uMShd;
          if(fz>0.){vec3 sT=normalize(Q*(Q*sv0));msh=mix(1.,matShadow(dL,xt,nT,sT,gx,gy,.15),fz);}
          if(uDbg==10)dbgV=vec3(fz,matShadow(dL,xt,nT,normalize(Q*(Q*sv0)),gx,gy,.15),msh);}
        alb*=mix(vec3(1),clamp(R,vec3(.2),vec3(2.5)),.9*km);am=mix(am,1.,.6);
        gd-=(Tx*dot(G,aT)+Ty*dot(G,bT))*.55*km*uBump.z;}}
    // under the 3D grass the ground we glimpse is the sward's shaded floor (the blades carry the field's colour)
    alb*=clamp(am*am_pre,.3,1.8)*tn;N=normalize(N-gd/Rm*Rm);}
  float mus=dot(up,uSun);vec3 Ts=trans(r,mus)*pSh(r,mus);
  float sh=1.;if(Ts.g>1e-5&&mus<.7)sh=macSh(P,up);
  // the trees' and rocks' shadows, rebuilt a step at a time: 1 one hard depth comparison; 2 soft edges (filtered comparisons)
  sh*=msh;
  if(uGSh==1&&Ts.g>1e-5)sh*=shHard(vRel,vec2(.12,.8));else if(uGSh==2&&Ts.g>1e-5)sh*=shSoft(vRel,vec2(.12,.8));
  // 3 edges as soft as the sun's disc makes them: sharp at the caster's foot, wider the higher the caster
  else if(uGSh==3&&Ts.g>1e-5)sh*=shPCSS(vRel,vec2(.12,.8));
  float wet=0.;
#if CLOUDS
  // cloud shadows, and ground darkened and glossy where it is raining
  if(Ts.g>1e-5)sh*=cShadow(P,max(.3,fp*uRkm));{vec4 wx=WX(P);wet=smoothstep(.25,.7,wxPr(wx))*eyeW(up,wx);alb*=1.-.4*wet*(1.-snow);}
#endif
  // under the trees: their real shadows near the camera (sun flecks through the gaps), farther out the canopy's average shade
  vec3 Es=uSunI*Ts*sh,Ek=uSunI*irr(r,mus);
#if CLOUDS
  Ek=cAmb(P,mus,Ek);
#endif
  // (the ground's shading is being rebuilt from scratch: for now only sun and sky, the hills' and the clouds' shadows)
  float ao=1.;
  vec3 Ecan=vec3(0);
  float nl=max(dot(N,uSun),0.);
  // forest canopies are rough and self-shadowing: less of their sunlit side shows at low sun
  float cnp=1.;
  vec3 col=alb/PI*(Es*nl*cnp+Ek*(.55+.45*dot(N,up))*ao+Ecan);
  float gK=clamp(dot(alb/PI*Es*nl*cnp,vec3(.3,.59,.11))/max(dot(col,vec3(.3,.59,.11)),1e-9),0.,1.);if(vWd>0.)gK=1.;
  if(wet>0.){vec3 H=normalize(uSun+V);col+=wet*.05*Es*pow(max(dot(N,H),0.),60.)*(1.-snow);}
  if(vWd>0.){
    float dm=vWd*Rm,F,ff=fp*Rm;vec3 Nw=up;
    // wind waves: two ripple octaves close up; farther out their slopes become roughness that spreads the sun's glint
    float kw=smoothstep(9.,1.5,ff);
    if(kw>0.){int kq=int(log2(Rm/14.));vec3 dq=vRel,ax=Tx,ay=Ty;for(int i=0;i<NOCT;i++){if(i>=kq)break;dq=2.*(Q*dq);ax=Q*ax;ay=Q*ay;}
      vec2 gw=vec2(0);for(int j=0;j<3;j++){int kk=min(kq+j,NOCT-1);vec3 x=uCB[kk]+dq+vec3(uTime*.31,0.,uTime*.23)*float(j+1);float n0=n3(x),nx=n3(x+ax*.3),ny=n3(x+ay*.3);
        float lw=Rm*exp2(-float(kk));gw+=vec2(nx-n0,ny-n0)/.3*.35*exp2(-float(j)*.6)*smoothstep(lw*.6,lw*.15,ff);   // each ripple octave fades before it can alias
        dq=2.*(Q*dq);ax=Q*ax;ay=Q*ay;}
      Nw=normalize(up-(Tx*gw.x+Ty*gw.y)*kw*.5);}
    float a2=mix(.045,.012,kw);
    float NV=max(dot(Nw,V),1e-3);F=.02+.98*pow(1.-NV,5.);
    vec3 R=reflect(-V,Nw);float mv=max(dot(R,up),0.);vec3 Rh=R-up*dot(R,up),Sh=uSun-up*mus;
    float ca=dot(Rh,Sh)/max(length(Rh)*length(Sh),1e-6);
    vec3 sky=uSunI*texture(uSky,vec3(.5/32.+sqrt(mv)*31./32.,.5/32.+clamp((mus+.35)/1.35,0.,1.)*31./32.,.5/16.+(1.-ca)*.5*15./16.)).rgb;
    // near the camera the water mirrors the real sky around it, clouds and all (a small cube map, blurred by the waves'
    // roughness); far off, or seen from high up, the clear-sky table
    if(uEnvK>0.){float ek=uEnvK*(1.-smoothstep(25.,70.,dist*uRkm));if(ek>0.)sky=mix(sky,textureLod(uEnv,R,clamp(log2(a2*900.),0.,4.)).rgb,ek);}
    vec3 H=normalize(uSun+V);float NH=max(dot(Nw,H),0.),Dg=a2/(PI*sq(NH*NH*(a2-1.)+1.)),Fh=.02+.98*pow(1.-max(dot(H,V),0.),5.);
    vec3 glint=Es*Dg*Fh/(4.*NV)*step(0.,dot(Nw,uSun));
    vec3 Tw=exp(-dm*vec3(.38,.07,.035)),body=mix(uOcean,alb*.85,Tw);
    float foam=smoothstep(1.2,.1,dm)*smoothstep(.35,.75,nz)*.6;
    vec3 wc=F*sky+(1.-F)*body/PI*(Es*max(mus,0.)+Ek)+glint;wc=mix(wc,vec3(.8)/PI*(Es*max(mus,0.)+Ek),foam);
    // lava: a dark crust split by glowing cracks
    if(uLava>0.){float cr=smoothstep(.45,.65,n3(P*uRkm*.06))*(.4+.6*n3(P*uRkm*.011+3.));wc=vec3(.012,.01,.009)/PI*(Es*max(mus,0.)+Ek)+uLavaC*uLava*(.04+cr*1.1);}
    float wb=smoothstep(0.,.02,dm);col=mix(col,wc,wb);}
  // city lights on the night side: temperate, low, fairly flat, near water
  if(uCity>0.){float hab=smoothstep(-2.,8.,T)*smoothstep(32.,22.,T)*smoothstep(.15,.3,W)*(1.-smoothstep(.15,.3,sl))*step(vWd,0.)*(1.-snow);
    float c=hab*smoothstep(.55,.72,n3(P*uRkm*.0041))*smoothstep(.45,.8,n3(P*uRkm*.05));
    col+=c*smoothstep(.04,-.12,mus)*vec3(1.,.62,.28)*uCity*2e-5;}
  if(uDbg==10)col=vec3(dbgV.z)*uSunI*.03;else if(uDbg==9)col=vec3(msh,float(dL>=0),0)*uSunI*.05;else if(uDbg==8){float q=float(dL);col=dL<0?vec3(.2):vec3(fract(q*.37),fract(q*.61),fract(q*.83))*uSunI*.05;}
  else if(uDbg==1)col=vec3(B.x,B.y,B.z);else if(uDbg==2)col=N*.5+.5;else if(uDbg==3)col=alb;else if(uDbg==4)col=vec3(sh,max(C.w*20.,0.),max(-C.w*20.,0.));else if(uDbg==5)col=vec3(fract(vLev/4.),float(vSlot%7)/7.,vWd>0.?1.:0.);
#if CLOUDS
  else if(uDbg==6){vec4 wx=WX(P);col=vec3(wx.r+uCov,wx.g,wx.b);}
#endif
  
  // (debug, uGSh 9: which cascade covers the ground, red near, blue far, and the hard shadow as black)
  if(uGSh==9){bool h0,h1;float v0=shHard1(vRel,uShO,uShX,uShY,uShZ,uShP,.12,0,h0),v1=shHard1(vRel,uShO2,uShX2,uShY2,uShZ2,uShP2,.8,1,h1);
    col=(h0?vec3(1,.2,.2)*v0:h1?vec3(.2,.3,1)*v1:vec3(.5))*.4;}
  o=vec4(col,4.+gK);oD=vec4(dist);}`;   // (alpha 4+: the ground)
