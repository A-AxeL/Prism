/* ---------- laser primitives on the GPU (shared by the ray tracer and the composite) ---------- */
const MAXP=768,MAXSPOT=32;
const LZGLSL=`
uniform highp sampler2D uLzT;uniform int uNLz,uNSpot;
#define LZP(i,r) texelFetch(uLzT,ivec2(i,r),0)
float lzPix(){return 2.*uTanF/min(uView.z,uView.w);}
// white light's color at a wavelength (nm), from the 256-sample spectrum row
vec3 lzSpec(float l){float x=clamp((l-400.)/300.,0.,1.)*255.;int i=int(x);return mix(LZP(i,5).rgb,LZP(min(i+1,255),5).rgb,x-float(i));}
bool lzBox(vec3 ro,vec3 inv,vec3 a,vec3 b,float tm){vec3 t0=(a-ro)*inv,t1=(b-ro)*inv,mn=min(t0,t1),mx=max(t0,t1);
  float tn=max(max(mn.x,mn.y),mn.z);return min(min(mx.x,mx.y),mx.z)>=max(tn,0.)&&tn<=tm;}
// closest approach of a ray to the segment a-b: (distance along the ray, fraction along the segment, gap)
vec3 lzSeg(vec3 ro,vec3 rd,vec3 a,vec3 b){vec3 u=b-a;float L=length(u);
  if(L<1e-6){float t=dot(a-ro,rd);return vec3(t,0.,length(ro+rd*t-a));}
  u/=L;vec3 w0=ro-a;float bb=dot(rd,u),d=dot(rd,w0),e=dot(u,w0),s=clamp((e-bb*d)/max(1.-bb*bb,1e-6),0.,L);vec3 q=a+u*s;float t=dot(q-ro,rd);
  return vec3(t,s/L,length(ro+rd*t-q));}
// light one primitive scatters toward the viewer from the air along ro -> ro+rd*tm. Beams: a gaussian core no thinner than a
// pixel, energy kept as it widens, brighter seen end-on. Spectrum sheets: power per width / |cos|, which is what a thin
// scattering sheet gives. tA is how far the ray has come already (pixel footprint); glare is the camera's bloom around lit
// spots and emitters, drawn only for the camera's own view
vec3 lzPrimAir(int j,vec4 r0,vec4 r1,vec4 r2,int k,vec3 ro,vec3 rd,float tm,float tA,float pa){
  vec3 c=vec3(0);float w=r0.w;
  if(k==0){vec3 u=r1.xyz-r0.xyz;
    if(dot(u,u)>1e-12){vec3 q=lzSeg(ro,rd,r0.xyz,r1.xyz);
      if(q.x>0.&&q.x<tm){float bu=dot(rd,normalize(u)),sn=sqrt(max(1.-bu*bu,0.)),r=max(w,pa*(tA+q.x)*.6);
        c+=r2.rgb*(w/r/max(sn,.15)*smoothstep(.1,.7,tA+q.x))*(exp(-q.z*q.z/(r*r))+.025*exp(-q.z/(r*4.)));}}
}
  else if(k==1){vec4 r3=LZP(j,3),r4=LZP(j,4);
    vec3 A0=r0.xyz,B0=r1.xyz,A1=r3.xyz,B1=r4.xyz,Am=(A0+A1)*.5,Dm=(B0+B1)*.5-Am,N=cross(Dm,A1-A0+B1-B0);float nl=length(N);if(nl<1e-9)return c;N/=nl;
    float dn=dot(rd,N);if(abs(dn)<1e-4)return c;float t=dot(Am-ro,N)/dn;if(t<=0.||t>=tm)return c;
    vec3 p=ro+rd*t;float s=dot(p-Am,Dm)/dot(Dm,Dm);if(s<0.||s>1.)return c;
    vec3 E0=mix(A0,B0,s),Lv=mix(A1,B1,s)-E0;float W=length(Lv),u=dot(p-E0,Lv)/max(W*W,1e-12),r=max(w,pa*(tA+t)*.6),f=1.;int fl=int(r1.w+.5);
    if(u<0.){if((fl&1)==0)return c;float o=-u*W;f=exp(-o*o/(r*r));}else if(u>1.){if((fl&2)==0)return c;float o=(u-1.)*W;f=exp(-o*o/(r*r));}
    float We=max(W,w);
    c+=r2.rgb*lzSpec(mix(r3.w,r4.w,clamp(u,0.,1.)))*((r4.w-r3.w)/300.*1.5708*w/We*min(1./abs(dn),We/w)*f*smoothstep(.1,.7,tA+t));}
  return c;}
// the camera's bloom around emitters, lit spots and stripes (drawn only for the camera's own view, by the laser pass)
vec3 lzPrimGlare(int j,vec4 r0,vec4 r1,vec4 r2,int k,vec3 ro,vec3 rd,float tm,float pa){
  vec3 c=vec3(0);float w=r0.w;
  if(k==0){if(r1.w>1.5){float t=dot(r0.xyz-ro,rd);if(t>0.&&t<tm*1.02+.03){float d=length(ro+rd*t-r0.xyz),r=max(w*1.2,pa*t*.8);
      c+=r2.rgb*(.35*smoothstep(.1,.7,t))*(exp(-d*d/(r*r))+.25*exp(-d/(r*4.)));}}}
  else if(k==2){float t=dot(r0.xyz-ro,rd);if(t>0.&&t<tm*1.02+.03){float d=length(ro+rd*t-r0.xyz),r=max(w*2.5,pa*t*1.3);
      c+=r2.rgb*smoothstep(.1,.7,t)*(.6*exp(-d*d/(r*r))+.2*exp(-d/(r*4.)));}}
    else if(k==3){vec4 r3=LZP(j,3),r4=LZP(j,4);vec3 q=lzSeg(ro,rd,r0.xyz,r3.xyz);
      if(q.x>0.&&q.x<tm*1.02+.03){float r=max(w*2.5,pa*q.x*1.3),L=max(length(r3.xyz-r0.xyz),r);
        c+=r2.rgb*lzSpec(mix(r3.w,r4.w,q.y))*((r4.w-r3.w)/300.*min(1.,2.*r/L)*smoothstep(.1,.7,q.x))*(.6*exp(-q.z*q.z/(r*r))+.2*exp(-q.z/(r*4.)));}}
  return c;}
// laser light falling on a surface point (multiply by its albedo): round spots and spectrum stripes, footprint-filtered
vec3 lzPrimSurf(int j,vec4 r0,vec4 r1,vec4 r2,int k,vec3 p,float tA,float pa){
  float w=r0.w,r=max(w,pa*tA*.6);
  if(k==2){vec3 v=p-r0.xyz;if(abs(dot(v,r1.xyz))>max(.02,r))return vec3(0);return r2.rgb*(w*w/(r*r))*exp(-dot(v,v)/(r*r));}
  if(k==3){vec4 r3=LZP(j,3),r4=LZP(j,4);vec3 D=r3.xyz-r0.xyz;float L2=dot(D,D),s=L2>0.?clamp(dot(p-r0.xyz,D)/L2,0.,1.):0.;vec3 v=p-r0.xyz-D*s;
    if(abs(dot(v,r1.xyz))>max(.02,r))return vec3(0);
    return r2.rgb*lzSpec(mix(r3.w,r4.w,s))*((r4.w-r3.w)/300.*1.772*w*w/(max(sqrt(L2),w)*r))*exp(-dot(v,v)/(r*r));}
  return vec3(0);}
// every primitive along a ray (reflections, refractions), skipping groups whose bounding box the ray misses
vec3 lzAir(vec3 ro,vec3 rd,float tm,float tA,bool glare){
  vec3 c=vec3(0),inv=1./rd;float pa=lzPix();int i=0;
  for(int it=0;it<${MAXP};it++){if(i>=uNLz)break;
    vec4 r0=LZP(i,0),r1=LZP(i,1),r2=LZP(i,2);int k=int(r2.w+.5),j=i;i++;
    if(k==4){if(!lzBox(ro,inv,r0.xyz,r1.xyz,tm*1.02+.05))i+=int(r0.w+.5);continue;}
    if(k<2)c+=lzPrimAir(j,r0,r1,r2,k,ro,rd,tm,tA,pa);
#ifdef LZGLARE
    if(glare)c+=lzPrimGlare(j,r0,r1,r2,k,ro,rd,tm,pa);
#endif
  }
  return c;}
vec3 lzSurf(vec3 p,float tA){
  vec3 c=vec3(0);float pa=lzPix();int i=0;
  for(int it=0;it<${MAXP};it++){if(i>=uNLz)break;
    vec4 r0=LZP(i,0),r1=LZP(i,1),r2=LZP(i,2);int k=int(r2.w+.5),j=i;i++;
    if(k==4){if(any(lessThan(p,r0.xyz))||any(greaterThan(p,r1.xyz)))i+=int(r0.w+.5);continue;}
    if(k>=2)c+=lzPrimSurf(j,r0,r1,r2,k,p,tA,pa);}
  return c;}`;
