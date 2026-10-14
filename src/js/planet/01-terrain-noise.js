/* ===================== planet engine: rocky worlds ===================== */
/* Rocky planets are drawn the way planet renderers such as Proland and SpaceEngine do it. The terrain lives in a quadtree
   of tiles over a cube-sphere; each tile is generated once on the GPU into an atlas (height, water, climate, slope) and is
   reused for as long as it stays in view, so moving costs a few new tiles a frame instead of the whole planet. The tiles
   are drawn as a real mesh, with vertices sliding smoothly between levels of detail, and shaded with their biome
   materials. The air and the clouds are ray marched over it at reduced resolution, reused across frames by reprojection
   with the camera motion, then composited at full resolution.
   Precision: positions near the camera are camera-relative, and every noise octave is evaluated from a base point
   computed on the CPU in double precision, so detail holds down to a few meters even on an Earth-sized world. */
const PE_NOCT=26,PE_TS=67;
// each octave of the noise ladder is turned by Q (hides the lattice) and doubles in frequency
const PE_Q=(()=>{const a0=[.36,.8,.48],l=Math.hypot(...a0),[x,y,z]=a0.map(v=>v/l),a=.71,c=Math.cos(a),s=Math.sin(a),t=1-c;
  return [t*x*x+c,t*x*y-s*z,t*x*z+s*y, t*x*y+s*z,t*y*y+c,t*y*z-s*x, t*x*z-s*y,t*y*z+s*x,t*z*z+c].map(Math.fround);})();
