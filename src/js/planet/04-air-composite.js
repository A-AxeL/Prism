// the air and the clouds along each ray up to the ground, at half resolution (full on the PC preset): in-scattered light and transmittance
const PE_VOL=()=>PE_HDR+`#define CLOUDS ${peClouds()?1:0}
`+PE_GLC()+PE_GLN+PE_GLA()+(peClouds()?peGLCLD():'')+`
uniform sampler2D uTerD;uniform vec3 uEye,uFw,uRt,uUp;uniform float uTanF,uEnvN,uVS;uniform int uDbgC;uniform vec2 uJ;uniform uint uFrame;uniform int uSteps,uNB,uCSteps,uLSteps,uEnvF;uniform vec4 uBS[12];
${CAMGLSL}
layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;
float gPx;   // the angle of one half-resolution pixel
float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
// air from t0 to t1: samples crowd where the air is dense (near the camera from inside it, near the ground from space)
void air(vec3 ro,vec3 rd,float t0,float t1,int N,float j,int mode,inout vec3 L,inout vec3 T){
  float nu=dot(rd,uSun),pr=phR(nu),Lg=t1-t0;vec3 pm=scM(nu);if(Lg<=0.)return;
  for(int i=0;i<64;i++){if(i>=N)break;float u0=float(i)/float(N),u1=float(i+1)/float(N),us=(float(i)+j)/float(N);
    if(mode==1){u0*=u0;u1*=u1;us*=us;}else if(mode==2){u0=1.-sq(1.-u0);u1=1.-sq(1.-u1);us=1.-sq(1.-us);}
    float dt=(u1-u0)*Lg,t=t0+us*Lg;vec3 p=ro+rd*t;float r=length(p),h=max(r-1.,-.002),mu=dot(p,uSun)/r;
    float dR=exp(-h/uHR),dM=exp(-h/uHM);vec3 sT=ext(h),Ts=trans(r,mu)*pSh(r,mu);
#if CLOUDS
    // light shafts: the air is lit only where the sun comes through the clouds; rain falls below storm clouds
    float hk=h*uRkm,rain=0.;if(hk<(DUST==1?32.:17.)){Ts*=cShadow(p,max(.4,t*uRkm*gPx));if(hk<8.){vec4 wx=WX(p);float b,tp;deckW(wx,b,tp);rain=smoothstep(.3,.8,wxPr(wx))*smoothstep(b,b-.4,hk)*.35*uRkm*eyeW(normalize(p),wx);}}
#endif
    vec3 S=uSunI*((uBR*dR*pr+dM*pm)*Ts+(uBR*dR+uBMs*dM)*msL(r,mu));
#if CLOUDS
    if(rain>0.){S+=rain*(uSunI*Ts*.08+uSunI*irr(r,mu)/PI*.9);sT+=rain;}
#endif
    vec3 e=exp(-sT*dt);L+=T*(S-S*e)/max(sT,vec3(1e-12));T*=e;}}
#if CLOUDS
float hg(float c,float g){float g2=g*g;return (1.-g2)/(4.*PI*pow(max(1.+g2-2.*g*c,1e-4),1.5));}
// the cloud layer along [t0,t1]: light in, transmittance, and the light-weighted depth (for reprojection and the air split)
void clouds(vec3 ro,vec3 rd,float t0,float t1,float j,float pxA,out vec3 L,out float T,out float tc){
  L=vec3(0);T=1.;tc=0.;if(t1<=t0)return;float nu=dot(rd,uSun),wsum=0.;
  // the phase of each order of scattering: a strong forward lobe with a sharp peak (the silver lining of a backlit heap)
  // and a weak backward one, all widening with each bounce
  float ph[6];{float g=1.;for(int n=0;n<6;n++){ph[n]=.62*hg(nu,.8*g)+.13*hg(nu,.95*g)+.25*hg(nu,-.3*g);g*=.6;}}
  float pwv=.7*sq(.5+.5*nu);
  // steps grow with distance; empty air is crossed in long jumps straight to where the local cloud deck begins,
  // and inside a deck no step is longer than a third of its thickness: thin layers are never stepped over. Where a
  // searching step finds cloud, the march goes back to the start of that step and walks it in short steps, a few across
  // even a small heap, until it has been out of cloud for a while (one long step would see a small heap as half there)
  float t=t0,ev=0.,sk=1.,zc=0.;bool fine=false,first=true;
  for(int i=0;i<400;i++){if(t>=t1||T<.01||ev>=float(uCSteps))break;
    vec3 p=ro+rd*t;float r=length(p),hk=(r-1.)*uRkm;vec3 up=p/r;float vz=dot(rd,up),base=.1+t*uRkm*.012;
    vec4 wx=WX(p);float b,tp;deckW(wx,b,tp);float cov=wx.r+uCov,st;
    if(cov<.01||hk<b-.03||hk>tp+.03){
      // (landing a random way into the deck each frame, so the steps inside never line up into slices)
      float g=cov<.01?5.:hk>tp?(vz<-.005?(hk-tp)/-vz:5.):(vz>.005?(b-hk)/vz:5.);st=clamp(g+.02+fract(j*7.31+.37)*min(base,.3),.05,5.);fine=false;}
    else{float stC=clamp(min(base,(tp-b)*.3/max(abs(vz),.06)),.04,4.),stF=min(.015+t*uRkm*.0025,stC);st=fine?stF:stC*sk;if(first){st*=.05+.95*fract(j*3.17+.61);first=false;}   // a random first step: the grid of steps shifts every frame
      // the sample sits at a random point of its step (stratified): no slicing bands, only fine noise that the resolve averages away
      float ts=t+st*j/uRkm;p=ro+rd*ts;r=length(p);hk=(r-1.)*uRkm;up=p/r;
      float fp=ts*uRkm*pxA+st*.25,d=cDen(p,hk,wx,true,fp)*eyeW(up,wx)*smoothstep(600.,420.,(ts-t0)*uRkm);
      // the step budget is spent on cloud, not on the gaps between heaps; gaps are crossed in lengthening strides
#if !DUST
      if(d>0.&&!fine&&st>stF*1.5){fine=true;zc=0.;ev+=.35;continue;}
#endif
      if(d>0.){ev+=fine?.7:1.;sk=1.;zc=0.;}else{ev+=fine?.2:.35;sk=min(sk*1.15,1.6);zc+=1.;if(zc>5.)fine=false;}
      if(d>0.){float dk=d*55.,mu=dot(p,uSun)/r;
        // light toward the sun through the cloud: a few growing steps of the coarse shape
        float od=0.,lt=0.,ls=max(.12,fp*.5);int nL=ts*uRkm>20.?max(uLSteps-3,3):uLSteps;for(int k=0;k<nL;k++){lt+=ls*.5;vec3 q=p+uSun*(lt/uRkm);float hq=(length(q)-1.)*uRkm;
          od+=cDen(q,hq,WX(q),false,max(fp,ls))*ls*55.;lt+=ls*.5;ls*=2.;}
        // and one short look a few tens of metres toward the sun with the fine detail: each billow shades its neighbours,
        // which is what makes a heap read as cauliflower rather than cotton wool
        if(fp<.3){float lm=max(.05,fp*2.);vec3 q=p+uSun*(lm/uRkm);od+=cDen(q,(length(q)-1.)*uRkm,wx,true,fp)*lm*55.*(1.-smoothstep(.1,.3,fp));}
#if DUST
        // dust: each grain scatters most light forward and keeps less of the blue (single-scattering albedo by colour);
        // light that has scattered more than once fills the storm with a dim, ruddy glow
        // (the colour of a storm follows the haze's own grains, as the planet editor sets them: Mars's dust storm colour,
        // shifted by how much more or less of each colour this world's grains keep than Mars's do, cubed for the several
        // scatterings a path through a thick storm takes)
        vec3 om=(uBMs+uBMp)/max(uBMe+uBMp,vec3(1e-12));if(uBMe.g<=0.)om=vec3(.975,.94,.82);
        vec3 sun=uSunI*trans(r,mu)*pSh(r,mu),alb=clamp(vec3(.9,.68,.48)*pow(clamp(om,0.,1.)/vec3(.975,.94,.82),vec3(3.)),0.,.98);float y=0.;
        vec3 Sc=sun*alb*(exp(-od)*(.8*hg(nu,.68)+.2*hg(nu,-.25))+alb*(.55*exp(-od*.3)+.3*exp(-od*.09))*.08);
        Sc+=uSunI*irr(r,mu)/PI*alb*mix(.35,.9,exp(-od*.05));
#else
        // the sky above: two looks straight up through the coarse shape (the sky light that reaches this point)
        float odU=0.;for(int k=0;k<2+uZ0;k++){float lu=k==0?.15:.6;vec3 q=p+up*(lu/uRkm);odU+=cDen(q,hk+lu,wx,false,max(fp,.3))*(k==0?.3:.6)*55.;}
        vec3 sun=uSunI*trans(r,mu)*pSh(r,mu);
        // many scatterings inside the cloud (Wrenninge, as Photon and Nubis do it): each order weaker, wider and reaching
        // deeper, which keeps the shaded side of a heap bright and its base grey rather than black. Thin wisps have little
        // depth to scatter in: seen away from the sun their rims stay darker (the "powder" look of sculpted billows)
        float pw=mix(1.-exp(-dk*.1),1.,pwv),oa=1.,oe=1.;vec3 Sc=vec3(0);
        for(int n=0;n<6;n++){Sc+=oa*exp(-oe*od)*ph[n];oa*=.7*(n==0?pw:1.);oe*=.35;}
        Sc*=sun*1.8;
        // sky light, dimmed by the cloud above it, and the light the sunlit ground below throws back onto the base
        float y=clamp((hk-b)/(tp-b),0.,1.),TU=1./(1.+.09*odU);
        Sc+=uSunI*irr(r,mu)/PI*(.18+.82*TU)*(.75+.25*y)+sun*max(mu,0.)*.025*(1.-y);
#endif
        // lightning inside storm cells: brief flashes, each cell on its own clock
        if(wx.g>.75&&wxPr(wx)>.4){vec3 cell=floor(p*uRkm/9.);float hsh=fract(sin(dot(cell,vec3(12.9898,78.233,37.719))+floor(uLT*2.5)*.618)*43758.5453);
          if(hsh<.012)Sc+=vec3(.8,.85,1.)*uSunI*.6*(1.-y)*fract(uLT*2.5)*(1.-fract(uLT*2.5))*4.;}
        float e=exp(-dk*st);L+=T*Sc*(1.-e);float w=T*(1.-e);tc+=ts*w;wsum+=w;T*=e;}}
    t+=st/uRkm;}
  tc=wsum>0.?tc/wsum:0.;}
// cirrus: a thin sheet of ice crystals near 9 km, combed into fibers along the wind (east-west)
void cirrus(vec3 ro,vec3 rd,float tmax,out vec3 L,out float T,out float tci){L=vec3(0);T=1.;tci=0.;
  float rc=1.+9./uRkm;vec2 s=sph(ro,rd,rc);float t=length(ro)<rc?s.y:s.x;if(t<=0.||t>tmax)return;
  vec3 p=ro+rd*t,up=normalize(p);vec4 wx=WX(p);float ci=wx.a*clamp(uCov*1.4+1.,0.,1.4)-.25;if(ci<=0.)return;
  float vz=max(abs(dot(rd,up)),.04),fp=t*uRkm*gPx/vz;vec3 pw=rotY(p,-uFlowC),e=normalize(cross(vec3(0,1,0),normalize(pw))+vec3(1e-4,0,0)),q=pw*uRkm;q-=e*dot(q,e)*.85;
  // patches tens of km across and streaks a few km wide (smooth noise: no polygonal outlines), ragged with fine billows
  float l=log2(max(fp,.01)/1.875)+uCDL,n1=textureLod(uCD,q*(1./60.)+vec3(0.,uCOff2.x,0.),max(l,0.)).g,n2=textureLod(uCD,q*(1./12.)+vec3(.3,uCOff2.y,0.),max(l+2.32,0.)).b,
    n3=textureLod(uCD,q*(1./3.)+vec3(.6,uCOff2.y*3.,.2),max(l+4.32,0.)).r;
  float m=.5+(n1-.5)+(n2-.5)*.6+(n3-.55)*.25,k=mix(.05,.25,smoothstep(1.,6.,l-uCDL));
  float tau=ci*smoothstep(.62-ci*.3-k,.62-ci*.3+k,m)*.5/vz;if(tau<1e-3)return;
  float r=length(p),mu=dot(up,uSun),nu=dot(rd,uSun);vec3 sun=uSunI*trans(r,mu)*pSh(r,mu);
  float ph=mix(hg(nu,.8),hg(nu,-.2),.3)+.08*smoothstep(.88,.9,nu)*smoothstep(.92,.9,nu);   // forward glow, and a faint 22° halo
  T=exp(-tau);L=(sun*ph+uSunI*irr(r,mu)/PI*.8)*(1.-T);tci=t;}
// the altocumulus layer along the ray (its nearer piece): light in, transmittance and the light-weighted depth
void altoc(vec3 ro,vec3 rd,float tmax,float j,out vec3 L,out float T,out float ta){L=vec3(0);T=1.;ta=0.;
  float rb=1.+AC0/uRkm,rt=1.+AC1/uRkm,r0=length(ro);vec2 sb=sph(ro,rd,rb),st=sph(ro,rd,rt);if(st.y<=0.)return;
  float t0,t1;if(r0>rt){t0=st.x;t1=sb.x>0.?sb.x:st.y;}else if(r0>rb){t0=0.;t1=sb.x>0.?sb.x:st.y;}else{t0=max(sb.y,0.);t1=st.y;}
  t1=min(min(t1,tmax),t0+60./uRkm);if(t1<=t0)return;
  vec3 pm=ro+rd*t0;vec4 wx=WX(pm);float ac=acCov(pm,wx,t0*uRkm*gPx);if(ac<.02)return;
  int N=clamp(uCSteps/10,5,14);float dt=(t1-t0)/float(N),nu=dot(rd,uSun),wsum=0.;
  float ph0=.62*hg(nu,.8)+.13*hg(nu,.95)+.25*hg(nu,-.3),ph1=.7*hg(nu,.45)+.3*hg(nu,-.15);
  for(int i=0;i<N;i++){float t=t0+(float(i)+j)*dt;vec3 p=ro+rd*t;float r=length(p),hk=(r-1.)*uRkm;
    float fp=t*uRkm*gPx+dt*uRkm*.25,d=acDen(p,hk,ac,fp);if(d<=0.)continue;
    // two looks toward the sun, a near one and a farther one: each heap shades its own far side
    vec3 q1=p+uSun*(.07/uRkm),q2=p+uSun*(.28/uRkm);float mu=dot(p,uSun)/r;
    float od=(acDen(q1,(length(q1)-1.)*uRkm,ac,fp)*.1+acDen(q2,(length(q2)-1.)*uRkm,ac,max(fp,.08))*.3)*55.;
    vec3 sun=uSunI*trans(r,mu)*pSh(r,mu),Sc=sun*1.8*(exp(-od)*ph0+.7*exp(-od*.35)*ph1+.08*(.49*exp(-od*.12)+.34*exp(-od*.04)+.24*exp(-od*.015)));
    // the sky above is hidden by the heap itself: grey middles, bright rims
    Sc+=uSunI*irr(r,mu)/PI*(.3+.7*exp(-od*.12))*(.6+.4*clamp((hk-AC0)/(AC1-AC0),0.,1.));
    float e=exp(-d*55.*dt*uRkm);L+=T*Sc*(1.-e);float w=T*(1.-e);ta+=t*w;wsum+=w;T*=e;if(T<.01)break;}
  ta=wsum>0.?ta/wsum:0.;}
// put another layer (L2, T2 at depth t2) in front of or behind what is there
void lay(inout vec3 L,inout float T,inout float t,vec3 L2,float T2,float t2){if(T2>=1.)return;if(T>.999||t2<t)L=L2+T2*L;else L+=T*L2;if(T>.999)t=t2;T*=T2;}
#endif
void main(){ivec2 hp=ivec2(gl_FragCoord.xy),fp=hp*int(uVS);vec3 ro=uEye,rd;float tS;bool sky;
  if(uEnvF>=0){
    // one face of the sky cube around the camera (for reflections): the direction of this texel; the sea-level sphere stops it
    vec2 s=gl_FragCoord.xy/uEnvN*2.-1.;int f=uEnvF;rd=normalize(f==0?vec3(1,-s.y,-s.x):f==1?vec3(-1,-s.y,s.x):f==2?vec3(s.x,1,s.y):f==3?vec3(s.x,-1,-s.y):f==4?vec3(s.x,-s.y,1):vec3(-s.x,-s.y,-1));
    vec2 g=sph(ro,rd,1.);sky=!(g.x>0.);tS=sky?1e9:g.x;}
  else{if(!camRay(vec2(fp)+uJ,ro,rd)){o0=vec4(0,0,0,-1e4);o1=vec4(1);return;}
    tS=texelFetch(uTerD,min(fp,textureSize(uTerD,0)-1),0).r;sky=tS>3e4;if(sky)tS=1e9;}
  for(int i=0;i<12;i++){if(i>=uNB)break;vec2 t=sph(ro-uBS[i].xyz,rd,uBS[i].w);if(t.x>0.&&t.x<tS){tS=t.x;sky=false;}}
  // a new interleaved-gradient pattern every frame: no fixed dither texture
  float j=ign(vec2(hp)+5.588238*float(uFrame%64u));gPx=uEnvF>=0?1.6/uEnvN:2.*uVS*uTanF/min(uView.z,uView.w);
  vec3 L=vec3(0),T=vec3(1);float tR=sky?1e4:tS;vec2 ta=sph(ro,rd,uRtop);
  if(ta.y>0.){float t0=max(ta.x,0.),t1=min(ta.y,tS);if(sky)tR=ta.y;
    if(t1>t0){int N=clamp(int((t1-t0)/(uHR*.5))+3,3,uSteps),mode=length(ro)<uRtop?1:(!sky?2:0);
#if CLOUDS
      // the cloud shell (up to 17 km: thunderheads over high ground), at most 600 km of it along the ray
      vec3 Lc=vec3(0);float Tc=1.,tc=0.;vec2 so=sph(ro,rd,1.+(DUST==1?32.:17.)/uRkm);
      if(so.y>0.){float c0=max(so.x,0.),c1=min(so.y,tS);vec2 si=sph(ro,rd,1.+.45/uRkm);if(DUST==0&&length(ro)>1.+.45/uRkm&&si.x>0.)c1=min(c1,si.x);
        c1=min(c1,c0+600./uRkm);if((uDbgC&4)==0)clouds(ro,rd,c0,c1,j,gPx,Lc,Tc,tc);}
      {vec3 Li;float Ti,ti;if((uDbgC&1)==0){altoc(ro,rd,tS,j,Li,Ti,ti);lay(Lc,Tc,tc,Li,Ti,ti);}if((uDbgC&2)==0){cirrus(ro,rd,tS,Li,Ti,ti);lay(Lc,Tc,tc,Li,Ti,ti);}}
      if(Tc<.999&&tc>t0){vec3 L2=vec3(0),T2=vec3(1);int Nh=max(N/2,3);air(ro,rd,t0,tc,Nh,j,mode,L,T);air(ro,rd,tc,t1,Nh,j,mode,L2,T2);
        L+=T*(Lc+Tc*L2);T*=Tc*T2;if(Tc<.5)tR=tc;}
      else air(ro,rd,t0,t1,N,j,mode,L,T);
#else
      air(ro,rd,t0,t1,N,j,mode,L,T);
#endif
    }}
  o0=vec4(L,sky?-min(tR,3e4):min(tR,3e4));o1=vec4(T,1);}`;
