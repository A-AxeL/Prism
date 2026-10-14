/* ---- rocks: boulders and stones on the ground ----
   Rocks lie in cells of the terrain quadtree (about 38 m across on an Earth-sized world, a slot every 1.2 m). A GPU pass works
   out each slot from the terrain generator: scree and boulders below steep and rocky ground, scattered stones in deserts, a few
   erratics anywhere, rocks along the shore. Each is one of a few lumpy, fractured meshes, turned, squashed and sized at random,
   half sunk into the ground; its surface is the world's rock colour with grain and veins, lichen and moss where it is damp,
   snow on top in the cold, and it is lit like the trees (sun, its shadows, sky, the ground's bounce). */
const PE_RV=8,PE_RCAP=256,peRCap=()=>({pc:1024,cinematic:640,ultra:512}[S.preset]||PE_RCAP);
// what lies at a slot. Returns (variant 1-4 or 0 none; size (radius, m); unused; unused)
const PE_GLROCK=`
vec4 rockPick(float T,float W,float hm,float sl,float rk,vec3 nz,vec3 r){
  if(hm<-.4||sl>.3)return vec4(0);   // (nothing perched on cliffs and spires: a rock rests only where the slope can hold it)
  float rock=smoothstep(.05,.25,sl+rk*.08+(nz.y-.5)*.1),dry=1.-smoothstep(.1,.4,W),shore=smoothstep(3.,.3,abs(hm-.8))*smoothstep(.45,.7,nz.x);
  float d0=rock*.32*(1.-smoothstep(.16,.3,sl))+.008+shore*.25,bar=dry*(1.-smoothstep(.05,.2,W)),d=d0+dry*.05*smoothstep(.45,.75,nz.y)+bar*(.06+.24*smoothstep(.3,.7,nz.y));
  if(r.x>d)return vec4(0);
  float sz=.18+1.7*pow(r.y,3.5)+rock*.8*pow(r.y,2.)*nz.z;sz*=shore>.3?.6:1.;
  if(r.x>d0)sz=.07+.28*pow(r.y,2.5)+1.3*pow(r.y,14.);   // (the pavement: mostly fist-sized, the odd boulder)
  // (worlds without water or rain have no river cobbles or rain-rounded boulders: only broken, angular kinds)
  float vk=floor(r.z*${PE_RV}.-.001);if(uTC.w<.5&&uTC.z<.3){const float AK[6]=float[6](0.,1.,2.,4.,5.,6.);vk=AK[int(min(r.z*6.,5.999))];}
  return vec4(1.+vk,sz,0,0);}
`;
const PE_GLRCELL=`
uniform highp sampler2D uRP,uRC;uniform mediump sampler2D uRS;uniform float uRkm;
struct RC{vec3 base,up,ex,ez;float size,seed,T,W;int kind;};
RC rockAt(int id){RC t;int cell=id>>10,slot=id&1023;ivec2 pt=ivec2((cell&15)*${PE_VC}+(slot&31),(cell>>4)*${PE_VC}+(slot>>5));
  vec4 P=texelFetch(uRP,pt,0),Sd=texelFetch(uRS,pt,0);t.kind=int(Sd.x*15.+.5);
  vec3 rel=texelFetch(uRC,ivec2(0,cell),0).xyz,c=texelFetch(uRC,ivec2(1,cell),0).xyz,T1=texelFetch(uRC,ivec2(2,cell),0).xyz,T2=texelFetch(uRC,ivec2(3,cell),0).xyz,
    Css=texelFetch(uRC,ivec2(4,cell),0).xyz,Cst=texelFetch(uRC,ivec2(5,cell),0).xyz,Ctt=texelFetch(uRC,ivec2(6,cell),0).xyz;
  vec2 st=P.xy;vec3 dl=T1*st.x+T2*st.y+.5*(Css*st.x*st.x+2.*Cst*st.x*st.y+Ctt*st.y*st.y);
  t.up=normalize(c+dl);t.base=rel+dl+t.up*P.z;float a=Sd.z*6.2832;vec3 e=normalize(cross(vec3(0,1,0),t.up)+vec3(1e-5,0,1e-5)),n=cross(t.up,e);
  t.ex=e*cos(a)+n*sin(a);t.ez=cross(t.ex,t.up);t.size=Sd.y*6.;t.seed=Sd.z;t.T=P.w*80.-40.;t.W=Sd.w;return t;}
`;
const PE_ROCKVS=()=>PE_HDR+PE_GLC()+PE_GLRCELL+PE_GLPROJ+`
layout(location=0) in vec3 aP;layout(location=1) in vec3 aN;layout(location=2) in float aAO;layout(location=4) in float iId;
uniform float uRR;uniform int uMatSet;
out vec3 vRel,vM,vN,vObj;out float vAO;flat out vec4 vInfo;
void main(){RC c=rockAt(int(iId+.5));if(c.kind==0){gl_Position=vec4(2,2,2,1);return;}
  float Rm=uRkm*1000.,d0=length(c.base)*Rm,s=c.size*(1.-smoothstep(uRR*.8,uRR,d0));
  // squashed and tilted a little, a third of it sunk in the ground
  float sq=(uMatSet==1?.68:.5)+(uMatSet==1?.3:.4)*fract(c.seed*7.31),tl=(fract(c.seed*3.7)-.5)*.5;vec3 p=aP*vec3(1.+.3*fract(c.seed*11.3),sq,1.),n=aN/vec3(1.+.3*fract(c.seed*11.3),sq,1.);
  float ct=cos(tl),st2=sin(tl);p=vec3(p.x,p.y*ct-p.z*st2,p.y*st2+p.z*ct);n=vec3(n.x,n.y*ct-n.z*st2,n.y*st2+n.z*ct);
  p*=s;p.y-=(uMatSet==1?.18:.3)*s*sq;   // (on Mars the wind has lowered the ground round them: they sit perched)
  vec3 o=c.ex*p.x+c.up*p.y+c.ez*p.z;vRel=c.base+o/Rm;vM=o;vN=normalize(c.ex*n.x+c.up*n.y+c.ez*n.z);vObj=aP*2.2+c.seed*31.;vAO=aAO;
  vInfo=vec4(c.size,c.T,c.W,c.seed);gl_Position=proj(vRel);}`;
