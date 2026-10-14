/* ---------- shaders ---------- */
const VS=`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}`;
const traceFS=()=>{const ns=SC.length,nb=BX.length,ng=GR.length,nl=LI.length;return `#version 300 es
precision highp float;precision highp int;
#define NS ${Math.max(1,ns)}
#define NSC ${ns}
#define NB ${Math.max(1,nb)}
#define NBC ${nb}
#define NBG ${Math.max(1,BGR.length)}
#define NBGC ${BGR.length}
#define NG ${Math.max(1,ng)}
#define NGC ${ng}
#define NL ${Math.max(1,nl)}
#define NLC ${nl}
#define NLB ${Math.max(1,LB.length)}
#define NLBC ${LB.length}
#define NLT ${nl+LB.length}
#define NPR ${Math.max(1,PR.length)}
#define NPRC ${PR.length}
#define NLN ${Math.max(1,LN.length)}
#define NLNC ${LN.length}
#define MAXB ${S.renderMode==='path'?16:(S.renderMode==='hybrid'||S.renderMode==='whitted')?10:8}   // the real count is uMaxB, so bounces never recompile
uniform int uDisp;
uniform float uFcl;   // firefly clamp for indirect light (high when a still image is converging, so caustics keep their energy)
#define FCL uFcl
#define MODE ${MIDX[S.renderMode]||0}
#define NT4 ${S.renderMode==='hybrid'&&fExt?1:0}
#define RESTIR ${S.renderMode==='hybrid'&&fExt&&S.restir&&nl+LB.length>0?1:0}
#define LZ ${(lzBuilt=nLz>0)?1:0}
#define INST ${INST.list.length>0?1:0}
uniform vec4 uBp[NB],uBh[NB],uBc[NB],uBm[NB];uniform vec3 uBBmin,uBBmax,uBGa[NBG],uBGb[NBG];uniform ivec2 uBGr[NBG];
uniform vec4 uS[NS],uC[NS],uM[NS],uG[NG];uniform ivec2 uGr[NG];uniform int uLi[NL],uLb[NLB];
uniform vec4 uPrP[NPR*6],uPrM[NPR],uPrO[NPR],uPrB[NPR],uLnB[NLN],uLnC[NLN],uLnA[NLN],uLnS[NLN],uLnM[NLN],uLnO[NLN];
uniform sampler2D uPrev;uniform float uBlend;uniform uint uFrame;uniform int uSpp,uReproj,uMaxB,uNee;
uniform vec2 uRes;uniform vec3 uEye,uFw,uRt,uUp,uPEye,uPFw,uPRt,uPUp;uniform float uTanF,uAp,uFocus;
uniform vec3 uSun;uniform float uSunOn;uniform int uSky,uFloor;uniform float uFog;uniform int uSdfSteps,uGiRate,uCache;
uniform float uMinA;uniform int uTaa;uniform vec2 uJit;
#if MODE==1
uniform sampler2D uPrev1,uPrev2;
layout(location=0) out vec4 o;layout(location=1) out vec4 o1;layout(location=2) out vec4 o2;
#if NT4
uniform sampler2D uPrev3;layout(location=3) out vec4 o3;
#endif
#else
uniform sampler2D uPrev1;
layout(location=0) out vec4 o;layout(location=1) out vec4 o1;
#endif
float gSpec0=0.;bool gFirst=true;vec3 gAlb0=vec3(1),gN0=vec3(0);   // gN0: normal of the first surface (for reprojection)
// a surface seen from one side now and from the other side last frame is a different surface (the two faces of a thin wall)
bool sameSide(vec3 P,vec3 n){return dot(n,n)<.25||dot(n,uEye-P)*dot(n,uPEye-P)>0.;}
float gDk=0.,gWl=.5;bool gDispHit=false;   // dispersion strength of the last material, this sample's wavelength, did it pass dispersive glass
// rainbow weight for a wavelength in [0,1] (red to violet), normalized so it averages to white
vec3 specW(float w){float h=w*.7;vec3 k=clamp(abs(fract(h+vec3(1.,2./3.,1./3.))*6.-3.)-1.,0.,1.);return k*vec3(2.7631,1.4000,2.4706);}
void mat(int id,vec3 p,bool stoch,out vec3 alb,out float mt,out float ro2,out float ior,out float em,out float dens);   // was the first surface hit a mirror or glass? (short history for those pixels)
// Catmull-Rom history fetch (5 taps): keeps texture detail sharp although history is resampled every frame
vec3 histCR(sampler2D t,vec2 p){vec2 tp1=floor(p-.5)+.5,f=p-tp1,
  w0=f*(-.5+f*(1.-.5*f)),w1=1.+f*f*(-2.5+1.5*f),w2=f*(.5+f*(2.-1.5*f)),w3=f*f*(-.5+.5*f),w12=w1+w2,
  t0=(tp1-1.)/uRes,t3=(tp1+2.)/uRes,t12=(tp1+w2/w12)/uRes;
  vec3 c=texture(t,vec2(t12.x,t0.y)).rgb*(w12.x*w0.y)+texture(t,vec2(t0.x,t12.y)).rgb*(w0.x*w12.y)+texture(t,t12).rgb*(w12.x*w12.y)
   +texture(t,vec2(t3.x,t12.y)).rgb*(w3.x*w12.y)+texture(t,vec2(t12.x,t3.y)).rgb*(w12.x*w3.y);
  return max(c/(w12.x*w0.y+w0.x*w12.y+w12.x*w12.y+w3.x*w12.y+w12.x*w3.y),0.);}
// firefly rejection against an established history: a new sample may be at most ~4x as bright as what the pixel has seen
vec3 ffClamp(vec3 c,vec3 h){float lc=dot(c,vec3(.2126,.7152,.0722)),lm=max(dot(h,vec3(.2126,.7152,.0722)),0.)*4.+.2;return lc>lm?c*(lm/lc):c;}
// mobile GPUs (fast maths, 16-bit buffers) can produce the odd NaN, infinity or negative value; once one is written to the
// history it spreads through reprojection and filtering like ink. Every value is checked before it is kept.
bool okc(vec3 c){return all(greaterThanEqual(c,vec3(-1e-4)))&&all(lessThan(c,vec3(6e4)));}
vec3 safe(vec3 c,vec3 fb){return okc(c)?max(c,vec3(0)):okc(fb)?max(fb,vec3(0)):vec3(0);}
float safeD(float d){return d>=0.&&d<6e4?d:1e4;}
uint st;
uint pcg(){st=st*747796405u+2891336453u;uint w=((st>>((st>>28u)+4u))^st)*277803737u;return (w>>22u)^w;}
float rnd(){return float(pcg())*(1./4294967296.);}
vec3 rsph(){float z=clamp(rnd()*2.-1.,-1.,1.),a=rnd()*6.2831853;float r=sqrt(max(0.,1.-z*z));return vec3(r*cos(a),r*sin(a),z);}
// cosine-weighted bounce direction that can never be a zero vector
vec3 cosDir(vec3 n){vec3 d=n+rsph();float l=dot(d,d);return l>1e-6?d*inversesqrt(l):n;}
${CAMGLSL}${APGLSL}
bool gStars=true;   // stars are pinpoints: only where the sky is seen directly or in a mirror, never through a diffuse bounce (they were fireflies)
vec3 sky(vec3 d,bool withSun){
  vec3 c;float y=d.y;
  if(uSky==4)return vec3(0);   // the void outside the Cornell box
  if(uSky==0){c=mix(vec3(.95,.55,.35),vec3(.18,.22,.45),smoothstep(-.05,.5,y));}
  else if(uSky==1){c=mix(vec3(.75,.85,1.),vec3(.25,.5,.95),smoothstep(0.,.6,y));}
  else if(uSky==2){c=mix(vec3(.04,.05,.09),vec3(.005,.008,.02),smoothstep(-.3,.5,y));if(withSun&&gStars){float s=fract(sin(dot(floor(d*220.),vec3(12.9,78.2,37.7)))*43758.5);c+=step(.9975,s)*vec3(.8);}}   // stars only where the sky is seen directly (fog and ambient used to pick them up as streaks)
  else{c=vec3(.55)*(.4+.6*smoothstep(-.2,.8,y));c+=vec3(3.)*smoothstep(.93,.97,dot(d,normalize(vec3(-.4,.8,.4))));}
  if(withSun&&uSunOn>.5&&uSky!=3){float s=dot(d,uSun);c+=vec3(30.,24.,18.)*smoothstep(.9994,.9997,s)+vec3(1.,.7,.4)*pow(max(s,0.),64.)*.4;}
  return c;
}
vec2 boxT(vec3 ro,vec3 inv,int i,out vec3 nN,out vec3 nF){
  vec3 t0=(uBp[i].xyz-uBh[i].xyz-ro)*inv,t1=(uBp[i].xyz+uBh[i].xyz-ro)*inv,mn=min(t0,t1),mx=max(t0,t1);
  float tn=max(max(mn.x,mn.y),mn.z),tf=min(min(mx.x,mx.y),mx.z);
  vec3 sd=sign(inv);nN=-sd*step(mn.yzx,mn)*step(mn.zxy,mn);nF=sd*step(mx,mx.yzx)*step(mx,mx.zxy);
  return vec2(tn,tf);
}
// bounding sphere test: can a ray segment up to tm touch the sphere b (center, radius)?
bool bsph(vec3 ro,vec3 rd,vec4 b,float tm){vec3 oc=ro-b.xyz;float bb=dot(oc,rd),h=bb*bb-dot(oc,oc)+b.w*b.w;if(h<0.)return false;h=sqrt(h);return -bb+h>1e-3&&-bb-h<tm;}
// prism or slab: convex solid bounded by 6 planes (n·x <= d inside)
vec2 prismT(vec3 ro,vec3 rd,int i,out vec3 nN,out vec3 nF){float tn=-1e9,tf=1e9;nN=vec3(0);nF=vec3(0);
  for(int k=0;k<6;k++){vec4 P=uPrP[i*6+k];float dn=dot(P.xyz,rd),dist=P.w-dot(P.xyz,ro);
    if(abs(dn)<1e-8){if(dist<0.)return vec2(1e9,-1e9);continue;}
    float t=dist/dn;if(dn<0.){if(t>tn){tn=t;nN=P.xyz;}}else if(t<tf){tf=t;nF=P.xyz;}}
  return vec2(tn,tf);}
// spherical lens: a cylinder of radius R along axis a, bounded by two faces that are convex (+r), flat (0) or concave (-r);
// concave faces are carved out by subtracting a sphere, so the solid can split into two intervals along a ray
float lensHit(vec3 ro,vec3 rd,int i,out vec3 nrm){
  vec3 c=uLnC[i].xyz,a=uLnA[i].xyz,oc=ro-c;float R=uLnC[i].w,he=uLnA[i].w,hc=uLnS[i].z;
  float tn=-1e9,tf=1e9;vec3 nn=vec3(0),nf=vec3(0);nrm=vec3(0,1,0);
  vec3 dp=rd-a*dot(rd,a),op=oc-a*dot(oc,a);float A=dot(dp,dp),Bq=dot(op,dp),Cq=dot(op,op)-R*R;
  if(A<1e-9){if(Cq>0.)return -1.;}
  else{float h=Bq*Bq-A*Cq;if(h<0.)return -1.;h=sqrt(h);tn=(-Bq-h)/A;tf=(-Bq+h)/A;nn=normalize(op+dp*tn);nf=normalize(op+dp*tf);}
  vec4 sc0=vec4(0),sc1=vec4(0);int ncc=0;
  for(int s=0;s<2;s++){float sg=s==0?1.:-1.,rr=s==0?uLnS[i].x:uLnS[i].y;vec3 ax=a*sg;
    if(rr>0.){vec3 cs=c+ax*(hc-rr),o2=ro-cs;float b=dot(o2,rd),cc=dot(o2,o2)-rr*rr,h=b*b-cc;if(h<0.)return -1.;h=sqrt(h);
      float t0=-b-h,t1=-b+h;if(t0>tn){tn=t0;nn=(o2+rd*t0)/rr;}if(t1<tf){tf=t1;nf=(o2+rd*t1)/rr;}}
    else{float lim=rr==0.?hc:he,dn=dot(rd,ax),dist=lim-dot(oc,ax);
      if(abs(dn)<1e-8){if(dist<0.)return -1.;}else{float t=dist/dn;if(dn>0.){if(t<tf){tf=t;nf=ax;}}else if(t>tn){tn=t;nn=ax;}}
      if(rr<0.){vec4 q=vec4(c+ax*(hc-rr),-rr);if(ncc==0)sc0=q;else sc1=q;ncc++;}}}
  if(tf<=tn)return -1.;
  vec2 I0=vec2(tn,tf),I1=vec2(1e9,-1e9);vec3 a0=nn,b0=nf,a1=vec3(0),b1=vec3(0);
  for(int k=0;k<2;k++){if(k>=ncc)break;vec4 q=k==0?sc0:sc1;vec3 o2=ro-q.xyz;float b=dot(o2,rd),cc=dot(o2,o2)-q.w*q.w,h=b*b-cc;if(h<=0.)continue;h=sqrt(h);
    float s0=-b-h,s1=-b+h;vec3 n0=-(o2+rd*s0)/q.w,n1=-(o2+rd*s1)/q.w;
    if(I1.y>I1.x&&!(s1<=I1.x||s0>=I1.y)){if(s0<=I1.x&&s1>=I1.y)I1=vec2(1e9,-1e9);else if(s0<=I1.x){I1.x=s1;a1=n1;}else{I1.y=s0;b1=n0;}}
    if(!(s1<=I0.x||s0>=I0.y)){if(s0<=I0.x&&s1>=I0.y){I0=I1;a0=a1;b0=b1;I1=vec2(1e9,-1e9);}
      else if(s0<=I0.x){I0.x=s1;a0=n1;}else if(s1>=I0.y){I0.y=s0;b0=n0;}
      else{I1=vec2(s1,I0.y);a1=n1;b1=b0;I0.y=s0;b0=n0;}}}
  if(I0.y>I0.x){if(I0.x>1e-3){nrm=a0;return I0.x;}if(I0.y>1e-3){nrm=b0;return I0.y;}}
  if(I1.y>I1.x){if(I1.x>1e-3){nrm=a1;return I1.x;}if(I1.y>1e-3){nrm=b1;return I1.y;}}
  return -1.;}
// boxes are grouped (up to 4 neighbors) under a bounding box, so a ray only tests the boxes near its path
bool grpHit(vec3 ro,vec3 inv,int g,float tm){vec3 t0=(uBGa[g]-ro)*inv,t1=(uBGb[g]-ro)*inv,mn=min(t0,t1),mx=max(t0,t1);
  float tn=max(max(mn.x,mn.y),mn.z),tf=min(min(mx.x,mx.y),mx.z);return tf>=max(tn,1e-3)&&tn<tm;}
bool bbHit(vec3 ro,vec3 inv,float tm){
  vec3 t0=(uBBmin-ro)*inv,t1=(uBBmax-ro)*inv,mn=min(t0,t1),mx=max(t0,t1);
  float tn=max(max(mn.x,mn.y),mn.z),tf=min(min(mx.x,mx.y),mx.z);return tf>=max(tn,0.)&&tn<tm;
}
#if INST
/* object instances from the scene builder, 8 texels each in uInT:
   0-2 world-to-local affine rows; 3 world box min, shape (0 mesh, 1 sphere, 2 box, 3 cylinder); 4 world box max, mesh root;
   5 color, glass density; 6 material (0 matte, 1 metal, 2 glass), roughness, IOR, glow; 7 smooth normals, dispersion.
   Shapes are exact in their own space (unit sphere, box and cylinder), so any rotation and stretch stays exact.
   Models are triangle meshes with a bounding-volume hierarchy in uBvhT (2 texels a node) over triangles in uMeshT (6 texels). */
uniform highp sampler2D uInT,uMeshT,uBvhT;uniform int uNI;
vec4 iF(int i,int k){int j=i*8+k;return texelFetch(uInT,ivec2(j&1023,j>>10),0);}
vec4 mF(highp sampler2D s,int j){return texelFetch(s,ivec2(j&4095,j>>12),0);}
vec2 slab(vec3 o,vec3 iv,vec3 a,vec3 b){vec3 t0=(a-o)*iv,t1=(b-o)*iv,mn=min(t0,t1),mx=max(t0,t1);return vec2(max(max(mn.x,mn.y),mn.z),min(min(mx.x,mx.y),mx.z));}
bool aabbI(vec3 ro,vec3 iv,int i,float tm){vec2 s=slab(ro,iv,iF(i,3).xyz,iF(i,4).xyz);return s.y>=max(s.x,0.)&&s.x<tm;}
// nearest hit of instance i closer than tm (0 when none); nw: world normal, not normalized
float instT(int i,vec3 ro,vec3 rd,float tm,bool anyHit,out vec3 nw){
  vec4 r0=iF(i,0),r1=iF(i,1),r2=iF(i,2);nw=vec3(0,1,0);
  vec3 lo=vec3(dot(r0,vec4(ro,1.)),dot(r1,vec4(ro,1.)),dot(r2,vec4(ro,1.))),ld=vec3(dot(r0.xyz,rd),dot(r1.xyz,rd),dot(r2.xyz,rd));
  int ty=int(iF(i,3).w);float t=tm;vec3 nl=vec3(0,1,0);bool hit=false;
  if(ty==1){float a=dot(ld,ld),b=dot(lo,ld),c=dot(lo,lo)-1.,h=b*b-a*c;if(h<0.)return 0.;h=sqrt(h);
    float t0=(-b-h)/a,t1=(-b+h)/a,tt=t0>1e-4?t0:t1;if(tt>1e-4&&tt<t){t=tt;nl=lo+ld*tt;hit=true;}}
  else if(ty==2){vec2 s=slab(lo,1./ld,vec3(-1),vec3(1));if(s.y<max(s.x,1e-4))return 0.;float tt=s.x>1e-4?s.x:s.y;
    if(tt<t){t=tt;vec3 q=lo+ld*tt,a=abs(q);nl=a.x>=a.y&&a.x>=a.z?vec3(sign(q.x),0,0):a.y>=a.z?vec3(0,sign(q.y),0):vec3(0,0,sign(q.z));hit=true;}}
  else if(ty==3){float a=dot(ld.xz,ld.xz),b=dot(lo.xz,ld.xz),c=dot(lo.xz,lo.xz)-1.,tn=-1e30,tf=1e30;vec3 nn=vec3(0),nf=vec3(0);
    if(a>1e-14){float h=b*b-a*c;if(h<0.)return 0.;h=sqrt(h);tn=(-b-h)/a;tf=(-b+h)/a;vec3 q=lo+ld*tn;nn=vec3(q.x,0,q.z);q=lo+ld*tf;nf=vec3(q.x,0,q.z);}
    else if(c>0.)return 0.;
    if(abs(ld.y)<1e-14){if(abs(lo.y)>1.)return 0.;}
    else{float y0=(-1.-lo.y)/ld.y,y1=(1.-lo.y)/ld.y;if(min(y0,y1)>tn){tn=min(y0,y1);nn=vec3(0,-sign(ld.y),0);}if(max(y0,y1)<tf){tf=max(y0,y1);nf=vec3(0,sign(ld.y),0);}}
    if(tf<max(tn,1e-4))return 0.;float tt=tn>1e-4?tn:tf;if(tt<t){t=tt;nl=tn>1e-4?nn:nf;hit=true;}}
  else{vec3 iv=1./ld;int stk[40];int sp=0,node=int(iF(i,4).w),tri=-1;vec2 bc=vec2(0);
    for(int it=0;it<4096;it++){
      vec4 A=mF(uBvhT,node*2),B=mF(uBvhT,node*2+1);int cnt=int(B.w);
      if(cnt>0){int f=int(A.w);
        for(int k=0;k<8;k++){if(k>=cnt)break;int ti=f+k;vec3 v0=mF(uMeshT,ti*6).xyz,e1=mF(uMeshT,ti*6+1).xyz,e2=mF(uMeshT,ti*6+2).xyz;
          vec3 pv=cross(ld,e2);float det=dot(e1,pv);if(abs(det)<1e-18)continue;float id=1./det;vec3 tv=lo-v0;float u=dot(tv,pv)*id;if(u<0.||u>1.)continue;
          vec3 qv=cross(tv,e1);float v=dot(ld,qv)*id;if(v<0.||u+v>1.)continue;float tt=dot(e2,qv)*id;
          if(tt>1e-4&&tt<t){t=tt;tri=ti;bc=vec2(u,v);if(anyHit)break;}}
        if((anyHit&&tri>=0)||sp==0)break;node=stk[--sp];continue;}
      int l=int(A.w);vec2 sl=slab(lo,iv,mF(uBvhT,l*2).xyz,mF(uBvhT,l*2+1).xyz),sr=slab(lo,iv,mF(uBvhT,l*2+2).xyz,mF(uBvhT,l*2+3).xyz);
      bool hl=sl.y>=max(sl.x,0.)&&sl.x<t,hr=sr.y>=max(sr.x,0.)&&sr.x<t;
      if(hl&&hr){bool lf=sl.x<=sr.x;if(sp<40)stk[sp++]=lf?l+1:l;node=lf?l:l+1;}
      else if(hl)node=l;else if(hr)node=l+1;
      else{if(sp==0)break;node=stk[--sp];}}
    if(tri<0)return 0.;hit=true;
    vec3 ng=cross(mF(uMeshT,tri*6+1).xyz,mF(uMeshT,tri*6+2).xyz);nl=ng;
    if(iF(i,7).x>.5){vec3 s=mF(uMeshT,tri*6+3).xyz*(1.-bc.x-bc.y)+mF(uMeshT,tri*6+4).xyz*bc.x+mF(uMeshT,tri*6+5).xyz*bc.y;if(dot(s,s)>1e-12&&dot(s,nl)>0.&&dot(s,ld)*dot(nl,ld)>0.)nl=s;}}   // keep the true face where the smoothed one would face the ray the other way
  if(!hit)return 0.;
  nw=r0.xyz*nl.x+r1.xyz*nl.y+r2.xyz*nl.z;   // normals go through the transpose of the world-to-local map
  return t;}
#endif
float hitScene(vec3 ro,vec3 rd,out vec3 n,out int id){
  float t=1e9;id=-2;
  if(uFloor!=3&&rd.y<-1e-4){float tp=-ro.y/rd.y;if(tp>1e-3){t=tp;n=vec3(0,1,0);id=-1;}}
#if NSC>0
  int hi=-1;
  for(int g=0;g<NGC;g++){
    vec3 gc=ro-uG[g].xyz;float gb=dot(gc,rd),gcc=dot(gc,gc)-uG[g].w*uG[g].w,gh=gb*gb-gcc;
    if(gh<0.)continue;gh=sqrt(gh);if(-gb+gh<1e-3||-gb-gh>t)continue;
    ivec2 r=uGr[g];
    for(int i=r.x;i<r.y;i++){
      vec3 oc=ro-uS[i].xyz;float b=dot(oc,rd),c=dot(oc,oc)-uS[i].w*uS[i].w,h=b*b-c;
      if(h<0.)continue;h=sqrt(h);float tt=-b-h;if(tt<1e-3)tt=-b+h;
      if(tt>1e-3&&tt<t){t=tt;hi=i;}}}
  if(hi>=0){n=(ro+rd*t-uS[hi].xyz)/uS[hi].w;id=hi;}
#endif
#if NBC>0
  vec3 inv=1./rd;int bi=-1;
  if(bbHit(ro,inv,t))
  for(int g=0;g<NBGC;g++){if(!grpHit(ro,inv,g,t))continue;ivec2 rg=uBGr[g];
   for(int i=rg.x;i<rg.y;i++){
    vec3 t0=(uBp[i].xyz-uBh[i].xyz-ro)*inv,t1=(uBp[i].xyz+uBh[i].xyz-ro)*inv,mn=min(t0,t1),mx=max(t0,t1);
    float tn=max(max(mn.x,mn.y),mn.z),tf=min(min(mx.x,mx.y),mx.z);if(tf<max(tn,1e-3)||tn>t)continue;
    float tt=tn>1e-3?tn:tf;if(tt<t){t=tt;bi=i;}}}
  if(bi>=0){vec3 a,b;vec2 r=boxT(ro,inv,bi,a,b);n=r.x>1e-3?a:b;id=100+bi;}   // normal only for the nearest box
#endif
#if NPRC>0
  for(int i=0;i<NPRC;i++){if(!bsph(ro,rd,uPrB[i],t))continue;vec3 a,b;vec2 r=prismT(ro,rd,i,a,b);if(r.y<max(r.x,1e-3)||r.x>t)continue;
    float tt=r.x>1e-3?r.x:r.y;if(tt<t){t=tt;n=r.x>1e-3?a:b;id=200+i;}}
#endif
#if NLNC>0
  for(int i=0;i<NLNC;i++){if(!bsph(ro,rd,uLnB[i],t))continue;vec3 nl;float tt=lensHit(ro,rd,i,nl);if(tt>0.&&tt<t){t=tt;n=nl;id=300+i;}}
#endif
#if INST
  {vec3 iv=1./rd;for(int i=0;i<256;i++){if(i>=uNI)break;if(!aabbI(ro,iv,i,t))continue;vec3 nw;float tt=instT(i,ro,rd,t,false,nw);if(tt>0.){t=tt;n=nw;id=400+i;}}
   if(id>=400){n=normalize(n);if(iF(id-400,6).x!=2.&&dot(n,rd)>0.)n=-n;}}   // only glass needs to know inside from outside
#endif
  return t;
}
vec3 shadow(vec3 ro,vec3 rd,float tm){
  vec3 tr=vec3(1);
#if NSC>0
  for(int g=0;g<NGC;g++){
    vec3 gc=ro-uG[g].xyz;float gb=dot(gc,rd),gcc=dot(gc,gc)-uG[g].w*uG[g].w,gh=gb*gb-gcc;
    if(gh<0.)continue;gh=sqrt(gh);if(-gb+gh<1e-3||-gb-gh>tm)continue;
    ivec2 r=uGr[g];
    for(int i=r.x;i<r.y;i++){
      vec3 oc=ro-uS[i].xyz;float b=dot(oc,rd),c=dot(oc,oc)-uS[i].w*uS[i].w,h=b*b-c;
      if(h<0.)continue;h=sqrt(h);if(-b+h<1e-3||-b-h>tm)continue;
      float m=uM[i].x;if(m==2.)tr*=mix(vec3(1),uC[i].rgb,.7)*.85;else if(m!=3.)return vec3(0);}}
#endif
#if NBC>0
  vec3 inv=1./rd;
  if(bbHit(ro,inv,tm))
  for(int g=0;g<NBGC;g++){if(!grpHit(ro,inv,g,tm))continue;ivec2 rg=uBGr[g];
   for(int i=rg.x;i<rg.y;i++){
    vec3 t0=(uBp[i].xyz-uBh[i].xyz-ro)*inv,t1=(uBp[i].xyz+uBh[i].xyz-ro)*inv,mn=min(t0,t1),mx=max(t0,t1);
    float tn=max(max(mn.x,mn.y),mn.z),tf=min(min(mx.x,mx.y),mx.z);if(tf<max(tn,1e-3)||tn>tm)continue;
    float m=uBm[i].x;if(m==2.)tr*=mix(vec3(1),uBc[i].rgb,.8)*.85;else if(m!=3.)return vec3(0);}}
#endif
#if NPRC>0
  for(int i=0;i<NPRC;i++){if(!bsph(ro,rd,uPrB[i],tm))continue;vec3 a,b;vec2 r=prismT(ro,rd,i,a,b);if(r.y<max(r.x,1e-3)||r.x>tm)continue;if(uPrO[i].z>1.5)tr*=mix(vec3(1),uPrM[i].rgb,.8)*.82;else return vec3(0);}
#endif
#if NLNC>0
  for(int i=0;i<NLNC;i++){if(!bsph(ro,rd,uLnB[i],tm))continue;vec3 nl;float tt=lensHit(ro,rd,i,nl);if(tt>0.&&tt<tm)tr*=mix(vec3(1),uLnM[i].rgb,.8)*.85;}
#endif
#if INST
  {vec3 iv=1./rd;for(int i=0;i<256;i++){if(i>=uNI)break;if(!aabbI(ro,iv,i,tm))continue;vec3 nw;if(instT(i,ro,rd,tm,true,nw)>0.){vec4 m=iF(i,6);
    if(m.x==2.)tr*=mix(vec3(1),iF(i,5).rgb,.8)*.85;else if(m.w<=0.)return vec3(0);}}}
#endif
  return tr;
}
#if NLBC>0
// emissive box as an area light: the face turned toward p, sampled uniformly (or at its center)
vec3 boxSample(vec3 p,vec3 n,int j,bool rand,out vec3 l,out float dl){
  vec3 c=uBp[j].xyz,h=uBh[j].xyz,d=p-c,q=abs(d)/max(h,vec3(1e-4));
  int ax=q.x>q.y?(q.x>q.z?0:2):(q.y>q.z?1:2),a1=(ax+1)%3,a2=(ax+2)%3;
  vec3 fn=vec3(0);fn[ax]=d[ax]>=0.?1.:-1.;vec3 lp=c+fn*h;
  if(rand){lp[a1]+=(rnd()*2.-1.)*h[a1];lp[a2]+=(rnd()*2.-1.)*h[a2];}
  float A=4.*h[a1]*h[a2];l=lp-p;float d2=dot(l,l);dl=sqrt(d2);l/=dl;
  float cp=dot(n,l),cl=dot(fn,-l);if(cp<=0.||cl<=0.)return vec3(0);
  return uBc[j].rgb*uBm[j].w*cp*cl*A/(3.14159265*max(d2,.02));
}
#endif
#if NLT>0
float lumc(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
// cheap unshadowed estimate of light k at p: used only to choose which light gets the one shadow ray
float lightW(vec3 p,vec3 n,int k){
#if NLC>0
  if(k<NLC){int li=uLi[k];vec4 s=uS[li];vec3 pc=s.xyz-p;float d2=dot(pc,pc),id=inversesqrt(d2);
    float nl=clamp(dot(n,pc)*id+s.w*id,0.,1.);return lumc(uC[li].rgb)*uM[li].w*nl*s.w*s.w/max(d2,s.w*s.w)+1e-6;}
#endif
#if NLBC>0
  int j=uLb[k-NLC];vec3 pc=uBp[j].xyz-p,h=uBh[j].xyz;float d2=dot(pc,pc),A=4.*max(max(h.x*h.y,h.y*h.z),h.x*h.z);
  float nl=clamp(dot(n,pc)*inversesqrt(d2)+.5,0.,1.);return lumc(uBc[j].rgb)*uBm[j].w*nl*A/max(d2,A)+1e-6;
#else
  return 1e-6;
#endif
}
// one light sample with shadow ray (sphere lights: visible cone; box lights: facing side)
vec3 neeOne(vec3 p,vec3 n,int k){
#if NLC>0
  if(k<NLC){
    int li=uLi[k];vec4 s=uS[li];
    vec3 pc=s.xyz-p;float dc2=dot(pc,pc),r2=s.w*s.w;if(dc2<=r2)return vec3(0);
    float cosMax=sqrt(max(0.,1.-r2/dc2)),ct=1.-rnd()*(1.-cosMax),stt=sqrt(max(0.,1.-ct*ct)),ph=6.2831853*rnd();
    vec3 w=pc*inversesqrt(dc2),u=normalize(cross(abs(w.x)>.1?vec3(0,1,0):vec3(1,0,0),w)),v=cross(w,u);
    vec3 l=u*(cos(ph)*stt)+v*(sin(ph)*stt)+w*ct;float nl=dot(n,l);if(nl<=0.)return vec3(0);
    return uC[li].rgb*uM[li].w*nl*(2.*(1.-cosMax))*shadow(p+n*1e-3,l,sqrt(dc2)-s.w*1.01);
  }
#endif
#if NLBC>0
  vec3 l;float dl;vec3 e=boxSample(p,n,uLb[k-NLC],true,l,dl);
  if(e.r+e.g+e.b<=0.)return vec3(0);
  return e*shadow(p+n*1e-3,l,dl-2e-3);
#else
  return vec3(0);
#endif
}
// next-event estimation with light importance sampling: pick a light in proportion to its estimated contribution
vec3 nee(vec3 p,vec3 n){
  float w[NLT];float W=0.;
  for(int k=0;k<NLT;k++){w[k]=lightW(p,n,k);W+=w[k];}
  float u=rnd()*W;int k=0;
  for(;k<NLT-1;k++){if(u<w[k])break;u-=w[k];}
  return neeOne(p,n,k)*(W/w[k]);
}
#endif
#if NLBC>0&&NPRC>0
#define MIRNEE 1
// light reflected by flat mirrors (a mirror-finish prism or slab): the receiver is mirrored across one of the mirror's faces,
// a point on the lamp is sampled as seen from that mirror image, and the folded path p → face → lamp is checked for
// shadows on both legs. This is the exact mirror-image construction for planar mirrors, so the bright patches a mirror
// throws onto nearby walls converge as fast as direct light instead of arriving as rare fireflies.
vec3 mirNee(vec3 p,vec3 n){vec3 acc=vec3(0);
  for(int i=0;i<NPRC;i++){if(uPrO[i].z!=1.||uPrO[i].w>0.)continue;
    int cnt=0;for(int k=0;k<6;k++){vec4 P=uPrP[i*6+k];if(dot(P.xyz,p)-P.w>1e-4&&dot(n,P.xyz)<.99)cnt++;}
    if(cnt==0)continue;
    int pick=min(int(rnd()*float(cnt)),cnt-1),f=0,c=0;
    for(int k=0;k<6;k++){vec4 P=uPrP[i*6+k];if(dot(P.xyz,p)-P.w>1e-4&&dot(n,P.xyz)<.99){if(c==pick)f=k;c++;}}
    vec4 F=uPrP[i*6+f];vec3 N=F.xyz;float sd=dot(N,p)-F.w;
    vec3 pm=p-2.*sd*N,nm=n-2.*dot(n,N)*N,lm;float dl;
    int j=uLb[min(int(rnd()*float(NLBC)),NLBC-1)];
    vec3 e=boxSample(pm,nm,j,true,lm,dl);if(e.r+e.g+e.b<=0.)continue;
    vec3 l=lm-2.*dot(lm,N)*N;float dn=dot(l,N);if(dn>=0.)continue;
    float tm=sd/(-dn);if(tm>=dl)continue;
    vec3 m=p+l*tm;bool inF=true;
    for(int k=0;k<6;k++){if(k==f)continue;vec4 Q=uPrP[i*6+k];if(dot(Q.xyz,m)-Q.w>1e-4)inF=false;}
    if(!inF)continue;
    vec3 tr=shadow(p+n*1e-3,l,tm-2e-3);if(tr.r+tr.g+tr.b<=0.)continue;
    tr*=shadow(m+N*1e-3,lm,dl-tm-2e-3);
    acc+=e*tr*uPrM[i].rgb*float(cnt*NLBC);}
  return acc;}
#endif
#if LZ
${LZGLSL}${LZNEE}
#endif
// firefly clamp for light that arrives after at least one diffuse bounce (rare caustic paths otherwise never converge)
vec3 fc(vec3 c,int d){if(d<1)return c;float m=max(c.r,max(c.g,c.b));return m>FCL?c*(FCL/m):c;}
vec3 trace(vec3 ro,vec3 rd,float wl,out float d0){
  vec3 col=vec3(0),thr=vec3(1);d0=1e4;bool sunDone=false,lgtDone=false;int dB=0,ms=0;float tA=0.;   // ms: 1 after a diffuse vertex with mirror NEE, 2 one flat-mirror bounce later
  for(int b=0;b<MAXB;b++){
    if(b>=uMaxB)break;
    vec3 n;int id;float t=hitScene(ro,rd,n,id);
#if LZ
    if(b>0&&dB==0)col+=thr*lzAir(ro,rd,id==-2?1e4:t,tA,false);   // beams seen in mirrors and through glass
    tA+=t;
#endif
    if(id==-2){gStars=dB==0;col+=fc(thr*sky(rd,!sunDone),dB);break;}
    if(b==0){d0=t;gN0=n;}
    vec3 p=ro+rd*t;
    if(uFog>0.){float fogT=1.-exp(-uFog*t);col+=thr*sky(normalize(vec3(rd.x,.05,rd.z)),false)*.6*fogT;thr*=1.-fogT;}
    vec3 alb;float mt,ro2,ior,em,dens;mat(id,p,true,alb,mt,ro2,ior,em,dens);
    if(b==0){gSpec0=(mt!=0.&&em<=0.)?1.:0.;gAlb0=(mt==0.&&em<=0.)?max(alb,vec3(.02)):vec3(1);}
    if(em>0.){if(!lgtDone&&!(ms==2&&id>=100&&id<200))col+=fc(thr*alb*em,dB);break;}
    if(mt==0.){
      sunDone=false;lgtDone=false;
#if LZ
      if(b>0&&dB==0)col+=thr*alb*lzSurf(p,tA);
      if(dB==0&&uNee>0)col+=thr*alb*lzNee(p,n);   // spot light on the first diffuse surface only: one bounce further it is negligible
#endif
      if(dB++<uNee){
        if(uSunOn>.5){float nl=dot(n,uSun);if(nl>0.)col+=thr*alb*nl*vec3(3.,2.5,2.)*shadow(p+n*1e-3,uSun,1e9);sunDone=true;}
        #if NLT>0
        col+=fc(thr*alb*nee(p,n),dB-1);lgtDone=true;
        #endif
        #ifdef MIRNEE
        col+=fc(thr*alb*mirNee(p,n),dB-1);ms=1;
        #endif
      }else ms=0;
      thr*=alb;rd=cosDir(n);ro=p+n*1e-3;
    }else if(mt==1.){
      sunDone=false;lgtDone=false;ms=(ms==1&&id>=200&&id<300&&ro2<=0.)?2:0;
      rd=reflect(rd,n);if(ro2>0.){rd=rd+ro2*rsph();rd=dot(rd,rd)>1e-8?normalize(rd):reflect(rd,n);if(dot(rd,n)<0.)rd=reflect(rd,n);}thr*=alb;ro=p+n*1e-3;
    }else{
      ms=0;bool inside=dot(rd,n)>0.;vec3 nn=inside?-n:n;
      float eta=ior;
      if(uDisp==1){
      eta+=(wl-.5)*gDk;gDispHit=true;
}
      if(inside&&dens>0.)thr*=exp(-(1.-alb)*dens*t);
      float e=inside?eta:1./eta,ci=-dot(rd,nn);
      float r0=(1.-eta)/(1.+eta);r0*=r0;float m=1.-ci,m2=m*m;float fr=r0+(1.-r0)*m2*m2*m;
      vec3 rf=refract(rd,nn,e);
      if(dot(rf,rf)==0.||rnd()<fr){rd=reflect(rd,nn);ro=p+nn*1e-3;}
      else{rd=rf;ro=p-nn*1e-3;}
      if(ro2>0.)rd=normalize(rd+ro2*.3*rsph());
    }
    if(dB>1){float q=max(thr.r,max(thr.g,thr.b));if(q<.02||rnd()>q)break;thr/=q;}
  }
  return col;
}