// lit spots as small lambertian lights. Lighting the room: one spot picked at random, and a faint contribution only
// takes its shadow ray some of the time (scaled up when it does, so the average is unchanged)
const LZNEE=`
vec3 lzOne(vec3 p,vec3 n,int j,out vec3 l,out float d){vec3 v=LZP(j,6).xyz-p;float d2=max(dot(v,v),.01);d=sqrt(d2);l=v/d;
  float cr=dot(n,l),cs=-dot(LZP(j,7).xyz,l);if(cr<=0.||cs<=0.)return vec3(0);return LZP(j,8).rgb*(cr*cs/(3.1415927*d2));}
vec3 lzNee(vec3 p,vec3 n){if(uNSpot==0)return vec3(0);vec3 l;float d;
  vec3 e=lzOne(p,n,min(int(rnd()*float(uNSpot)),uNSpot-1),l,d)*float(uNSpot);float m=max(e.r,max(e.g,e.b));
  if(m<1e-4)return vec3(0);float q=min(1.,m*6.);if(rnd()>q)return vec3(0);
  return e/q*shadow(p+n*1e-3,l,d-.02);}
vec3 lzNeeAll(vec3 p,vec3 n,bool sh){vec3 s=vec3(0),l;float d;
  for(int j=0;j<${MAXSPOT};j++){if(j>=uNSpot)break;vec3 e=lzOne(p,n,j,l,d);if(sh&&max(e.r,max(e.g,e.b))>1e-3)e*=shadow(p+n*1e-3,l,d-.02);s+=e;}
  return s;}`;