const PE_ROCKFS=()=>PE_HDR+`#define CLOUDS ${peClouds()?1:0}
`+PE_GLC()+PE_GLN+PE_GLA()+(peClouds()?peGLCLD():'')+PE_GLTLIT+PE_GLSH+peGLMat()+`
uniform highp sampler3D uNoise;
`+PE_N3+`
uniform vec3 uRockC,uDryC,uIceC,uVegC;
in vec3 vRel,vM,vN,vObj;in float vAO;flat in vec4 vInfo;
layout(location=0) out vec4 o;layout(location=1) out vec4 oD;
void main(){
  // fractured faces read flat, worn edges rounded: the faceted normal leaned toward the smooth one
  vec3 fN=normalize(cross(dFdx(vM),dFdy(vM)));if(dot(fN,vN)<0.)fN=-fN;vec3 N=normalize(mix(fN,vN,.35));
  vec3 P=uCam+vRel;vec3 up=normalize(P);float nu=dot(N,up);
  float n1=n3(vObj),n2=n3(vObj*3.7+5.),n4=n3(vObj*12.+9.),sd=vInfo.w,T=vInfo.y,W=vInfo.z;
  // the rock: the world's rock colour, some boulders paler or rustier, grain and a few veins
  vec3 alb=mix(uRockC,mix(uRockC,uDryC,.5)*1.12,step(.75,fract(sd*13.7)))*(1.+.3*(fract(sd*5.3)-.5));
  alb*=rockTint(fract(geoU(up)+(fract(sd*7.3)-.5)*.4),uMatSet==1);   // (the formation it broke from, or one carried from nearby)
  alb*=(.72+.56*n1)*(.86+.28*n2)*(.9+.2*n4);alb=mix(alb,alb*1.6,smoothstep(.47,.5,n2)*smoothstep(.53,.5,n2)*.6);
  // lichen crusts where it is damp, moss on the tops in wet woods, dust in dry lands, snow on the tops in the cold
  alb=mix(alb,mix(vec3(.3,.31,.22),vec3(.42,.4,.3),n4),smoothstep(.58,.72,n2)*smoothstep(.12,.45,W)*.75);
  alb=mix(alb,uVegC*1.15,smoothstep(.15,.6,nu)*smoothstep(.45,.75,W)*smoothstep(.4,.62,n1)*smoothstep(-2.,6.,T));
  alb=mix(alb,uDryC*.8,smoothstep(.3,.8,nu)*(1.-smoothstep(.08,.3,W))*(uMatSet==1?.15+.45*smoothstep(.45,.75,n1):.5));   // (Mars: a patchy coat of dust on every upturned face)
  alb=mix(alb,uIceC,smoothstep(-1.,-7.,T)*smoothstep(.03,.12,W)*smoothstep(.35,.7,nu+(n2-.5)*.5));   // (snow needs some moisture: none on Mars)
  // the photo-scanned rock surface (grain, cracks, crystals), mapped three ways in metres around the rock: its relief tilts
  // the light, its pattern stays the world's rock colour
  if(uMatOn>.5){float pk=fract(sd*7.7);int L=uMatSet==1?(pk<.55?23:pk<.8?18:22):(pk<.4?12:pk<.7?13:pk<.85?18:15);
    vec3 a,gv;float h;matTri(L,vM*.5,N,a,gv,h);alb*=mix(vec3(1),clamp(a,.25,1.6),.75);N=normalize(N+gv*.55);alb*=.8+.3*h;}
  float ao=vAO*(.8+.2*n1);
  vec2 sh=sunSh(vRel+N*(.15/(uRkm*1000.)),.25);
  o=vec4(treeLight(alb,N,ao,0.,vRel,mix(1.,sh.x,sh.y),0.),gK);oD=vec4(length(vRel));}`;
