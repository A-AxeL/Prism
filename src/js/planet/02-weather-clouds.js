/* ---- clouds and weather ----
   The weather lives in cube maps (coverage, cloud type, precipitation, cirrus) baked from the climate bands, the moving
   storms and wind-carried noise. They are baked ahead of the world clock and cross-faded, so the weather keeps changing:
   fronts and showers drift with the trade winds and the westerlies, lows spin up, travel and fill, hurricanes form over
   warm seas. The cloud volumes are shaped from the weather with tileable 3D noise (Worley and Perlin, made once on the
   CPU) and ray marched in the air pass, lit by the sun through the cloud above and by the sky. */
const peClouds=()=>{const co=SCENES[S.scene].cosmos;return !!(co&&(co.clouds||co.dust)&&S.clouds);};
// a dusty world (Mars): the weather lifts dust instead of making water clouds
const peDust=()=>{const co=SCENES[S.scene].cosmos;return !!(co&&co.dust&&!co.clouds&&S.clouds);};
// mean wind toward the east (m/s) at cloud level by latitude: trade winds, westerlies, polar easterlies
const peWindU=la=>{const a=Math.abs(la);return -7*Math.exp(-(((a-13)/11)**2))+12*Math.exp(-(((a-45)/12)**2))-3.5*Math.exp(-(((a-75)/9)**2));};
const PE_WINDGL=`float windU(float la){float a=abs(la);return -7.*exp(-sq((a-13.)/11.))+12.*exp(-sq((a-45.)/12.))-3.5*exp(-sq((a-75.)/9.));}
vec3 rotY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z);}
`;
// cloud functions shared by the air pass and the ground (shadows, wet ground)
const peGLCLD=()=>`#define DUST ${peDust()?1:0}
`+PE_GLCLD;
const PE_GLCLD=`
uniform samplerCube uWxA,uWxB;uniform highp sampler3D uCS,uCD;uniform float uCov,uWxM,uFlowA,uFlowC,uLT,uCSL,uCDL;uniform vec4 uCOff,uCOff2,uCyc[12],uCycS[12];
`+PE_WINDGL+`
// the weather between two bakes of the world clock
vec4 WX(vec3 p){vec3 d=normalize(p);return mix(texture(uWxA,d),texture(uWxB,d),uWxM);}
// the eye of a hurricane is a few tens of km across: cleared analytically, finer than the weather cube
float eye(vec3 d){float e=1.;for(int i=0;i<12;i++){if(uCycS[i].y<.5||uCycS[i].z<=0.)continue;float x=length(d-uCyc[i].xyz)*uRkm;e*=smoothstep(uCycS[i].z*.55,uCycS[i].z,x);}return e;}
// cloud deck by type: 0 stratus (low, flat), .5 cumulus (heaps), 1 cumulonimbus (towers to ~12 km, anvil on top)
void deck(float ty,out float b,out float t){b=mix(.5,1.,smoothstep(0.,.35,ty));
  t=b+.4+1.4*smoothstep(.2,.55,ty)+2.6*smoothstep(.5,.75,ty)+6.6*smoothstep(.7,.95,ty);}   // ~1 km stratus and fair-weather heaps, 4-5 km congestus, 12 km thunderheads
#if !DUST
// the decks ride over high ground: air rising off a plateau condenses about as high above it as air rising off the sea
// does above the sea (the third weather channel is the ground's height, smoothed over tens of km, in units of 6 km)
void deckW(vec4 wx,out float b,out float t){deck(wx.g,b,t);float z=wx.b*5.4;b+=z;t+=z;}
// how hard it rains: under thick, deep decks
float wxPr(vec4 wx){return smoothstep(.55,.85,wx.r)*mix(.25,1.,wx.g);}
#endif
// how much of the noise's spread survives at each mip level (measured on the texture): the averaged field is stretched
// back to full contrast, so heaps keep their share of the sky at every distance instead of melting away
float cRet(float l){const float R[7]=float[7](1.,.952,.831,.587,.285,.155,0.);l=clamp(l,0.,5.99);int i=int(l);return mix(R[i],R[i+1],l-float(i));}
// the billow field at a point (km, in the frame that drifts with the wind): cells of a few km over clumps of tens of km,
// both evened out to a flat histogram. Mip levels follow the footprint fp (km); sd is the spread of the part too fine to
// resolve, which becomes partial cover. The field rises through the texture at about a metre a second, the speed of the
// air in a fair-weather thermal, so heaps grow at their tops and fade over a quarter to half an hour, as real ones do
// (the offsets are worked out on the CPU in double precision, modulo the texture's period)
float cShape(vec3 pk,float fp,float ty,out float sd){
  // small heaps (cells under a km) for shallow cumulus and stratocumulus, big ones (2-3 km) for towering clouds
  // (two fixed scales blended: a scale that varied with the weather would smear the noise across the whole planet)
  float sz=smoothstep(.45,.8,ty),l=log2(max(fp,.01)/.125),ls=l+1.19,lm=log2(max(fp,.01)/.625);
  float cb=textureLod(uCS,pk*(1./8.)+vec3(0.,uCOff.x,0.),max(l+uCSL,0.)).a,cs=textureLod(uCS,pk*(1./3.5)+vec3(.5,uCOff.y,.2),max(ls+uCSL,0.)).a;
  l=mix(ls,l,sz);float c=mix(cs,cb,sz),m=textureLod(uCS,pk*(1./40.)+vec3(.3,uCOff.z,.1),max(lm+uCSL,0.)).a;
  float gc=1.-smoothstep(2.5,4.,l),gm=1.-smoothstep(2.5,4.,lm);sd=.393*length(vec2(.65*(1.-gc),.35*(1.-gm)))+.015;
  // blending the two scales narrows the spread: widen it back
  float bw=inversesqrt(sz*sz+(1.-sz)*(1.-sz));
  return .5+1.36*(.65*(c-.5)*bw*gc/max(cRet(l),.25)+.35*(m-.5)*gm/max(cRet(lm),.25));}
// mesoscale cells (tens of km): closed cells of low decks (cloud cells parted by thin clear lanes), open cells of
// cumulus (rings of cloud around clear middles), as seen over the oceans from orbit
float cMeso(vec3 pk,float fp,float ty){float l=log2(max(fp,.01)/2.5);if(l>4.)return 0.;
  float z=textureLod(uCS,pk*(1./160.)+vec3(.6,.2,.9),max(l+uCSL,0.)).g,cl=smoothstep(.12,.42,z)-.5,op=.5-smoothstep(.3,.75,z);
  return mix(cl,op,smoothstep(.3,.5,ty))*(1.-smoothstep(.75,.9,ty))*(1.-smoothstep(2.5,4.,l));}
float cProf(float y,float ty){float pr=smoothstep(0.,.025,y)*(1.-smoothstep(mix(.35,.8,ty),1.,y));
  return mix(pr,max(pr,smoothstep(.78,.92,y)*(1.-smoothstep(.95,1.,y))*1.15),smoothstep(.75,.95,ty));}   // with the anvil of a storm cell
// a point in the frame of the drifting small-scale cloud field (km)
vec3 cFrame(vec3 p){return rotY(p,-uFlowA)*uRkm;}
#if DUST
// ---- a dusty world (Mars): the weather lifts dust instead of making water clouds. Channels: r how much dust a storm lifts,
// g how much of it towers in billowing fronts, b the ground's height ((km+8)/30, valleys included), a unused ----
float dGround(vec4 wx){return wx.b*30.-8.;}
float dStr(vec4 wx){return clamp(wx.r+uCov*.5,0.,1.);}
void deckW(vec4 wx,out float b,out float t){float S=dStr(wx),g=dGround(wx);b=g-.6;t=g+1.5+9.5*S;}
float wxPr(vec4 wx){return 0.;}
float eyeW(vec3 d,vec4 wx){return 1.;}
const float AC0=60.,AC1=61.;
float acCov(vec3 p,vec4 wx,float fp){return 0.;}
float acDen(vec3 p,float hk,float ac,float fp){return 0.;}
// dust density (in the clouds' units: 55 per km of extinction at 1). Inside a storm the dust thins upward over a few km
// and is lumpy over tens of km (a column holds an optical depth of about 5 in a strong one); at its fronts it towers in
// billows like a thunderhead's, a brown wall rolling over the land
float cDen(vec3 p,float hk,vec4 wx,bool det,float fp){
  float S=dStr(wx);if(S<.01)return 0.;float g=dGround(wx),h=hk-g;if(h<-.6)return 0.;h=max(h,0.);
  float H=1.2+3.*S,top=1.5+9.5*S;if(h>top)return 0.;
  vec3 pk=cFrame(p);float sd,lump=cShape(pk*.4,fp,.9,sd),body=S*exp(-h/H)*(.4+1.2*lump)*smoothstep(top,top*.6,h)*(5./H);
  // close to the ground the wind drags streamers of dust along
  body*=1.+.6*smoothstep(.3,0.,h)*(textureLod(uCD,pk*vec3(.15,.6,.15)+vec3(0.,uCOff.w,0.),max(log2(fp/.2)+uCDL,0.)).g-.4);
  float F=wx.g*S,wall=0.;
  if(F>.03){float y=h/(1.+7.*F),pr=smoothstep(0.,.04,y)*(1.-smoothstep(.35,1.,y)),sh=cShape(pk,fp,.85,sd),x=sh*pr-(1.-F*.9),s=x/max(F*.5,.04);
    if(det&&s>0.&&fp<.8){float w0=textureLod(uCD,pk*(1./1.6)+vec3(0.,uCOff.w,0.),max(log2(fp/.05)+uCDL,0.)).r;s-=(1.-w0)*(1.-w0)*.5*(1.-smoothstep(.3,1.,s));}
    wall=clamp(s*3.,0.,1.)*7.;}
  return (body+wall)/55.;}
// the sun through the dust column above a point
float cShadow(vec3 p,float fp){float r=length(p),hk=(r-1.)*uRkm;vec4 wx=WX(p);float S=dStr(wx);if(S<.01)return 1.;
  float h=max(hk-dGround(wx),0.),H=1.2+3.*S,mu=max(dot(p/r,uSun),.04);return exp(-.8*5.*S*exp(-h/H)/mu);}
// light from the sky under the dust: the blue-brown sky dims, and the sunlight the dust takes from the beam comes down
// scattered, reddened by the dust's own colour
vec3 cAmb(vec3 p,float mus,vec3 Ek){vec4 wx=WX(p);float S=dStr(wx);if(S<.01)return Ek;
  float r=length(p),h=max((r-1.)*uRkm-dGround(wx),0.),H=1.2+3.*S,tau=5.*S*exp(-h/H),Ts=exp(-tau/max(mus,.05));
  return Ek*exp(-tau*.45)+uSunI*max(mus,0.)*(1.-Ts)*vec3(.92,.72,.5)*.55;}
#else
// cloud density (scaled so 55 per km is the extinction) at a point hk km up. Shaped the way the shader packs for games
// shape theirs (Nubis, Photon): the heap's outline from the coverage, its edge eaten into billows by finer Worley noise
// curled by a smooth flow, wisps near the flat base, cauliflower above, then a steep rise inside the outline so the
// edges are crisp and the heaps solid
float cDen(vec3 p,float hk,vec4 wx,bool det,float fp){
  float cov=clamp(wx.r+uCov,0.,1.);if(cov<.01)return 0.;
  float ty=wx.g,b,t;deckW(wx,b,t);float y=(hk-b)/(t-b);if(y<=0.||y>=1.)return 0.;
  vec3 pk=cFrame(p);cov=clamp(cov+.35*cMeso(pk,fp,ty)*cov*(1.-cov)*4.,0.,1.);
  float prof=cProf(y,ty),sd,sh=cShape(pk,fp,ty,sd),x=sh*prof-(1.-cov);
  // resolved: s is 0 on the outline of a heap and rises inward over a hundred metres or so. The detail eats into that
  // margin (billows), then the density climbs steeply from the eaten outline: crisp edges, solid heaps
  float s=x/max(cov*.6,.04);
  if(det&&s>0.&&fp<.8){float fd=1.-smoothstep(.25,.8,fp),ld=max(log2(fp/.034)-.5+uCDL,0.);
    vec3 q=pk*(1./1.1)+vec3(0.,uCOff.w,0.),cw=textureLod(uCD,q*.31,0.).gba-.5;
    // billows a few hundred metres across and their tenth: curled most near the base, where the rising air churns
    float w0=textureLod(uCD,q+cw*mix(.4,.15,y),ld).r,w1=textureLod(uCD,q*3.3+cw*1.3,ld+1.7).r;
    // near the flat base the billows thin into wisps; above, the gaps between them are eaten away: cauliflower
    float hb=smoothstep(0.,.06,y),e0=mix(w0,1.-w0,hb),e1=mix(w1,1.-w1,hb);
    s-=(.6*e0*e0+.3*e1)*fd*(1.-smoothstep(.3,1.2,s))*mix(.5,1.,hb);}
  float d=clamp(s*mix(4.,5.,smoothstep(0.,.25,y))*mix(1.,.35,smoothstep(.15,.8,fp)),0.,1.);
  d=1.-pow(1.-d,3.);
  d*=.4+.6*cov;
  // unresolved: the fraction f of the footprint that is cloud, as a density whose optical depth through the deck lets 1-f of the light through
  float x1=sh-(1.-cov),f=clamp((x1+sd)/(2.*sd),0.,1.),w=smoothstep(.06,.25,sd);
  if(w>0.)d=mix(d,-log(1.-.97*f)/(55.*max(t-b,.3)*.55)*prof,w);
  return d;}
float eyeW(vec3 d,vec4 wx){return wx.g>.6?eye(d):1.;}
// altocumulus: a thin layer of small heaps near 4.6 km packed into cells (a "mackerel sky"), where the air aloft is moist
// (with the cirrus) and in patches hundreds of km across; hidden where thunderstorms take over the sky
const float AC0=4.4,AC1=4.85;
float acCov(vec3 p,vec4 wx,float fp){vec3 q=rotY(p,-uFlowC)*uRkm;float n=textureLod(uCD,q*(1./1200.)+vec3(.2,uCOff2.x,.8),max(log2(fp/37.5)+uCDL,0.)).b;
  return .75*smoothstep(.1,.5,(wx.a-.42)*1.5+(n-.5)*1.3+uCov*.6)*(1.-smoothstep(.6,.9,wx.r)*smoothstep(.55,.8,wx.g));}
float acDen(vec3 p,float hk,float ac,float fp){float y=(hk-AC0)/(AC1-AC0);if(y<=0.||y>=1.)return 0.;
  vec3 q=cFrame(p)*(1./4.)+vec3(.37,uCOff.y*.7,.11);q.x*=.7;
  float l=log2(max(fp,.004)/(4./64.)),sh=textureLod(uCS,q,max(l+uCSL,0.)).a,prof=smoothstep(0.,.2,y)*(1.-smoothstep(.25,1.,y));
  float x=sh*prof-(1.-ac),s=x/max(ac*.5,.03);
  if(s>0.&&fp<.25){float w=textureLod(uCD,q*3.1+vec3(0.,uCOff.w,0.),max(log2(fp*3.1*32./4.)-.5+uCDL,0.)).r;s-=(1.-w)*(1.-w)*.6*(1.-smoothstep(.3,1.,s))*(1.-smoothstep(.1,.25,fp));}
  float d=clamp(s*4.,0.,1.);d=1.-pow(1.-d,3.);
  // too small to see one by one: their average
  return mix(d,ac*prof*.3,smoothstep(2.,4.,l))*.45;}
// light through the cloud deck straight above toward the sun (one look, for cloud shadows on the ground and god rays)
float cShadow(vec3 p,float fp){float r=length(p),hk=(r-1.)*uRkm;if(hk>17.)return 1.;
  // look at the lower third of the deck over this point (decks ride over high ground)
  vec4 w0=WX(p);float b0,t0;deckW(w0,b0,t0);float hm=max(b0+.3*(t0-b0),hk+.05),rm=1.+hm/uRkm;
  vec2 s=sph(p,uSun,rm);float t=max(s.y,0.);vec3 q=p+uSun*t;vec4 wx=WX(q);float cov=clamp(wx.r+uCov,0.,1.),S=1.;
  if(cov>.01){float b,tp;deckW(wx,b,tp);vec3 qk=cFrame(q);cov=clamp(cov+.35*cMeso(qk,fp,wx.g)*cov*(1.-cov)*4.,0.,1.);
    float sd,sh=cShape(qk,fp,wx.g,sd),f=clamp((sh-(1.-cov)+sd+.015)/(2.*sd+.03),0.,1.);
    float k=smoothstep(b-.3,b+.2,hm+.01)*step(hk,tp)*eyeW(normalize(q),wx);
    S=mix(1.,mix(1.,exp(-max(cov,.3)*(tp-b)*5.),f),k);}
  // and the altocumulus higher up: dappled light
  if(hk<AC0){vec2 s2=sph(p,uSun,1.+4.6/uRkm);vec3 q2=p+uSun*max(s2.y,0.);float ac=acCov(q2,wx,fp);
    if(ac>.02)S*=1.-.55*clamp(acDen(q2,4.6,ac,max(fp,.05))*3.,0.,1.);}
  return S;}
// sky light on the ground under the clouds: the clear sky through the gaps, and under a deck the sunlight that seeps
// through it after many scatterings (diffuse transmittance of optical depth tau, about 1/(1+0.75(1-g)tau) with g=.85):
// a thin stratus deck passes a third of the sun, a thunderhead a few percent
vec3 cAmb(vec3 p,float mus,vec3 Ek){vec4 wx=WX(p);float cov=clamp(wx.r+uCov,0.,1.),b,tp;deckW(wx,b,tp);
  float tau=12.*cov*(tp-b),Td=1./(1.+.11*tau),fc=smoothstep(.12,.9,cov);
  return mix(Ek,uSunI*max(mus,0.)*Td*.8+Ek*.12,fc);}
#endif
`;
// the weather bake (pass 3 of the terrain program), the static geography it reads (pass 5), the weather at one point (pass 6)
const peGLWX=()=>`#define DUST ${peDust()?1:0}
`+PE_GLWX;
const PE_GLWX=`
uniform samplerCube uGeo,uWpA,uWpB,uMacW;uniform float uWT,uWpM,uDustA;uniform vec4 uCyc[12],uCycS[12];
`+PE_WINDGL+`
// a point carried back along the zonal wind over tau seconds
vec3 wBack(vec3 P,float tau){float la=asin(clamp(P.y,-1.,1.));return rotY(P,-windU(degrees(la))*tau/(uTP.w*1000.*max(cos(la),.15)));}
// the weather noise around a point (q: where the air there came from; cy: which cycle of the flow, a fresh noise field each)
vec3 wxNoise(vec3 P,vec3 q,float cy,float la){
  // the winds shear everything east-west, most in the jet streams: cloud masses become streaks and bands
  vec3 e=normalize(cross(vec3(0,1,0),q)+vec3(1e-5,0,0)),o=vec3(.173,.071,-.119)*cy;
  q+=e*(octW(uK.x,33,wk(q-P+o,uK.x)).x*.07+.035*sin(radians(la)*7.));
  vec3 w=q-P+o;float n=0.,s=1.,nn=0.;
  for(int i=0;i<8;i++){int k=uK.x+1+i;n+=s*octW(k,30,wk(w,k)).x;nn+=s;s*=.6;}n/=nn*.5;
  return vec3(n,octW(uK.x+3,31,wk(w,uK.x+3)).x,octW(uK.x+2,32,wk(w,uK.x+2)).x);}
vec4 weather(vec3 P){
  vec4 G=texture(uGeo,P);float land=G.x,cl=G.y;
  float la=degrees(asin(clamp(P.y,-1.,1.))),lt=abs(la);vec3 q=P;float cyc=0.,trop=0.,arm=0.;
  for(int i=0;i<12;i++){float rad=uCyc[i].w;if(rad<=0.)continue;vec3 c=uCyc[i].xyz;float hs=sign(uCycS[i].x),tr=uCycS[i].y;
    // spiral bands: a comma cloud with its trailing cold front for a mid-latitude low, three tight arms for a hurricane
    vec3 t1=normalize(cross(c,vec3(0,1,0))+vec3(0,0,1e-4)),t2=cross(c,t1),v=P-c*dot(P,c);float rho=length(v)/rad,th=atan(dot(v,t2),dot(v,t1))*hs;
    float na=tr>.5?3.:1.,sp=th*na+(tr>.5?3.2:2.4)*na*log(rho+.04),bd=pow(.5+.5*cos(sp),tr>.5?3.:5.);
    arm=max(arm,bd*smoothstep(tr>.5?1.3:2.4,.35,rho)*smoothstep(.04,.2,rho));
    // and the whole field turns around the center, most near the middle: bands wind into spirals
    float f=exp(-sq(length(q-c)/rad)),a=uCycS[i].x*f;
    q=q*cos(a)+cross(c,q)*sin(a)+c*dot(c,q)*(1.-cos(a));cyc=max(cyc,f*(1.-tr)*abs(uCycS[i].x)/1.5);trop=max(trop,f*tr);}
  // the noise is carried by the wind (a flow map: two phases half a cycle apart, each restarting from a fresh field while
  // the other has full weight), so showers and cloud masses drift east or west at the speed of their latitude's winds
  // and slowly change shape, never sheared without end
  float T=172800.,f0=fract(uWT/T),f1=fract(uWT/T+.5),w0=1.-abs(2.*f0-1.),w1=1.-w0;
  vec3 a=wxNoise(P,wBack(q,f0*T),floor(uWT/T),la),b=wxNoise(P,wBack(q,f1*T),floor(uWT/T+.5)+7.,la);
  vec3 N=(a*w0+b*w1)*inversesqrt(w0*w0+w1*w1);float n=N.x,n2=N.y,n3c=N.z;
  float itcz=exp(-sq((la-6.)/7.)),sub=exp(-sq((lt-25.)/8.)),mid=exp(-sq((lt-50.)/12.)),pol=smoothstep(62.,82.,lt),sea=land<0.?1.:0.;
  // cover: a narrow belt of tropical storms, clear subtropical highs (deserts under them), storm tracks and their fronts
  float c=.36+.3*itcz-.36*sub+.22*mid+.08*pol-.18*smoothstep(0.,2.,cl)*(.4+sub)+n*.27+arm*.5*(cyc+trop)+cyc*.3+trop*.45;
  c=smoothstep(.2,.85,c);
  // fair-weather cumulus dot the trade-wind oceans even under the highs
  c=max(c,.27*sea*smoothstep(.1,.6,sub+itcz*.5)*(.7+.3*n2));
  c*=clamp(uTC.z*1.2,0.,1.);
  // type: towering convection in the tropics, in hurricanes and in some mid-latitude storms; flat decks where air sinks
  float ty=clamp(.3+.55*itcz+trop+.4*mid*smoothstep(.3,1.5,n2)+.25*arm*cyc+.15*(1.-sea)*(1.-sub)-.3*sub*sea*smoothstep(.4,.8,c)-.15*pol+.1*n2,0.,1.);
  float ci=clamp(.3+.12*n3c+.3*itcz+.25*mid+.3*cyc+.3*arm*(cyc+trop),0.,1.);
  // the ground's height under the decks, averaged over some 60 km (from the coarse height cube, in km)
  vec3 e1=normalize(cross(P,abs(P.y)<.9?vec3(0,1,0):vec3(1,0,0))),e2=cross(P,e1);float z=0.,zr=0.,o=30./uTP.w;
  for(int i=0;i<9+uZ0;i++){vec2 g=vec2(i%3-1,i/3-1);float hz=texture(uMacW,P+(e1*g.x+e2*g.y)*o).r;z+=max(hz,0.);zr+=hz;}
#if DUST
  // dust storms: they rise where the wind is strong over loose ground (low plains and basins, the edges of the polar caps,
  // the south in its dusty season), drift with the winds, wind up in the passing lows, and grow into regional storms;
  // at their edges the dust billows up in towering fronts
  float low=smoothstep(.4,-1.2,land),capE=exp(-sq((lt-62.)/7.)),south=smoothstep(-10.,-45.,la);
  float sd=n*.5+.3*low+.22*capE+.12*south+.45*arm*cyc+.25*cyc+(uDustA-.5)*.6,S=smoothstep(.4,1.05,sd);S*=S;
  float F=smoothstep(.4,.7,n2)*smoothstep(.05,.3,S)*(1.-smoothstep(.7,1.,S));
  return vec4(S,F,clamp((zr/9.+8.)/30.,0.,1.),0.);
#endif
  return vec4(c,ty,clamp(z/9./6.,0.,1.),ci);}
`;
// tileable 3D noise for the cloud shapes, made once on the GPU. Shape (128³ on the PC preset, 64³ otherwise): Perlin-Worley
// (smooth gradient noise carved into billows by Worley cells), Worley octaves, and their blend evened out to a flat histogram,
// so a coverage c makes clouds over a fraction c of the sky. Detail (64³ or 32³): Worley billows, and a smooth vector field
// that curls them the way rising, churning air does
const PE_NGEN=`#version 300 es
precision highp float;precision highp int;
uniform float uN,uZ;uniform int uMode,uZ0;out vec4 o;
uint hsh(uvec3 c,uint s){uint h=(c.x*1597334677u)^(c.y*3812015801u)^(c.z*2798796415u)^(s*2654435761u);h^=h>>15;h*=2246822519u;h^=h>>13;h*=3266489917u;h^=h>>16;return h;}
vec3 rnd(vec3 c,float F,uint s){uvec3 u=uvec3(mod(c+F,F));return vec3(float(hsh(u,s)),float(hsh(u,s+101u)),float(hsh(u,s+202u)))*(1./4294967296.);}
// Worley (1 at a cell's point, 0 a cell away) and Perlin noise, F cells across the period
float wor(vec3 p,float F,uint s){vec3 q=p*F,i=floor(q),f=q-i;float b=9.;
  for(int z=-1;z<2+uZ0;z++)for(int y=-1;y<2+uZ0;y++)for(int x=-1;x<2+uZ0;x++){vec3 c=vec3(x,y,z),d=c+rnd(i+c,F,s)-f;b=min(b,dot(d,d));}
  return 1.-min(sqrt(b),1.);}
float gr(vec3 i,vec3 c,vec3 f,float F,uint s){return dot(normalize(rnd(i+c,F,s)-.5+1e-5),f-c);}
float per(vec3 p,float F,uint s){vec3 q=p*F,i=floor(q),f=q-i,u=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(mix(gr(i,vec3(0,0,0),f,F,s),gr(i,vec3(1,0,0),f,F,s),u.x),mix(gr(i,vec3(0,1,0),f,F,s),gr(i,vec3(1,1,0),f,F,s),u.x),u.y),
             mix(mix(gr(i,vec3(0,0,1),f,F,s),gr(i,vec3(1,0,1),f,F,s),u.x),mix(gr(i,vec3(0,1,1),f,F,s),gr(i,vec3(1,1,1),f,F,s),u.x),u.y),u.z);}
void main(){vec3 p=vec3(gl_FragCoord.xy,uZ+.5)/uN;
  if(uMode==0){float pf=clamp(per(p,4.,1u)*.55+per(p,8.,2u)*.3+per(p,16.,3u)*.15+.5,0.,1.);
    float wa=wor(p,4.,11u),wb=wor(p,8.,12u),wc=wor(p,16.,13u),wf=wa*.6+wb*.3+wc*.1,pw=clamp((pf-(1.-wf))/max(wf,.05)*.6+wf*.45,0.,1.);
    o=vec4(pw,wb,wc,pw*.55+wb*.3+wc*.15);}
  else{float w=wor(p,4.,21u)*.6+wor(p,8.,22u)*.28+wor(p,16.,23u)*.12;
    vec3 v=vec3(per(p,4.,31u),per(p,4.,32u),per(p,4.,33u))+.5*vec3(per(p,8.,34u),per(p,8.,35u),per(p,8.,36u));
    o=vec4(w,clamp(v*.6+.5,0.,1.));}}`;
