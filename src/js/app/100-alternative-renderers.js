/* ===== alternative renderers ===== */
#define SUNC vec3(3.,2.5,2.)
void mat(int id,vec3 p,bool stoch,out vec3 alb,out float mt,out float ro2,out float ior,out float em,out float dens){
  ro2=0.;ior=1.;em=0.;dens=0.;mt=0.;
  if(id==-1){
    if(uFloor==0){vec2 q=floor(p.xz);alb=mod(q.x+q.y,2.)<1.?vec3(.82):vec3(.12);}
    else if(uFloor==1){alb=vec3(.7);mt=1.;ro2=.02;}
    else if(uFloor==4){if(!stoch){alb=vec3(.26);mt=1.;ro2=.03;}else if(rnd()<.3){alb=vec3(.8);mt=1.;ro2=.03;}else alb=vec3(.05,.055,.07);}
    else alb=vec3(.5);
  }else if(id<100){alb=uC[id].rgb;mt=uM[id].x;ro2=uM[id].y;ior=uM[id].z;em=uM[id].w;dens=uC[id].a;}
  else if(id<200){int j=id-100;alb=uBc[j].rgb;mt=uBm[j].x;ro2=uBm[j].y;ior=uBm[j].z;em=uBm[j].w;dens=uBc[j].a;}
#if NPRC>0
  else if(id<300){int j=id-200;alb=uPrM[j].rgb;dens=uPrM[j].a;mt=uPrO[j].z;ro2=uPrO[j].w;ior=uPrO[j].x;gDk=uPrO[j].y;}
#endif
#if NLNC>0
  else if(id<400){int j=id-300;alb=uLnM[j].rgb;dens=uLnM[j].a;mt=2.;ior=uLnO[j].x;gDk=uLnO[j].y;}
#endif
#if INST
  else{int j=id-400;vec4 a=iF(j,5),m=iF(j,6);alb=a.rgb;dens=a.a;mt=m.x;ro2=m.y;ior=m.z;em=m.w;gDk=iF(j,7).y;}
#endif
  if(id<200)gDk=.06;
  if(gFirst){gFirst=false;gSpec0=(mt!=0.&&em<=0.)?1.:0.;}
}
// hemisphere ambient approximating sky irradiance
vec3 amb(vec3 n){vec3 up=sky(vec3(0,1,0),false),hz=sky(normalize(vec3(n.x,.08,n.z)+vec3(1e-4)),false);return mix(hz*.3,mix(hz,up,.5),n.y*.5+.5)*.9;}
void fogStep(inout vec3 col,inout vec3 thr,vec3 rd,float t){if(uFog>0.){float f=1.-exp(-uFog*t);col+=thr*sky(normalize(vec3(rd.x,.05,rd.z)),false)*.6*f;thr*=1.-f;}}
#if NLT>0
// every light, deterministically: spheres by solid angle, boxes by their facing side's center; optional hard shadow ray
vec3 lightsDet(vec3 p,vec3 n,bool shad){vec3 s=vec3(0);
#if NLBC>0
  for(int k=0;k<NLBC;k++){vec3 l;float dl;vec3 e=boxSample(p,n,uLb[k],false,l,dl);if(shad&&e.r+e.g+e.b>0.)e*=shadow(p+n*1e-3,l,dl-2e-3);s+=e;}
#endif
#if NLC>0
  for(int k=0;k<NLC;k++){int li=uLi[k];vec4 L=uS[li];vec3 pc=L.xyz-p;float d2=dot(pc,pc);if(d2<=L.w*L.w)continue;
    vec3 l=pc*inversesqrt(d2);float nl=dot(n,l);if(nl<=0.)continue;
    vec3 c=uC[li].rgb*uM[li].w*nl*2.*(1.-sqrt(max(0.,1.-L.w*L.w/d2)));
    if(shad)c*=shadow(p+n*1e-3,l,sqrt(d2)-L.w*1.01);s+=c;}
#endif
  return s;}
#endif
#if MODE==1
// screen-space radiance cache: where a bounce ray lands on a surface that was on screen last frame,
// reuse that pixel's finished lighting instead of tracing new shadow rays (and get its bounces for free)
bool ssCache(vec3 p2,out vec3 L){
  vec3 dv=p2-uPEye;float z=dot(dv,uPFw);if(z<.05)return false;
  vec2 sp=vec2(dot(dv,uPRt),dot(dv,uPUp))/z/(2.*uTanF)*min(uRes.x,uRes.y)+.5*uRes;
  if(any(lessThan(sp,vec2(1)))||any(greaterThan(sp,uRes-1.)))return false;
  vec2 q=sp/uRes;vec4 h=texture(uPrev,q);float pd=length(dv);
  if(abs(h.a-pd)>.012*pd+.01)return false;
  vec4 bs=texture(uPrev1,q);if(bs.a<.5)return false;   // only pixels whose first hit was diffuse (view-independent lighting)
  L=bs.rgb+texture(uPrev2,q).rgb*h.rgb;return true;
}
#endif
// one cheap reflection ray: shade what it hits with direct light only (or last frame's lighting, in the hybrid)
vec3 cheapRad(vec3 o,vec3 d){vec3 n;int id;float t=hitScene(o,d,n,id);if(id==-2)return sky(d,true);
  vec3 p=o+d*t,alb;float mt,ro2,ior,em,dens;mat(id,p,false,alb,mt,ro2,ior,em,dens);
  if(em>0.)return alb*em;
  if(mt!=0.)return alb*sky(reflect(d,n),true);
#if MODE==1
  vec3 L;if(uCache==1&&ssCache(p,L))return L;
#endif
  vec3 E=amb(n)*.6;if(uSunOn>.5){float nl=dot(n,uSun);if(nl>0.)E+=nl*SUNC*shadow(p+n*1e-3,uSun,1e9);}
#if NLT>0
  E+=lightsDet(p,n,false);
#endif
  return alb*E;}
// deterministic dielectric: follow the refracted ray, add the Fresnel reflection (one traced ray)
void glassDet(inout vec3 ro,inout vec3 rd,inout vec3 thr,inout vec3 col,vec3 p,vec3 n,vec3 alb,float ior,float dens,float t){
  bool inside=dot(rd,n)>0.;vec3 nn=inside?-n:n;
  if(inside&&dens>0.)thr*=exp(-(1.-alb)*dens*t);
if(uDisp==1){
  ior+=(gWl-.5)*gDk;gDispHit=true;
}
  float e=inside?ior:1./ior,ci=-dot(rd,nn);float r0=(1.-ior)/(1.+ior);r0*=r0;float m=1.-ci,m2=m*m,fr=r0+(1.-r0)*m2*m2*m;
  vec3 rf=refract(rd,nn,e);
  if(dot(rf,rf)==0.){rd=reflect(rd,nn);ro=p+nn*1e-3;return;}
  if(!inside)col+=thr*fr*cheapRad(p+nn*1e-3,reflect(rd,nn));
  thr*=1.-fr;rd=rf;ro=p-nn*1e-3;
}