// rock caster for the sun's shadow map (depth only)
const PE_ROCKSHVS=()=>PE_HDR+PE_GLC()+PE_GLRCELL+`
layout(location=0) in vec3 aP;layout(location=4) in float iId;
uniform vec3 uShO,uShX,uShY,uShZ;uniform float uRR;
// (pebbles cast no map shadow: half-sunk and hidden in grass, theirs showed as dark slabs on the ground)
void main(){RC c=rockAt(int(iId+.5));if(c.kind==0||c.size<.3){gl_Position=vec4(2,2,2,1);return;}
  float Rm=uRkm*1000.,d0=length(c.base)*Rm,s=c.size*(1.-smoothstep(uRR*.8,uRR,d0));
  float sq=.5+.4*fract(c.seed*7.31),tl=(fract(c.seed*3.7)-.5)*.5;vec3 p=aP*vec3(1.+.3*fract(c.seed*11.3),sq,1.);
  float ct=cos(tl),st2=sin(tl);p=vec3(p.x,p.y*ct-p.z*st2,p.y*st2+p.z*ct);p*=s*.86;p.y-=.3*s*sq;   // (the coarse caster shrunk to sit inside the drawn rock: else a rock shades its own top)
  vec3 q=c.base+(c.ex*p.x+c.up*p.y+c.ez*p.z)/Rm-uShO;gl_Position=vec4(dot(q,uShX),dot(q,uShY),dot(q,uShZ),1);}`;