const peQ=v=>[PE_Q[0]*v[0]+PE_Q[1]*v[1]+PE_Q[2]*v[2],PE_Q[3]*v[0]+PE_Q[4]*v[1]+PE_Q[5]*v[2],PE_Q[6]*v[0]+PE_Q[7]*v[1]+PE_Q[8]*v[2]];
const PE_OF=Array.from({length:PE_NOCT},(_,k)=>[k*7.31+.17,-k*3.97+.53,k*5.13-.41]);
// cube faces: forward, right, up (right × up = forward, so every face winds outward)
const PE_F=[[[1,0,0],[0,0,-1],[0,1,0]],[[-1,0,0],[0,0,1],[0,1,0]],[[0,1,0],[1,0,0],[0,0,-1]],[[0,-1,0],[1,0,0],[0,0,1]],[[0,0,1],[1,0,0],[0,1,0]],[[0,0,-1],[-1,0,0],[0,1,0]]];
const glf=v=>{let s=(+v).toPrecision(9);if(!/[.e]/.test(s))s+='.';return s;};
const glv=a=>`vec3(${a.map(glf).join(',')})`;
const PE_GLC=()=>`
#define PI 3.14159265
#define NOCT ${PE_NOCT}
const mat3 Q=mat3(${[0,3,6,1,4,7,2,5,8].map(i=>glf(PE_Q[i])).join(',')});
const vec3 FF[6]=vec3[6](${PE_F.map(f=>glv(f[0])).join(',')}),FU[6]=vec3[6](${PE_F.map(f=>glv(f[1])).join(',')}),FV[6]=vec3[6](${PE_F.map(f=>glv(f[2])).join(',')});
// always 0 (never set): loop bounds written as N+uZ0 stay real loops, so Direct3D's compiler (Windows) does not unroll
// and copy their bodies, which made the planet's shaders take minutes to compile there
uniform int uZ0;
float sq(float x){return x*x;}
vec2 sph(vec3 ro,vec3 rd,float r){float b=dot(ro,rd),c=dot(ro,ro)-r*r,h=b*b-c;if(h<0.)return vec2(-1);h=sqrt(h);return vec2(-b-h,-b+h);}
uint hu(uint x){x^=x>>16;x*=0x7feb352du;x^=x>>15;x*=0x846ca68bu;x^=x>>16;return x;}
vec3 gv(uint h){return vec3(uvec3(h,h>>10,h>>20)&uvec3(1023u))*(2./1023.)-1.;}
// gradient noise and its derivative (Quilez) on an integer lattice: x = cell i + fraction f. Integer cells keep the hash
// exact however far out the octave goes. Returns (value, d/dx, d/dy, d/dz), value roughly in [-1,1].
vec4 gnd(ivec3 i,vec3 f){
  vec3 u=f*f*f*(f*(f*6.-15.)+10.),du=30.*f*f*(f*(f-2.)+1.);
  uint X0=uint(i.x)*0x8da6b343u,X1=X0+0x8da6b343u,Y0=uint(i.y)*0xd8163841u,Y1=Y0+0xd8163841u,Z0=uint(i.z)*0xcb1ab31fu,Z1=Z0+0xcb1ab31fu;
  vec3 ga=gv(hu(X0^Y0^Z0)),gb=gv(hu(X1^Y0^Z0)),gc=gv(hu(X0^Y1^Z0)),gd=gv(hu(X1^Y1^Z0)),
       ge=gv(hu(X0^Y0^Z1)),gf=gv(hu(X1^Y0^Z1)),gg=gv(hu(X0^Y1^Z1)),gh=gv(hu(X1^Y1^Z1));
  float va=dot(ga,f),vb=dot(gb,f-vec3(1,0,0)),vc=dot(gc,f-vec3(0,1,0)),vd=dot(gd,f-vec3(1,1,0)),
        ve=dot(ge,f-vec3(0,0,1)),vf=dot(gf,f-vec3(1,0,1)),vg=dot(gg,f-vec3(0,1,1)),vh=dot(gh,f-vec3(1,1,1));
  float k1=vb-va,k2=vc-va,k3=ve-va,k4=va-vb-vc+vd,k5=va-vc-ve+vg,k6=va-vb-ve+vf,k7=-va+vb+vc-vd+ve-vf-vg+vh;
  vec3 g1=gb-ga,g2=gc-ga,g3=ge-ga,g4=ga-gb-gc+gd,g5=ga-gc-ge+gg,g6=ga-gb-ge+gf,g7=-ga+gb+gc-gd+ge-gf-gg+gh;
  float v=va+k1*u.x+k2*u.y+k3*u.z+k4*u.x*u.y+k5*u.y*u.z+k6*u.z*u.x+k7*u.x*u.y*u.z;
  vec3 d=ga+g1*u.x+g2*u.y+g3*u.z+g4*u.x*u.y+g5*u.y*u.z+g6*u.z*u.x+g7*u.x*u.y*u.z
    +du*vec3(k1+k4*u.y+k6*u.z+k7*u.y*u.z,k2+k5*u.z+k4*u.x+k7*u.z*u.x,k3+k6*u.x+k5*u.y+k7*u.x*u.y);
  return vec4(v,d)*5.2;}   // scaled to unit standard deviation
`;
// the terrain generator: the noise ladder, then continents, mountain belts, eroded relief, craters, canyons, lakes,
// climate (temperature and rain), mesas and dunes. Heights are in km until the end.
const PE_GLT=()=>`
uniform ivec3 uOI[NOCT];uniform vec3 uOF[NOCT];uniform ivec3 uSeed;
uniform ivec4 uK;     // octaves: continents, mountain belts, relief, craters
uniform vec4 uTP;     // continent bias, mountain height km, hill height km, planet radius km
uniform vec4 uTF;     // craters, canyons, mesas, dunes
uniform vec4 uTC;     // lakes, temperature offset °C, humidity, has seas
uniform vec4 uVc[4],uVs[4];   // shield volcanoes: direction and height (km); radius (km), caldera radius (fraction), base cliff (km)
uniform vec4 uTR;     // relief gain at fine scales, erosion, rock, 0
vec3 D[NOCT],RR[NOCT];
// per point: its offset from the tile center in every octave's coordinates, and the local vertical in that frame
void ladder(vec3 dl,vec3 P){vec3 d=dl,r=P;for(int k=0;k<NOCT+uZ0;k++){D[k]=d;RR[k]=r;d=2.*(Q*d);r=Q*r;}}
ivec3 LO(int L){return ivec3(L*1619,L*31337,L*6971)+uSeed;}
vec4 octW(int k,int L,vec3 w){vec3 x=uOF[k]+D[k]+w,fl=floor(x);return gnd(uOI[k]+ivec3(fl)+LO(L),x-fl);}
vec4 oct(int k,int L){return octW(k,L,vec3(0));}
vec3 wk(vec3 w,int k){for(int i=0;i<k+uZ0;i++){w=2.*(Q*w);}return w;}   // a world offset in octave k
// continents and mountain belts around the point offset by w (world units)
void macro(vec3 w,out float land,out float cl,out float belt,out float base){
  // sixteen noise lookups in one loop (one copy of the noise for the compiler): 0-5 warp the coastlines, 6-11 the continental
  // signal at the warped point, 12-15 the two fields whose zero lines are mountain belts
  int kc=uK.x,kb=uK.y;
  vec3 a=wk(w,kc),b=2.*(Q*a),W=vec3(0),B=wk(w,kb),B2=2.*(Q*B),B3=2.*(Q*B2),wp=vec3(0);float c=0.,s=1.,n=0.,z1=0.,z2=0.;cl=0.;
  for(int j=0;j<16+uZ0;j++){
    if(j==6)W=wk(w+wp,kc);
    int k=j<3?kc:j<6?kc+1:j<12?kc+j-6:j==12?kb:j==15?kb+2:kb+1;
    vec3 x=j<3?a:j<6?b:j<12?W:j==12?B:j==15?B3:B2;
    float v=octW(k,j<12?(j<6?j+1:7):j-4,x).x;
    if(j<6)wp[j%3]+=(j<3?.021:.0087)*v;
    else if(j<12){c+=s*v;n+=s;if(j==8)cl=c/n;s*=.55;W=2.*(Q*W);}
    else if(j<14)z1+=v*(j==12?.8:.35);else z2+=v*(j==14?.8:.3);}
  z1=abs(z1);z2=abs(z2);
  // in units of the noise's spread: land is where the continental signal clears the sea bias
  land=c/(n*.553)-uTP.x;cl=cl/.64-uTP.x;
  // shelf, slope and abyss below the coast; a continental plateau above it
  base=.45*smoothstep(0.,1.,land)+.45*smoothstep(.8,2.5,land)-.13*smoothstep(0.,-.2,land)-4.3*smoothstep(-.2,-1.,land);
  // mountain belts follow the zero lines of two noise fields: long winding ranges, like plate boundaries
  belt=max(smoothstep(.3,.05,z1),.7*smoothstep(.22,.04,z2))*(.15+.85*smoothstep(-.6,.4,land));
}
struct TS{float h,wl,temp,wet,rock,ej;};
TS terrain(vec3 P,int mo,bool clim){
  TS o;float land,cl,belt,base,lu,cu,bu,au;
  // the continents here and (for the rain shadow) 220 km upwind: one call site in a loop, so the compiler builds macro() once
  float lt0=degrees(asin(min(abs(P.y),1.)));vec3 E=vec3(-P.z,0.,P.x);E=dot(E,E)>1e-8?normalize(E):vec3(1,0,0);
  float ws=smoothstep(26.,34.,lt0)-smoothstep(58.,66.,lt0);vec3 wind=E*(2.*ws-1.);
  for(int m=0;m<(clim?2:1)+uZ0;m++){float a1,a2,a3,a4;macro(m==0?vec3(0):-wind*(220./uTP.w),a1,a2,a3,a4);
    if(m==0){land=a1;cl=a2;belt=a3;base=a4;}else{lu=a1;cu=a2;bu=a3;au=a4;}}
  float rough=.25+.75*smoothstep(-1.5,1.5,oct(uK.y+1,12).x);
  // landforms, the way Minecraft's noise router sorts them: a slow "erosion" field makes some regions flat plains and
  // others rugged highlands, and a folded "peaks and valleys" field lifts ridges tens of km long with broad valleys between
  float lfE=oct(uK.y,30).x,lfPV=1.-abs(oct(uK.y+2,31).x)*1.3,lfF=smoothstep(-.1,.9,lfE)*uTR.w,rug=smoothstep(.1,-1.,lfE)*uTR.w;
  rough*=mix(1.,.15+.4*(1.-smoothstep(0.,.3,uTC.z)),lfF)*(1.+1.4*rug);   // (a dry world's plains stay hummocky: no water or soil to smooth them)
  // rolling hills everywhere: plain fractal noise; mountain belts: ridged multifractal (Musgrave) from ~50 km down, each
  // octave weighted by the ridge below it, so crests stay sharp and branch while valley floors stay smooth
  float hs=0.,ah=1.,rs=0.,ar=1.,wg=1.,hl=0.,rl=0.;int kr=uK.z+2;
  float Ah=uTP.z*.33*rough,Am=uTP.y*.62*belt;
  // the slope of the relief built so far, carried along in each octave's own frame (for the erosion below)
  int kE=clamp(int(log2(uTP.w/2.4)+.5),uK.z+2,NOCT-3);vec3 G=vec3(0),GE[3];GE[0]=GE[1]=GE[2]=vec3(0);
  for(int k=uK.z;k<NOCT;k++){if(k>mo)break;
    if(k>uK.z)G=Q*G;if(k>=kE&&k<kE+3)GE[k-kE]=G;
    vec4 nh=oct(k,13);hs+=ah*nh.x;G+=Ah*ah*nh.yzw*exp2(float(k))/uTP.w;ah*=k<uK.z+5?.5:uTR.x;
    if(belt>.01&&k>=kr){vec4 nr=oct(k,14);float u=1.-abs(nr.x)*.72,sg=clamp(u,0.,1.);float s2=sg*sg*wg;rs+=ar*s2*1.35;
      G+=Am*ar*2.7*u*(-.72*nr.x/sqrt(nr.x*nr.x+.03))*wg*nr.yzw*exp2(float(k))/uTP.w;wg=clamp(s2*2.2,0.,1.);ar*=k<kr+4?.62:uTR.x;}
    if(k<=uK.z+1)hl=hs;if(k<=kr+2)rl=rs;}
  float up=base+belt*.3*uTP.y+(lfPV-.35)*uTP.z*.45*(1.-lfF*.8)*(1.+rug)*smoothstep(-.1,.4,land);
  float H=up+Ah*hs+Am*rs,Hm=up+Ah*hl+Am*rl;
  // shield volcanoes: domes hundreds of km across rising many km above the plains, ringed by a cliff at their foot, with a
  // collapsed caldera on top (Olympus Mons is 600 km wide and 22 km high, its basal cliff up to 8 km)
  for(int i=0;i<4+uZ0;i++){if(uVc[i].w<=0.)continue;float x=length(P-uVc[i].xyz)*uTP.w/uVs[i].x;if(x>=1.2)continue;
    float Hv=uVc[i].w,dome=Hv*pow(max(1.-pow(x,1.25),0.),1.5)+uVs[i].z*smoothstep(1.13,.98,x),cr=uVs[i].y,cal=Hv*.13*smoothstep(cr*1.12,cr*.82,x);
    H+=dome-cal;Hm+=dome-cal;}
  // rivers: winding valleys along the zero lines of slow noise fields (a great river every hundred km or so, smaller ones
  // between). Each valley is cut down toward a bed a little under the smooth land around it, wider in the lowlands, with
  // a channel along its floor; on a wet world the channel holds water. (Dry worlds keep them as dry valleys.)
  float rvBed=-1e4,rvD=1e4,rvW=0.;
  if(uTR.z>0.&&land>-.1){for(int i=0;i<2+uZ0;i++){int k=uK.y+1+2*i;vec4 rn=oct(k,32+i);float cell=uTP.w*exp2(-float(k)),dk=abs(rn.x)/(length(rn.yzw)+1e-3)*cell;
      float vw=(i==0?3.:1.2)*(.5+smoothstep(1.2,.1,Hm))*uTR.z,cw=(i==0?.22:.07)*(.6+.8*smoothstep(1.,.1,Hm)),q=dk/vw;
      if(q<1.){float bed=max(mix(base,Hm,.3)-.04,.003),pv=pow(smoothstep(cw*.8/vw,1.,q),.75);if(H>bed)H=bed+(H-bed)*pv;
        if(dk<cw){float d=(i==0?.012:.005)*(1.-sq(dk/cw));H=min(H,bed-d);}
        if(dk/cw<rvD){rvD=dk/cw;rvBed=bed;rvW=float(i);}}}}
  // erosion: on slopes, runoff carves gullies that run straight downhill and branch at finer scales (a sum of waves
  // laid along the local fall line, one per nearby cell, blended smoothly: the "erosion noise" of Fewes and Clay John)
  for(int e=0;e<3+uZ0;e++){int k=kE+e;if(k>mo)break;vec3 nv=normalize(RR[k]),g=GE[e]-nv*dot(GE[e],nv);float sl=length(g);if(sl<.02)continue;
    vec3 dp=normalize(cross(nv,g)),x=uOF[k]+D[k],fl=floor(x)-1.;float ev=0.,ws=0.;
    for(int i=0;i<27+uZ0;i++){vec3 c=fl+vec3(i%3,(i/3)%3,i/9);ivec3 ci=uOI[k]+ivec3(c)+LO(40+e);
      uint hh=hu(uint(ci.x)*0x8da6b343u^uint(ci.y)*0xd8163841u^uint(ci.z)*0xcb1ab31fu);
      vec3 pc=c+.2+.6*vec3(float(hh&255u),float((hh>>8)&255u),float((hh>>16)&255u))/255.;float w=sq(max(0.,1.-dot(x-pc,x-pc)));   // compact: nothing reaches past one cell, and every cell within one is visited, so no seams
      ev+=cos(dot(x-pc,dp)*6.2832*1.6)*w;ws+=w;}
    ev/=ws+.15;
    float lam=uTP.w*exp2(-float(k));H+=ev*lam*.12*uTR.y*smoothstep(.03,.35,sl)*(e==0?1.:.6)*mix(.3,1.,smoothstep(-.05,.05,H));}
  float ej=0.;
  // canyons: winding gorges cut into the uplands
  if(uTF.y>0.){float v=abs(oct(uK.y+1,17).x*.85+oct(uK.y+3,18).x*.3),m=smoothstep(.5,2.,oct(uK.y,19).x)*smoothstep(0.,1.,land);
    float cy=smoothstep(.12,.03,v)*m;H-=cy*2.8*uTF.y;Hm-=cy*2.8*uTF.y;}
  // layered rock, as in Mount Sharp's sediments or a canyon's walls: beds some 150, 45 and 9 m thick, the hard ones left
  // standing as ledges over slopes of the softer ones; the beds lie level but wander a little in thickness
  // (on dry worlds; it is worked out with or without the climate, so every sample of the ground agrees)
  float wd=1.-smoothstep(0.,.35,uTC.z);
  if(uTF.z>0.&&wd>0.){float wv=oct(uK.y+4,24).x*.5;
    for(int i=0;i<3+uZ0;i++){float st=i==0?.15:i==1?.045:.009,o2=wv*(i==0?.6:i==1?1.:2.7),x=H/st+o2,fx=fract(x);H=mix(H,(floor(x)+smoothstep(.4,.97,fx)-o2)*st,wd*uTF.z*(i==0?.6:i==1?.55:.3));}}   // (risers kept to slopes, not walls: stacked beds with sheer risers made spires)
  // craters at several sizes: bowl, raised rim, ejecta blanket, flat floors and central peaks on the big ones
  if(uTF.x>0.){for(int j=0;j<8+uZ0;j++){int k=uK.w+2*j;if(k>mo+1||k>=NOCT)break;
      vec3 x=uOF[k]+D[k],fl=floor(x),f=x-fl;ivec3 ci=uOI[k]+ivec3(fl)+LO(20+j);
      uint hh=hu(uint(ci.x)*0x8da6b343u^uint(ci.y)*0xd8163841u^uint(ci.z)*0xcb1ab31fu);
      float pr=float(hh&255u)/255.;if(pr>uTF.x*(.32+.07*float(j))*smoothstep(.004,.04,uTP.w*exp2(-float(k))))continue;   // (metre-sized pits are soon filled by blowing sand: few of them)
      // radius at most .2 of the cell and everything gone by 1.4 radii, so no crater reaches past its own cell
      vec3 c=.3+.4*vec3(float((hh>>8)&255u),float((hh>>16)&255u),float(hu(hh)&255u))/255.;float r=.07+.13*float(hu(hh^0x9e37u)&255u)/255.;
      float d=length(f-c)/r;if(d>=1.4)continue;
      float Dk=2.*r*uTP.w*exp2(-float(k)),cx=smoothstep(15.,45.,Dk),dep=min(Dk*mix(.2,.06,smoothstep(8.,60.,Dk)),4.5);
      float fresh=float(hu(hh^0x51u)&255u)/255.;
      // simple craters are bowls; big ones have flat floors, terraced walls and a central peak
      float bowl=d<1.?mix((d*d-1.)*dep,-dep*(1.-smoothstep(.45,1.,d)),cx):0.;
      if(d<1.&&cx>0.){float w=smoothstep(.45,1.,d)*4.,tw=(floor(w)+smoothstep(.3,1.,fract(w)))/4.;bowl=mix(bowl,-dep*(1.-tw),cx*.5);}
      float rim=dep*.2*(d<1.?smoothstep(.7,1.,d):sq(smoothstep(1.4,1.,d)));
      float pk=dep*.4*smoothstep(.22,0.,d)*cx;
      float add=(bowl+rim+pk)*(.4+.6*fresh);H+=add;if(Dk>20.)Hm+=add;
      ej=max(ej,fresh*fresh*smoothstep(1.4,1.,d)*smoothstep(.8,1.,d));}}
  float temp=0.,wet=0.;
  if(clim){
    // temperature: sun by latitude, colder poles, 6.5 °C per km of height, inland extremes
    float sl=abs(P.y),lt=degrees(asin(min(sl,1.)));
    temp=27.+uTC.y-40.*pow(sl,2.8)-10.*smoothstep(.85,1.,sl)-6.5*max(Hm,0.)+2.5*oct(uK.x+2,15).x-2.5*smoothstep(0.,1.5,cl)*sl;
    // rain: the tropical rain belt, subtropical deserts, mid-latitude storm tracks, dry poles; less inland, more on slopes
    // facing the wind and less in their rain shadow (trade winds blow west, westerlies east)
    float pb=.95*exp(-sq(lt/11.))+.6*exp(-sq((lt-50.)/14.))+.12-.1*exp(-sq((lt-25.)/8.))-.08*smoothstep(65.,85.,lt);
    float rise=(Hm-(au+bu*.75*uTP.y))/220.;
    wet=land<0.?pb:1.35*pb*mix(1.,.5,smoothstep(0.,2.5,cl))*clamp(1.+rise*30.,.3,1.7)*(.65+.7*clamp(oct(uK.x+3,16).x*.25+.5,0.,1.));
    wet*=uTC.z;   // the world's humidity: 0 is a bone-dry planet
    float dry=smoothstep(.3,.12,wet)*smoothstep(0.,.4,land);
    // mesas: flat-topped steps in dry country
    if(uTF.z>0.&&dry>0.){float mr=smoothstep(.3,1.2,oct(uK.y+2,22).x),st=.4,x=H/st,fx=fract(x),tr=(floor(x)+smoothstep(.3,.97,fx))*st;H=mix(H,tr,.8*dry*uTF.z*mr*smoothstep(0.,.3,H));}
    // dunes across the wind in hot sandy deserts, and in the dune fields of frozen dust worlds (Mars's crater floors and plains)
    float dm=dry*max(smoothstep(14.,24.,temp),smoothstep(-25.,-45.,temp)*smoothstep(.15,.8,oct(uK.y+3,36).x))*uTF.w;int kd=uK.z+7;
    if(dm>.01&&kd<=mo){vec3 wd2=cross(P,wind);for(int i=0;i<kd+uZ0;i++){wd2=Q*wd2;}
      float ph=dot(vec3(uOI[kd])+uOF[kd]+D[kd],wd2)+.1*oct(kd-2,21).x;float du=1.-abs(sin(PI*ph));H+=dm*.05*du*du;}}
  // water: the sea at 0 km; lakes in damp lowland basins sit a little below the regional ground. Toward the edge of a lake
  // district the level sinks steeply (but smoothly) under the ground, so every shore is where water meets land: a level
  // that simply stopped at the district's edge left walls of water standing over the forest beside it
  float wl=uTC.w>.5?0.:-1e4;
  if(uTC.x>0.&&clim){float lm=smoothstep(.5,.66,oct(uK.z,14).x*.1+.5+uTC.x*.25-.12)*(1.-smoothstep(.05,.3,belt))*smoothstep(.3,1.,land)*smoothstep(.22,.35,wet);
    // (lakes fill the hollows of the land, below its smooth lie: many lakes, not one inland sea)
    if(lm>.01){float q=1.-lm;wl=max(wl,min(base-.05,Hm-.035)-3.*q*q*q);}}
  // (rivers run where it rains: in dry country the channel is a dry wash)
  if(uTC.w>.5&&rvBed>-1e3&&rvD<2.){float q=clamp(rvD-.75,0.,2.)+3.*smoothstep(.22,.1,wet);wl=max(wl,rvBed-.0015-q*q*q*.8);}
  o.h=H/uTP.w;o.wl=wl/uTP.w;o.temp=temp;o.wet=wet;o.rock=clamp(belt*rs*.6+belt*.15,0.,1.);o.ej=ej;return o;}
`;
// the atmosphere: transmittance (Bruneton's mapping), multiple scattering (Hillaire), sky irradiance, phase functions
const PE_GLA=()=>`
uniform vec3 uSun,uSunI,uBR,uBMs,uBMe,uBO,uBMp,uGPk;uniform float uRtop,uHR,uHM,uOzC,uOzW,uRkm;uniform vec3 uG;
uniform sampler2D uTrans,uMS,uIrr;
vec3 ext(float h){return uBR*exp(-h/uHR)+uBMe*exp(-h/uHM)+uBO*max(0.,1.-abs(h-uOzC)/uOzW);}
vec2 tUV(float r,float mu){float H=sqrt(uRtop*uRtop-1.),rho=sqrt(max(r*r-1.,0.)),d=max(0.,-r*mu+sqrt(max(r*r*(mu*mu-1.)+uRtop*uRtop,0.))),dn=uRtop-r,dx=rho+H;
  return vec2(clamp((d-dn)/max(dx-dn,1e-9),0.,1.),clamp(rho/H,0.,1.));}
vec3 trans(float r,float mu){vec2 uv=tUV(r,mu);return texture(uTrans,vec2(.5/256.+uv.x*(255./256.),.5/64.+uv.y*(63./64.))).rgb;}
// the planet's shadow, softened over the sun's disk
float pSh(float r,float mu){float mh=-sqrt(max(0.,1.-1./(r*r)));return smoothstep(-.006,.006,mu-mh);}
vec3 sunT(vec3 p){float r=length(p),mu=dot(p,uSun)/r;return trans(r,mu)*pSh(r,mu);}
vec2 aUV(float r,float mu,vec2 n){return vec2(.5/n.x+clamp(mu*.5+.5,0.,1.)*(1.-1./n.x),.5/n.y+clamp((r-1.)/(uRtop-1.),0.,1.)*(1.-1./n.y));}
vec3 msL(float r,float mu){return texture(uMS,aUV(r,mu,vec2(32))).rgb;}
vec3 irr(float r,float mu){return texture(uIrr,aUV(r,mu,vec2(64,16))).rgb;}
float phR(float nu){return 3./(16.*PI)*(1.+nu*nu);}
// (one forward lobe per colour: dust grains of a few microns throw blue light more sharply forward than red, which is
// why a Martian sunset is blue around the sun under a butterscotch sky)
vec3 phM(float nu){vec3 g=uG,g2=g*g;return 3./(8.*PI)*((1.-g2)*(1.+nu*nu))/((2.+g2)*pow(max(1.+g2-2.*g*nu,vec3(1e-4)),vec3(1.5)));}
// the haze's diffraction lobe (see peAirU), and the haze's single scattering per unit density: the broad lobe plus the peak
vec3 phP(float nu){vec3 g=uGPk,g2=g*g;return (1.-g2)/(4.*PI*pow(max(1.+g2-2.*g*nu,vec3(1e-5)),vec3(1.5)));}
vec3 scM(float nu){return uBMs*phM(nu)+uBMp*phP(nu);}
`;