#if MODE==1
#if RESTIR
/* ReSTIR direct lighting (reservoir resampling, Bitterli et al. 2020) for the first diffuse surface:
   several cheap candidate points on the lights, then the pick from last frame at this spot and two nearby pixels is
   re-weighted here and kept or replaced; one shadow ray goes to the winner. Good samples survive from frame to frame and
   spread to neighbors, and samples found to be in shadow are dropped from the reuse. Reservoir texel:
   x = (light*6 + box face)*21 + count, yz = position on the light, w = weight. */
vec2 gHP;bool gValid=false,gResSet=false,gUseRes=true;float gPD=1e4;vec4 gRes=vec4(-1,0,0,0);
float lum3(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
// a point on light k (face f for boxes) from two numbers in [0,1); its normal and emitted radiance
// (divided by pi: the renderer's lights give irradiance/pi, which the albedo then turns into outgoing light)
vec3 lsPoint(int k,int f,vec2 uv,out vec3 ln,out vec3 Le){
#if NLC>0
  if(k<NLC){int li=uLi[k];vec4 s=uS[li];float z=1.-2.*uv.x,r=sqrt(max(0.,1.-z*z)),a=6.2831853*uv.y;ln=vec3(r*cos(a),r*sin(a),z);Le=uC[li].rgb*uM[li].w*.31830989;return s.xyz+ln*s.w;}
#endif
#if NLBC>0
  int j=uLb[k-NLC];vec3 c=uBp[j].xyz,h=uBh[j].xyz,x;int ax=f>>1,a1=(ax+1)%3,a2=(ax+2)%3;ln=vec3(0);ln[ax]=(f&1)==0?1.:-1.;
  x=c+ln*h;x[a1]+=(uv.x*2.-1.)*h[a1];x[a2]+=(uv.y*2.-1.)*h[a2];Le=uBc[j].rgb*uBm[j].w*.31830989;return x;
#else
  ln=vec3(0,1,0);Le=vec3(0);return vec3(0);
#endif
}
// light arriving at p from a light point, per unit light area (unshadowed)
vec3 lsF(vec3 p,vec3 n,vec3 x,vec3 ln,vec3 Le,out vec3 l,out float d){vec3 v=x-p;float d2=max(dot(v,v),1e-6);d=sqrt(d2);l=v/d;
  float cr=dot(n,l),cl=-dot(ln,l);return cr>0.&&cl>0.?Le*(cr*cl/max(d2,.02)):vec3(0);}
struct Res{int k,f;vec2 uv;float ws,M,ph;};
void resAdd(inout Res r,int k,int f,vec2 uv,float w,float ph,float m){r.ws+=w;r.M+=m;if(w>0.&&rnd()*r.ws<w){r.k=k;r.f=f;r.uv=uv;r.ph=ph;}}
bool resGet(ivec2 q,out int k,out int f,out vec2 uv,out float W,out float M){vec4 v=texelFetch(uPrev3,q,0);
  if(!(v.x>=0.&&v.x<2048.)||!(v.w>=0.&&v.w<6e4))return false;int id=int(v.x+.5);M=float(id%21);int kf=id/21;k=kf/6;f=kf-k*6;uv=clamp(v.yz,0.,.9999);W=v.w;
  return k<NLT&&M>0.;}
// re-weight a reservoir from last frame for this receiver and merge it
void resMerge(inout Res r,vec3 p,vec3 n,ivec2 q,float cap){int k,f;vec2 uv;float W,M;if(!resGet(q,k,f,uv,W,M))return;M=min(M,cap);
  vec3 ln,Le,l;float d;vec3 x=lsPoint(k,f,uv,ln,Le);float ph=lum3(lsF(p,n,x,ln,Le,l,d));resAdd(r,k,f,uv,ph*W*M,ph,M);}
vec3 restirDirect(vec3 p,vec3 n){
  float w[NLT];float Wt=0.;for(int k=0;k<NLT;k++){w[k]=lightW(p,n,k);Wt+=w[k];}
  Res r;r.k=-1;r.f=0;r.uv=vec2(0);r.ws=0.;r.M=0.;r.ph=0.;
  for(int c=0;c<4;c++){
    float u=rnd()*Wt;int k=0;for(;k<NLT-1;k++){if(u<w[k])break;u-=w[k];}
    float pk=w[k]/Wt,pA=0.;int f=0;vec2 uv=vec2(0);
#if NLC>0
    if(k<NLC){int li=uLi[k];vec4 s=uS[li];vec3 pc=s.xyz-p;float dc2=dot(pc,pc),r2=s.w*s.w;
      if(dc2>r2){float cosMax=sqrt(max(0.,1.-r2/dc2)),ct=1.-rnd()*(1.-cosMax),stt=sqrt(max(0.,1.-ct*ct)),a=6.2831853*rnd();
        vec3 wv=pc*inversesqrt(dc2),uu=normalize(cross(abs(wv.x)>.1?vec3(0,1,0):vec3(1,0,0),wv)),vv=cross(wv,uu),dir=uu*(cos(a)*stt)+vv*(sin(a)*stt)+wv*ct;
        vec3 oc=p-s.xyz;float b=dot(oc,dir),tt=-b-sqrt(max(b*b-dot(oc,oc)+r2,0.));vec3 nl=normalize(p+dir*tt-s.xyz);
        uv=vec2((1.-nl.z)*.5,fract(atan(nl.y,nl.x)/6.2831853+1.));
        pA=max(dot(nl,-dir),1e-4)/(6.2831853*max(1.-cosMax,1e-7)*max(tt*tt,1e-6));}}
    else
#endif
    {
#if NLBC>0
      int j=uLb[k-NLC];vec3 c0=uBp[j].xyz,h=uBh[j].xyz,dv=p-c0,q=abs(dv)/max(h,vec3(1e-4));int ax=q.x>q.y?(q.x>q.z?0:2):(q.y>q.z?1:2);
      f=ax*2+(dv[ax]>=0.?0:1);uv=vec2(rnd(),rnd());pA=1./max(4.*h[(ax+1)%3]*h[(ax+2)%3],1e-6);
#endif
    }
    if(pA<=0.){r.M+=1.;continue;}
    vec3 ln,Le,l;float d;vec3 x=lsPoint(k,f,uv,ln,Le);float ph=lum3(lsF(p,n,x,ln,Le,l,d));
    resAdd(r,k,f,uv,ph/(pk*pA),ph,1.);}
  float lc=r.ws/max(r.M,1.);   // what this pixel's own candidates say the light is worth
  if(gValid){
    resMerge(r,p,n,ivec2(gHP),20.);
    for(int s=0;s<2;s++){float a=6.2831853*rnd(),rr=3.+rnd()*13.;ivec2 q=ivec2(gHP+vec2(cos(a),sin(a))*rr);
      if(any(lessThan(q,ivec2(0)))||any(greaterThanEqual(q,ivec2(uRes))))continue;
      if(abs(texelFetch(uPrev,q,0).a-gPD)>.05*gPD+.02||texelFetch(uPrev1,q,0).a<.5)continue;   // a similar, diffuse surface
      resMerge(r,p,n,q,10.);}}
  gResSet=true;
  if(r.k<0||r.ph<=0.){gRes=vec4(-1,0,0,0);return vec3(0);}
  // reused samples may not be worth much more than the pixel's own estimate: a neighbor on a differently facing surface
  // can carry a large weight that would show here as a firefly
  float Wf=min(r.ws/r.M,3.*lc+1e-4)/r.ph;vec3 ln,Le,l;float d;vec3 x=lsPoint(r.k,r.f,r.uv,ln,Le);vec3 F=lsF(p,n,x,ln,Le,l,d);
  vec3 vis=shadow(p+n*1e-3,l,d-2e-3);float V=max(vis.r,max(vis.g,vis.b));
  gRes=vec4(float((r.k*6+r.f)*21+int(min(r.M,20.))),r.uv,V>0.?min(Wf,6e4):0.);
  return F*vis*Wf;}
#endif
/* Prism hybrid: deterministic specular chain (mirrors, glass) to the first diffuse surface;
   sun = exact hard shadow (kept sharp, never filtered);
   emissive lights + one stochastic diffuse bounce = "indirect" written demodulated (no albedo),
   so it can be filtered and accumulated across texture edges; GI can be traced on 1/2 or 1/4 of pixels per frame. */
void hybrid(vec3 ro,vec3 rd,float t,vec3 n,int id,bool doInd,out vec3 base,out vec3 albT,out vec3 ind,out float diff0){
  base=vec3(0);albT=vec3(0);ind=vec3(0);diff0=0.;vec3 thr=vec3(1);float tA=0.;
  for(int b=0;b<MAXB;b++){
    if(b>=uMaxB)break;
    if(b>0)t=hitScene(ro,rd,n,id);
#if LZ
    if(b>0)base+=thr*lzAir(ro,rd,id==-2?1e4:t,tA,false);
    tA+=t;
#endif
    if(id==-2){base+=thr*sky(rd,true);return;}
    vec3 p=ro+rd*t;fogStep(base,thr,rd,t);
    vec3 alb;float mt,ro2,ior,em,dens;mat(id,p,true,alb,mt,ro2,ior,em,dens);
    if(em>0.){base+=thr*alb*em;return;}
    if(mt==0.){
      vec3 a=thr*alb;if(b==0)diff0=1.;
#if LZ
      if(b>0)base+=a*lzSurf(p,tA);
#endif
      if(uSunOn>.5){float nl=dot(n,uSun);if(nl>0.)base+=a*nl*SUNC*shadow(p+n*1e-3,uSun,1e9);}
      albT=a;
      if(doInd){
        vec3 E=vec3(0);
#if RESTIR
        E+=b==0&&gUseRes?restirDirect(p,n):nee(p,n);
#elif NLT>0
        E+=nee(p,n);
#endif
#if LZ
        E+=lzNee(p,n);
#endif
        vec3 o2=p+n*1e-3,r2=cosDir(n),n2;int id2;float t2=hitScene(o2,r2,n2,id2);
        if(id2==-2)E+=sky(r2,false);
        else{
          vec3 p2=o2+r2*t2,a2;float m2,q1,q2,e2,q3;mat(id2,p2,true,a2,m2,q1,q2,e2,q3);
          if(e2>0.){
#if NLT==0
            E+=a2*e2;
#endif
          }else if(m2==0.){
            vec3 Lc;
            if(uCache==1&&ssCache(p2,Lc))E+=Lc;
            else{
              vec3 L=amb(n2)*.5;
              if(uSunOn>.5){float nl=dot(n2,uSun);if(nl>0.)L+=nl*SUNC*shadow(p2+n2*1e-3,uSun,1e9);}
#if NLT>0
              L+=nee(p2,n2);
#endif
              E+=a2*L;
            }
          }else E+=a2*sky(reflect(r2,n2),true)*(m2==1.?1.:.7);
        }
        ind=E;
      }
      return;
    }
    if(mt==1.){rd=reflect(rd,n);if(ro2>0.){rd=rd+ro2*rsph();rd=dot(rd,rd)>1e-8?normalize(rd):reflect(rd,n);if(dot(rd,n)<0.)rd=reflect(rd,n);}thr*=alb;ro=p+n*1e-3;continue;}
    glassDet(ro,rd,thr,base,p,n,alb,ior,dens,t);
  }
}
#endif

#if MODE==2
/* Whitted: one deterministic path, hard shadows from sun and every light, constant ambient, no GI */
vec3 whitted(vec3 ro,vec3 rd,out float d0){
  vec3 col=vec3(0),thr=vec3(1);d0=1e4;float tA=0.;
  for(int b=0;b<MAXB;b++){
    if(b>=uMaxB)break;
    vec3 n;int id;float t=hitScene(ro,rd,n,id);
#if LZ
    if(b>0)col+=thr*lzAir(ro,rd,id==-2?1e4:t,tA,false);
    tA+=t;
#endif
    if(id==-2){col+=thr*sky(rd,true);break;}
    if(b==0)d0=t;
    vec3 p=ro+rd*t;fogStep(col,thr,rd,t);
    vec3 alb;float mt,ro2,ior,em,dens;mat(id,p,false,alb,mt,ro2,ior,em,dens);
    if(em>0.){col+=thr*alb*em;break;}
    if(mt==0.){vec3 E=amb(n)*.6;
      if(uSunOn>.5){float nl=dot(n,uSun);if(nl>0.)E+=nl*SUNC*shadow(p+n*1e-3,uSun,1e9);}
#if NLT>0
      E+=lightsDet(p,n,true);
#endif
#if LZ
      E+=lzNeeAll(p,n,true);if(b>0)E+=lzSurf(p,tA);
#endif
      col+=thr*alb*E;break;}
    if(mt==1.){rd=reflect(rd,n);thr*=alb;ro=p+n*1e-3;continue;}
    glassDet(ro,rd,thr,col,p,n,alb,ior,dens,t);
  }
  return col;
}
#endif

#if MODE==3
/* Raster-style forward shading: primary visibility only (what a rasterizer computes),
   local lights without shadows, environment-mapped reflection and refraction */
vec3 raster(vec3 ro,vec3 rd,out float d0){
  vec3 n;int id;float t=hitScene(ro,rd,n,id);d0=1e4;
  if(id==-2)return sky(rd,true);
  d0=t;vec3 p=ro+rd*t,c;
  vec3 alb;float mt,ro2,ior,em,dens;mat(id,p,false,alb,mt,ro2,ior,em,dens);
  if(em>0.)c=alb*em;
  else if(mt==0.){vec3 E=amb(n)*.6;if(uSunOn>.5)E+=max(dot(n,uSun),0.)*SUNC;
#if NLT>0
    E+=lightsDet(p,n,false);
#endif
#if LZ
    E+=lzNeeAll(p,n,false);
#endif
    c=alb*E;}
  else if(mt==1.)c=alb*sky(reflect(rd,n),true);
  else{float ci=max(-dot(rd,n),0.);float r0=(1.-ior)/(1.+ior);r0*=r0;float m=1.-ci,fr=r0+(1.-r0)*m*m*m*m*m;
    c=mix(sky(refract(rd,n,1./ior),true)*mix(vec3(1),alb,min(1.,dens*.4)),sky(reflect(rd,n),true),fr);}
  vec3 thr=vec3(1),col=vec3(0);fogStep(col,thr,rd,t);return col+thr*c;
}
#endif

#if MODE==4
/* SDF sphere tracing: the scene as a distance field; soft shadows and ambient occlusion
   come from extra marches, one reflection march for metal and glass */
float sdBox(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
float map(vec3 p,bool skipL,out int id){
  float d=1e9;id=-2;
  if(uFloor!=3){d=p.y;id=-1;}
#if NSC>0
  for(int g=0;g<NGC;g++){if(length(p-uG[g].xyz)-uG[g].w>d)continue;ivec2 r=uGr[g];
    for(int i=r.x;i<r.y;i++){if(skipL&&uM[i].x==3.)continue;float di=length(p-uS[i].xyz)-uS[i].w;if(di<d){d=di;id=i;}}}
#endif
#if NBC>0
  for(int g=0;g<NBGC;g++){vec3 c=(uBGa[g]+uBGb[g])*.5;if(sdBox(p-c,uBGb[g]-c)>d)continue;ivec2 rg=uBGr[g];   // whole group farther than the nearest so far
    for(int i=rg.x;i<rg.y;i++){if(skipL&&uBm[i].x==3.)continue;float di=sdBox(p-uBp[i].xyz,uBh[i].xyz);if(di<d){d=di;id=100+i;}}}
#endif
#if NPRC>0
  for(int i=0;i<NPRC;i++){if(length(p-uPrB[i].xyz)-uPrB[i].w>d)continue;float di=-1e9;for(int k=0;k<6;k++){vec4 P=uPrP[i*6+k];di=max(di,dot(P.xyz,p)-P.w);}if(di<d){d=di;id=200+i;}}
#endif
#if NLNC>0
  for(int i=0;i<NLNC;i++){if(length(p-uLnB[i].xyz)-uLnB[i].w>d)continue;vec3 c=uLnC[i].xyz,a=uLnA[i].xyz,q=p-c;float y=dot(q,a),hc=uLnS[i].z,he=uLnA[i].w;
    float di=length(q-a*y)-uLnC[i].w;
    for(int s=0;s<2;s++){float sg=s==0?1.:-1.,rr=s==0?uLnS[i].x:uLnS[i].y;vec3 ax=a*sg;
      if(rr>0.)di=max(di,length(p-(c+ax*(hc-rr)))-rr);
      else{di=max(di,dot(q,ax)-(rr==0.?hc:he));if(rr<0.)di=max(di,-rr-length(p-(c+ax*(hc-rr))));}}
    if(di<d){d=di;id=300+i;}}
#endif
#if INST
  for(int i=0;i<256;i++){if(i>=uNI)break;int ty=int(iF(i,3).w);if(ty==0)continue;if(skipL&&iF(i,6).w>0.)continue;
    vec3 a=iF(i,3).xyz,b=iF(i,4).xyz,c=(a+b)*.5;if(sdBox(p-c,b-c)>d)continue;
    vec4 r0=iF(i,0),r1=iF(i,1),r2=iF(i,2);vec3 q=vec3(dot(r0,vec4(p,1.)),dot(r1,vec4(p,1.)),dot(r2,vec4(p,1.)));
    float sm=max(length(r0.xyz),max(length(r1.xyz),length(r2.xyz)));   // the largest stretch keeps the distance a safe underestimate
    float dl=ty==1?length(q)-1.:ty==2?sdBox(q,vec3(1)):max(length(q.xz)-1.,abs(q.y)-1.),di=dl/sm;if(di<d){d=di;id=400+i;}}
#endif
  return d;
}
float mapD(vec3 p){int i;return map(p,false,i);}
float march(vec3 ro,vec3 rd,out int id){float t=.003;
  for(int i=0;i<400;i++){if(i>=uSdfSteps)break;float d=map(ro+rd*t,false,id);if(abs(d)<.0005+.0007*t)return t;t+=d;if(t>80.)break;}
  id=-2;return 1e9;}
vec3 nrm(vec3 p){const vec2 k=vec2(1,-1);const float e=.0007;
  return normalize(k.xyy*mapD(p+k.xyy*e)+k.yyx*mapD(p+k.yyx*e)+k.yxy*mapD(p+k.yxy*e)+k.xxx*mapD(p+k.xxx*e));}
float softSh(vec3 ro,vec3 rd,float tmax){float res=1.,t=.02;int id;
  for(int i=0;i<40;i++){float h=map(ro+rd*t,true,id);res=min(res,10.*h/t);if(res<.003||t>tmax)break;t+=clamp(h,.015,.5);}
  return clamp(res,0.,1.);}
float aoF(vec3 p,vec3 n){float o=0.,s=1.;for(int i=1;i<=5;i++){float h=.02+.06*float(i);o+=(h-mapD(p+n*h))*s;s*=.7;}return clamp(1.-1.5*o,0.,1.);}
vec3 sdfDirect(vec3 p,vec3 n,bool sh){vec3 E=vec3(0);
  if(uSunOn>.5){float nl=dot(n,uSun);if(nl>0.)E+=nl*SUNC*(sh?softSh(p+n*.01,uSun,40.):1.);}
#if NLC>0
  for(int k=0;k<NLC;k++){int li=uLi[k];vec4 L=uS[li];vec3 pc=L.xyz-p;float d2=dot(pc,pc);if(d2<=L.w*L.w)continue;float d=sqrt(d2);vec3 l=pc/d;float nl=dot(n,l);if(nl<=0.)continue;
    E+=uC[li].rgb*uM[li].w*nl*2.*(1.-sqrt(max(0.,1.-L.w*L.w/d2)))*(sh?softSh(p+n*.01,l,d-L.w):1.);}
#endif
#if NLBC>0
  for(int k=0;k<NLBC;k++){vec3 l;float dl;vec3 e=boxSample(p,n,uLb[k],false,l,dl);if(sh&&e.r+e.g+e.b>0.)e*=softSh(p+n*.01,l,dl-.05);E+=e;}
#endif
  return E;}
vec3 sdfDiffuse(vec3 p,vec3 n,vec3 alb,bool full){return alb*(amb(n)*.6*(full?aoF(p,n):1.)+sdfDirect(p,n,full));}
vec3 sdfSecondary(vec3 ro,vec3 rd){int id;float t=march(ro,rd,id);if(id==-2)return sky(rd,true);
  vec3 p=ro+rd*t,n=id==-1?vec3(0,1,0):nrm(p);vec3 alb;float mt,ro2,ior,em,dens;mat(id,p,false,alb,mt,ro2,ior,em,dens);
  if(em>0.)return alb*em;if(mt==0.)return sdfDiffuse(p,n,alb,false);return alb*sky(reflect(rd,n),true);}
vec3 sdfRender(vec3 ro,vec3 rd,out float d0){
  int id;float t=march(ro,rd,id);d0=1e4;if(id==-2)return sky(rd,true);
  d0=t;vec3 p=ro+rd*t,n=id==-1?vec3(0,1,0):nrm(p),c;
  vec3 alb;float mt,ro2,ior,em,dens;mat(id,p,false,alb,mt,ro2,ior,em,dens);
  if(em>0.)c=alb*em;
  else if(mt==0.)c=sdfDiffuse(p,n,alb,true);
  else if(mt==1.)c=alb*sdfSecondary(p+n*.01,reflect(rd,n));
  else{float ci=max(-dot(rd,n),0.);float r0=(1.-ior)/(1.+ior);r0*=r0;float m=1.-ci,fr=r0+(1.-r0)*m*m*m*m*m;
    c=mix(sky(refract(rd,n,1./ior),true)*mix(vec3(1),alb,min(1.,dens*.4)),sdfSecondary(p+n*.01,reflect(rd,n)),fr);}
  vec3 thr=vec3(1),col=vec3(0);fogStep(col,thr,rd,t);return col+thr*c;}
#endif

#if MODE==1
void main(){
  uvec2 px=uvec2(gl_FragCoord.xy);st=px.x*1973u+px.y*9277u+uFrame*26699u;pcg();
  // upscaling: every pixel samples at the same sub-pixel offset this frame (a Halton sequence), so the upscaler knows where each sample is
  vec3 ro=uEye,rd;if(!camRay(gl_FragCoord.xy-.5+(uTaa==1?uJit:vec2(rnd(),rnd())),ro,rd)){o=vec4(0,0,0,1e4);o1=vec4(0);o2=vec4(0);
#if NT4
    o3=vec4(-1,0,0,0);
#endif
    return;}
  vec3 rd0=rd;
  if(uAp>0.&&uProj==0){vec3 fp=ro+rd*(uFocus/dot(rd,uFw));vec2 a=apSample()*uAp;ro+=uRt*a.x+uUp*a.y;rd=normalize(fp-ro);}
  vec3 n;int id;float t=hitScene(ro,rd,n,id);float d0=id==-2?1e4:t;
  float blend=uBlend;bool valid=uBlend<.999;vec2 hp=gl_FragCoord.xy;vec4 h0;
  if(uReproj==1){valid=false;blend=1.;vec3 dv=uEye+rd0*d0-uPEye;float z=dot(dv,uPFw);
    if(z>.01){vec2 sp=vec2(dot(dv,uPRt),dot(dv,uPUp))/z/(2.*uTanF)*min(uRes.x,uRes.y)+.5*uRes;
      if(all(greaterThan(sp,vec2(1)))&&all(lessThan(sp,uRes-1.))){float pd=length(dv);h0=texture(uPrev,sp/uRes);
        if(abs(h0.a-pd)<.04*pd+.03&&(id==-2||sameSide(uEye+rd0*d0,n))){valid=true;blend=uBlend;hp=sp;}
#if RESTIR
        gPD=pd;
#endif
      }}}
  else h0=texelFetch(uPrev,ivec2(px),0);
  vec4 h1,h2;float nOld;
  if(valid&&uReproj==1){h1=vec4(histCR(uPrev1,hp),texture(uPrev1,hp/uRes).a);vec4 a=texture(uPrev2,hp/uRes);h2=vec4(histCR(uPrev2,hp),a.a);nOld=a.a*255.;}
  else{h1=texelFetch(uPrev1,ivec2(px),0);h2=texelFetch(uPrev2,ivec2(px),0);nOld=h2.a*255.;}
  h0.rgb=safe(h0.rgb,vec3(0));h1.rgb=safe(h1.rgb,vec3(0));h2.rgb=safe(h2.rgb,vec3(0));if(!(nOld>=0.&&nOld<=255.))nOld=0.;
#if RESTIR
  // resample while moving and for the first frames after stopping; once the view is still, accumulation does the work and
  // independent light samples converge cleaner (and cheaper)
  gUseRes=uReproj==1||nOld<8.||!valid;gValid=valid&&gUseRes;gHP=hp;if(uReproj==0)gPD=h0.a;
#endif
  float hn=valid?min(nOld+1.,64.):1.;
  // GI decimation in 8x8 tiles so whole GPU warps take the same branch (a per-pixel checkerboard diverges every warp)
  uvec2 tl=px>>3u;uint R=uint(uGiRate),k=R==4u?((tl.x&1u)|((tl.y&1u)<<1)):R==2u?((tl.x+tl.y)&1u):0u;
  bool doInd=!valid||k==uFrame%R;
  gWl=rnd();gDispHit=false;
  vec3 base,albT,ind;float diff0;hybrid(ro,rd,t,n,id,doInd,base,albT,ind,diff0);
if(uDisp==1){
  if(gDispHit){vec3 w=specW(gWl);base*=w;albT*=w;}
}
  base=min(safe(base,h1.rgb),vec3(20.));ind=fc(safe(ind,h0.rgb),1);albT=safe(albT,h2.rgb);d0=safeD(d0);
  float be=blend;
  if(valid&&uReproj==1){h1.rgb=min(h1.rgb,base*3.+vec3(1.5));blend=max(1./hn,diff0<.5?.5:.35);be=max(1./hn,uMinA);}
  if(valid&&hn>4.)ind=ffClamp(ind,h0.rgb);
  float fR=float(R),bi=!valid?1.:doInd?min(1.,fR*be/(1.+(fR-1.)*be)):0.;
  o=vec4(mix(h0.rgb,ind,bi),d0);o1=mix(h1,vec4(base,diff0),blend);o2=vec4(mix(h2.rgb,albT,blend),hn/255.);
  if(uTaa==1){o1=vec4(base,diff0);o2=vec4(albT,hn/255.);}   // the upscaler accumulates these at full resolution instead
#if RESTIR
  // pixels that did not resample this frame keep last frame's reservoir (moved with the camera)
  vec4 rs=gResSet?gRes:valid?texelFetch(uPrev3,ivec2(hp),0):vec4(-1,0,0,0);o3=rs.x>=0.&&rs.x<2048.&&rs.w>=0.&&rs.w<6e4?rs:vec4(-1,0,0,0);
#elif NT4
  o3=vec4(-1,0,0,0);
#endif
}
#else

void main(){
  uvec2 px=uvec2(gl_FragCoord.xy);st=px.x*1973u+px.y*9277u+uFrame*26699u;pcg();
  vec3 acc=vec3(0);float d0=1e4;vec3 rd0=uFw;
  vec3 accA=vec3(0);
  for(int s=0;s<4;s++){if(s>=uSpp)break;gFirst=true;gAlb0=vec3(1);
    vec3 ro=uEye,rd;bool ok=camRay(gl_FragCoord.xy-.5+vec2(rnd(),rnd()),ro,rd);
    if(s==0)rd0=rd;
    if(!ok)continue;
    if(uAp>0.&&uProj==0){vec3 fp=ro+rd*(uFocus/dot(rd,uFw));vec2 a=apSample()*uAp;ro+=uRt*a.x+uUp*a.y;rd=normalize(fp-ro);}
    float wl=rnd(),dd;gWl=wl;gDispHit=false;
#if MODE==0
    vec3 c=trace(ro,rd,wl,dd);
#elif MODE==2
    vec3 c=whitted(ro,rd,dd);
#elif MODE==3
    vec3 c=raster(ro,rd,dd);
#else
    vec3 c=sdfRender(ro,rd,dd);
#endif
    if(s==0)d0=dd;
    if(uDisp==1){
    if(gDispHit)c*=specW(wl);
}
    acc+=min(safe(c,vec3(0)),vec3(20.));accA+=safe(gAlb0,vec3(1));   // color plus the first surface's albedo (used to separate lighting from texture while moving)
  }
  acc/=float(uSpp);accA/=float(uSpp);d0=safeD(d0);
  float blend=uBlend,blendA=uBlend,n=1.;vec3 hist=vec3(0),histA=vec3(1);
#if MODE>=2
  const float AMIN=.5;   // noise-free methods: history is only for anti-aliasing
#else
  float AMIN=uMinA;
#endif
  if(uReproj==1){
    vec3 dv=uEye+rd0*d0-uPEye;float z=dot(dv,uPFw);blend=1.;blendA=1.;
    if(z>.01){vec2 sp=vec2(dot(dv,uPRt),dot(dv,uPUp))/z/(2.*uTanF)*min(uRes.x,uRes.y)+.5*uRes;
      if(all(greaterThan(sp,vec2(1)))&&all(lessThan(sp,uRes-1.))){float pd=length(dv);
        if(abs(texture(uPrev,sp/uRes).a-pd)<.04*pd+.03&&(d0>=1e4||sameSide(uEye+rd0*d0,gN0))){
          hist=min(safe(histCR(uPrev,sp),vec3(0)),acc*3.+vec3(1.5));histA=safe(histCR(uPrev1,sp),vec3(1));n=min(texture(uPrev1,sp/uRes).a*255.+1.,64.);
          blend=max(1./n,gSpec0>.5?max(.3,AMIN):AMIN);blendA=max(1./n,.35);
          // moving: long history on lighting (color / albedo), short history on albedo, then recombine
          vec3 Rh=hist/max(histA,vec3(.02)),Rc=acc/max(accA,vec3(.02));if(n>4.)Rc=ffClamp(Rc,Rh);
          vec3 An=mix(histA,accA,blendA),Rn=mix(Rh,Rc,blend);
          o=vec4(safe(Rn*An,acc),d0);o1=vec4(safe(An,accA),n/255.);return;}}}
  }else{vec4 a=texelFetch(uPrev1,ivec2(px),0);hist=safe(texelFetch(uPrev,ivec2(px),0).rgb,vec3(0));histA=safe(a.rgb,vec3(1));n=uBlend>.999?1.:min(a.a*255.+1.,64.);}
#if MODE==0
  if(n>4.&&uReproj==0)acc=ffClamp(acc,hist);
#endif
  o=vec4(safe(mix(hist,acc,blend),acc),d0);o1=vec4(safe(mix(histA,accA,blendA),accA),n/255.);
}
#endif`;};
const outFS=`#version 300 es
precision highp float;uniform sampler2D uT,uB,uA;uniform vec2 uRes,uTx;uniform float uExp,uDn,uVig,uGrain,uSat,uSeed,uDnB,uFade,uNcap,uNmul;uniform vec3 uWB;uniform int uTm,uHyb,uNsrc,uDemod,uTaa;uniform sampler2D uXB,uXA;out vec4 o;
uniform sampler2D uLz;uniform int uLzOn;uniform vec4 uView;uniform vec3 uVeil;uniform float uBlack;
uniform int uRaw;uniform float uGk,uVt,uCA,uBM,uLT;uniform sampler2D uG0,uG1,uG2,uG3,uG4;uniform vec2 uGt0,uGt1,uGt2,uGt3,uGt4;
// lens glare: the image convolved with a wide point-spread function, built from a blur pyramid (each level twice as wide)
vec3 glareAt(vec2 gu);
// lateral color grows with the cube of the distance from the optical center (third-order aberration): nothing in the
// middle of the frame, a fringe of a pixel or two partway out, and the most toward the corners. k(P) is the per-color scale.
float caK(vec2 P){vec2 C=.5*uView.zw;float r2=dot(P-C,P-C)/dot(C,C);return uCA*min(3.*r2,2.);}
vec3 gTap(sampler2D t,vec2 uv,vec2 tx){return .25*(texture(t,uv+tx*vec2(.5,.5)).rgb+texture(t,uv+tx*vec2(-.5,.5)).rgb+texture(t,uv+tx*vec2(.5,-.5)).rgb+texture(t,uv+tx*vec2(-.5,-.5)).rgb);}
// wide levels are read with a 3×3 tent, so their blur stays round however bright the source
vec3 gTent(sampler2D t,vec2 uv,vec2 tx){vec3 c=texture(t,uv).rgb*4.;c+=2.*(texture(t,uv+vec2(tx.x,0)).rgb+texture(t,uv-vec2(tx.x,0)).rgb+texture(t,uv+vec2(0,tx.y)).rgb+texture(t,uv-vec2(0,tx.y)).rgb);
  c+=texture(t,uv+tx).rgb+texture(t,uv-tx).rgb+texture(t,uv+vec2(tx.x,-tx.y)).rgb+texture(t,uv+vec2(-tx.x,tx.y)).rgb;return c/16.;}
vec3 glareAt(vec2 gu){return .52*gTap(uG0,gu,uGt0)+.22*gTent(uG1,gu,uGt1)+.13*gTent(uG2,gu,uGt2)+.08*gTent(uG3,gu,uGt3)+.05*gTent(uG4,gu,uGt4);}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
bool okc(vec3 c){return all(greaterThanEqual(c,vec3(-1e-4)))&&all(lessThan(c,vec3(6e4)));}
// the scene's light at one point of this target (denoised and recombined), before any lens or camera effects
vec3 sceneAt(vec2 uv){vec4 c0=texture(uT,uv);if(!okc(c0.rgb))c0.rgb=vec3(0);vec3 c=c0.rgb;
 float dn=uDn;
 if(uNsrc>0){float n=uNsrc==2?texture(uA,uv).a*255.:texture(uB,uv).a*255.;dn=uDnB*max(0.,1.-sqrt(min(n,uNcap)*uNmul/uFade));}
 if(uHyb==1){
  // hybrid: filter only the demodulated indirect light (12-tap golden-angle disc, depth-aware), then re-apply albedo
  vec3 E=c0.rgb;
  if(dn>.01){float ws=1.;vec3 sm=E;float R=1.+4.*dn;
   int nt=uTaa==1?8:16;   // upscaled: the screen has more pixels than the light layer, so fewer taps are enough
   for(int i=0;i<16;i++){if(i>=nt)break;float a=float(i)*2.39996*16./float(nt),rr=R*sqrt((float(i)+.5)/float(nt));vec4 s=texture(uT,uv+vec2(cos(a),sin(a))*rr*uTx);
    float w=exp(-abs(s.a-c0.a)/(c0.a*.02+.01));sm+=min(s.rgb,vec3(4.))*w;ws+=w;}
   E=mix(E,sm/ws,min(1.,dn*1.3));}
  c=uTaa==1?texture(uXB,uv).rgb+texture(uXA,uv).rgb*E:texture(uB,uv).rgb+texture(uA,uv).rgb*E;
 }else if(dn>.01){vec3 A0=uDemod==1?max(texture(uB,uv).rgb,vec3(.02)):vec3(1);c=c0.rgb/A0;float l0=lum(c),ws=1.;vec3 sm=c;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){if(x==0&&y==0)continue;
   vec2 q=uv+vec2(x,y)*uTx*1.5;vec4 s=texture(uT,q);if(uDemod==1)s.rgb/=max(texture(uB,q).rgb,vec3(.02));float wd=exp(-abs(s.a-c0.a)/(c0.a*.03+.02));
   float dl=abs(lum(s.rgb)-l0)/(l0+lum(s.rgb)+.15);float w=wd*exp(-dl*dl*6./dn)*(x*y==0?1.:.7);sm+=s.rgb*w;ws+=w;}
  c=mix(c,sm/ws,dn)*A0;}
 if(uLzOn==1){vec3 lz=uRaw==1?texture(uLz,uv).rgb:texelFetch(uLz,clamp(ivec2(uv*uRes),ivec2(0),ivec2(uRes)-1),0).rgb;if(okc(lz))c+=lz;}   // lasers, drawn at full resolution by the laser pass
 if(!okc(c))c=vec3(0);
 return c;}
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec3 c=sceneAt(uv);
 // lateral chromatic aberration: the lens magnifies each wavelength slightly differently, so red and blue land a little
 // outward and inward of green, growing with distance from the optical center (colored fringes toward the corners)
 if(uCA>0.&&uRaw==0){vec2 P=gl_FragCoord.xy+uView.xy,C=.5*uView.zw;float k=caK(P);
   vec2 pr=C+(P-C)/(1.+k),pb=C+(P-C)/(1.-k);
   c=vec3(sceneAt((pr-uView.xy)/uRes).r,c.g,sceneAt((pb-uView.xy)/uRes).b);}
 if(uRaw==1){float l=lum(c);if(l>uBM)c*=uBM/l;o=vec4(c,1);return;}   // scene light for the glare pyramid (a sun is capped: the planet renderer draws its own glare)   // scene light for the glare pyramid
 // a fraction uGk of all light is scattered by the lens: 1/r-like falloff, about half the energy per doubling of radius
 if(uGk>0.){vec2 P=gl_FragCoord.xy+uView.xy,C=.5*uView.zw,gu=P/uView.zw;vec3 g=glareAt(gu);
   if(uCA>0.){float k=caK(P);
     // the scattered light goes through the same lens: its red and blue are magnified differently too, so the glow
     // around a lamp splits into a warm fringe on its outer side and a cool one on its inner side
     // (only the two narrowest levels are re-sampled: on the wider ones a shift this small is invisible)
     vec2 ur=(C+(P-C)/(1.+k))/uView.zw,ub=(C+(P-C)/(1.-k))/uView.zw;
     vec3 nr=gTap(uG0,ur,uGt0),nb=gTap(uG0,ub,uGt0),g0=gTap(uG0,gu,uGt0),g1=gTap(uG1,gu,uGt1);
     g.r+=.52*(nr.r-g0.r)+.22*(gTap(uG1,ur,uGt1).r-g1.r);g.b+=.52*(nb.b-g0.b)+.22*(gTap(uG1,ub,uGt1).b-g1.b);
     // axial color: red and blue also focus slightly behind and in front of green, so bright edges carry a soft
     // magenta halo (the purple fringing of real lenses). Red and blue get a touch of the nearest glare level instead
     // of their sharp image; the light only moves, none is added.
     float ax=clamp(k*30.,0.,.3);if(okc(nr)&&okc(nb)){c.r=mix(c.r,nr.r,ax);c.b=mix(c.b,nb.b,ax);}}
   if(okc(g))c=c*(1.-uGk)+g*uGk;}
 c=(c+uVeil)*uExp*uWB;
 // local tone mapping (as the eye adapts, and as phone cameras do in HDR): each part of the frame is brought part of the
 // way toward mid grey by the brightness of its surroundings (a few degrees around, from the blur pyramid), so a dark
 // foreground under a bright sunset sky still shows; bright parts are left as they are; detail within each part is untouched
 if(uLT>0.&&uRaw==0){vec2 gu=(gl_FragCoord.xy+uView.xy)/uView.zw;vec3 b=.5*gTent(uG2,gu,uGt2)+.5*gTent(uG3,gu,uGt3);
   float La=max(lum(b)*uExp*lum(uWB),1e-5);if(okc(b))c*=clamp(pow(La/.18,-uLT*.6),1.,8.);}   // (only lifted: a bright sky keeps its contrast, its glow its punch)
 // dynamic range: anything far enough below white sinks into the noise floor (soft toe, no hard edge)
 if(uBlack>0.)c=max(c-uBlack*(1.-exp(-c/uBlack)),0.);
 // natural vignetting: a lens passes light falling cos^4 with the angle off its axis; the slider keeps that fraction of it
 // (cameras partly correct it in processing)
 vec2 q=(gl_FragCoord.xy+uView.xy-.5*uView.zw)/(.5*min(uView.z,uView.w));float t2=dot(q,q)*uVt*uVt;c*=mix(1.,1./((1.+t2)*(1.+t2)),uVig);
 // sensor noise: photon shot noise grows with the square root of the light, so shadows are grainier than highlights
 if(uGrain>0.){float n1=fract(sin(dot(gl_FragCoord.xy+uSeed,vec2(12.9898,78.233)))*43758.5453)+fract(sin(dot(gl_FragCoord.xy+uSeed*1.7,vec2(39.346,11.135)))*24634.6345)-1.;
   float n2=fract(sin(dot(gl_FragCoord.xy+uSeed*2.3,vec2(73.156,52.235)))*13758.5453)-.5;
   float L=max(lum(c),0.);c+=(vec3(n1)+vec3(n2,-n2*.5,n2)*.35)*uGrain*.09*sqrt(L+.003);c=max(c,0.);}
 if(uTm==3){
   // camera-style: the film curve is applied to brightness and the color is kept, so a warm lamp stays warm instead of
   // bleaching to white; only what still falls outside the display is eased toward white, keeping its brightness
   // (below the highlights it is the same per-channel film curve as Filmic, which gives photographs their color depth)
   vec3 pc=aces(c);float L=lum(c);
   if(L>1e-6){float Ld=aces(vec3(L)).x;vec3 hp=c*(Ld/L);float m=max(hp.r,max(hp.g,hp.b));if(m>1.)hp=mix(hp,vec3(Ld),clamp((m-1.)/max(m-Ld,1e-4),0.,1.));
     c=mix(pc,clamp(hp,0.,1.),smoothstep(.7,.97,max(pc.r,max(pc.g,pc.b))));}else c=pc;
 }else c=uTm==0?aces(c):uTm==1?c/(1.+c):clamp(c,0.,1.);
 c=max(mix(vec3(lum(c)),c,uSat),0.);c=pow(c,vec3(1./2.2));
 o=vec4(c,1);}`;

const downFS=`#version 300 es
precision highp float;uniform sampler2D uS;uniform vec2 uSt;out vec4 o;
vec3 T(vec2 uv,float x,float y){return texture(uS,uv+uSt*vec2(x,y)).rgb;}
// 13 taps in a smooth, round-ish falloff (a box filter here turned a bright point into a square glow)
void main(){vec2 uv=gl_FragCoord.xy*2.*uSt;
  o=vec4(T(uv,0.,0.)*.125+(T(uv,-2.,2.)+T(uv,2.,2.)+T(uv,-2.,-2.)+T(uv,2.,-2.))*.03125+(T(uv,0.,2.)+T(uv,-2.,0.)+T(uv,2.,0.)+T(uv,0.,-2.))*.0625
    +(T(uv,-1.,1.)+T(uv,1.,1.)+T(uv,-1.,-1.)+T(uv,1.,-1.))*.125,1);}`;
function sh(t,s){const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS)){const e=gl.getShaderInfoLog(x);gl.deleteShader(x);throw e;}return x;}
// link a program and let go of its shader objects (the linked program keeps what it needs)
function progVF(vs,f){const p=gl.createProgram(),a=sh(gl.VERTEX_SHADER,vs);let b;try{b=sh(gl.FRAGMENT_SHADER,f);}catch(e){gl.deleteShader(a);gl.deleteProgram(p);throw e;}
  gl.attachShader(p,a);gl.attachShader(p,b);gl.linkProgram(p);gl.detachShader(p,a);gl.detachShader(p,b);gl.deleteShader(a);gl.deleteShader(b);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)){const e=gl.getProgramInfoLog(p);gl.deleteProgram(p);throw e;}
  const u={};const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<n;i++){const a=gl.getActiveUniform(p,i);u[a.name.replace('[0]','')]=gl.getUniformLocation(p,a.name);}return {p,u};}