// the camera's view of the lasers, drawn as geometry: each primitive becomes a quad (a ribbon around a beam, the fan of a
// spectrum sheet, a billboard around a spot) and its fragments compute the exact contribution, depth-tested against the
// traced image and added into a full-resolution HDR buffer. Cost follows the pixels a beam covers, not beams × pixels.
// Fisheye and 360° views cannot be rasterized with straight edges, so there one full-screen pass loops over everything.
const LZVS=()=>`#version 300 es
precision highp float;precision highp int;
uniform vec2 uRes;uniform vec3 uEye,uFw,uRt,uUp;uniform float uTanF,uOrtho;uniform int uProj,uFull;uniform vec4 uView;
${LZGLSL}
flat out int vI;
// to clip space of this tile: through the whole image's pixel grid, so tiles line up (linear in x,y,z: still perspective-correct)
vec4 clip(vec3 P){vec3 v=P-uEye;float z=dot(v,uFw),x=dot(v,uRt),y=dot(v,uUp),s=min(uView.z,uView.w)*.5;
  if(uProj==3){vec2 px=vec2(x,y)/uOrtho*s+.5*uView.zw-uView.xy;return vec4(px/uRes*2.-1.,0.,1.);}
  vec2 px=vec2(x,y)/uTanF*s+(.5*uView.zw-uView.xy)*z;return vec4(px/uRes*2.-vec2(z),z-.1,z);}
float ext(vec3 P,float w,float pa,float k){return max(w,pa*max(dot(P-uEye,uFw),.05)*.6)*k;}
void main(){int i=gl_InstanceID,v=gl_VertexID,c=v<3?v:v==3?2:v==4?1:3;vI=i;
  if(uFull==1){gl_Position=vec4(float((v<<1)&2)*2.-1.,float(v&2)*2.-1.,0.,1.);if(v>2)gl_Position=vec4(2,2,2,1);return;}
  vec4 r0=LZP(i,0),r1=LZP(i,1),r2=LZP(i,2);int k=int(r2.w+.5);float w=r0.w,pa=lzPix();vec3 P;
  if(k==4){gl_Position=vec4(2,2,2,1);return;}
  if(k==1){vec3 A0=r0.xyz,B0=r1.xyz,A1=LZP(i,3).xyz,B1=LZP(i,4).xyz,La=A1-A0,Lb=B1-B0;
    if(dot(La,La)<1e-10)La=Lb;La=normalize(La);Lb=normalize(Lb);vec3 D=normalize(B0+B1-A0-A1);
    P=c==0?A0-La*ext(A0,w,pa,3.):c==1?B0-Lb*ext(B0,w,pa,3.)+D*w:c==2?A1+La*ext(A1,w,pa,3.):B1+Lb*ext(B1,w,pa,3.)+D*w;}
  else{vec3 A=r0.xyz,B=k==3?LZP(i,3).xyz:k==2?r0.xyz:r1.xyz;
    float tA=max(dot(A-uEye,uFw),.05),cm=max(r2.r,max(r2.g,r2.b)),   // how far the glare reaches: until its halo fades below visibility
      g=k>=2?max(w*2.5,pa*tA*1.3)*max(3.,4.*log(max(.2*cm/.0015,1.))):r1.w>1.5?max(w*1.2,pa*tA*.8)*max(3.,4.*log(max(.25*.35*cm/.0015,1.))):0.;
    float eA=max(ext(A,w,pa,6.),g),eB=k==0?ext(B,w,pa,6.):max(ext(B,w,pa,6.),g);
    vec3 u=B-A;float L=length(u);
    if(L<1e-6){P=A+(c==0||c==2?-1.:1.)*uRt*eA+(c<2?-1.:1.)*uUp*eA;}
    else{u/=L;vec3 sA=cross(u,A-uEye),sB=cross(u,B-uEye);sA=dot(sA,sA)>1e-12?normalize(sA):uUp;sB=dot(sB,sB)>1e-12?normalize(sB):uUp;
      P=c==0?A-sA*eA-u*eA:c==1?B-sB*eB+u*eB:c==2?A+sA*eA-u*eA:B+sB*eB+u*eB;}}
  gl_Position=clip(P);}`;
