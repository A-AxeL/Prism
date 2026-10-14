/* ---------- cosmos renderer: planets with atmospheric scattering, ringed giant, black hole ---------- */
const COSMOS_COMMON=`
uint st;
uint pcg(){st=st*747796405u+2891336453u;uint w=((st>>((st>>28u)+4u))^st)*277803737u;return (w>>22u)^w;}
float rnd(){return float(pcg())*(1./4294967296.);}
uint hash3(ivec3 c){uint h=uint(c.x)*73856093u^uint(c.y)*19349663u^uint(c.z)*83492791u;h^=h>>16;h*=2246822519u;h^=h>>13;h*=3266489917u;h^=h>>16;return h;}
float hf(uint h){return float(h)*(1./4294967296.);}
// smooth value noise from a 32^3 random texture: one fetch per octave
// the lattice cell is wrapped to the 32³ tile before sampling: large coordinates otherwise overflow the texture unit's
// fixed-point address on many phone GPUs and leave dark lines along every cell edge
float n3(vec3 p){vec3 i=floor(p),f=p-i;f=f*f*(3.-2.*f);i=mod(i,32.);return texture(uNoise,(i+f+.5)*.03125).r;}
float fbm(vec3 p,int oct){float a=.5,s=0.,w=0.;for(int i=0;i<8;i++){if(i>=oct)break;s+=a*n3(p);w+=a;p=p*2.07+vec3(5.3,1.9,7.7);a*=.5;}return s/w;}
// zero-mean detail octaves on top of a base fbm, faded in by level of detail (nd = octaves the pixel can resolve)
float fbmD(vec3 p,int oct,float nd,float g){float a=.5,s=0.,w=0.;for(int i=0;i<18;i++){float fi=float(i);if(i>=oct&&fi>=nd)break;float v=n3(p);
  if(i<oct){s+=a*v;w+=a;}else s+=a*g*clamp(nd-fi,0.,1.)*(v-.5);p=p*2.07+vec3(5.3,1.9,7.7);a*=.5;}return s/w;}
vec2 sph(vec3 ro,vec3 rd,float r){float b=dot(ro,rd),c=dot(ro,ro)-r*r,h=b*b-c;if(h<0.)return vec2(-1);h=sqrt(h);return vec2(-b-h,-b+h);}
// blackbody color, t in hundreds of kelvin
vec3 bb(float t){t=clamp(t,10.,400.);vec3 c;
  c.r=t<=66.?1.:clamp(1.292936*pow(t-60.,-.1332047),0.,1.);
  c.g=t<=66.?clamp(.3900816*log(t)-.6318414,0.,1.):clamp(1.129891*pow(t-60.,-.0755148),0.,1.);
  c.b=t>=66.?1.:t<=19.?0.:clamp(.5432068*log(t-10.)-1.1962541,0.,1.);return c*c;}
vec3 stars(vec3 d){
  vec3 col=vec3(0);vec3 mwN=normalize(vec3(.3,.9,.2));float lat=dot(d,mwN),band=exp(-lat*lat*14.);
  float neb=fbm(d*5.,4),dust=smoothstep(.42,.62,fbm(d*11.+7.,4));
  col+=band*(.004+.03*neb*neb)*vec3(.95,.85,.8)*(1.-.75*dust);
  col+=vec3(.3,.08,.18)*.015*smoothstep(.55,.8,fbm(d*3.+2.,3));
  for(int L=0;L<2;L++){float sc=L==0?90.:230.;vec3 p=d*sc;ivec3 c=ivec3(floor(p));uint h=hash3(c);
    vec3 sp=vec3(c)+.2+.6*vec3(hf(h),hf(h*747796405u+1u),hf(h*2891336453u+7u));
    vec3 dp=p-sp;float dist=length(dp-d*dot(dp,d));   // across the line of sight only: no rings where the sphere meets a cell face
   float br=pow(hf(h^0x5bd1e995u),L==0?14.:22.)*(L==0?80.:30.);
    col+=exp(-dist*dist*150.)*br*step(hf(h*13u+5u),.2)*bb(30.+90.*hf(h*3u+11u))*(1.+band*2.*float(L));}
  return col*uStars;
}`;