const prog=f=>progVF(VS,f);
let TR,OUT,pending=null,broken=false;
const pExt=gl.getExtension('KHR_parallel_shader_compile');
// compile without blocking the page where the browser allows it; the old image stays on screen meanwhile
// Every program is kept once compiled (PCACHE, keyed by its source), so going back to a scene or a setting is instant;
// the shader warm-up (385) fills the cache ahead of time. A build still compiling is handed back to the warm-up, not thrown away.
const PCACHE=new Map();
function pcUse(fs,rec){PCACHE.delete(fs);PCACHE.set(fs,rec);
  if(PCACHE.size>64)for(const [k,x] of PCACHE){if(PCACHE.size<=64)break;if(x!==rec&&x!==TR){gl.deleteProgram(x.p);PCACHE.delete(k);}}return rec;}
function progU(p){const u={},n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<n;i++){const a=gl.getActiveUniform(p,i);u[a.name.replace('[0]','')]=gl.getUniformLocation(p,a.name);}return u;}
function build(){
  if(pending){if(pending.pe){for(const x of pending.list)if(!x.hit)warmAdopt(x);}else warmAdopt(pending);pending=null;document.body.classList.remove('busy');}   // a newer build replaces one still compiling
  if(peOn()){peBuild();return;}
  const fs=isCosmos()?cosmosFS():traceFS(),hit=PCACHE.get(fs);
  if(hit){TR=pcUse(fs,hit);broken=false;errEl.style.display='none';try{OUT=OUT||prog(outFS);}catch(e){}reset();return;}
  pending=warmTake('tr|'+fs)||(()=>{const v=gl.createShader(gl.VERTEX_SHADER),f=gl.createShader(gl.FRAGMENT_SHADER),p=gl.createProgram();
    gl.shaderSource(v,VS);gl.compileShader(v);gl.shaderSource(f,fs);gl.compileShader(f);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);return {p,v,f};})();
  pending.fs=fs;document.body.classList.add('busy');
  if(!pExt)pollBuild(true);
}
function pollBuild(force){
  if(!pending)return true;
  if(pending.pe)return pePoll(force);
  if(!force&&!gl.getProgramParameter(pending.p,pExt.COMPLETION_STATUS_KHR))return false;
  const {p,v,f}=pending,pending_fs=pending.fs;pending=null;document.body.classList.remove('busy');
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)){broken=true;errEl.style.display='grid';errEl.textContent='Shader error:\n'+(gl.getShaderInfoLog(f)||'')+(gl.getShaderInfoLog(v)||'')+(gl.getProgramInfoLog(p)||'');gl.deleteProgram(p);gl.deleteShader(v);gl.deleteShader(f);return true;}
  gl.deleteShader(v);gl.deleteShader(f);
  TR=pcUse(pending_fs,{p,u:progU(p)});broken=false;errEl.style.display='none';
  try{OUT=OUT||prog(outFS);}catch(e){broken=true;errEl.style.display='grid';errEl.textContent='Shader error:\n'+e;}
  reset();return true;
}
const VAO0=gl.createVertexArray();gl.bindVertexArray(VAO0);