// the noise sizes by preset: shape and detail
const peCloudN=()=>['pc','ultra','cinematic'].includes(S.preset)?[128,64]:[64,32];
function peCloudTex(){const [nS,nD]=peCloudN();if(PE.cs&&PE.csN===nS&&PE.cdN===nD)return;
  const t0=performance.now(),P=PE.ngP||(PE.ngP=prog(PE_NGEN));
  const make=(n,mode,flat)=>{const rt=peTex(gl.TEXTURE_2D,gl.RGBA32F,n,n,1,false),fb=peFB(),N=n*n*n,F=new Float32Array(N*4),sl=new Float32Array(n*n*4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,rt,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0,0,n,n);gl.useProgram(P.p);gl.uniform1f(P.u.uN,n);gl.uniform1i(P.u.uMode,mode);gl.uniform1i(P.u.uZ0,0);
    for(let z=0;z<n;z++){gl.uniform1f(P.u.uZ,z);gl.drawArrays(gl.TRIANGLES,0,3);gl.readPixels(0,0,n,n,gl.RGBA,gl.FLOAT,sl);F.set(sl,z*n*n*4);}
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(fb);gl.deleteTexture(rt);
    const B=new Uint8Array(N*4);for(let i=0;i<N*4;i++){const v=F[i]*255+.5;B[i]=v<0?0:v>255?255:v;}
    // evened out: each value becomes its rank among all of them (a 65536-bin histogram stands in for sorting)
    if(flat){const H=65536,h=new Uint32Array(H),bin=v=>Math.min(H-1,Math.max(0,Math.floor(v*H)));for(let i=0;i<N;i++)h[bin(F[i*4+3])]++;
      const c=new Float32Array(H);let a=0;for(let k=0;k<H;k++){c[k]=(a+h[k]*.5)/N;a+=h[k];}
      for(let i=0;i<N;i++)B[i*4+3]=Math.min(255,Math.floor(c[bin(F[i*4+3])]*256));}
    const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,t);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,n,n,n,0,gl.RGBA,gl.UNSIGNED_BYTE,B);
    gl.generateMipmap(gl.TEXTURE_3D);
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.REPEAT],[gl.TEXTURE_WRAP_T,gl.REPEAT],[gl.TEXTURE_WRAP_R,gl.REPEAT]])gl.texParameteri(gl.TEXTURE_3D,k,v);
    gl.bindTexture(gl.TEXTURE_3D,null);return t;};
  if(PE.cs){gl.deleteTexture(PE.cs);gl.deleteTexture(PE.cd);}
  PE.cs=make(nS,0,true);PE.cd=make(nD,1,false);PE.csN=nS;PE.cdN=nD;PE.cloudMs=Math.round(performance.now()-t0);}