const PE_ROCKSHFS=()=>PE_HDR+`out vec4 o;void main(){o=vec4(0);}`;
// the meshes, eight kinds: blocks and wedges broken along joints (flat faces, sharp edges, chipped), slabs, a weathered
// boulder, a shard, a ledgy sedimentary block, a pitted lava block, a river cobble. Each is an icosphere pulled onto its
// cutting planes, then roughened; flat underneath. LOD 0 is fine (5120 triangles), LOD 1 middling (320), LOD 2 coarse (80).
function peRockGen(){const V=[],I=[],sp=[],nm=a=>{const l=Math.hypot(...a)||1;return a.map(x=>x/l);},sb=(a,b)=>a.map((x,i)=>x-b[i]),
    cr=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dt=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  // smooth 3D value noise for roughness (hashed lattice)
  const hs=(x,y,z,s)=>{let h=(x*374761393+y*668265263+z*1274126177+s*144269)|0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
  const vn=(p,f,s)=>{const x=p[0]*f,y=p[1]*f,z=p[2]*f,i=Math.floor(x),j=Math.floor(y),k=Math.floor(z),u=x-i,v=y-j,w=z-k,S=t=>t*t*(3-2*t),a=S(u),b=S(v),c=S(w);let r=0;
    for(let q=0;q<8;q++){const di=q&1,dj=(q>>1)&1,dk=q>>2;r+=hs(i+di,j+dj,k+dk,s)*(di?a:1-a)*(dj?b:1-b)*(dk?c:1-c);}return r;};
  // (enough joint planes, cut deep enough, that nothing of the sphere they are cut from is left: every face a fracture)
  const kinds=[{pl:15,d:[.58,.8],lump:0,rough:.022},{pl:12,d:[.52,.8],lump:0,rough:.02,sc:[1.45,.85,.8]},{pl:11,d:[.6,.82],lump:0,rough:.015,sc:[1.2,.42,1.1]},
    {pl:4,d:[.75,.95],lump:.09,rough:.02},{pl:9,d:[.35,.7],lump:0,rough:.02,sc:[1.6,.7,.6]},{pl:12,d:[.6,.82],lump:0,rough:.02,ledge:6},
    {pl:13,d:[.55,.8],lump:.02,rough:.012,pits:1},{pl:0,d:[1,1],lump:.05,rough:.006,sc:[1.25,.7,1]}];
  for(let lod=0;lod<3;lod++){const r=rng(131);for(let v=0;v<PE_RV;v++){const K=kinds[v],t=(1+Math.sqrt(5))/2;let P=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(nm);
    let F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
    for(let s=0;s<[4,2,1][lod];s++){const mid=new Map(),m=(a,b)=>{const k=a<b?a+','+b:b+','+a;if(!mid.has(k)){P.push(nm(P[a].map((x,i)=>x+P[b][i])));mid.set(k,P.length-1);}return mid.get(k);};
      const F2=[];for(const [a,b,c] of F){const ab=m(a,b),bc=m(b,c),ca=m(c,a);F2.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}F=F2;}
    const W=[...Array(4)].map(()=>({d:nm([r()-.5,r()-.5,r()-.5]),f:2+3*r(),p:r()*6.3}));
    // joint planes spread around the sphere (golden spiral, jittered), so every side is broken, not only the top
    const pl=[...Array(K.pl)].map((_,i)=>{const y=1-2*(i+.5)/K.pl,rr=Math.sqrt(1-y*y),a=i*2.39996+r()*.9;return {n:nm([rr*Math.cos(a)+(r()-.5)*.5,y*.9+(r()-.5)*.4,rr*Math.sin(a)+(r()-.5)*.5]),d:K.d[0]+(K.d[1]-K.d[0])*r()};});
    const sc=K.sc||[1,1,1],seed=v*7+3;
    P=P.map(p=>{let k=1;for(const w of W)k+=K.lump*Math.sin(dt(p,w.d)*w.f+w.p);
      for(const q of pl){const c=dt(p,q.n);if(c>.02)k=Math.min(k,q.d/c);}
      // ledges: the block steps in at bedding planes
      if(K.ledge){const yy=p[1]*k,st=Math.floor((yy+1)*K.ledge*.5),fr=(yy+1)*K.ledge*.5-st;k*=1-.06*(st%2)-.04*Math.max(0,fr-.8)*5;}
      let o=p.map((x,i)=>x*k*sc[i]);
      // roughness: chipped and grainy, more on edges than in the middle of faces is left to the light; pits on lava
      const n=vn(o,6,seed)*.6+vn(o,13,seed+1)*.3+vn(o,29,seed+2)*.1-.5;let d=1+n*K.rough*4;
      if(K.pits){const pv=vn(o,18,seed+5);d-=Math.max(0,pv-.62)*.35;}
      o=o.map(x=>x*d);o[1]=Math.max(o[1],-.35);return o;});
    // normalise the size: the widest extent becomes 1
    let mx=0;for(const p of P)mx=Math.max(mx,Math.hypot(p[0],p[2]));P=P.map(p=>p.map(x=>x/mx));
    const N=P.map(()=>[0,0,0]);for(const [a,b,c] of F){const n=cr(sb(P[b],P[a]),sb(P[c],P[a]));for(const i of [a,b,c])for(let j=0;j<3;j++)N[i][j]+=n[j];}
    const base=V.length/7;P.forEach((p,i)=>{const n=nm(N[i]),ao=.45+.55*Math.min(1,Math.max(0,(p[1]+.35)/.8));V.push(...p,...n,ao);});
    const i0=I.length;for(const f of F)I.push(base+f[0],base+f[1],base+f[2]);sp.push({i0,n:I.length-i0});}}
  return {V:new Float32Array(V),I:new Uint32Array(I),sp};}   // sp: variants 0-7 fine, 8-15 middling, 16-23 coarse
function peRockQ(){return {battery:60,balanced:120,quality:180,ultra:250,cinematic:350,pc:800}[S.preset]||0;}
function peRockOn(g){return !!(!PE.rckOff&&PE.P&&PE.P.ROCK&&peRockQ());}
function peRockInit(g){const R=g.R;PE.rck=peLayer(Math.max(8,Math.min(22,Math.round(Math.log2(Math.PI/2*R/.15))+2)),peRCap(),R);
  if(!PE.rckVAO){const M=peRockGen();PE.rckM=M;const vao=gl.createVertexArray();gl.bindVertexArray(vao);const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,M.V,gl.STATIC_DRAW);
    [[0,3,0],[1,3,12],[2,1,24]].forEach(([l,n,o])=>{gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,n,gl.FLOAT,false,28,o);});
    const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,M.I,gl.STATIC_DRAW);
    PE.rckIB=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,PE.rckIB);gl.enableVertexAttribArray(4);gl.vertexAttribPointer(4,1,gl.FLOAT,false,4,0);gl.vertexAttribDivisor(4,1);gl.bindVertexArray(VAO0);PE.rckVAO=vao;}}