// temporal resolve of the half-resolution volumetrics: reproject last frame's result with the camera motion, keep it
// within the range of this frame's neighborhood while moving, and average more frames when still
const PE_RES=()=>PE_HDR+`
uniform sampler2D uC0,uC1,uH0,uH1;uniform vec3 uEye,uFw,uRt,uUp,uPEye,uPFw,uPRt,uPUp;uniform float uTanF,uPTanF,uPOrtho,uMov,uVS,uHmax;uniform vec2 uJ,uPJ;uniform int uHist;
${CAMGLSL}
layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;
void main(){ivec2 p=ivec2(gl_FragCoord.xy),sz=textureSize(uC0,0);vec4 c0=texelFetch(uC0,p,0),c1=texelFetch(uC1,p,0);
  // (new terrain tiles came in: the ground's history is dropped, the sky's and its clouds' kept)
  if(uHist==0||uHist==2&&c0.a>=0.){o0=c0;o1=vec4(c1.rgb,1);return;}
  // the neighborhood: its spread bounds the history (variance clipping), and its depth-aware blur stands in for this
  // frame's noisy sample while the camera moves and little history survives
  // (over the sky every neighbour counts: a cloud's depth jumps about from sample to sample)
  vec3 m1L=vec3(0),m2L=vec3(0),m1T=vec3(0),m2T=vec3(0),bL=vec3(0),bT=vec3(0);float bw=0.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){ivec2 q=clamp(p+ivec2(i,j),ivec2(0),sz-1);vec4 a=texelFetch(uC0,q,0);vec3 b=texelFetch(uC1,q,0).rgb;
    m1L+=a.rgb;m2L+=a.rgb*a.rgb;m1T+=b;m2T+=b*b;
    float w=float((2-abs(i))*(2-abs(j)))*((a.a<0.)==(c0.a<0.)&&(c0.a<0.||abs(abs(a.a)-abs(c0.a))<.08*abs(c0.a)+1e-7)?1.:0.);bL+=a.rgb*w;bT+=b*w;bw+=w;}
  m1L/=9.;m1T/=9.;vec3 sL=sqrt(max(m2L/9.-m1L*m1L,0.))*1.25,sT=sqrt(max(m2T/9.-m1T*m1T,0.))*1.25;
  vec3 mnL=m1L-sL,mxL=m1L+sL,mnT=m1T-sT,mxT=m1T+sT;
  // while moving, a wider ring (5×5) joins the blur where the sample is cloud-laden (inside or behind a cloud the light
  // dims and one frame's march is at its noisiest)
  if(uMov>.5){if(dot(c1.rgb,vec3(.33))<.85){for(int j=-2;j<=2;j++)for(int i=-2;i<=2;i++){if(abs(i)<2&&abs(j)<2)continue;ivec2 q=clamp(p+ivec2(i,j),ivec2(0),sz-1);vec4 a=texelFetch(uC0,q,0);
      float w=((a.a<0.)==(c0.a<0.)&&(c0.a<0.||abs(abs(a.a)-abs(c0.a))<.08*abs(c0.a)+1e-7))?.5:0.;bL+=a.rgb*w;bT+=texelFetch(uC1,q,0).rgb*w;bw+=w;}}
    c0.rgb=bL/bw;c1.rgb=bT/bw;}
  float dc=abs(c0.a);vec3 ro=uEye,rd;camRay(vec2(p)*uVS+uJ,ro,rd);vec3 X=ro+rd*dc;vec2 hq=vec2(p);bool ok=true;
  if(uMov>.5){vec3 v=X-uPEye;float s=min(uView.z,uView.w)*.5;
    if(uProj==0){float z=dot(v,uPFw);if(z<1e-9)ok=false;else hq=(vec2(dot(v,uPRt),dot(v,uPUp))/z/uPTanF*s+.5*uView.zw-uView.xy-uPJ)/uVS;}
    else if(uProj==3)hq=(vec2(dot(v,uPRt),dot(v,uPUp))/uPOrtho*s+.5*uView.zw-uView.xy-uPJ)/uVS;
    else ok=false;}
  vec2 uv=(hq+.5)/vec2(sz);if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))ok=false;
  vec4 h0=texture(uH0,uv),h1=texture(uH1,uv);float dp=length(X-uPEye);
  // the history must have seen the same thing: the ground at the same distance; a cloud's light-weighted depth jumps
  // about from frame to frame with the random sample positions, so it is only held to that loosely, and only while moving
  // (over the sky the clouds' history is kept and only held within this frame's neighbourhood: rejecting it on their
  // jittery depth left thin cloud as raw noise whenever anything moved)
  if((h0.a<0.)!=(c0.a<0.)||(uMov>.5&&c0.a>=0.&&abs(abs(h0.a)-dp)>.06*dp+1e-7))ok=false;
  float n=ok?min(h1.a+1.,uMov>.5?(c0.a<0.?14.:8.):uHmax):1.,a=1./n;vec3 hL=h0.rgb,hT=h1.rgb;
  if(uMov>.5){hL=clamp(hL,mnL,mxL);hT=clamp(hT,mnT,mxT);}
  o0=vec4(mix(hL,c0.rgb,a),c0.a);o1=vec4(mix(hT,c1.rgb,a),n);}`;