/* ---- storms: mid-latitude lows ride the westerlies poleward and fill after a few days; hurricanes form over warm tropical
   seas, drift west with the trade winds, curve poleward and die over land or cool water. Each is a center, a size, a spin
   and a life; the weather bake winds the clouds around them. ---- */
const PE_NST=12;
const peSm=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
// a direction from latitude and longitude (longitude grows eastward: the way the planet turns)
const peDir=(la,lo)=>{const a=la*D2R,o=lo*D2R;return [-Math.cos(a)*Math.sin(o),Math.sin(a),Math.cos(a)*Math.cos(o)];};
function peLandAt(la,lo){const G=PE.geoC;if(!G)return false;const d=peDir(la,lo),[f,u,v]=peUV(d),n=G.n,i=Math.min(n-1,Math.floor((u+1)/2*n)),j=Math.min(n-1,Math.floor((v+1)/2*n));return G.a[(f*n*n+j*n+i)]>0;}
function peStormNew(g,r,trop,age){const hem=r()<.5?-1:1;let s;
  if(trop){for(let k=0;k<12;k++){s={la:hem*(8+r()*12),lo:r()*360};if(!peLandAt(s.la,s.lo))break;}
    Object.assign(s,{trop:true,life:(6+r()*6)*86400,rad:380+r()*240,sw:3.5+r()*1.5,eye:14+r()*16});}
  else s={la:hem*(36+r()*22),lo:r()*360,trop:false,life:(3+r()*4)*86400,rad:1000+r()*700,sw:1.1+r()*.9,eye:0};
  s.hem=hem;s.age=age*s.life;return s;}