function peRockFree(){if(PE.rck)peLayerFree(PE.rck);PE.rck=null;}
// once a frame, before the shadow pass: keep the cells and list the rocks to draw (and those that shade the ground near the camera)
function peRockFrame(g,eye,K){PE.rckDraw=null;if(!peRockOn(g))return;if(!PE.rck||PE.rck.key!==g.tKey||PE.rck.cap!==peRCap()){peRockFree();peRockInit(g);PE.rck.key=g.tKey;}
  const V=PE.rck,R=peRockQ(),Rm=g.R*1000,en=.9*Math.PI/2/2**PE.maxL,mo=Math.min(PE_NOCT-1,Math.max(Math.floor(Math.log2(64/(3*en))),g.K[2]+4));
  const gh=peLayerKeep(V,g,eye,R,(PE.boot>0?4:2)*(S.preset==='pc'?3:1),{pass:10,mo,e:1});
  const per=[],shd=[],D=PE.vegDraw,shQ=peShQ(),Rsh=shQ?Math.max(D?D.R_mesh:0,60)*shQ[1]*1.42+V.W:0;for(let s=0;s<=3*PE_RV;s++){per.push([]);shd.push([]);}
  let shK=0;
  for(const [k] of V.want){const c=V.cells.get(k);if(!c||c.state!==2||!c.ids.length)continue;
    if(c.d<Rsh){for(let i=0;i<c.ids.length;i++)shd[c.sp[i]+2*PE_RV].push(c.idf[i]);shK=(shK*31+c.slot*7+c.ids.length)%1e9;}
    const t=c.node,cp=[t.c[0]*gh,t.c[1]*gh,t.c[2]*gh],rho=(V.W*.75+12)/Rm;
    if(!K.omni){const v=[cp[0]-eye[0],cp[1]-eye[1],cp[2]-eye[2]],z=dot3(v,K.fw);if(z<-rho)continue;const x=dot3(v,K.rt),y=dot3(v,K.up),pl=(a,b)=>(a-b*z)/Math.sqrt(1+b*b)>rho;if(pl(x,K.x1)||pl(-x,-K.x0)||pl(y,K.y1)||pl(-y,-K.y0))continue;}
    // the fine meshes in the cells around the camera, middling ones in the next ring, coarse ones beyond (and in the shadow map)
    const lod=c.d<18?0:c.d<V.W*1.2+25?PE_RV:2*PE_RV;for(let i=0;i<c.ids.length;i++)per[c.sp[i]+lod].push(c.idf[i]);}
  PE.rckDraw={per,shd,shK:shK+':'+shd.reduce((s,a)=>s+a.length,0),R};PE.rckStat={cells:V.cells.size,n:per.reduce((s,a)=>s+a.length,0)};}
