/* ---- grass: blades around the camera ----
   Grass grows in small cells of the terrain quadtree (about 9.5 m across on an Earth-sized world, 32×32 clumps each, a clump
   every 30 cm). A GPU pass works out each clump from the terrain generator: where it stands, and from the climate what grows
   there: meadow grass where it is warm and wet, tawny tussocks with bare ground between in steppe and savanna, short sedge in the
   cold, thin shade-grass on the forest floor, nothing on rock, beaches, snow or under water. Each clump is a handful of curved
   blades built in the vertex shader and bent by gusts of wind that sweep across the field, lit per vertex: the sun past the
   clouds and the trees' shadows, the sky, light shining through the blades from behind. Farther out the clumps thin (the ones
   left grow wider) and beyond a few tens of metres the blades sink away and the ground's own grass colour takes over. */
const PE_GB=8,PE_GS=4,PE_GCAP=128;   // blades per clump, segments per blade, cells in the pool
// what grows at a clump. T: mean temperature (°C), W: rain (0-1), hm: height above the water line (m), sl: slope (1-cos), rk:
// rockiness, nz: patch noises, r: random. Returns (kind: 0 none, 1 grass, 2 forest floor, 3 cold sedge; height (m); dryness: 0
// green .. 1 straw; fullness of the clump)
const PE_GLGRASS=`
vec4 grassPick(float T,float W,float hm,float sl,float rk,vec3 nz,vec2 r){
  if(hm<.25||sl>.35)return vec4(0);
  float veg=smoothstep(.06,.3,W)*smoothstep(-6.,4.,T);
  float fo=smoothstep(.3,.55,W+(nz.x-.5)*.12+(uVegK-1.)*.15)*smoothstep(-1.,7.,T)*(1.-smoothstep(.12,.28,sl))*min(uVegK*2.,1.);
  float rock=smoothstep(.07,.2,sl+rk*.05+(nz.y-.5)*.07),bch=smoothstep(5.,1.,hm)*(1.-smoothstep(.03,.1,sl));
  float snow=smoothstep(-1.5,-8.,T+(nz.z-.5)*5.)*smoothstep(.015,.07,W),dry=1.-smoothstep(.16,.48,W);
  // dry lands: bunch grass in tussocks with bare ground between; under a closed canopy, thin shade-grass
  float d=veg*(1.-rock)*(1.-bch)*(1.-snow)*mix(1.,.3+.55*smoothstep(.45,.7,nz.y),fo)*mix(1.,.45+.55*smoothstep(.35,.65,nz.y),dry);
  if(r.x>d)return vec4(0);
  float h=mix(.1,.7,smoothstep(-3.,15.,T))*mix(.55,1.2,smoothstep(.15,.5,W))*mix(.5,1.35,nz.z);
  h*=1.+.9*smoothstep(18.,26.,T)*smoothstep(.12,.25,W)*(1.-smoothstep(.42,.58,W));   // savanna grass, head high in places
  float kind=fo>.5?2.:T<3.?3.:1.;if(kind==2.)h*=mix(.5,1.15,smoothstep(.45,.7,nz.y));   // (tall in the forest's clearings)
  float dr=clamp(dry*1.15+smoothstep(24.,34.,T)*dry*.4+(nz.x-.5)*.35+(r.y-.5)*.15,0.,1.);
  return vec4(kind,h,dr,clamp(d*1.6+.25,.45,1.));}
`;
// a clump's place and frame from the cell table and the slot pools (as the trees')
const PE_GLGCELL=`
uniform highp sampler2D uGP,uGC;uniform mediump sampler2D uGS;
struct GC{vec3 base,up,ex,ez;float H,dry,full,rk;int kind;};
GC grassAt(int id){GC t;int cell=id>>10,slot=id&1023;ivec2 pt=ivec2((cell&15)*${PE_VC}+(slot&31),(cell>>4)*${PE_VC}+(slot>>5));
  vec4 P=texelFetch(uGP,pt,0),Sd=texelFetch(uGS,pt,0);t.kind=int(Sd.x*15.+.5);
  vec3 rel=texelFetch(uGC,ivec2(0,cell),0).xyz,c=texelFetch(uGC,ivec2(1,cell),0).xyz,T1=texelFetch(uGC,ivec2(2,cell),0).xyz,T2=texelFetch(uGC,ivec2(3,cell),0).xyz,
    Css=texelFetch(uGC,ivec2(4,cell),0).xyz,Cst=texelFetch(uGC,ivec2(5,cell),0).xyz,Ctt=texelFetch(uGC,ivec2(6,cell),0).xyz;
  vec2 st=P.xy;vec3 dl=T1*st.x+T2*st.y+.5*(Css*st.x*st.x+2.*Cst*st.x*st.y+Ctt*st.y*st.y);
  t.up=normalize(c+dl);t.base=rel+dl+t.up*P.z;t.ex=normalize(cross(vec3(0,1,0),t.up)+vec3(1e-5,0,1e-5));t.ez=cross(t.ex,t.up);
  t.H=Sd.y*2.;t.dry=Sd.w;t.full=P.w;t.rk=Sd.z;return t;}
`;
const PE_GRVS=()=>PE_HDR+`#define CLOUDS ${peClouds()?1:0}
`+PE_GLC()+PE_GLN+PE_GLA()+PE_GLGCELL+PE_GLPROJ+PE_GLSH+`
uniform highp sampler3D uNoise;
`+PE_N3+`
layout(location=0) in vec3 aB;layout(location=4) in float iId;
uniform mediump sampler2D uLM;uniform vec3 uLO,uLU,uLV,uCam,uWind,uG1,uG2,uCamM,uVeg,uDry,uRock;uniform float uTime,uGR,uGN,uPix;
out vec3 vCol;out float vDist;
void main(){GC c=grassAt(int(iId+.5));float Rm=uRkm*1000.,d0=length(c.base)*Rm;int b=int(aB.x+.5);
  uint h=hu(uint(iId+.5)*16u+uint(b)),h2=hu(h^0x5bd1e995u);
  vec4 r=vec4(uvec4(h&255u,(h>>8)&255u,(h>>16)&255u,h>>24))/255.,r2=vec4(uvec4(h2&255u,(h2>>8)&255u,(h2>>16)&255u,h2>>24))/255.;
  // thinning with distance (a clump stays while its rank is within the share kept there), the outer four blades near only,
  // the whole field sinking away toward its edge
  float keep=min(1.,pow(uGN/max(d0,1.),1.3)),inner=b<4?1.:1.-smoothstep(uGN*.8,uGN,d0),fade=1.-smoothstep(uGR*.45,uGR,d0);
  if(c.kind==0||c.rk>keep||fade<=0.||inner<=0.||r.x>c.full){gl_Position=vec4(2,2,2,1);vCol=vec3(0);vDist=0.;return;}
  float s=aB.y/${PE_GS}.,side=aB.z;   // along the blade (0 root .. 1 tip), across it
  // the blade: a curve from its root (somewhere in the clump) up and over, leaning out at random and bent by the wind
  float th=r.y*6.2832,rr=(.05+.11*sqrt(r.z))*(.7+.3*c.full);vec2 ro=vec2(cos(th),sin(th))*rr;
  // (a clump thinned away with distance shrinks out over the last part of its share instead of vanishing at once)
  float gk=smoothstep(0.,1.,clamp((keep-c.rk)/max(keep*.3,.02),0.,1.));
  float H=max(c.H*(.5+.65*r.w)*fade*inner*gk,.002);
  vec2 ld=normalize(ro+(r2.xy-.5)*.08+1e-5);float lean=H*(c.kind==2?.6+.3*r2.z:(.1+.35*r2.z)*(c.kind==3?.5:1.));   // forest floor: fern fronds arching out from the crown
  // the wind where the clump stands: a steady push and gusts sweeping across (world-anchored noise drifting downwind), and each
  // blade quivering on its own
  vec3 pw=uCamM+c.base*Rm;float g1=n3((pw-uG1)/14.),g2=n3((pw-uG2)/4.9);
  vec2 wl=vec2(dot(uWind,c.ex),dot(uWind,c.ez));float ws=length(wl);vec2 wd=wl/max(ws,1e-3);
  float bend=clamp(ws/14.,0.,.7)*(.35+1.3*g1*g1)+.12*(g2-.5)*min(ws/4.,1.);
  float fl=sin(uTime*(5.+3.*r2.w)+r.y*40.+g2*6.)*.03*min(ws/3.,1.)*H;
  vec2 tip=ld*lean+wd*H*bend+vec2(wd.y,-wd.x)*fl;float tl=length(tip);if(tl>H*.95){tip*=H*.95/tl;tl=H*.95;}
  vec3 p0=vec3(ro.x,0.,ro.y),p2=p0+vec3(tip.x,sqrt(H*H-tl*tl),tip.y),p1=p0+vec3(tip.x*.25,H*.6,tip.y*.25);
  float u1=1.-s;vec3 pos=u1*u1*p0+2.*u1*s*p1+s*s*p2,tg=normalize(2.*u1*(p1-p0)+2.*s*(p2-p1)+vec3(0,1e-6,0));
  // its width: turned at random, tapering to a point; wider where fewer clumps stand, and never much under a pixel (thin
  // blades would flicker)
  float ph=r2.w*6.2832;vec3 wv=vec3(cos(ph),0.,sin(ph));wv=normalize(wv-tg*dot(wv,tg)+vec3(1e-6,0,0));
  float w0=(c.kind==2?.024:c.kind==3?.01:.017)*min(inversesqrt(keep),2.4)*(1.+.35*(1.-inner))*(b<4?1.+.35*smoothstep(uGN*.8,uGN,d0):1.);
  float w=max(w0*(c.kind==2?3.:1.),d0*uPix*1.1)*(c.kind==2?pow(sin(3.1416*min(s*1.1,1.)),.6)*(1.-.4*s):1.-pow(s,1.4));
  vec3 lp=pos+wv*side*.5*w,tgw=c.ex*tg.x+c.up*tg.y+c.ez*tg.z,wvw=c.ex*wv.x+c.up*wv.y+c.ez*wv.z;
  // roots a few cm under the surface (the ground's mesh is a little off the true surface in places)
  vec3 rel=c.base+(c.ex*lp.x+c.up*(lp.y-.05)+c.ez*lp.z)/Rm;float dist=length(rel);vec3 V=-rel/dist;
  vec3 N=normalize(cross(wvw,tgw));if(dot(N,V)<0.)N=-N;
  // light: the sun through the air, the clouds' shade and the trees' shadows; the sky and cloud light around here
  vec3 P=uCam+rel;float rp=length(P),mus=dot(c.up,uSun);vec3 Ts=trans(rp,mus)*pSh(rp,mus);
  vec4 lm=texture(uLM,vec2(dot(rel-uLO,uLU),dot(rel-uLO,uLV))*.5+.5);vec2 sh=sunSh(rel+c.up*(.1/Rm),.2);
  vec3 Ec=uSunI*Ts*lm.a,Es=Ec*mix(1.,sh.x,sh.y),Ek=lm.rgb,Eg=Ec*max(mus,0.)*.5+Ek;
  // colour: green to straw by dryness (sedge olive in the cold), dark and brown down in the sward, each blade its own shade
  vec3 gC=uVeg*mix(1.2,1.65,r.z),sC=mix(uDry,uVeg,.12)*mix(1.05,1.35,r.z),cC=mix(uVeg,uRock,.45)*1.1;
  vec3 alb=c.kind==3?cC:c.kind==2?uVeg*mix(.95,1.35,r.z):mix(gC,sC,clamp(c.dry+(r2.x-.5)*.3,0.,1.));alb*=mix(.5,1.,smoothstep(0.,.55,s))*(.85+.3*r2.y);
  // the sun on the side we see, or shining through from behind; the sky (less of it down in the sward); the ground's bounce
  float nl=dot(N,uSun),ao=mix(.3,1.,smoothstep(0.,.85,s)),aoS=mix(.45,1.,smoothstep(.1,.9,s));
  vec3 col=alb/PI*(Es*aoS*(max(nl,0.)+max(-nl,0.)*.4*vec3(.9,1.,.55))+Ek*ao*(.55+.45*max(dot(N,c.up),0.))+Eg*vec3(.08,.08,.05)*.5*ao);
  // a soft sheen where blades catch the sun at a glancing angle
  vec3 Hh=normalize(uSun+V);col+=Es*aoS*.035*pow(max(dot(N,Hh),0.),24.)*s;
  vCol=col;vDist=dist;gl_Position=proj(rel);}`;