function peStormsInit(g){const r=rng(9973+g.seed*31),L=[],k=g.wx.storm;PE.stR=r;
  const nm=Math.min(9,Math.round(8*k)),nt=g.TC[3]>.5&&g.TC[2]>.3&&g.TC[1]>-25?Math.min(PE_NST-nm,Math.round(3*k)):0;
  for(let i=0;i<nm;i++)L.push(peStormNew(g,r,false,r()));for(let i=0;i<nt;i++)L.push(peStormNew(g,r,true,r()*.8));
  PE.storms=L;}
// how a storm moves (m/s east, m/s poleward): steered by the winds of its latitude, drifting poleward
function peStormV(s){const a=Math.abs(s.la);
  return s.trop?[a<24?-6.5:peWindU(s.la)*.8+2,2+4*peSm(14,28,a)]:[peWindU(s.la)*1.1+3,2.2];}
function peStormsStep(g,dt){if(!PE.storms)return;const R=g.R*1000;
  for(const s of PE.storms){s.age+=dt;if(s.trop&&(Math.abs(s.la)>34||peLandAt(s.la,s.lo)))s.age+=dt*1.5;   // land and cool water starve a hurricane
    if(s.age>s.life||Math.abs(s.la)>78){Object.assign(s,peStormNew(g,PE.stR,s.trop,0));continue;}
    const [u,v]=peStormV(s);s.lo+=u*dt/(R*Math.max(Math.cos(s.la*D2R),.15))/D2R;s.la+=s.hem*v*dt/R/D2R;}}