const cosmosFS=()=>{const c=SCENES[S.scene].cosmos;return `#version 300 es
precision highp float;precision highp int;precision highp sampler3D;
#define KIND ${c.kind}
#define ASTEPS ${S.atmSteps}
#define OCT ${S.terrainOct}
#define BHSTEPS ${S.bhSteps}
#define CLOUDS ${c.clouds&&S.clouds?1:0}
#define RINGS ${c.rin>0?1:0}
#define NMOON ${moonList(c).length}
#define NBOD ${(c.bodies||[]).length}
#define PI 3.14159265
uniform sampler2D uPrev,uLut;uniform sampler3D uNoise;
uniform float uBlend;uniform uint uFrame;uniform int uReproj;
uniform vec2 uRes;uniform vec3 uEye,uFw,uRt,uUp,uPEye,uPFw,uPRt,uPUp;uniform float uTanF,uTime;
uniform vec3 uSun,uBR,uBMs,uBMe,uBO,uP1,uP2,uP3,uP4,uAxis;
uniform float uHR,uHM,uRa,uG,uSea,uCloud,uCity,uRin,uRout,uDisk,uDiskT,uDop,uStars,uGlare;
uniform vec3 uSunI,uOcean,uLavaC,uRingC;uniform float uSunK,uSunC0,uSunC1,uLava,uRelief,uStarD;
uniform vec4 uMoons[${Math.max(1,moonList(c).length)}],uMoonC[${Math.max(1,moonList(c).length)}];
uniform vec4 uBodN[${Math.max(1,(c.bodies||[]).length)}],uBod[${Math.max(1,(c.bodies||[]).length)}],uBodA[${Math.max(1,(c.bodies||[]).length)}],uBodB[${Math.max(1,(c.bodies||[]).length)}],uBodC[${Math.max(1,(c.bodies||[]).length)}];
out vec4 o;
${COSMOS_COMMON}
${CAMGLSL}
#define SUNI uSunI
float volW=0.,dispW=0.;   // 0 from orbit, 1 near the ground: volumetric clouds and cloud layers (volW), real terrain relief (dispW)
vec3 spin(vec3 n,float a){float c=cos(a),s=sin(a);return vec3(c*n.x-s*n.z,n.y,s*n.x+c*n.z);}
// precomputed sun transmittance (includes planet shadow)
vec3 lut(vec3 p,vec3 l){float r=length(p);return texture(uLut,vec2(dot(p,l)/r*.5+.5,sqrt(clamp((r-1.)/(uRa-1.),0.,1.)))).rgb;}
float ozone(float h){float w=uRa-1.;return max(0.,1.-abs(h-.25*w)/(.15*w));}
// single-scattering Rayleigh + Mie + ozone absorption along [t0,t1]
vec3 atmos(vec3 ro,vec3 rd,float t0,float t1,out vec3 trans){
  float dt=(t1-t0)/float(ASTEPS),mu=dot(rd,uSun),g=uG;
  float pr=3./(16.*PI)*(1.+mu*mu);
  float pm=3./(8.*PI)*((1.-g*g)*(1.+mu*mu))/((2.+g*g)*pow(1.+g*g-2.*g*mu,1.5));
  vec3 sR=vec3(0),sM=vec3(0),od=vec3(0);float j=rnd();
  for(int i=0;i<ASTEPS;i++){
    vec3 p=ro+rd*(t0+(float(i)+j)*dt);float h=length(p)-1.;
    float dR=exp(-h/uHR),dM=exp(-h/uHM);
    vec3 tau=(uBR*dR+uBMe*dM+uBO*ozone(h))*dt;
    vec3 T=exp(-(od+tau*.5))*lut(p,uSun);
    sR+=T*dR*dt;sM+=T*dM*dt;od+=tau;
  }
  trans=exp(-od);
  return SUNI*(sR*uBR*pr+sM*uBMs*pm);
}
vec3 moonCol(int i,vec3 p,vec3 rd){
  vec3 N=normalize(p-uMoons[i].xyz);float a=fbm(N*5.+float(i)*13.,OCT),cr=smoothstep(.62,.7,n3(N*30.+float(i)*7.))*.5;
  vec3 alb=vec3(.10+.14*a-.05*cr)*uMoonC[i].rgb;
  float m0=max(dot(N,uSun),0.),m=max(dot(N,-rd),.02);
  float d=length(p-uSun*dot(p,uSun));float sh=dot(p,uSun)<0.?smoothstep(.96,1.06,d):1.;
  return alb*SUNI*2.*m0/(m0+m)/PI*mix(vec3(.25,.06,.02)*.08,vec3(1),sh);
}
#if KIND==0
// terrain height: continents from the base octaves, then ridged detail octaves as far as the pixel can resolve,
// stronger on high ground, so mountains, valleys and coastlines keep sharpening as the camera comes down
#if CLOUDS
float hgPh(float m,float g){float g2=g*g;return (1.-g2)/(4.*PI*pow(1.+g2-2.*g*m,1.5));}
// two thin cloud decks above the cumulus: altocumulus (rows of small puffs, ~7.5 km) and cirrus (long ice streaks, ~12 km)
float altoA(vec3 Np){vec3 q=spin(Np,uTime*.05);float m=smoothstep(.52,.66,fbm(q*7.+11.,3)+(uCloud-.57)*.6);if(m<=0.)return 0.;
  return smoothstep(.6,.78,fbm(q*1100.,2)*.75+fbm(q*90.,2)*.45)*m*.85;}
float cirrusA(vec3 Np){vec3 q=spin(Np,uTime*.07);float m=smoothstep(.46,.68,fbm(q*5.+27.,3));if(m<=0.)return 0.;
  return smoothstep(.55,.85,fbm(q*vec3(40.,280.,40.),3))*m*.5;}
vec3 sheetLit(vec3 p,float mu){vec3 Np=normalize(p);return lut(p,uSun)*SUNI*(.13+1.1*hgPh(mu,.6))+vec3(.5,.6,.78)*SUNI*.03*smoothstep(-.15,.25,dot(Np,uSun));}
#endif
// terrain height and its slope: continents from the base octaves, then ridged detail octaves as far as the pixel can resolve,
// stronger on high ground. The slope is taken per octave over a step no smaller than an eighth of that octave's cell:
// texture filtering keeps only 8 bits of position inside a cell, so tiny steps would turn its staircase into lines.
float hgt(vec3 p,float nd,out float dv){float a=.5,s=0.,w=0.,d=0.;dv=0.;
  for(int i=0;i<18;i++){float fi=float(i);if(i>=OCT&&fi>=nd)break;float v=n3(p);
    if(i<OCT){s+=a*v;w+=a;}else{float k=clamp(nd-fi,0.,1.)*(i<OCT+4?2.6:1.);d+=a*k*(1.-abs(2.*v-1.)-.62);dv+=k*(v-.5)*(i<OCT+4?.5:.25);}
    p=p*2.07+vec3(5.3,1.9,7.7);a*=.5;}
  float h=s/w;return h+d/w*(.45+1.5*smoothstep(uSea-.02,uSea+.18,h));}
vec3 hgtG(vec3 p,vec3 t1,vec3 t2,float nd,float e,out float dv){float a=.5,s=0.,w=0.,d=0.,f=2.2;vec2 gs=vec2(0),gd=vec2(0);dv=0.;
  for(int i=0;i<18;i++){float fi=float(i);if(i>=OCT&&fi>=nd)break;
    float st=max(e*f,.125),v=n3(p),vx=n3(p+t1*st),vy=n3(p+t2*st);vec2 g=vec2(vx-v,vy-v)*(f/st);
    if(i<OCT){s+=a*v;w+=a;gs+=a*g;}
    else{float k=clamp(nd-fi,0.,1.)*(i<OCT+4?2.6:1.),r=1.-abs(2.*v-1.);d+=a*k*(r-.62);
      gd+=a*k*vec2(1.-abs(2.*vx-1.)-r,1.-abs(2.*vy-1.)-r)*(f/st);dv+=k*(v-.5)*(i<OCT+4?.5:.25);}
    p=p*2.07+vec3(5.3,1.9,7.7);f*=2.07;a*=.5;}
  float h=s/w,m=.45+1.5*smoothstep(uSea-.02,uSea+.18,h);return vec3(h+d/w*m,(gs+gd*m)/w);}
// real relief near the ground: land rises with height above sea level (peaks ~10 km, mildly exaggerated). The shape uses
// the continents plus four detail octaves (a few km); finer relief is left to the shading. The camera code mirrors this
// function on the CPU (groundJS) so the camera never ends up inside a mountain.
#define DISP (.0016*uRelief)
float groundAt(vec3 p,float ng){vec3 q=spin(normalize(p),uTime*.03);float dv,h=hgt(q*2.2,ng,dv),x=max(h-(uSea>0.?uSea:.45),0.);
  return 1.+DISP*dispW*x*(.4+1.6*x)/.3;}
// heightfield ray march in the thin shell above sea level, then a short bisection for a clean contact
float terrainHit(vec3 ro,vec3 rd,float tLim){
  float Rm=1.+DISP*dispW*2.45+1e-6;vec2 tO=sph(ro,rd,Rm);if(tO.y<=0.)return -1.;   // Rm: above the highest possible peak
  vec2 tb=sph(ro,rd,1.);float t=max(tO.x,0.),tE=min(tO.y,tLim);bool base=tb.x>0.&&tb.x<=tE;if(base)tE=tb.x;
  const int MST=ASTEPS*3<24?24:ASTEPS*3>48?48:ASTEPS*3;float tp=t,pix=2.*uTanF/min(uView.z,uView.w);
  for(int i=0;i<MST;i++){vec3 p=ro+rd*t;
    // far away, relief finer than a pixel is skipped (fewer octaves per step)
    float ng=clamp(log2(1./(2.2*2.5*max(t*pix,1e-7)))/log2(2.07),float(OCT),float(OCT)+4.),dh=length(p)-groundAt(p,ng);
    if(dh<0.){float a=tp,b=t;for(int k=0;k<5;k++){float m=(a+b)*.5;vec3 q=ro+rd*m;if(length(q)<groundAt(q,ng))b=m;else a=m;}return b;}
    // step by how fast the ray is descending plus a bound on the terrain's slope, so grazing rays over flat ground take long strides
    float sink=max(-dot(rd,p/length(p)),0.);tp=t;t+=clamp(dh/(sink+.16),t*1.5e-4+2e-7,.012);if(t>=tE)return base?tb.x:-1.;}
  return t;}
vec3 rocky(vec3 p,vec3 rd,float fp){
  vec3 N=normalize(p),q=spin(N,uTime*.03);
  vec3 T1=normalize(cross(N,abs(N.y)<.99?vec3(0,1,0):vec3(1,0,0))),T2=cross(N,T1);
  // detail: octaves finer than about two pixels are left out (they would only shimmer)
  float nd=clamp(log2(1./(2.2*2.5*fp))/log2(2.07),float(OCT),17.),e=clamp(fp*1.5,2e-6,.004),dv;
  vec3 H3=hgtG(q*2.2,spin(T1,uTime*.03),spin(T2,uTime*.03),nd,e,dv);float h=H3.x;
  float cw=clamp(fp*30.,.0006,.008),land=smoothstep(uSea,uSea+cw,h);
  vec3 n=normalize(N-(T1*H3.y+T2*H3.z)*(land*.05*sqrt(uRelief)));
  float lat=abs(q.y),moist=fbm(q*5.+9.,3)+dv*.12,hs=h-max(uSea,.42),slope=1.-dot(n,N);
  vec3 alb=mix(uP1,uP3,smoothstep(.45,.62,moist+(.5-lat)*.15));
  alb=mix(alb,uP2,smoothstep(.1,.22,hs));
  alb=mix(alb,uP2*.8+.04,smoothstep(.1,.9,slope*8.)*.7*(1.-smoothstep(.15,.3,hs)));   // bare rock on steep ground
  if(uSea>0.)alb=mix(vec3(.5,.45,.33),alb,smoothstep(uSea+cw,uSea+cw+.006,h));        // beaches
  alb=mix(alb,uP4,smoothstep(.78,.88,lat+hs*.9)*(1.-smoothstep(.2,.9,slope*8.)*.6));    // snow, thinner on cliffs
  alb*=clamp(1.+dv*.8,.7,1.3);
  vec3 ocean=uOcean*mix(1.,.5,smoothstep(0.,.08,uSea-h));
  vec3 Ts=lut(p*1.0005,uSun)*SUNI;float sd=dot(N,uSun);
  vec3 amb=vec3(.03,.05,.09)*smoothstep(-.2,.3,sd)*2.;
  // valleys and hollows: how far the ground sits below its smoothed surroundings darkens it (cheap occlusion)
  float ao=1.;if(nd>float(OCT)+1.){float db,hb=hgt(q*2.2,nd-3.,db);ao=clamp(1.+(h-hb)/(pow(.5,nd-3.)*1.2)*.9,.45,1.12);}
  vec3 col=mix(ocean,alb*ao,land)*(Ts*max(dot(n,uSun),0.)/PI+amb*ao);
#if RINGS
  {float t=-dot(p,uAxis)/dot(uSun,uAxis);if(t>0.)Ts*=1.-ringA(length(p+uSun*t))*.9;col=mix(ocean,alb*ao,land)*(Ts*max(dot(n,uSun),0.)/PI+amb*ao);}
#endif
  // lava seas: a dark crust broken by glowing cracks (their own light, no sun glint)
  if(uLava>0.){float cr=smoothstep(.45,.62,fbm(q*60.,4))*(.4+.6*fbm(q*7.+3.,3));col=mix(col,vec3(.012,.01,.009)*(Ts*max(dot(N,uSun),0.)/PI+amb),1.-land)+(1.-land)*uLavaC*uLava*(.04+cr*1.1);}
  if(land<1.&&uLava<=0.){vec3 V=-rd,No=N;
    // close up, wind waves break the sun's glint into sparkles
    float kw=smoothstep(2e-4,2e-5,fp);if(kw>0.){vec3 wq=q*3e4+vec3(uTime*.6,0.,uTime*.4);float w0=n3(wq),wx=n3(wq+T1*.35),wy=n3(wq+T2*.35);
      No=normalize(N-(T1*(wx-w0)+T2*(wy-w0))*kw*.6);}
    vec3 H=normalize(uSun+V);float fr=.02+.98*pow(1.-max(dot(No,V),0.),5.);
    col+=(1.-land)*(Ts*pow(max(dot(No,H),0.),mix(350.,900.,kw))*mix(12.,30.,kw)*fr+fr*vec3(.12,.22,.4)*smoothstep(-.1,.2,sd));}
  float night=smoothstep(.04,-.15,sd);
  if(uCity>0.){float c=smoothstep(.55,.72,fbm(q*30.,3))*smoothstep(.45,.8,n3(q*420.));
    if(fp<3e-4)c*=mix(1.,smoothstep(.35,.75,n3(q*6000.))*1.8,smoothstep(3e-4,6e-5,fp));   // streets and blocks resolve close up
    col+=land*night*c*vec3(1.,.62,.28)*uCity*2e-5;}
#if CLOUDS
  vec3 qc=spin(N,uTime*.045);float cw2=mix(.22,.1,smoothstep(.003,.0003,fp)),cov=smoothstep(uCloud,uCloud+cw2,fbmD(qc*4.,OCT,clamp(log2(1./(4.*2.5*fp))/log2(2.07),float(OCT),15.),2.5)+(fbm(qc*130.,2)-.5)*.32*(1.-smoothstep(.03,.12,length(uEye)-1.)));
  float sh=smoothstep(uCloud,uCloud+.22,fbm(spin(normalize(p+uSun*.012),uTime*.045)*4.,max(OCT-2,2)));
  col*=1.-.65*sh;
  vec3 cl=vec3(.92)*(Ts*(max(sd,0.)*.85+.15*smoothstep(-.1,.2,sd))/PI+amb*1.5);
  col=mix(col,cl,cov*(1.-volW));   // near the ground the clouds become real volumes (cloudVol)
  col=mix(col,vec3(.95)*(Ts*(max(sd,0.)*.8+.2*smoothstep(-.1,.2,sd))/PI+amb),cirrusA(N)*(1.-volW)*(1.-cov));
#endif
  return col;
}
#endif
#if RINGS
float ringA(float r){if(r<uRin||r>uRout)return 0.;float x=(r-uRin)/(uRout-uRin);
  float a=.25+.75*fbm(vec3(r*30.,1.3,2.7),4);a*=smoothstep(0.,.03,x)*smoothstep(1.,.95,x);
  a*=1.-.92*smoothstep(.025,0.,abs(x-.62));a*=mix(.35,1.,smoothstep(0.,.2,x));return clamp(a,0.,.95);}
vec3 ringCol(vec3 q,vec3 rd){float r=length(q);
  vec3 c=mix(uRingC,uRingC*.62,fbm(vec3(r*18.,0,0),3));
  float lit=sph(q,uSun,1.).y>0.?0.:1.,ph=dot(rd,uSun);
  return c*SUNI*lit*(.45+1.2*pow(max(ph,0.),8.))*.12;}
#endif
#if KIND==1
vec3 giant(vec3 p,vec3 rd,float fp){
  vec3 N=normalize(p),ax=uAxis,ex=normalize(cross(ax,abs(ax.z)<.9?vec3(0,0,1):vec3(1,0,0))),ez=cross(ex,ax);
  float lat=dot(N,ax);vec3 l=spin(vec3(dot(N,ex),lat,dot(N,ez)),uTime*.05);
  float nd=clamp(log2(1./(3.*2.5*fp))/log2(2.07),float(OCT),14.),w=fbmD(l*vec3(3.,1.,3.)+vec3(0,lat*5.,0),OCT,nd,3.),band=lat*9.+w*1.7;
  vec3 c=mix(uP1,uP2,.5+.5*sin(band*3.1));
  c=mix(c,uP3,(.5+.5*sin(band*7.3+1.))*.55*smoothstep(.2,.8,fbmD(l*vec3(10.,36.,10.),3,nd-1.,2.)));
  vec3 sc=normalize(vec3(.6,-.35,.7));float ds=length((l-sc)*vec3(1.,2.2,1.))+.06*fbm(l*20.,3);
  c=mix(c,uP4,smoothstep(.24,.12,ds));
  float sh=1.;
#if RINGS
  float t=-dot(p,ax)/dot(uSun,ax);if(t>0.)sh=1.-ringA(length(p+uSun*t))*.9;
#endif
  vec3 Ts=lut(p*1.0005,uSun)*SUNI;
  return c*(Ts*max(dot(N,uSun),0.)/PI*sh+vec3(.002));
}
#endif
#if KIND==0&&CLOUDS
// volumetric clouds in a thin shell (about 4–20 km up), only while the camera is low enough to see them as volumes.
// Same coverage map as the flat cloud layer seen from orbit, billowed by a little 3D noise. One march per pixel;
// light toward the sun is estimated from the depth to the cloud top instead of a second march, so it stays cheap.
const float CB=1.0002,CT=1.001,CSIG=2600.;
vec4 cloudVol(vec3 ro,vec3 rd,float tMax,out float tv){tv=1e9;
  vec2 to=sph(ro,rd,CT);if(to.y<=0.)return vec4(0,0,0,1);
  vec2 tb=sph(ro,rd,CB);float r0=length(ro),t0=max(to.x,0.),t1=min(to.y,tMax);
  if(r0>CB){if(tb.x>0.)t1=min(t1,tb.x);}else if(tb.y>0.)t0=max(t0,tb.y);
  t1=min(t1,t0+.06);if(t1<=t0)return vec4(0,0,0,1);tv=t0;
  const int NS=ASTEPS>16?16:ASTEPS;float dt=(t1-t0)/float(NS),T=1.,j=rnd(),mu=dot(rd,uSun);vec3 L=vec3(0);
  float ph=mix(hgPh(mu,.7),hgPh(mu,-.25),.35)*4.*PI;   // forward-scattering silver lining, normalized so isotropic = 1
  const float SH=.00025;   // one look toward the sun for the billows' own shading
  for(int i=0;i<NS;i++){vec3 p=ro+rd*(t0+(float(i)+j)*dt);float r=length(p);vec3 Np=p/r;
    vec3 qc=spin(Np,uTime*.045);
    float c=smoothstep(uCloud,uCloud+.16,fbm(qc*4.,min(OCT,5))+(fbm(qc*130.,2)-.5)*.32);if(c<.01)continue;   // weather systems, then cloud fields
    float y=(r-CB)/(CT-CB),top=.25+.75*c,prof=smoothstep(0.,.1,y)*(1.-smoothstep(top*.5,top,y));if(prof<.01)continue;
    vec3 p3=spin(p,uTime*.045)*1900.;   // cumulus billows, a few km across
    float d=max(c*prof*(.2+1.2*fbm(p3,2))-.16,0.)*2.6*volW;if(d<=0.)continue;
    float dS=max(c*prof*(.2+1.2*n3(p3+spin(uSun,uTime*.045)*SH*1900.))-.16,0.)*2.6;
    float ls=max(dot(Np,uSun),.06),od=CSIG*(.45*c*max(top*(CT-CB)-(r-CB),0.)/ls+dS*SH);
    vec3 Ts=lut(p,uSun)*SUNI;float up=smoothstep(-.15,.25,dot(Np,uSun));
    vec3 Ls=Ts*(exp(-od)+.3*exp(-od*.12))*ph*(.9/(4.*PI))*2.5+vec3(.5,.6,.78)*SUNI*.035*up*(.4+.6*y);
    float a=exp(-d*CSIG*dt);L+=T*Ls*(1.-a);T*=a;if(T<.02)break;}
  return vec4(L,T);}
#endif
// another planet of the system: simple surface or bands, lit by the star (a point at uSun*uStarD), with an air glow at the rim
vec3 bodyCol(int i,vec3 p,vec3 rd){vec4 A=uBodA[i],Bc=uBodB[i],C=uBodC[i];vec3 c=uBod[i].xyz,N=normalize(p-c),L=normalize(uSun*uStarD-c);
  float nl=max(dot(N,L),0.),fi=float(i);vec3 alb;
  if(A.w<.5){float h=fbm(N*2.5+fi*7.,4);alb=mix(A.rgb,Bc.rgb,smoothstep(.46,.56,h));}
  else{float b=N.y*7.+fbm(N*vec3(2,8,2)+fi*3.,3)*1.6;alb=mix(A.rgb,Bc.rgb,.5+.5*sin(b*3.));}
  vec3 col=alb*SUNI*nl/PI;float rim=pow(1.-max(dot(N,-rd),0.),3.);col+=C.rgb*C.w*SUNI*.06*rim*smoothstep(-.25,.35,dot(N,L));
  return col;}
vec3 planetRay(vec3 ro,vec3 rd,out float d0){
  d0=1e4;float sd=dot(rd,uSun);
  // the sun's disk at its true radiance: its irradiance spread over its solid angle (5.97e-4 sr here), ~17 stops above the lit ground
  vec3 col=stars(rd)+SUNI*uSunK*smoothstep(uSunC0,uSunC1,sd);
  float tS=1e9;
  for(int i=0;i<NMOON;i++){vec2 tm=sph(ro-uMoons[i].xyz,rd,uMoons[i].w);if(tm.x>0.&&tm.x<tS){tS=tm.x;col=moonCol(i,ro+rd*tm.x,rd);}}
  for(int i=0;i<NBOD;i++){vec2 tb=sph(ro-uBod[i].xyz,rd,uBod[i].w);if(tb.x>0.&&tb.x<tS){tS=tb.x;col=bodyCol(i,ro+rd*tb.x,rd);}
    float rw=uBodB[i].w;if(rw>0.){vec3 an=normalize(uBodN[i].xyz),oc=ro-uBod[i].xyz;float tr=-dot(oc,an)/dot(rd,an);
      if(tr>0.&&tr<tS){float r=length(oc+rd*tr)/uBod[i].w;if(r>1.3&&r<rw){float a=(.35+.5*fbm(vec3(r*25.,1,2),3))*smoothstep(1.3,1.4,r)*smoothstep(rw,rw-.1,r);
        vec3 L=normalize(uSun*uStarD-uBod[i].xyz);col=mix(col,uBodA[i].rgb*SUNI*.1*(.5+.5*abs(dot(L,an))),a);}}}}
#if KIND==0
  float tg=dispW>0.?terrainHit(ro,rd,tS<1e9?tS:1e4):sph(ro,rd,1.).x;vec2 tp=vec2(tg,0.);
#else
  vec2 tp=sph(ro,rd,1.);
#endif
  if(tp.x>0.&&tp.x<tS){tS=tp.x;vec3 p=ro+rd*tp.x;
    float fp=tp.x*2.*uTanF/min(uView.z,uView.w)/max(-dot(rd,normalize(p)),.2);   // pixel footprint on the ground
#if KIND==0
    col=rocky(p,rd,fp);
#elif KIND==1
    col=giant(p,rd,fp);
#endif
  }
#if KIND==0&&CLOUDS
  if(volW>0.){float tm=tS<1e9?tS:1e4,mu=dot(rd,uSun),tz[3];vec4 lz[3];
    lz[0]=cloudVol(ro,rd,tm,tz[0]);
    for(int k=1;k<3;k++){float R=k==1?1.00118:1.0019;vec2 sr=sph(ro,rd,R);float t=length(ro)>R?sr.x:sr.y;tz[k]=1e9;lz[k]=vec4(0,0,0,1);
      if(t>0.&&t<tm){vec3 p=ro+rd*t;float a=(k==1?altoA(p/R):cirrusA(p/R))*volW*(1.-smoothstep(.06,.16,t));
        if(a>0.){tz[k]=t;lz[k]=vec4(sheetLit(p,mu)*a,1.-a);}}}
    // composite the three decks from the farthest to the nearest
    for(int n=0;n<3;n++){int b=-1;float bt=-1.;for(int k=0;k<3;k++)if(tz[k]<1e8&&tz[k]>bt){bt=tz[k];b=k;}
      if(b<0)break;col=col*lz[b].a+lz[b].rgb;tz[b]=1e9;}}
#endif
  if(tS<1e9)d0=tS;
  vec2 ta=sph(ro,rd,uRa);
  if(ta.y>0.){float t0=max(ta.x,0.),t1=min(ta.y,tS);if(t1>t0){vec3 tr;vec3 sc=atmos(ro,rd,t0,t1,tr);col=col*tr+sc;}}
#if RINGS
  float tr=-dot(ro,uAxis)/dot(rd,uAxis);
  if(tr>0.&&tr<tS){vec3 q=ro+rd*tr;float a=ringA(length(q));if(a>0.){col=mix(col,ringCol(q,rd),a);d0=min(d0,tr);}}
#endif
  return col;
}
#if KIND==2
vec4 disk(vec3 q,vec3 v){
  float r=length(q.xz),x=(r-uRin)/(uRout-uRin);
  float T=pow(uRin/r,.75)*pow(max(1.-sqrt(uRin/r)*.98,0.),.25)/.49;
  float vel=min(sqrt(.5*r)/(r-1.),.75),gam=inversesqrt(1.-vel*vel);
  float ct=dot(normalize(vec3(-q.z,0.,q.x)),-normalize(v));
  float g=mix(sqrt(1.-1./r),sqrt(1.-1./r)/(gam*(1.-vel*ct)),uDop);
  float a=-uTime*vel/r*4.;vec2 rq=mat2(cos(a),-sin(a),sin(a),cos(a))*q.xz;
  float n=fbm(vec3(rq*.9,r*2.6),5);
  float dens=smoothstep(0.,.05,x)*smoothstep(1.,.45,x)*(.2+1.3*n*n);
  float To=T*g;
  vec3 c=bb(uDiskT*To)*pow(To,4.)*uDisk*dens*5.;
  return vec4(c,clamp(dens*1.5,0.,.97));
}
vec3 bhRay(vec3 ro,vec3 rd){
  float b=length(cross(ro,rd));
  if(b>22.){vec3 toC=normalize(-ro+rd*dot(ro,rd));return stars(normalize(rd+toC*(2./b)));}
  vec3 pos=ro,v=rd,col=vec3(0);float trn=1.;
  vec3 hv=cross(pos,v);float h2=dot(hv,hv);
  for(int i=0;i<BHSTEPS;i++){
    float r2=dot(pos,pos),r=sqrt(r2);
    if(r<1.){trn=0.;break;}
    if(r>40.&&dot(pos,v)>0.)break;
    float dt=clamp((r-1.)*.16+.012,.012,2.5);
    vec3 np=pos+v*dt;v+=-1.5*h2*pos/(r2*r2*r)*dt;
    if(pos.y*np.y<0.){float f=pos.y/(pos.y-np.y);vec3 q=mix(pos,np,f);float rq=length(q.xz);
      if(rq>uRin&&rq<uRout){vec4 d=disk(q,v);col+=trn*d.rgb;trn*=1.-d.a;if(trn<.01)break;}}
    pos=np;
  }
  if(trn>.01)col+=trn*stars(normalize(v));
  return col;
}
#endif
void main(){
  uvec2 px=uvec2(gl_FragCoord.xy);st=px.x*1973u+px.y*9277u+uFrame*26699u;pcg();
  volW=1.-smoothstep(.02,.06,length(uEye)-1.);dispW=1.-smoothstep(.012,.035,length(uEye)-1.);
  vec3 ro=uEye,rd,c;float d0=1e4;bool camOK=camRay(gl_FragCoord.xy-.5+vec2(rnd(),rnd()),ro,rd);
#if KIND==2
  c=bhRay(ro,rd);
#else
  c=planetRay(ro,rd,d0);
#endif
#if KIND!=2
  // lens glare around the sun: a fraction uGlare of its light, spread by a normalized two-lobe point-spread function
  if(uGlare>0.){float sd=max(dot(rd,uSun),0.);bool vis=sph(ro,uSun,1.).x<0.;for(int i=0;i<NMOON;i++)vis=vis&&sph(ro-uMoons[i].xyz,uSun,uMoons[i].w).x<0.;for(int i=0;i<NBOD;i++)vis=vis&&sph(ro-uBod[i].xyz,uSun,uBod[i].w).x<0.;
    if(vis)c+=uGlare*SUNI*vec3(1.,.96,.9)*(.6*601.*pow(sd,600.)+.4*61.*pow(sd,60.))/(2.*PI);}
#endif
  c=camOK?min(c,vec3(3e4)):vec3(0);
  float blend=uBlend;vec3 hist=vec3(0);
  if(uReproj==1){
    vec3 dv=uEye+rd*d0-uPEye;float z=dot(dv,uPFw);blend=1.;
    if(z>.001){vec2 sp=vec2(dot(dv,uPRt),dot(dv,uPUp))/z/(2.*uTanF)*min(uRes.x,uRes.y)+.5*uRes;
      if(all(greaterThan(sp,vec2(1)))&&all(lessThan(sp,uRes-1.))){vec4 h=texture(uPrev,sp/uRes);float pd=length(dv);
        if(abs(h.a-pd)<.02*pd+.002){hist=h.rgb;blend=uBlend;}}}
  }else hist=texelFetch(uPrev,ivec2(px),0).rgb;
  o=vec4(mix(hist,c,blend),d0);
}`;};

// transmittance table: x = cos(sun zenith), y = sqrt(altitude); 40-step optical depth march
const lutFS=`#version 300 es
precision highp float;uniform vec3 uBR,uBMe,uBO;uniform float uHR,uHM,uRa;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/vec2(256.,64.);float w=uRa-1.,h=uv.y*uv.y*w,mu=uv.x*2.-1.;
  vec3 p=vec3(0,1.+h,0),d=vec3(sqrt(1.-mu*mu),mu,0);float b=dot(p,d),c=dot(p,p)-1.;
  if(b<0.&&b*b-c>0.){o=vec4(0,0,0,1);return;}
  float tE=-b+sqrt(b*b-(dot(p,p)-uRa*uRa)),dt=tE/40.;vec3 tau=vec3(0);
  for(int i=0;i<40;i++){float hh=length(p+d*(float(i)+.5)*dt)-1.;
    tau+=(uBR*exp(-hh/uHR)+uBMe*exp(-hh/uHM)+uBO*max(0.,1.-abs(hh-.25*w)/(.15*w)))*dt;}
  o=vec4(exp(-tau),1);}`;