const PE_GRFS=()=>PE_HDR+`
in vec3 vCol;in float vDist;layout(location=0) out vec4 o;layout(location=1) out vec4 oD;
void main(){o=vec4(vCol,2);oD=vec4(vDist);}   // (alpha 2: grass, which the screen-space shadows neither darken nor count as a caster: its thin blades in the depth buffer would print rows of false shadows)`;
// the sky light and the clouds' shade around the camera, on a small map in the tangent plane (the grass looks it up per vertex
// instead of marching the clouds itself): rgb sky irradiance, a the sun past the clouds
const PE_GLITFS=()=>PE_HDR+`#define CLOUDS ${peClouds()?1:0}
`+PE_GLC()+PE_GLN+PE_GLA()+(peClouds()?peGLCLD():'')+`
uniform vec3 uCam,uLO,uLX,uLY;uniform float uLN;out vec4 o;
void main(){vec2 s=gl_FragCoord.xy/uLN*2.-1.;vec3 rel=uLO+uLX*s.x+uLY*s.y,P=uCam+rel;float r=length(P);vec3 up=P/r;float mus=dot(up,uSun);
  vec3 Ek=uSunI*irr(r,mus);float sc=1.;
#if CLOUDS
  if(mus>-.1)sc=cShadow(P,.3);Ek=cAmb(P,mus,Ek);
#endif
  o=vec4(Ek,sc);}`;