const LZFS=()=>`#version 300 es
precision highp float;precision highp int;
#define LZGLARE
uniform vec2 uRes,uRS;uniform vec3 uEye,uFw,uRt,uUp;uniform float uTanF;uniform int uFull,uDepthOK,uHyb,uDemod;uniform sampler2D uT,uB,uA;
${CAMGLSL}${LZGLSL}
flat in int vI;out vec4 o;
void main(){vec3 ro=uEye,rd;if(!camRay(gl_FragCoord.xy,ro,rd))discard;
  ivec2 ip=ivec2(gl_FragCoord.xy*uRS);float tm=uDepthOK==1?texelFetch(uT,ip,0).a:1e4;if(!(tm>0.))tm=1e4;
  vec3 al=uHyb==1?texelFetch(uA,ip,0).rgb:uDemod==1?texelFetch(uB,ip,0).rgb:vec3(.6);bool surf=tm<1e3&&uDepthOK==1;vec3 c;
  if(uFull==1){c=lzAir(ro,rd,tm,0.,true);if(surf)c+=al*lzSurf(ro+rd*tm,tm);}
  else{vec4 r0=LZP(vI,0),r1=LZP(vI,1),r2=LZP(vI,2);int k=int(r2.w+.5);float pa=lzPix();
    c=(k<2?lzPrimAir(vI,r0,r1,r2,k,ro,rd,tm,0.,pa):vec3(0))+lzPrimGlare(vI,r0,r1,r2,k,ro,rd,tm,pa);if(surf&&k>=2)c+=al*lzPrimSurf(vI,r0,r1,r2,k,ro+rd*tm,tm,pa);}
  o=vec4(c,1);}`;
const CAMGLSL=`
uniform int uProj;uniform float uFish,uOrtho;uniform vec4 uView;
// camera ray for a pixel: perspective, equidistant fisheye, 360° equirectangular, or orthographic.
// uView is (offset of this tile, size of the whole image), so a photo can be rendered in tiles
bool camRay(vec2 fc,inout vec3 ro,out vec3 rd){
  vec2 g=fc+uView.xy,RV=uView.zw,p=(g-.5*RV)/min(RV.x,RV.y)*2.;
  if(uProj==1){float r=length(p),th=r*uFish*.5;rd=uFw;if(th>3.1416)return false;vec2 d=r>1e-6?p/r:vec2(0);rd=normalize(cos(th)*uFw+sin(th)*(d.x*uRt+d.y*uUp));return true;}
  if(uProj==2){float lon=(g.x/RV.x-.5)*6.2831853,lat=(g.y/RV.y-.5)*3.1415927;rd=normalize(cos(lat)*(sin(lon)*uRt+cos(lon)*uFw)+sin(lat)*uUp);return true;}
  if(uProj==3){ro+=(p.x*uRt+p.y*uUp)*uOrtho;rd=uFw;return true;}
  vec2 uv=p*uTanF;rd=normalize(uFw+uv.x*uRt+uv.y*uUp);return true;}`;
const APGLSL=`
uniform int uBlades;uniform float uAnam,uBladeRot;
// a point on the lens: round, or a polygon with uBlades blades; anamorphic squeezes it into an oval
vec2 apSample(){float u=rnd(),v=rnd();vec2 q;
  if(uBlades<3){float a=6.2831853*u;q=vec2(cos(a),sin(a))*sqrt(v);}
  else{float n=float(uBlades),k=floor(rnd()*n),a0=k/n*6.2831853+uBladeRot,a1=a0+6.2831853/n;q=sqrt(u)*((1.-v)*vec2(cos(a0),sin(a0))+v*vec2(cos(a1),sin(a1)));}
  return q*vec2(uAnam,1.);}`;