// the storms as uniforms, looking ahead by dt seconds: center, size (planet radii), spin (signed by hemisphere), tropical, eye (km)
function peStormU(g,dt){const C=new Float32Array(PE_NST*4),V=new Float32Array(PE_NST*4);if(!PE.storms)return {C,V};const R=g.R*1000;
  PE.storms.forEach((s,i)=>{if(i>=PE_NST)return;const [u,v]=peStormV(s),la=s.la+s.hem*v*dt/R/D2R,lo=s.lo+u*dt/(R*Math.max(Math.cos(s.la*D2R),.15))/D2R,f=(s.age+dt)/s.life;
    const k=peSm(0,.22,f)*(1-peSm(.68,1,f));if(k<=.01)return;C.set([...peDir(la,lo),s.rad*(.55+.45*k)/g.R],i*4);V.set([s.sw*s.hem*k,s.trop?1:0,s.trop&&k>.55?s.eye:0,0],i*4);});
  return {C,V};}

/* ---- the weather over time: three cubes, the one being shown, the next, and one being baked a band at a time ---- */
let PE_WXN=512,PE_WXO=0;const PE_WXB=8;   // cube size (1024 on the PC preset; tests may set it); bands per face
try{const v=+localStorage.getItem('peWxN');if(v>=64)PE_WXO=v;}catch(e){}
// time between bakes: a quarter hour, or longer when time runs fast (so the baking keeps up)
const peWxDt=()=>Math.max(900,(S.timeSpeed||1)*.6);
// the direction of a cube-map texel (face f, s and t in -1..1), as the bake shader computes it
function peCubeDir(f,s,t){const d=f===0?[1,-t,-s]:f===1?[-1,-t,s]:f===2?[s,1,t]:f===3?[s,-1,-t]:f===4?[s,-t,1]:[-s,-t,-1],l=Math.hypot(...d);return d.map(x=>x/l);}
// the static geography the weather reads (land and sea, how far inland), once per world; and a small CPU copy of the land
function peGeo(g){if(PE.geoK===g.tKey)return;PE.geoK=g.tKey;const G=PE.P.TWX,b=peBases([0,0,0]);
  if(!PE.geo)PE.geo=peTex(gl.TEXTURE_CUBE_MAP,gl.RGBA16F,256,256,1,true);
  gl.useProgram(G.p);peTerrU(G.u,g);gl.uniform3iv(G.u.uOI,b.I);gl.uniform3fv(G.u.uOF,b.F);gl.uniform1i(G.u.uPass,5);gl.uniform1f(G.u.uSize,256);gl.uniform1f(G.u.uOffX,0);
  // every cube sampler of the program points at an empty unit while the geography cube is the target (no feedback loop)
  gl.activeTexture(gl.TEXTURE11);gl.bindTexture(gl.TEXTURE_CUBE_MAP,null);gl.activeTexture(gl.TEXTURE0);for(const k of ['uGeo','uWpA','uWpB','uMacW'])if(G.u[k])gl.uniform1i(G.u[k],11);
  gl.bindFramebuffer(gl.FRAMEBUFFER,PE.fbL);gl.viewport(0,0,256,256);
  for(let f=0;f<6;f++){gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_CUBE_MAP_POSITIVE_X+f,PE.geo,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.uniform1i(G.u.uFace,f);gl.drawArrays(gl.TRIANGLES,0,3);}
  const n=48,t=PE.geoT||(PE.geoT=peTex(gl.TEXTURE_2D,gl.RGBA32F,n*6,n,1,false)),a=new Float32Array(n*n*6),all=new Float32Array(n*6*n*4);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.uniform1f(G.u.uSize,n);
  for(let f=0;f<6;f++){gl.viewport(f*n,0,n,n);gl.uniform1i(G.u.uFace,f);gl.uniform1f(G.u.uOffX,f*n);gl.drawArrays(gl.TRIANGLES,0,3);}
  gl.readPixels(0,0,n*6,n,gl.RGBA,gl.FLOAT,all);
  // stored by the quadtree's own face coordinates, for lookups by direction
  for(let f=0;f<6;f++)for(let j=0;j<n;j++)for(let i=0;i<n;i++){const d=peCubeDir(f,(i+.5)/n*2-1,(j+.5)/n*2-1),[ff,u,v]=peUV(d),ii=Math.min(n-1,Math.floor((u+1)/2*n)),jj=Math.min(n-1,Math.floor((v+1)/2*n));a[ff*n*n+jj*n+ii]=all[(j*n*6+f*n+i)*4];}
  PE.geoC={n,a};gl.uniform1f(G.u.uOffX,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,null,0);}