// the final image: ground from the mesh pass or what lies beyond (stars, sun, moons, other planets), seen through the air
const PE_COMP=()=>{const co=SCENES[S.scene].cosmos,nm=moonList(co).length,nb=(co.bodies||[]).length;return `#version 300 es
precision highp float;precision highp int;precision highp sampler3D;
#define PI 3.14159265
#define NMOON ${nm}
#define NBOD ${nb}
#define RINGS ${co.rin>0?1:0}
#define OCT 5
uniform sampler3D uNoise;uniform sampler2D uTer,uTerD,uV0,uV1,uPrev;uniform int uSSL,uSoftSky;
#define CLOUDS ${peClouds()&&!peDust()?1:0}
uniform float uRainT,uBlend,uStars,uSunK,uSunC0,uSunC1,uGlare,uStarD,uRin,uRout,uSpin,uTanF,uVS;uniform vec3 uEye,uFw,uRt,uUp,uAxis,uRingC;uniform vec2 uJ;
uniform samplerCube uWxA,uWxB;uniform float uWxM,uCov;
uniform vec4 uMoons[${Math.max(1,nm)}],uMoonC[${Math.max(1,nm)}],uBod[${Math.max(1,nb)}],uBodA[${Math.max(1,nb)}],uBodB[${Math.max(1,nb)}],uBodC[${Math.max(1,nb)}],uBodN[${Math.max(1,nb)}];
out vec4 o;
${COSMOS_COMMON}
${PE_GLA()}
${CAMGLSL}
#define SUNI uSunI
vec3 moonCol(int i,vec3 p,vec3 rd){
  vec3 N=normalize(p-uMoons[i].xyz);float a=fbm(N*5.+float(i)*13.,OCT),cr=smoothstep(.62,.7,n3(N*30.+float(i)*7.))*.5;
  vec3 alb=vec3(.10+.14*a-.05*cr)*uMoonC[i].rgb;float m0=max(dot(N,uSun),0.),m=max(dot(N,-rd),.02);
  float d=length(p-uSun*dot(p,uSun));float sh=dot(p,uSun)<0.?smoothstep(.96,1.06,d):1.;
  return alb*SUNI*2.*m0/(m0+m)/PI*mix(vec3(.25,.06,.02)*.08,vec3(1),sh);}
vec3 bodyCol(int i,vec3 p,vec3 rd){vec4 A=uBodA[i],Bc=uBodB[i],C=uBodC[i];vec3 c=uBod[i].xyz,N=normalize(p-c),L=normalize(uSun*uStarD-c);
  float nl=max(dot(N,L),0.),fi=float(i);vec3 alb;
  if(A.w<.5){float h=fbm(N*2.5+fi*7.,4);alb=mix(A.rgb,Bc.rgb,smoothstep(.46,.56,h));}
  else{float b=N.y*7.+fbm(N*vec3(2,8,2)+fi*3.,3)*1.6;alb=mix(A.rgb,Bc.rgb,.5+.5*sin(b*3.));}
  vec3 col=alb*SUNI*nl/PI;float rim=pow(1.-max(dot(N,-rd),0.),3.);col+=C.rgb*C.w*SUNI*.06*rim*smoothstep(-.25,.35,dot(N,L));return col;}
#if RINGS
float ringA(float r){if(r<uRin||r>uRout)return 0.;float x=(r-uRin)/(uRout-uRin);
  float a=.25+.75*fbm(vec3(r*30.,1.3,2.7),4);a*=smoothstep(0.,.03,x)*smoothstep(1.,.95,x);
  a*=1.-.92*smoothstep(.025,0.,abs(x-.62));a*=mix(.35,1.,smoothstep(0.,.2,x));return clamp(a,0.,.95);}
vec3 ringCol(vec3 q,vec3 rd){float r=length(q);vec3 c=mix(uRingC,uRingC*.62,fbm(vec3(r*18.,0,0),3));
  float lit=sph(q,uSun,1.).y>0.?0.:1.,ph=dot(rd,uSun);return c*SUNI*lit*(.45+1.2*pow(max(ph,0.),8.))*.12;}
#endif
// ---- screen-space lighting: ambient occlusion and contact shadows, from the depth of what was drawn. Every surface stores
// the share of its colour that is direct sunlight (alpha): the sky-lit part is dimmed by the occlusion of the creases,
// hollows and feet of things around it, the sunlit part by anything between it and the sun that the shadow map does not
// hold (the ground's own bumps and ledges, a rock's own faces, far trees and cliffs). Both reach farther with distance,
// so a far mountainside keeps its relief instead of going flat.
float sslZ(ivec2 q){ivec2 z=textureSize(uTerD,0);if(q.x<0||q.y<0||q.x>=z.x||q.y>=z.y)return 1e9;float d=texelFetch(uTerD,q,0).r;return d>3e4||texelFetch(uTer,q,0).a>1.5?1e9:d;}
vec3 sslP(vec2 fc,float d){vec3 o=vec3(0),r;camRay(fc,o,r);return o+r*d;}
vec2 sslProj(vec3 q){float z=dot(q,uFw);if(z<=0.)return vec2(-1e4);vec2 p=vec2(dot(q,uRt),dot(q,uUp))/z/uTanF,RV=uView.zw;return p*min(RV.x,RV.y)*.5+.5*RV-uView.xy;}
vec2 ssl(ivec2 ip,float dS,bool gr){vec2 fc=vec2(ip)+.5;float Rm=uRkm*1000.;vec3 P=sslP(fc,dS);
  vec3 a1=sslP(fc+vec2(1,0),sslZ(ip+ivec2(1,0))),a0=sslP(fc-vec2(1,0),sslZ(ip-ivec2(1,0))),b1=sslP(fc+vec2(0,1),sslZ(ip+ivec2(0,1))),b0=sslP(fc-vec2(0,1),sslZ(ip-ivec2(0,1)));
  vec3 dx=length(a1-P)<length(P-a0)?a1-P:P-a0,dy=length(b1-P)<length(P-b0)?b1-P:P-b0,N=normalize(cross(dx,dy));if(dot(N,P)>0.)N=-N;
  float nz=fract(52.9829189*fract(dot(fc,vec2(.06711056,.00583715)))),RV=min(uView.z,uView.w);
  // occlusion: a disc of samples some 4% of the distance across (half a metre close by, tens of metres on far slopes)
  float rw=clamp(dS*Rm*.05,.5,400.)/Rm,px=clamp(rw/(dS*uTanF)*RV*.5,2.,90.),occ=0.;
  for(int i=0;i<12;i++){float a=(float(i)+nz)*2.39996,r=sqrt((float(i)+.5)/12.)*px;vec2 q=fc+vec2(cos(a),sin(a))*r;float d=sslZ(ivec2(q));if(d>1e8)continue;
    vec3 v=sslP(q,d)-P;float l=length(v);occ+=max(dot(v,N)/max(l,1e-12)-.12,0.)*(1.-smoothstep(rw*.6,rw*1.6,l));}
  float ao=clamp(1.-occ/12.*2.6,.1,1.);
  // contact shadows: a short march toward the sun through the depth buffer
  float cs=1.;
  if(dot(N,uSun)>0.&&uProj==0){float Lw=clamp(dS*Rm*.06,.4,800.)/Rm,th=clamp(dS*Rm*.04,.35,400.)/Rm;vec3 Q0=P+N*(dS*.004+.05/Rm);float gz=min(max(abs(length(a1)-dS),abs(length(b1)-dS)),dS*.05);   // (how much the depth changes from one pixel to the next here: a sample that lands a pixel off must not count)
    for(int i=0;i<14;i++){float t=Lw*(float(i)+nz)/14.;vec3 Q=Q0+uSun*t;vec2 q=sslProj(Q);if(q.x<0.||q.y<0.||q.x>=uView.z||q.y>=uView.w)break;
      ivec2 iq=ivec2(q);float d=sslZ(iq),tq=length(Q),df=tq-d;
      // (near the camera the ground does not shade itself here: its facets would print lines, and the shadow map and the hill
      // shadows already cover it; farther out ridges shade the slopes below them)
      if(gr&&dS*Rm<400.&&texelFetch(uTer,iq,0).a>3.5)continue;if(df>tq*.006+.12/Rm+2.*gz*(tq/dS)*(tq/dS)&&df<th){cs=float(i)/14.*.6;break;}}}
  return vec2(ao,cs);}
void main(){ivec2 ip=ivec2(gl_FragCoord.xy);vec3 ro=uEye,rd;bool ok=camRay(gl_FragCoord.xy-.5+uJ,ro,rd);
  vec4 S=texelFetch(uTer,ip,0);float dS=texelFetch(uTerD,ip,0).r;dS=dS>3e4?1e9:dS;
  vec3 rw=vec3(cos(uSpin)*rd.x+sin(uSpin)*rd.z,rd.y,-sin(uSpin)*rd.x+cos(uSpin)*rd.z);
  vec3 bg=stars(rw)+SUNI*uSunK*smoothstep(uSunC0,uSunC1,dot(rd,uSun));float tB=1e9;
  for(int i=0;i<NMOON;i++){vec2 tm=sph(ro-uMoons[i].xyz,rd,uMoons[i].w);if(tm.x>0.&&tm.x<tB){tB=tm.x;bg=moonCol(i,ro+rd*tm.x,rd);}}
  for(int i=0;i<NBOD;i++){vec2 tb=sph(ro-uBod[i].xyz,rd,uBod[i].w);if(tb.x>0.&&tb.x<tB){tB=tb.x;bg=bodyCol(i,ro+rd*tb.x,rd);}
    float rw2=uBodB[i].w;if(rw2>0.){vec3 an=normalize(uBodN[i].xyz),oc=ro-uBod[i].xyz;float tr=-dot(oc,an)/dot(rd,an);
      if(tr>0.&&tr<tB){float r=length(oc+rd*tr)/uBod[i].w;if(r>1.3&&r<rw2){float a=(.35+.5*fbm(vec3(r*25.,1,2),3))*smoothstep(1.3,1.4,r)*smoothstep(rw2,rw2-.1,r);
        vec3 L=normalize(uSun*uStarD-uBod[i].xyz);bg=mix(bg,uBodA[i].rgb*SUNI*.1*(.5+.5*abs(dot(L,an))),a);}}}}
  vec3 c;float d0;bool sky;
  if(tB<dS){c=bg;d0=tB;sky=false;}else if(dS<1e8){c=S.rgb;d0=dS;sky=false;if(uSSL>0&&S.a<1.5){bool gr=S.a>3.5;vec2 l=ssl(ip,dS,gr);float k=clamp(gr?S.a-4.:S.a,0.,1.);c*=k*(uSSL==2?1.:l.y)+(1.-k)*(uSSL==3?1.:l.x);}}else{c=bg;d0=1e9;sky=tB>1e8;}
  // the half-resolution air, upsampled with weights that respect depth edges (mountains against the sky)
  vec2 h=(gl_FragCoord.xy-.5)/uVS;ivec2 b=ivec2(floor(h)),sz=textureSize(uV0,0);vec2 f=h-vec2(b);
  vec3 L=vec3(0),T=vec3(0);float ws=0.;
  // (while anything moves, the sky's clouds are gathered from a wider, tent-weighted patch: one frame of them is noisy and
  // little history survives the motion)
  int R0=uSoftSky>0&&d0>1e8?-1:0,R1=R0<0?2:1;
  for(int j=R0;j<=R1;j++)for(int i=R0;i<=R1;i++){ivec2 q=clamp(b+ivec2(i,j),ivec2(0),sz-1);vec4 a=texelFetch(uV0,q,0),t=texelFetch(uV1,q,0);
    vec2 e=abs(vec2(i,j)-f);float w=R0<0?max(1.6-e.x,0.)*max(1.6-e.y,0.)+1e-3:(i==0?1.-f.x:f.x)*(j==0?1.-f.y:f.y)+1e-3;
    if(d0>1e8)w*=a.a<0.?1.:.002;else{float dz=abs(a.a-d0)/d0;w*=a.a>0.?1./(1.+dz*dz*900.):.002;}
    L+=a.rgb*w;T+=t.rgb*w;ws+=w;}
  L/=ws;T/=ws;c=c*T+L;
  // falling rain near the camera: streaks on three cylinders around it (2, 5 and 11 m away), lit by the dim sky
  // how hard it rains where the camera is: under a raining deck, below its base
  float uRain=0.;
#if CLOUDS
  {vec3 d=normalize(uEye);vec4 w=mix(texture(uWxA,d),texture(uWxB,d),uWxM);float b=mix(.5,1.,smoothstep(0.,.35,w.g))+w.b*5.4,hk=(length(uEye)-1.)*uRkm;
   uRain=smoothstep(.3,.8,smoothstep(.55,.85,w.r)*mix(.25,1.,w.g))*smoothstep(b+.2,b-.3,hk)*smoothstep(.05,.25,w.r+uCov);}
#endif
  if(uRain>0.&&ok){vec3 U=normalize(ro),E=normalize(cross(U,abs(U.y)<.9?vec3(0,1,0):vec3(1,0,0))),Nn=cross(E,U);
    float az=atan(dot(rd,Nn),dot(rd,E)),sl=dot(rd,U),ch=sqrt(max(1.-sl*sl,.02)),pa=2.*uTanF/min(uView.z,uView.w),a=0.;
    for(int k=0;k<3;k++){float R=k==0?2.:k==1?5.:11.;if(R/ch>d0*uRkm*1000.)continue;
      vec2 g=vec2(az*R/.12,(R*sl/ch+uRainT*(7.5+float(k)))/.9);vec2 cl=floor(g),fr=g-cl;
      float h=fract(sin(dot(cl,vec2(127.1,311.7))+float(k)*7.)*43758.5453),xo=.2+.6*fract(h*17.31),w=max(pa*R/ch/.12,.03);
      a+=step(h,.25*uRain+.05)*smoothstep(w,0.,abs(fr.x-xo))*smoothstep(0.,.25,fr.y)*smoothstep(1.,.6,fr.y)*(1.-float(k)*.25);}
    float r0=length(ro),m0=dot(ro,uSun)/r0;vec3 amb=uSunI*irr(r0,m0)/PI;c=mix(c,c*1.6+amb*.5,clamp(a*.3,0.,.6)*uRain);}
#if RINGS
  {float tr=-dot(ro,uAxis)/dot(rd,uAxis);if(tr>0.&&tr<d0){vec3 q=ro+rd*tr;float a=ringA(length(q));if(a>0.){c=mix(c,ringCol(q,rd),a);d0=tr;}}}
#endif
  if(uGlare>0.){float sd=max(dot(rd,uSun),0.);bool vis=sph(ro,uSun,1.).x<0.;
    for(int i=0;i<NMOON;i++)vis=vis&&sph(ro-uMoons[i].xyz,uSun,uMoons[i].w).x<0.;for(int i=0;i<NBOD;i++)vis=vis&&sph(ro-uBod[i].xyz,uSun,uBod[i].w).x<0.;
    // the sun can hide behind terrain or cloud: look at the depth and the cloud transmittance around its image
    float sv=1.;if(vis&&uProj==0){float z=dot(uSun,uFw);if(z>.05){float s=min(uView.z,uView.w)*.5;vec2 sp=vec2(dot(uSun,uRt),dot(uSun,uUp))/z/uTanF*s+.5*uView.zw-uView.xy;
      ivec2 tz=textureSize(uTerD,0),hz=textureSize(uV1,0);float rr=max(2.,.0047/uTanF*s),acc=0.;
      for(int k=0;k<9;k++){vec2 q=sp+(k==0?vec2(0):rr*vec2(cos(float(k)*.785),sin(float(k)*.785)));ivec2 iq=ivec2(q);
        if(any(lessThan(iq,ivec2(0)))||any(greaterThanEqual(iq,tz))){acc+=1.;continue;}
        float dd=texelFetch(uTerD,iq,0).r;acc+=dd>3e4?dot(texelFetch(uV1,clamp(iq/int(uVS),ivec2(0),hz-1),0).rgb,vec3(.2,.7,.1)):0.;}
      sv=acc/9.;}}
    vis=vis&&sv>0.;
    if(vis){float r=length(ro);vec3 tg=vec3(1);vec2 ta=sph(ro,uSun,uRtop);if(ta.y>0.){vec3 pe=ro+uSun*max(ta.x,0.);float re=length(pe);tg=trans(re,dot(pe,uSun)/re);}
      c+=uGlare*sv*SUNI*tg*vec3(1.,.96,.9)*(.6*601.*pow(sd,600.)+.4*61.*pow(sd,60.))/(2.*PI);}}
  c=ok?min(c,vec3(3e4)):vec3(0);
  o=vec4(mix(texelFetch(uPrev,ip,0).rgb,c,uBlend),min(d0,6e4));}`;};