/* ---- the grass layer ---- */
function peGrassQ(){return {balanced:[20,6],quality:[28,8],ultra:[36,10],cinematic:[48,13],pc:[60,18]}[S.preset]||null;}   // [radius, full-density radius] (m)
function peGrassOn(g){return !!(g.veg3d&&!PE.grsOff&&PE.P&&PE.P.GRASS&&PE.P.GLIT&&peGrassQ());}
function peGrassInit(g){const R=g.R;PE.grs=peLayer(Math.max(8,Math.min(24,Math.round(Math.log2(Math.PI/2*R/.15))+4)),PE_GCAP,R);
  if(!PE.grsVAO){const V=[],I=[];
    // per blade: a pair of vertices at each level (one each side) and a single one at the tip
    for(let b=0;b<PE_GB;b++){const o=V.length/3;for(let s=0;s<PE_GS;s++)V.push(b,s,-1,b,s,1);V.push(b,PE_GS,0);
      for(let s=0;s<PE_GS-1;s++){const a=o+s*2;I.push(a,a+1,a+3,a,a+3,a+2);}const a=o+(PE_GS-1)*2;I.push(a,a+1,o+PE_GS*2);}
    const vao=gl.createVertexArray();gl.bindVertexArray(vao);const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(V),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(I),gl.STATIC_DRAW);
    PE.grsIB=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,PE.grsIB);gl.enableVertexAttribArray(4);gl.vertexAttribPointer(4,1,gl.FLOAT,false,4,0);gl.vertexAttribDivisor(4,1);
    gl.bindVertexArray(VAO0);PE.grsVAO=vao;PE.grsNI=I.length/PE_GB;}}