// bake one band (or all) of a weather cube for world time t
function peWxBake(g,tex,t,band){const G=PE.P.TWX,b=peBases([0,0,0]),n=PE_WXN,h=n/PE_WXB,su=peStormU(g,t-PE.wt);PE.wxMacK=PE.macK;
  gl.useProgram(G.p);peTerrU(G.u,g);gl.uniform3iv(G.u.uOI,b.I);gl.uniform3fv(G.u.uOF,b.F);gl.uniform1i(G.u.uPass,3);gl.uniform1f(G.u.uSize,n);gl.uniform1f(G.u.uWT,t);gl.uniform1f(G.u.uOffX,0);
  gl.uniform4fv(G.u.uCyc,su.C);gl.uniform4fv(G.u.uCycS,su.V);if(G.u.uDustA)gl.uniform1f(G.u.uDustA,g.wx.dust??.5);gl.activeTexture(gl.TEXTURE11);gl.bindTexture(gl.TEXTURE_CUBE_MAP,PE.geo);gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_CUBE_MAP,PE.mac||null);gl.activeTexture(gl.TEXTURE0);for(const k of ['uGeo','uWpA','uWpB'])gl.uniform1i(G.u[k],11);if(G.u.uMacW)gl.uniform1i(G.u.uMacW,6);   // (the weather cubes stay off the program's units while one is the target)
  gl.bindFramebuffer(gl.FRAMEBUFFER,PE.fbL);gl.viewport(0,0,n,n);gl.enable(gl.SCISSOR_TEST);
  const list=band<0?[...Array(6*PE_WXB).keys()]:[band];
  for(const k of list){const f=(k/PE_WXB)|0,r=k%PE_WXB;gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_CUBE_MAP_POSITIVE_X+f,tex,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.scissor(0,r*h,n,h);gl.uniform1i(G.u.uFace,f);gl.drawArrays(gl.TRIANGLES,0,3);}
  gl.disable(gl.SCISSOR_TEST);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,null,0);}