const peRockBind=(P,g)=>{const V=PE.rck;for(const [nm,t,un] of [['uRP',V.P,3],['uRS',V.S,4],['uRC',V.T,5]]){gl.activeTexture(gl.TEXTURE0+un);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(P.u[nm],un);}
  gl.activeTexture(gl.TEXTURE0);gl.uniform1f(P.u.uRkm,g.R);gl.uniform1f(P.u.uRR,PE.rckDraw.R);};
// draw instanced lists, one per mesh variant
function peRockInst(lists){const all=[],off=[];for(let s=0;s<lists.length;s++){off.push(all.length);for(const x of lists[s])all.push(x);}if(!all.length)return;
  gl.bindVertexArray(PE.rckVAO);gl.bindBuffer(gl.ARRAY_BUFFER,PE.rckIB);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(all),gl.STREAM_DRAW);
  for(let s=1;s<lists.length;s++){const n=lists[s].length;if(!n)continue;const m=PE.rckM.sp[s-1];gl.vertexAttribPointer(4,1,gl.FLOAT,false,4,off[s]*4);gl.drawElementsInstanced(gl.TRIANGLES,m.n,gl.UNSIGNED_INT,m.i0*4,n);}
  gl.bindVertexArray(VAO0);}
// into the shadow map (called by the shadow pass while its target is bound)
function peRockShadow(g,Sh){const D=PE.rckDraw;if(!D||!PE.P.RSHD)return;const P=PE.P.RSHD;gl.useProgram(P.p);peRockBind(P,g);
  gl.uniform3fv(P.u.uShO,Sh.O);gl.uniform3fv(P.u.uShX,Sh.X);gl.uniform3fv(P.u.uShY,Sh.Y);gl.uniform3fv(P.u.uShZ,Sh.Z);peRockInst(D.shd);}
function peRockDraw(g,eye,fw,rv,up,sun,sI,J,CO){const D=PE.rckDraw;if(!D||!peRockOn(g)||!D.per.some(a=>a.length))return;const P=PE.P.ROCK,u=P.u;
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.disable(gl.CULL_FACE);gl.useProgram(P.p);peRockBind(P,g);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_3D,noiseTex);gl.uniform1i(u.uNoise,2);gl.activeTexture(gl.TEXTURE0);
  peLutBind(u);peAirU(u,g);peCamU(u,eye,fw,rv,up,sun,sI,J);if(peClouds())peCloudU(u,CO);peShU(u);peMatU(u,g);
  gl.uniform3fv(u.uRockC,g.rock);gl.uniform3fv(u.uDryC,g.dry);gl.uniform3fv(u.uIceC,g.ice);gl.uniform3fv(u.uVegC,g.veg);gl.uniform3fv(u.uLeafTint,[1,1,1]);
  const C=1e8,far=1e3;gl.uniform1f(u.uLogC,C);gl.uniform1f(u.uLogF,2/Math.log2(1+C*far));peRockInst(D.per);}