function peGrassFree(){if(PE.grs)peLayerFree(PE.grs);PE.grs=null;}
// once a frame, before the terrain pass: keep the cells, list the clumps to draw, and redraw the light map
function peGrassFrame(g,eye,K,sun,sI,CO){PE.grsDraw=null;if(!peGrassOn(g))return;if(!PE.grs||PE.grs.key!==g.vKey){peGrassFree();peGrassInit(g);PE.grs.key=g.vKey;}
  const V=PE.grs,[Rg,Rn]=peGrassQ(),Rm=g.R*1000,en=.9*Math.PI/2/2**PE.maxL,mo=Math.min(PE_NOCT-1,Math.max(Math.floor(Math.log2(64/(3*en))),g.K[2]+4));
  const gh=peLayerKeep(V,g,eye,Rg,PE.boot>0?4:2,{pass:9,mo,e:.5});if(!V.want.length)return;
  // near cells with all eight blades, the rest with the inner four; in each cell the clumps of lowest rank first, as many as the
  // thinning keeps at the cell's nearest point (the vertex shader drops the rest clump by clump)
  const near=[],far=[],Wc=V.W;
  for(const [k] of V.want){const c=V.cells.get(k);if(!c||c.state!==2||!c.ids.length)continue;
    if(!c.ord){const o=[...c.idf.keys()].sort((a,b)=>c.rk[a]-c.rk[b]);c.ord=Float32Array.from(o.map(i=>c.idf[i]));c.ork=Float32Array.from(o.map(i=>c.rk[i]/255));}
    const dmin=Math.max(c.d-Wc*.72,0);if(dmin>Rg)continue;
    const t=c.node,cp=[t.c[0]*gh,t.c[1]*gh,t.c[2]*gh],rho=(Wc*.75+3)/Rm;
    if(!K.omni){const v=[cp[0]-eye[0],cp[1]-eye[1],cp[2]-eye[2]],z=dot3(v,K.fw);if(z<-rho)continue;const x=dot3(v,K.rt),y=dot3(v,K.up),pl=(a,b)=>(a-b*z)/Math.sqrt(1+b*b)>rho;if(pl(x,K.x1)||pl(-x,-K.x0)||pl(y,K.y1)||pl(-y,-K.y0))continue;}
    const keep=Math.min(1,Math.pow(Rn/Math.max(dmin,1),1.3));let lo=0,hi=c.ork.length;while(lo<hi){const m=(lo+hi)>>1;if(c.ork[m]<=keep+1e-6)lo=m+1;else hi=m;}
    const L=dmin<Rn?near:far;for(let i=0;i<lo;i++)L.push(c.ord[i]);}
  // the light map around the camera
  const P=PE.P.GLIT,N=32;
  if(!PE.glm){PE.glm=peTex(gl.TEXTURE_2D,gl.RGBA16F,N,N,1,true);PE.glmFB=peFB();gl.bindFramebuffer(gl.FRAMEBUFFER,PE.glmFB);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,PE.glm,0);}
  const er=Math.hypot(...eye),u=eye.map(x=>x/er),a=Math.abs(u[1])<.9?[0,1,0]:[1,0,0],cr=(p,q)=>[p[1]*q[2]-p[2]*q[1],p[2]*q[0]-p[0]*q[2],p[0]*q[1]-p[1]*q[0]];
  let e1=cr(a,u);const l1=Math.hypot(...e1);e1=e1.map(x=>x/l1);const e2=cr(u,e1),ext=Rg*1.3/Rm,O=u.map((x,i)=>x*gh-eye[i]);
  PE.glmU={O,U:e1.map(x=>x/ext),V:e2.map(x=>x/ext)};
  gl.bindFramebuffer(gl.FRAMEBUFFER,PE.glmFB);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(0,0,N,N);gl.useProgram(P.p);
  peLutBind(P.u);peAirU(P.u,g);if(peClouds())peCloudU(P.u,CO);gl.uniform3fv(P.u.uCam,eye);gl.uniform3fv(P.u.uSun,sun);gl.uniform3fv(P.u.uSunI,sI);
  gl.uniform3fv(P.u.uLO,O);gl.uniform3fv(P.u.uLX,e1.map(x=>x*ext));gl.uniform3fv(P.u.uLY,e2.map(x=>x*ext));gl.uniform1f(P.u.uLN,N);gl.drawArrays(gl.TRIANGLES,0,3);
  PE.grsDraw={near,far,Rg,Rn};PE.grsStat={cells:V.cells.size,near:near.length,far:far.length};}