function peWeather(g){if(!peClouds())return;peCloudTex();
  const wn=PE_WXO||(S.preset==='pc'?1024:512);if(wn!==PE_WXN){PE_WXN=wn;if(PE.wxT){PE.wxT.forEach(t=>gl.deleteTexture(t));PE.wxT=null;}PE.wxt=null;}
  if(!PE.wxT)PE.wxT=[0,1,2].map(()=>peTex(gl.TEXTURE_CUBE_MAP,gl.RGBA8,PE_WXN,PE_WXN,1,true));
  const D=peWxDt(),fresh=PE.wxK!==g.wxKey||PE.wxMacK!==PE.macK;
  if(fresh){PE.wxK=g.wxKey;peGeo(g);peStormsInit(g);PE.stT=PE.wt;}
  // the storms move with the clock
  if(PE.stT!==PE.wt){peStormsStep(g,PE.wt-PE.stT);PE.stT=PE.wt;}
  const t=PE.wxt;
  // start over (all three baked now) for a new world, or when the clock has run far past what is baked
  if(fresh||!t||PE.wt>t[2]+D||PE.wt<t[0]-1){PE.wxt=[PE.wt,PE.wt+D,PE.wt+2*D];PE.wxJ=null;for(let i=0;i<3;i++)peWxBake(g,PE.wxT[i],PE.wxt[i],-1);}
  else{
    // passed the next bake and the one after is done: shift along and start baking a new third
    if(PE.wt>=t[1]&&!PE.wxJ){PE.wxT.push(PE.wxT.shift());t.shift();t.push(t[1]+D);PE.wxJ={k:0};}
    if(PE.wxJ){const sp=S.timeSpeed||1,per=sp<=600?1:sp<=7200?4:12;
      for(let i=0;i<per&&PE.wxJ;i++){peWxBake(g,PE.wxT[2],t[2],PE.wxJ.k++);if(PE.wxJ.k>=6*PE_WXB)PE.wxJ=null;}}}
  PE.wxM=Math.min(1,Math.max(0,(PE.wt-PE.wxt[0])/Math.max(1,PE.wxt[1]-PE.wxt[0])));}