// the blades, into the terrain targets (after the trees)
function peGrassDraw(g,eye,fw,rv,up,sun,sI,J){const D=PE.grsDraw;if(!D||!peGrassOn(g)||!(D.near.length+D.far.length))return;
  const V=PE.grs,P=PE.P.GRASS,u=P.u,Rm=g.R*1000;gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.disable(gl.CULL_FACE);gl.useProgram(P.p);
  for(const [nm,t,un] of [['uGP',V.P,3],['uGS',V.S,4],['uGC',V.T,5],['uLM',PE.glm,6]]){gl.activeTexture(gl.TEXTURE0+un);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(u[nm],un);}
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_3D,noiseTex);gl.uniform1i(u.uNoise,2);gl.activeTexture(gl.TEXTURE0);
  peLutBind(u);peAirU(u,g);peCamU(u,eye,fw,rv,up,sun,sI,J);peShU(u);
  const L=PE.glmU;gl.uniform3fv(u.uLO,L.O);gl.uniform3fv(u.uLU,L.U);gl.uniform3fv(u.uLV,L.V);
  gl.uniform1f(u.uTime,PE.vt%1e4);gl.uniform1f(u.uGR,D.Rg);gl.uniform1f(u.uGN,D.Rn);gl.uniform1f(u.uPix,2*viewTan()/Math.min(W,H));
  gl.uniform3fv(u.uVeg,g.veg);gl.uniform3fv(u.uDry,g.dry);gl.uniform3fv(u.uRock,g.rock);
  // the wind near the ground: east or west with the latitude's prevailing winds, a few metres a second, slowly rising and falling
  const er=Math.hypot(...eye),uu=eye.map(x=>x/er),el=Math.hypot(uu[2],uu[0])||1,east=[-uu[2]/el,0,uu[0]/el],U=peWindU(PE.camLat);
  const sp=Math.max(1.5,Math.min(8,Math.abs(U)*.45+1.5))*(.8+.2*Math.sin(PE.vt*.05)),wv=east.map(x=>x*(U<0?-1:1)*sp),md=(x,p)=>x-Math.floor(x/p)*p,tt=PE.vt;
  gl.uniform3fv(u.uWind,wv);gl.uniform3fv(u.uG1,wv.map(x=>md(x*tt,448)));gl.uniform3fv(u.uG2,wv.map(x=>md(x*tt*1.15,156.8)));gl.uniform3fv(u.uCamM,eye.map(x=>md(x*Rm,3136)));
  const C=1e8,far=1e3;gl.uniform1f(u.uLogC,C);gl.uniform1f(u.uLogF,2/Math.log2(1+C*far));
  gl.bindVertexArray(PE.grsVAO);gl.bindBuffer(gl.ARRAY_BUFFER,PE.grsIB);const n0=D.near.length,all=new Float32Array(n0+D.far.length);all.set(D.near);all.set(D.far,n0);gl.bufferData(gl.ARRAY_BUFFER,all,gl.STREAM_DRAW);
  if(n0){gl.vertexAttribPointer(4,1,gl.FLOAT,false,4,0);gl.drawElementsInstanced(gl.TRIANGLES,PE.grsNI*PE_GB,gl.UNSIGNED_SHORT,0,n0);}
  if(D.far.length){gl.vertexAttribPointer(4,1,gl.FLOAT,false,4,n0*4);gl.drawElementsInstanced(gl.TRIANGLES,PE.grsNI*4,gl.UNSIGNED_SHORT,0,D.far.length);}
  gl.bindVertexArray(VAO0);}