// texture offsets of the cloud noise as it evolves (rising through the texture), in double precision, modulo one period
const peFr=x=>x-Math.floor(x);
function peCloudU(u,CO){if(!u.uWxA)return;
  for(const [nm,t,un,k] of [['uWxA',PE.wxT[0],7,gl.TEXTURE_CUBE_MAP],['uWxB',PE.wxT[1],10,gl.TEXTURE_CUBE_MAP],['uCS',PE.cs,8,gl.TEXTURE_3D],['uCD',PE.cd,9,gl.TEXTURE_3D]]){gl.activeTexture(gl.TEXTURE0+un);gl.bindTexture(k,t);gl.uniform1i(u[nm],un);}
  gl.activeTexture(gl.TEXTURE0);const g=PE.cfg,w=PE.wt;gl.uniform1f(u.uCov,((CO.cover??S.cloudCover)-.5)*.7+g.wx.cover);gl.uniform1f(u.uWxM,PE.wxM);
  // rising at about a metre a second through cells 8 km, 3.5 km and 40 km across, and the 1.1 km detail
  gl.uniform4f(u.uCOff,peFr(w*1.2/8000),peFr(w*1.2/3500),peFr(.7+w*.5/40000),peFr(w*1.5/1100));gl.uniform4f(u.uCOff2,peFr(w*.4/60000),peFr(.1+w*.6/9000),0,0);
  gl.uniform1f(u.uFlowA,PE.flowA);gl.uniform1f(u.uFlowC,PE.flowC);gl.uniform1f(u.uCSL,Math.log2((PE.csN||64)/64));gl.uniform1f(u.uCDL,Math.log2((PE.cdN||32)/32));gl.uniform1f(u.uLT,PE.vt%1e5);
  const su=peStormU(g,0);gl.uniform4fv(u.uCyc,su.C);gl.uniform4fv(u.uCycS,su.V);}
// the weather at one direction, read back at once (for tools and tests)
function peWxAt(d){if(!PE.wxT||!PE.P)return [0,0,0,0];const G=PE.P.TWX,R=PE.pr;peProbe(PE.cfg,d,true);
  gl.useProgram(G.p);gl.uniform1i(G.u.uPass,6);gl.uniform3fv(G.u.uPu,d);gl.uniform1f(G.u.uWpM,PE.wxM);
  [[PE.wxT[0],'uWpA',7],[PE.wxT[1],'uWpB',10]].forEach(([t,nm,un])=>{gl.activeTexture(gl.TEXTURE0+un);gl.bindTexture(gl.TEXTURE_CUBE_MAP,t);gl.uniform1i(G.u[nm],un);});gl.activeTexture(gl.TEXTURE0);
  gl.bindFramebuffer(gl.FRAMEBUFFER,R.fb);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(0,0,1,1);gl.drawArrays(gl.TRIANGLES,0,3);
  const o=new Float32Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,o);return [...o];}
// the weather as a latitude-longitude map, read back at once (tools and tests): rows from 90°S up, columns eastward from 0°
function peWxMap(h){if(!PE.wxT||!PE.P)return null;const G=PE.P.TWX,w=2*h,t=peTex(gl.TEXTURE_2D,gl.RGBA32F,w,h,1,false),fb=peFB();
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(0,0,w,h);
  gl.useProgram(G.p);gl.uniform1i(G.u.uPass,7);gl.uniform1f(G.u.uSize,h);gl.uniform1f(G.u.uWpM,PE.wxM);
  [[PE.wxT[0],'uWpA',7],[PE.wxT[1],'uWpB',10]].forEach(([x,nm,un])=>{gl.activeTexture(gl.TEXTURE0+un);gl.bindTexture(gl.TEXTURE_CUBE_MAP,x);gl.uniform1i(G.u[nm],un);});gl.activeTexture(gl.TEXTURE0);
  gl.drawArrays(gl.TRIANGLES,0,3);const o=new Float32Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,o);gl.deleteFramebuffer(fb);gl.deleteTexture(t);peTgenSamp(G);return {w,h,d:Array.from(o)};}
