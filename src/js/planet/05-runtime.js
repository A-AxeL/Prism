// Earth's air: Rayleigh and Mie coefficients per km, scale heights (km), ozone layer, and the top of the atmosphere
const PE_AIR={ray:[5.802,13.558,33.1],mie:[3.996,3.996,3.996],mieE:[4.4,4.4,4.4],hr:8,hm:1.2,g:.8,oz:[.65,1.881,.085],ozC:25,ozW:15,top:100,ga:[.3,.3,.3]};
const PE={tk:1,genN:0,P:null,key:'',tiles:new Map(),roots:null,fr:0,nslot:0,st:[],free:[],maxL:19,tgt:8,budget:8,
  rb:{sync:null,snap:null},pr:{sync:null,h:0,wl:-1,ok:false,fresh:0},lutK:'',macK:'',trg:{w:0,h:0},vp:0,hist:false,jit:[.5,.5],prev:null,genT:0,
  wt:0,vt:0,flowA:0,flowC:0,camLat:0,wxM:0};
// the sun's disc: its angular radius (co.sunR degrees, the real 0.265° seen from Earth unless a scene says otherwise, times the
// builder's size), its edge (the last quarter limb-darkened) and the radiance that keeps the light it gives the same
function sunDiskU(co){const r=(co.sunR||.265)*(co.sunSize||1)*Math.PI/180;return [1.264/(Math.PI*r*r),Math.cos(r),Math.cos(.764*r)];}
const peOn=()=>{const co=SCENES[S.scene].cosmos;return !!(co&&co.kind===0&&fFloat&&co.pe!==false);};
// a world's terrain, climate, colors and air, with defaults filled in (older scene fields map onto the new ones)
function peCfg(co){if(co._pe)return co._pe;const t=co.pe||{},R=t.R||6371,kR=Math.round(Math.log2(R/6371)),K=x=>Math.max(0,Math.min(PE_NOCT-4,x+kR));
  const sea=co.sea??.5,seas=t.seas??(sea>=0),rel=t.relief??co.relief??1,a=Object.assign({},PE_AIR,t.air||{}),p=k=>co[k]||[.2,.2,.2];
  const c={R,kR,K:[K(1),K(2),K(5),K(3)],seed:t.seed??3,
    TP:[t.cont??(seas?.55+(sea-.5)*3:-1.),(t.mount??3.4)*rel,(t.hill??.55)*rel,R],
    TF:[t.crater||0,t.canyon||0,t.mesa||0,t.dune??.6],TC:[seas?(t.lakes??.5):0,t.temp||0,t.hum??1,seas?1:0],TR:[t.gain??.56,t.erode??1,t.rivers??(seas?1:.6),t.landforms??1],
    veg:t.veg||p('p1').map(v=>v*.9),dry:t.dry||p('p3'),rock:t.rock||p('p2').map(v=>v*.65),ice:t.ice||p('p4'),sand:t.sand||p('p3').map(v=>v*.9+.06),
    ocean:co.ocean||[.003,.012,.03],lava:co.lava||0,lavaC:co.lavaC||[1,.35,.08],city:co.city||0,cap:t.cap??90,rough:t.rough??1,air:a,
    VC:new Float32Array(16),VS:new Float32Array(16),
    day:t.day??((co.spin??1)>0?24/(co.spin??1):0),wx:{storm:t.storm??1,cover:t.cloudBias??0,dust:t.dust??.5},veg3d:t.trees??((t.hum??1)>.1&&(t.temp||0)>-30&&!co.lava),forest:t.forest??1};
  // shield volcanoes: up to four, at low latitudes, placed by the seed (height, radius and the cliff round the base)
  {const nv=Math.min(4,t.volcano||0),r=rng(7717+c.seed*13);for(let i=0;i<nv;i++){const la=(r()-.5)*60*Math.PI/180,lo=r()*Math.PI*2,s=i===0?1:.45+.4*r();
      c.VC.set([-Math.cos(la)*Math.sin(lo),Math.sin(la),Math.cos(la)*Math.cos(lo),(t.vH??18)*s],i*4);c.VS.set([(t.vR??300)*Math.sqrt(s),.05+.03*r(),(t.vEsc??4)*s,0],i*4);}}
  // what each part depends on: a color change keeps the tiles, the weather and the trees
  c.tKey=JSON.stringify([c.K,c.TP,c.TF,c.TC,c.TR,c.seed,c.R,t.volcano||0,t.vH,t.vR]);c.wxKey=c.tKey+JSON.stringify(c.wx);c.vKey=c.tKey+c.veg3d+c.forest;
  co._pe=c;return c;}
const peSrcs=()=>({TGEN:[VS,PE_TGEN()],TWX:[VS,PE_TGEN(true)],TPOST:[VS,PE_TPOST()],LUT:[VS,PE_LUT()],TERR:[PE_TERRVS(),PE_TERRFS()],VOL:[VS,PE_VOL()],RES:[VS,PE_RES()],COMP:[VS,PE_COMP()],
  TREE:[PE_TREEVS(),PE_TREEFS()],IMP:[PE_IMPVS(),PE_IMPFS()],TBAKE:[PE_TBVS(),PE_TBFS()],TSHD:[PE_SHVS(),PE_SHFS()],SHBL:[VS,PE_SHBL()],TSM:[PE_TSMVS(),PE_TSMFS()],ROCK:[PE_ROCKVS(),PE_ROCKFS()],RSHD:[PE_ROCKSHVS(),PE_ROCKSHFS()],GRASS:[PE_GRVS(),PE_GRFS()],GLIT:[VS,PE_GLITFS()]});
// compile the engine's programs without blocking (finished in pollBuild); unchanged sources keep their programs. Only the core
// programs (ground, air, clouds) hold up the first picture; trees, grass, rocks and shadows compile afterwards in the background,
// one at a time where the browser cannot compile in parallel (Firefox), and switch on as they arrive.
const PE_EXTRA=['TREE','IMP','TBAKE','TSHD','SHBL','TSM','ROCK','RSHD','GRASS','GLIT'];
function peLink(n,vs,fs,key){const v=gl.createShader(gl.VERTEX_SHADER),f=gl.createShader(gl.FRAGMENT_SHADER),p=gl.createProgram();
  gl.shaderSource(v,vs);gl.compileShader(v);gl.shaderSource(f,fs);gl.compileShader(f);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);return {n,p,v,f,key};}
// programs are cached by name and source, so each world's variants (Earth, Mars, clouds on or off) stay compiled
function peFinish(x){gl.deleteShader(x.v);gl.deleteShader(x.f);PE.cache=PE.cache||new Map();const r={p:x.p,u:progU(x.p),key:x.key};PE.cache.set(x.n+'|'+x.key,r);return r;}
function peBuild(){const srcs=peSrcs(),list=[];PE.cache=PE.cache||new Map();PE.xq=[];PE.xrun=[];
  for(const [n,[vs,fs]] of Object.entries(srcs)){const key=vs.length+':'+fs;const hit=PE.cache.get(n+'|'+key);if(hit){list.push({n,hit});continue;}
    const w=warmTake('pe|'+n+'|'+key);if(w){w.n=n;w.key=key;(PE_EXTRA.includes(n)?PE.xrun:list).push(w);continue;}
    if(PE_EXTRA.includes(n)){PE.xq.push({n,vs,fs,key});continue;}
    list.push(peLink(n,vs,fs,key));}
  pending={pe:true,list};document.body.classList.add('busy');if(!pExt)pollBuild(true);}
// once a frame: the background programs (all started at once with parallel compiling, else one a frame)
function peExtras(){if(!PE.P)return;
  if(PE.xq&&PE.xq.length&&(pExt||!PE.xrun.length)){const take=pExt?PE.xq.splice(0):PE.xq.splice(0,1);for(const x of take)PE.xrun.push(peLink(x.n,x.vs,x.fs,x.key));}
  if(!PE.xrun||!PE.xrun.length)return;
  PE.xrun=PE.xrun.filter(x=>{if(pExt&&!gl.getProgramParameter(x.p,pExt.COMPLETION_STATUS_KHR))return true;
    if(!gl.getProgramParameter(x.p,gl.LINK_STATUS)){console.warn('Prism: '+x.n+' did not compile\n'+(gl.getShaderInfoLog(x.f)||'')+(gl.getShaderInfoLog(x.v)||''));gl.deleteProgram(x.p);gl.deleteShader(x.v);gl.deleteShader(x.f);return false;}
    PE.P[x.n]=peFinish(x);return false;});}
function pePoll(force){const L=pending.list;
  if(!force&&pExt&&!L.every(x=>x.hit||gl.getProgramParameter(x.p,pExt.COMPLETION_STATUS_KHR)))return false;
  pending=null;document.body.classList.remove('busy');let err='';
  for(const x of L){if(x.hit)continue;if(!gl.getProgramParameter(x.p,gl.LINK_STATUS))err+=x.n+':\n'+(gl.getShaderInfoLog(x.f)||'')+(gl.getShaderInfoLog(x.v)||'')+(gl.getProgramInfoLog(x.p)||'')+'\n';}
  if(err){for(const x of L)if(!x.hit){gl.deleteProgram(x.p);gl.deleteShader(x.v);gl.deleteShader(x.f);}broken=true;errEl.style.display='grid';errEl.textContent='Shader error:\n'+err;return true;}
  const P={};
  for(const x of L)P[x.n]=x.hit||peFinish(x);
  PE.P=P;TR={p:null,u:{},pe:true};broken=false;errEl.style.display='none';
  try{OUT=OUT||prog(outFS);}catch(e){broken=true;errEl.style.display='grid';errEl.textContent='Shader error:\n'+e;}
  PE.lutK='';PE.macK='';reset();return true;}
// textures and framebuffers
function peTex(kind,fmt,w,h,d,lin){const t=gl.createTexture();gl.bindTexture(kind,t);
  if(kind===gl.TEXTURE_2D)gl.texStorage2D(kind,1,fmt,w,h);else if(kind===gl.TEXTURE_CUBE_MAP)gl.texStorage2D(kind,1,fmt,w,w);else gl.texStorage3D(kind,1,fmt,w,h,d);
  const f=lin?gl.LINEAR:gl.NEAREST;gl.texParameteri(kind,gl.TEXTURE_MIN_FILTER,f);gl.texParameteri(kind,gl.TEXTURE_MAG_FILTER,f);
  for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(kind,k,gl.CLAMP_TO_EDGE);gl.bindTexture(kind,null);return t;}
// the terrain program's cube samplers point at one unit that never holds a render target of its passes
function peTgenSamp(G){for(const k of ['uGeo','uWpA','uWpB','uMacW'])if(G.u[k])gl.uniform1i(G.u[k],11);}
function peFB(){return gl.createFramebuffer();}
function peAtlas(){const n=PE.nslotW;if(PE.nslot===n&&PE.A)return;
  if(PE.A){for(const t of [PE.A,PE.B,PE.C,PE.bnd])gl.deleteTexture(t);}
  // a new atlas holds nothing yet: every tile is made again (old tiles would point at slots that new ones reuse)
  PE.roots=null;PE.hist=false;PE.boot=6;PE.tk=1;
  PE.A=peTex(gl.TEXTURE_2D_ARRAY,gl.RG32F,PE_TS,PE_TS,n,false);PE.B=peTex(gl.TEXTURE_2D_ARRAY,gl.RGBA8,PE_TS,PE_TS,n,true);PE.C=peTex(gl.TEXTURE_2D_ARRAY,gl.RGBA16F,PE_TS,PE_TS,n,true);
  PE.bnd=peTex(gl.TEXTURE_2D,gl.RGBA32F,n,1,1,false);PE.fbG=PE.fbG||peFB();PE.fbC=PE.fbC||peFB();PE.fbB=PE.fbB||peFB();
  gl.bindFramebuffer(gl.FRAMEBUFFER,PE.fbB);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,PE.bnd,0);
  if(PE.rb.pbo)gl.deleteBuffer(PE.rb.pbo);PE.rb.pbo=gl.createBuffer();gl.bindBuffer(gl.PIXEL_PACK_BUFFER,PE.rb.pbo);gl.bufferData(gl.PIXEL_PACK_BUFFER,n*16,gl.STREAM_READ);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
  if(PE.rb.sync){gl.deleteSync(PE.rb.sync);PE.rb.sync=null;}
  PE.nslot=n;PE.st=new Array(n).fill(null);PE.free=[...Array(n).keys()].reverse();for(const t of PE.tiles.values()){t.ready=false;t.slot=-1;}}
function peTargets(){if(!PE.vs)PE.vs=2;if(PE.trg.w===W&&PE.trg.h===H&&PE.trg.vs===PE.vs&&PE.tC)return;const T=PE.trg;
  if(PE.tC){gl.deleteTexture(PE.tC);gl.deleteTexture(PE.tDs);gl.deleteRenderbuffer(PE.tD);for(const r of [PE.vr,...PE.vh])r.t.forEach(t=>gl.deleteTexture(t));}
  PE.tC=peTex(gl.TEXTURE_2D,gl.RGBA16F,W,H,1,false);PE.tD=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,PE.tD);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT32F,W,H);
  // the ground's distance gets its own full-precision target: half floats quantize it into rings in the air above
  PE.tDs=peTex(gl.TEXTURE_2D,gl.R32F,W,H,1,false);
  PE.fbT=PE.fbT||peFB();gl.bindFramebuffer(gl.FRAMEBUFFER,PE.fbT);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,PE.tC,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,PE.tDs,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,PE.tD);
  const w=Math.ceil(W/PE.vs),h=Math.ceil(H/PE.vs),mk2=lin=>{const f=peFB(),t=[peTex(gl.TEXTURE_2D,gl.RGBA16F,w,h,1,lin),peTex(gl.TEXTURE_2D,gl.RGBA16F,w,h,1,lin)];
    gl.bindFramebuffer(gl.FRAMEBUFFER,f);t.forEach((x,i)=>gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,x,0));gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);return {f,t};};
  PE.vr=mk2(false);PE.vh=[mk2(true),mk2(true)];PE.hist=false;T.w=W;T.h=H;T.vs=PE.vs;}
// the mesh every tile is drawn with: a 33×33 grid plus a skirt around the edge (hides cracks between levels)
function peMesh(){if(PE.vao)return;const V=[],I=[],G=32,id=(i,j)=>j*(G+1)+i;
  for(let j=0;j<=G;j++)for(let i=0;i<=G;i++)V.push(i,j,0);
  for(let j=0;j<G;j++)for(let i=0;i<G;i++){const a=id(i,j),b=id(i+1,j),c=id(i+1,j+1),d=id(i,j+1);I.push(a,b,c,a,c,d);}
  const edge=(pts,out)=>{const base=V.length/3;for(const [i,j] of pts)V.push(i,j,1);
    for(let k=0;k<pts.length-1;k++){const A=id(...pts[k]),B=id(...pts[k+1]),A2=base+k,B2=base+k+1;if(out)I.push(A,A2,B,B,A2,B2);else I.push(A,B,A2,B,B2,A2);}};
  const r=[...Array(G+1).keys()];edge(r.map(i=>[i,0]),true);edge(r.map(j=>[G,j]),true);edge(r.map(i=>[i,G]),false);edge(r.map(j=>[0,j]),false);
  PE.nIdx=I.length;PE.vao=gl.createVertexArray();gl.bindVertexArray(PE.vao);
  const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(V),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);
  const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(I),gl.STATIC_DRAW);
  PE.ib=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,PE.ib);for(let k=0;k<9;k++){gl.enableVertexAttribArray(1+k);gl.vertexAttribPointer(1+k,4,gl.FLOAT,false,144,k*16);gl.vertexAttribDivisor(1+k,1);}
  gl.bindVertexArray(VAO0);}
/* ---- the tile quadtree ---- */
function pePos(f,u,v){const F=PE_F[f],a=Math.tan(u*Math.PI/4),b=Math.tan(v*Math.PI/4),q=[0,1,2].map(i=>F[0][i]+F[1][i]*a+F[2][i]*b),l=Math.hypot(...q);return q.map(x=>x/l);}
function peNode(f,L,x,y,par){const n=2**L,du=2/n,u0=-1+x*du,v0=-1+y*du,P=(s,t)=>pePos(f,u0+(s*.5+.5)*du,v0+(t*.5+.5)*du);
  const c=P(0,0),a=P(1,0),b=P(-1,0),C=P(0,1),D=P(0,-1),p11=P(1,1),p1m=P(1,-1),pm1=P(-1,1),pmm=P(-1,-1),A=[0,1,2];
  const T1=A.map(i=>(a[i]-b[i])/2),T2=A.map(i=>(C[i]-D[i])/2),Css=A.map(i=>a[i]-2*c[i]+b[i]),Ctt=A.map(i=>C[i]-2*c[i]+D[i]),Cst=A.map(i=>(p11[i]-p1m[i]-pm1[i]+pmm[i])/4);
  const e=2*Math.max(Math.hypot(...T1),Math.hypot(...T2)),en=.9*Math.PI/2/2**L,g=PE.cfg,m=par?Math.min(e*.08,.06/g.R)+.002/g.R:0;
  const t={f,L,x,y,u0,v0,du,c,T1,T2,Css,Cst,Ctt,e,en,par,m,ef:-1,emin:0,emax:0,ch:null,slot:-1,ready:false,used:0,gid:0,bk:false,
    hmin:par?par.hmin-m:-12/g.R,hmax:par?par.hmax+m:16/g.R,mo:Math.min(PE_NOCT-1,Math.max(Math.floor(Math.log2(64/(3*en))),g.K[2]+4))};
  return t;}
// which face and face coordinates a direction falls on (the inverse of pePos)
function peUV(d){let f=0,b=-9;for(let i=0;i<6;i++){const F=PE_F[i][0],k=d[0]*F[0]+d[1]*F[1]+d[2]*F[2];if(k>b){b=k;f=i;}}
  const F=PE_F[f],dt=(a)=>d[0]*a[0]+d[1]*a[1]+d[2]*a[2];return [f,Math.atan(dt(F[1])/b)*4/Math.PI,Math.atan(dt(F[2])/b)*4/Math.PI];}
const peKey=(f,L,x,y)=>((f*32+L)*4194304+x)*4194304+y;
// across each edge, is the drawn neighbor coarser (1) or finer (2)? Edge vertices then morph fully (or not at all), so levels meet without cracks
function peEdges(t,dk){let m=0;const s=[[-.25,.5],[1.25,.5],[.5,-.25],[.5,1.25]];
  for(let i=0;i<4;i++){const [f,u,v]=peUV(pePos(t.f,t.u0+s[i][0]*t.du,t.v0+s[i][1]*t.du));let lv=-1;
    for(let L=t.L;L>=0;L--){const n=2**L,x=Math.min(n-1,Math.floor((u+1)/2*n)),y=Math.min(n-1,Math.floor((v+1)/2*n));if(dk.has(peKey(f,L,x,y))){lv=L;break;}}
    m+=(lv<0?2:lv<t.L?1:0)*4**i;}
  return m;}
function peKids(t){t.ch=[[0,0],[1,0],[0,1],[1,1]].map(([i,j])=>peNode(t.f,t.L+1,t.x*2+i,t.y*2+j,t));}
// a tile's height range: its own once the GPU has reported it, otherwise its nearest known ancestor's, widened a little
function peB(t){if(t.bk||!t.par)return t;if(t.ef!==PE.fr){const p=peB(t.par);t.emin=p.hmin-t.m;t.emax=p.hmax+t.m;t.ef=PE.fr;}return {hmin:t.emin,hmax:t.emax};}
// distance from the camera to a tile, horizontal and vertical apart: a wide height range then never makes a far tile look near
function peDist(t,cp){const b=peB(t),R=Math.hypot(cp[0],cp[1],cp[2]),u=[cp[0]/R,cp[1]/R,cp[2]/R],ch=Math.hypot(u[0]-t.c[0],u[1]-t.c[1],u[2]-t.c[2]);
  const ang=2*Math.asin(Math.min(1,ch/2)),dh=Math.max(0,ang*Math.min(R,1+b.hmax)-t.e*.72),a=R-1,dv=Math.max(0,a-b.hmax,b.hmin-a);
  return Math.hypot(dh,dv);}
function peCull(t,cp,K){const b=peB(t),hm=(b.hmin+b.hmax)/2,r=1+hm,C=[t.c[0]*r,t.c[1]*r,t.c[2]*r],rho=t.e*.75+(b.hmax-b.hmin)/2;
  if(t.L>=2){const D=Math.hypot(...cp),Ro=K.occ;if(D>Ro){const dh=Math.sqrt(D*D-Ro*Ro),X=Math.hypot(...C)+rho,dm=dh+Math.sqrt(Math.max(X*X-Ro*Ro,0));
      if(Math.hypot(C[0]-cp[0],C[1]-cp[1],C[2]-cp[2])-rho>dm)return true;}}
  if(K.omni)return false;
  const v=[C[0]-cp[0],C[1]-cp[1],C[2]-cp[2]],x=dot3(v,K.rt),y=dot3(v,K.up),z=dot3(v,K.fw);
  if(K.ortho)return x-K.x1>rho||K.x0-x>rho||y-K.y1>rho||K.y0-y>rho||z<-rho;
  if(z<-rho)return true;
  const pl=(a,b)=>(a-b*z)/Math.sqrt(1+b*b)>rho;return pl(x,K.x1)||pl(-x,-K.x0)||pl(y,K.y1)||pl(-y,-K.y0);}
// Tiles within PE.near metres of the camera are refined and kept whether or not they are in view (only those in view are
// drawn), so turning the camera never reveals coarse tiles that then sharpen
function peSelect(cp,K,need){const draw=[],fr=PE.fr,split=t=>t.L<PE.maxL&&t.d<t.en*K.fpx/(32*PE.tgt*PE.tk),nr=(PE.near||1500)/(PE.cfg.R*1000);
  let nu=0;const visit=(t,vis)=>{t.used=fr;nu++;t.d=peDist(t,cp);
    if(split(t)){if(!t.ch)peKids(t);let ok=true;
      let nc=0;for(const k of t.ch){k.cul=peCull(k,cp,K);k.d=peDist(k,cp);k.keep=!k.cul||k.d<nr;if(k.keep){k.used=fr;nc++;if(!k.ready){ok=false;need.push(k);}}}
      if(ok){for(const k of t.ch)if(k.keep)visit(k,!k.cul);return;}nu+=nc;}
    if(vis)draw.push(t);};
  for(const r of PE.roots){r.used=fr;const c=peCull(r,cp,K);r.d=peDist(r,cp);if(c&&r.d>=nr)continue;if(r.ready)visit(r,!c);else need.push(r);}
  PE.selN=nu;return draw;}
// octave bases of the noise ladder at a point, in double precision: integer cell and fraction for every octave
function peBases(c){const I=new Int32Array(PE_NOCT*3),F=new Float32Array(PE_NOCT*3);let v=[c[0],c[1],c[2]];
  for(let k=0;k<PE_NOCT;k++){for(let a=0;a<3;a++){const b=v[a]+PE_OF[k][a],f=Math.floor(b);I[k*3+a]=f|0;F[k*3+a]=b-f;}v=peQ(v).map(x=>2*x);}return {I,F};}
function peTerrU(u,g){gl.uniform3iv(u.uSeed,[g.seed*1013|0,g.seed*7919|0,g.seed*104729|0]);gl.uniform4iv(u.uK,g.K);if(u.uVc){gl.uniform4fv(u.uVc,g.VC);gl.uniform4fv(u.uVs,g.VS);}
  gl.uniform4fv(u.uTP,g.TP);gl.uniform4fv(u.uTF,g.TF);gl.uniform4fv(u.uTC,g.TC);gl.uniform4fv(u.uTR,PE.trO||g.TR);   // (PE.trO: a test override of the relief settings)
}
function peTileU(u,t){const dm=t.L<10;gl.uniform1i(u.uMode,dm?0:1);gl.uniform1i(u.uFace,t.f);gl.uniform4f(u.uUV,t.u0,t.v0,t.du,t.du);
  gl.uniform3fv(u.uC,t.c);gl.uniform3fv(u.uT1,t.T1);gl.uniform3fv(u.uT2,t.T2);gl.uniform3fv(u.uCss,t.Css);gl.uniform3fv(u.uCst,t.Cst);gl.uniform3fv(u.uCtt,t.Ctt);}
function peSlot(){if(PE.free.length)return PE.free.pop();let best=-1,bu=Infinity;
  for(let s=0;s<PE.nslot;s++){const t=PE.st[s];if(!t||t.L===0)continue;const u=t.used+(PE.fr-t.used>1?0:1e9)-t.L*.01;if(u<bu){bu=u;best=s;}}
  if(best<0||bu>=1e8)return -1;const t=PE.st[best];t.ready=false;t.slot=-1;PE.st[best]=null;return best;}
function peGen(t){const s=peSlot();if(s<0)return false;const G=PE.P.TGEN,Pp=PE.P.TPOST,b=peBases(t.c);
  gl.bindFramebuffer(gl.FRAMEBUFFER,PE.fbG);gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,PE.A,0,s);gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,PE.B,0,s);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.viewport(0,0,PE_TS,PE_TS);gl.useProgram(G.p);peTgenSamp(G);
  gl.uniform1i(G.u.uPass,0);gl.uniform1i(G.u.uMO,t.mo);peTileU(G.u,t);gl.uniform3iv(G.u.uOI,b.I);gl.uniform3fv(G.u.uOF,b.F);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindFramebuffer(gl.FRAMEBUFFER,PE.fbC);gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,PE.C,0,s);gl.useProgram(Pp.p);
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D_ARRAY,PE.A);gl.uniform1i(Pp.u.uTA,3);gl.uniform1i(Pp.u.uPass,0);gl.uniform1i(Pp.u.uSlot,s);peTileU(Pp.u,t);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindFramebuffer(gl.FRAMEBUFFER,PE.fbB);gl.viewport(s,0,1,1);gl.uniform1i(Pp.u.uPass,1);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.activeTexture(gl.TEXTURE0);t.slot=s;t.ready=true;t.gid=++PE.genN;PE.st[s]=t;PE.newTiles=true;return true;}
// the GPU's height ranges of new tiles come back a frame or two later and tighten their bounds
function peBounds(){const R=PE.rb;
  if(R.sync){if(gl.clientWaitSync(R.sync,0,0)===gl.TIMEOUT_EXPIRED)return;gl.deleteSync(R.sync);R.sync=null;
    const a=new Float32Array(PE.nslot*4);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,R.pbo);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,a);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
    R.snap.forEach((g,s)=>{const t=PE.st[s];if(g&&t&&t.gid===g&&isFinite(a[s*4])){t.hmin=a[s*4];t.hmax=a[s*4+1];t.bk=true;}});R.snap=null;}
  if(!R.sync&&PE.st.some(t=>t&&!t.bk)){R.snap=PE.st.map(t=>t&&!t.bk?t.gid:0);gl.bindFramebuffer(gl.FRAMEBUFFER,PE.fbB);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,R.pbo);
    gl.readPixels(0,0,PE.nslot,1,gl.RGBA,gl.FLOAT,0);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);R.sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);}}
// air uniforms: per-km coefficients become per planet radius
// Haze grains several times the wavelength (Mars's dust, about 3 µm across) send a share of the light they meet (pk, up to
// about half of their extinction, by diffraction round the grain) into a narrow forward lobe a few degrees wide. That light
// keeps going with the beam, so it is taken out of the extinction (δ-scaling) and out of the scattering that feeds the
// many-times-scattered glow; it is put back, as single scattering, through the lobe itself (phP, widths gp per colour). It is
// never absorbed (it does not pass through the grain), while what is refracted through the grain loses its blue: hence a
// white-blue glow round the sun under a dun sky
function peAirU(u,g){const a=g.air,R=g.R,k=S.atmDensity,m=(v,s)=>v.map(x=>x*s*k*1e-3*R),pk=Math.min(.95,Math.max(0,a.pk||0)),pe=a.mieE.map(x=>x*pk);
  gl.uniform3fv(u.uBR,m(a.ray,1));gl.uniform3fv(u.uBMs,m(a.mie.map((x,i)=>Math.max(0,x-pe[i])),1));gl.uniform3fv(u.uBMe,m(a.mieE.map((x,i)=>x-pe[i]),1));gl.uniform3fv(u.uBO,m(a.oz,1));
  if(u.uBMp)gl.uniform3fv(u.uBMp,m(pe,1));if(u.uGPk)gl.uniform3fv(u.uGPk,a.gp||[.86,.88,.9]);
  gl.uniform1f(u.uRtop,1+a.top/R);gl.uniform1f(u.uHR,a.hr/R);gl.uniform1f(u.uHM,a.hm/R);gl.uniform3fv(u.uG,Array.isArray(a.g)?a.g:[a.g,a.g,a.g]);gl.uniform1f(u.uOzC,a.ozC/R);gl.uniform1f(u.uOzW,a.ozW/R);gl.uniform1f(u.uRkm,R);}
function peLutBind(u){for(const [n,t,un,k] of [['uTrans',PE.lTr,12,gl.TEXTURE_2D],['uMS',PE.lMs,13,gl.TEXTURE_2D],['uIrr',PE.lIrr,14,gl.TEXTURE_2D],['uSky',PE.lSky,15,gl.TEXTURE_3D]]){
  if(!u[n])continue;gl.activeTexture(gl.TEXTURE0+un);gl.bindTexture(k,t);gl.uniform1i(u[n],un);}gl.activeTexture(gl.TEXTURE0);}
// the atmosphere tables, remade when the air changes
function peLUTs(g){const key=JSON.stringify(g.air)+g.R+S.atmDensity;if(PE.lutK===key)return;PE.lutK=key;const L=PE.P.LUT;
  if(!PE.lTr){PE.lTr=peTex(gl.TEXTURE_2D,gl.RGBA16F,256,64,1,true);PE.lMs=peTex(gl.TEXTURE_2D,gl.RGBA16F,32,32,1,true);PE.lIrr=peTex(gl.TEXTURE_2D,gl.RGBA16F,64,16,1,true);
    PE.lSky=peTex(gl.TEXTURE_3D,gl.RGBA16F,32,32,16,true);PE.fbL=peFB();}
  gl.useProgram(L.p);peAirU(L.u,g);gl.uniform3fv(L.u.uGA,g.air.ga);peLutBind(L.u);gl.bindFramebuffer(gl.FRAMEBUFFER,PE.fbL);
  const pass=(i,t,w,h,layer)=>{if(layer==null)gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);else gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,t,0,layer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(0,0,w,h);gl.uniform1i(L.u.uPass,i);gl.uniform1i(L.u.uLayer,layer||0);gl.drawArrays(gl.TRIANGLES,0,3);};
  // a texture cannot be sampled while it is the target: unbind each table from its unit while it is drawn
  const un=(n,k)=>{gl.activeTexture(gl.TEXTURE0+n);gl.bindTexture(k,null);gl.activeTexture(gl.TEXTURE0);};
  un(12,gl.TEXTURE_2D);pass(0,PE.lTr,256,64);peLutBind(L.u);un(13,gl.TEXTURE_2D);pass(1,PE.lMs,32,32);peLutBind(L.u);un(14,gl.TEXTURE_2D);pass(2,PE.lIrr,64,16);
  peLutBind(L.u);un(15,gl.TEXTURE_3D);for(let z=0;z<16;z++)pass(3,PE.lSky,32,32,z);
  gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,null,0,0);peDaylight(g);}
// the light on a level grey card where the camera is (direct sun through the air plus the sky's), from the tables read
// back after they are made. The camera can adapt to it (S.wbAdapt), as eyes do and as rover images are white-balanced against
// their calibration targets: on Mars the butterscotch cast goes, and at sunset the dusky sky turns grey round a blue glow
function peDaylight(g){const fb=PE.fbL,rd=(t,w,h)=>{gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
    const p=new Float32Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,p);return p;};
  try{PE.lut={tr:rd(PE.lTr,256,64),ir:rd(PE.lIrr,64,16),rt:1+g.air.top/g.R};}catch(e){PE.lut=null;}
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,null,0);gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
function peLight(r,mu){const L=PE.lut;if(!L)return null;const rt=L.rt,H=Math.sqrt(rt*rt-1),rho=Math.sqrt(Math.max(r*r-1,0)),d=Math.max(0,-r*mu+Math.sqrt(Math.max(r*r*(mu*mu-1)+rt*rt,0))),dn=rt-r,dx=rho+H;
  const bl=(p,w,h,x,y)=>{const fx=Math.min(w-1,Math.max(0,x*(w-1))),fy=Math.min(h-1,Math.max(0,y*(h-1))),i=Math.floor(fx),j=Math.floor(fy),i2=Math.min(w-1,i+1),j2=Math.min(h-1,j+1),tx=fx-i,ty=fy-j;
    return [0,1,2].map(c=>(p[(j*w+i)*4+c]*(1-tx)+p[(j*w+i2)*4+c]*tx)*(1-ty)+(p[(j2*w+i)*4+c]*(1-tx)+p[(j2*w+i2)*4+c]*tx)*ty);};
  const T=bl(L.tr,256,64,Math.min(1,Math.max(0,(d-dn)/Math.max(dx-dn,1e-9))),Math.min(1,rho/H)),I=bl(L.ir,64,16,mu*.5+.5,Math.min(1,Math.max(0,(r-1)/(rt-1))));
  const mh=-Math.sqrt(Math.max(0,1-1/(r*r))),ps=Math.min(1,Math.max(0,(mu-mh+.006)/.012));return [0,1,2].map(c=>T[c]*ps*Math.max(mu,0)+I[c]);}
// the camera's adaptation to that light: gains that make it grey (luminance kept), limited to what a camera would do
function peWBf(){if(PE.wbR==null||!PE.cfg)return 0;const g=PE.cfg,alt=(PE.wbR-1)*g.R,top=Math.max(g.air.hm*3,8);return Math.min(1,Math.max(0,1-(alt-.3*top)/(.7*top)));}
// (only down in the air: from above the haze the camera sees the planet by sunlight, not by its daylight)
function peWB(){if(!PE.lut||PE.wbR==null||!PE.cfg)return null;const E=peLight(PE.wbR,Math.max(PE.wbMu,.02));if(!E)return null;
  const g=PE.cfg,alt=(PE.wbR-1)*g.R,top=Math.max(g.air.hm*3,8),f=Math.min(1,Math.max(0,1-(alt-.3*top)/(.7*top)));if(f<=0)return null;
  const inv=E.map(v=>1/Math.max(v,1e-9)),l=.2126*inv[0]+.7152*inv[1]+.0722*inv[2];return inv.map(v=>Math.pow(Math.min(2.5,Math.max(.4,v/l)),f));}
// the coarse height cube that terrain shadows are marched over
function peMacro(g){const n=PE.macN,key=JSON.stringify([g.K,g.TP,g.TF,g.TC,g.TR,g.seed,n]);if(PE.macK===key)return;PE.macK=key;
  if(PE.mac&&PE.macS!==n){gl.deleteTexture(PE.mac);PE.mac=null;}if(!PE.mac){PE.mac=peTex(gl.TEXTURE_CUBE_MAP,gl.R16F,n,n,1,true);PE.macS=n;}
  const G=PE.P.TGEN,b=peBases([0,0,0]);gl.useProgram(G.p);peTgenSamp(G);peTerrU(G.u,g);gl.uniform3iv(G.u.uOI,b.I);gl.uniform3fv(G.u.uOF,b.F);gl.uniform1i(G.u.uPass,2);
  gl.uniform1i(G.u.uMO,Math.min(PE_NOCT-1,Math.floor(Math.log2(n*2/Math.PI/2))));gl.uniform1f(G.u.uSize,n);gl.bindFramebuffer(gl.FRAMEBUFFER,PE.fbL);gl.viewport(0,0,n,n);
  for(let f=0;f<6;f++){gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_CUBE_MAP_POSITIVE_X+f,PE.mac,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.uniform1i(G.u.uFace,f);gl.drawArrays(gl.TRIANGLES,0,3);}
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,null,0);}
// the height under the camera, read back without stalling (the first one waits): keeps the camera above the ground
function peProbe(g,dir,wait){const R=PE.pr;
  if(!R.fb){R.tex=peTex(gl.TEXTURE_2D,gl.RGBA32F,1,1,1,false);R.fb=peFB();gl.bindFramebuffer(gl.FRAMEBUFFER,R.fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,R.tex,0);
    R.pbo=gl.createBuffer();gl.bindBuffer(gl.PIXEL_PACK_BUFFER,R.pbo);gl.bufferData(gl.PIXEL_PACK_BUFFER,16,gl.STREAM_READ);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);R.buf=new Float32Array(4);}
  const take=()=>{gl.bindBuffer(gl.PIXEL_PACK_BUFFER,R.pbo);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,R.buf);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
    if(isFinite(R.buf[0])){R.h=R.buf[0];R.wl=R.buf[1];R.T=R.buf[2];R.W=R.buf[3];R.ok=true;R.cnt=(R.cnt||0)+1;}};
  if(R.sync){if(gl.clientWaitSync(R.sync,0,0)===gl.TIMEOUT_EXPIRED&&!wait)return;gl.deleteSync(R.sync);R.sync=null;take();}
  const G=PE.P.TGEN,b=peBases(dir);gl.useProgram(G.p);peTgenSamp(G);peTerrU(G.u,g);gl.uniform3iv(G.u.uOI,b.I);gl.uniform3fv(G.u.uOF,b.F);gl.uniform1i(G.u.uPass,1);gl.uniform3fv(G.u.uPu,dir);
  gl.bindFramebuffer(gl.FRAMEBUFFER,R.fb);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(0,0,1,1);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,R.pbo);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,0);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
  if(wait){take();}else R.sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);}
// ground radius under the camera (planet radii), from the probe
const peGround=()=>{const R=PE.pr;return R.ok?1+Math.max(R.h,R.wl):1;};
// quality: on-screen size a mesh cell may reach, tiles made per frame, cache size, terrain shadow cube
const PE_Q8={potato:{tgt:7,b:4,n:256,mac:512,st:10,cs:24,ls:3},battery:{tgt:6,b:4,n:288,mac:512,st:12,cs:28,ls:3},balanced:{tgt:4.5,b:8,n:384,mac:1024,st:16,cs:40,ls:4},
  quality:{tgt:3.6,b:10,n:448,mac:1024,st:20,cs:56,ls:5},ultra:{tgt:3,b:16,n:512,mac:1024,st:28,cs:72,ls:5},cinematic:{tgt:2.4,b:16,n:576,mac:1024,st:32,cs:96,ls:6},
  pc:{tgt:3,b:40,n:2048,mac:2048,st:48,cs:160,ls:8,near:4000,vs:2}};
function peQual(){const q=PE_Q8[S.preset]||PE_Q8[S.atmSteps>=24?'ultra':S.atmSteps>=16?'quality':S.atmSteps>=12?'balanced':'potato'];
  PE.tgt=q.tgt*(S.terrainOct>=7?.8:S.terrainOct<=3?1.3:1);PE.budget=q.b;PE.maxLayers=PE.maxLayers||gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)||256;PE.nslotW=Math.min(q.n,PE.maxLayers);PE.near=q.near||{potato:600,battery:600,balanced:1200,quality:1800,ultra:2500,cinematic:3000}[S.preset]||1500;PE.macN=q.mac;PE.steps=Math.max(8,S.atmSteps);PE.cst=q.cs;PE.lst=q.ls;PE.vs=q.vs||2;
  if(PE.nearO!=null)PE.near=PE.nearO;if(PE.tgtO)PE.tgt=PE.tgtO;}   // (overrides for testing)
/* ---- the world clock: seconds of the world's own time. It runs while Animate is on, at the chosen time speed: at 1×
   the planet turns once a day (24 hours for an Earth), clouds drift at real wind speeds and heaps grow over minutes ---- */
function peTick(dts){if(!peOn())return;const sp=S.timeSpeed||1,g=PE.cfg;PE.wt+=dts*sp;PE.vt+=dts*Math.min(sp,4);
  // the small-scale cloud field drifts with the wind at the camera's latitude (integrated, so moving north or south never jumps it)
  if(g){const la=PE.camLat,c=g.R*1000*Math.max(Math.cos(la*D2R),.15);PE.flowA+=peWindU(la)*dts*sp/c;PE.flowC+=(peWindU(la)*1.8+6)*dts*sp/c;}}
// how far the planet has turned
const peSpinA=()=>{const co=SCENES[S.scene].cosmos;if(!co)return 0;const g=peCfg(co);return g.day>0?2*Math.PI*(PE.wt/(g.day*3600)%1):0;};
// the sky around the camera as a small cube (with mips), for reflections: one face redrawn each frame by the air pass
const PE_ENVN=64;
function peEnv(g,eye,sun,sI,CO,bodies){if(!peClouds()){PE.envK=0;return;}
  if(!PE.env){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_CUBE_MAP,t);gl.texStorage2D(gl.TEXTURE_CUBE_MAP,7,gl.RGBA16F,PE_ENVN,PE_ENVN);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.bindTexture(gl.TEXTURE_CUBE_MAP,null);PE.env=t;PE.envF=0;PE.envFB=peFB();PE.envDone=0;}
  // only worth it near the ground: from high up the water is too far below for the camera's sky to be the one it reflects
  const alt=(Math.hypot(...eye)-1)*g.R;PE.envK=PE.envDone>=6?1-peSm(15,40,alt):0;if(alt>60){PE.envDone=0;return;}
  const V=PE.P.VOL,f=PE.envF;gl.bindFramebuffer(gl.FRAMEBUFFER,PE.envFB);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_CUBE_MAP_POSITIVE_X+f,PE.env,0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(0,0,PE_ENVN,PE_ENVN);gl.useProgram(V.p);
  gl.uniform1i(V.u.uEnvF,f);gl.uniform1f(V.u.uEnvN,PE_ENVN);gl.drawArrays(gl.TRIANGLES,0,3);gl.uniform1i(V.u.uEnvF,-1);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP,PE.env);gl.generateMipmap(gl.TEXTURE_CUBE_MAP);gl.bindTexture(gl.TEXTURE_CUBE_MAP,null);
  PE.envF=(f+1)%6;PE.envDone++;}
// one frame of a rocky world, into rt[1-ping]
function peFrame(V,CO){const g=peCfg(CO),Pp=PE.P;if(!Pp)return;peExtras();peMatLoad();
  peQual();peAtlas();
  if(PE.cfg!==g&&PE.cfg&&PE.cfg.tKey===g.tKey){PE.cfg=g;}
  if(PE.cfg!==g){PE.cfg=g;PE.tiles.clear();PE.roots=null;PE.st=new Array(PE.nslot).fill(null);PE.free=[...Array(PE.nslot).keys()].reverse();PE.pr.ok=false;PE.hist=false;PE.boot=6;
    PE.maxL=Math.min(21,Math.floor(Math.log2(Math.PI/2*g.R*1000/(32*.45))));}
  peTargets();peMesh();peLUTs(g);peMacro(g);PE.fr++;
  peWeather(g);if(!PE.roots)PE.roots=[0,1,2,3,4,5].map(f=>peNode(f,0,0,0,null));
  // the planet's own frame: it spins under the sun and stars; a flying camera turns with it, an orbiting one does not
  const a=peSpinA(),ca=Math.cos(a),sa=Math.sin(a),rot=v=>[ca*v[0]-sa*v[2],v[1],sa*v[0]+ca*v[2]],fly=S.camMode==='fly';
  const eye=fly?V.eye:rot(V.eye),fw=fly?V.fw:rot(V.fw),rv=fly?V.rt:rot(V.rt),up=fly?V.up:rot(V.up);
  const sI=CO.sunI||[20,20,20],el=S.sunAngle*Math.PI/180,az=S.sunAz*Math.PI/180,sunW=[Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az)],sun=rot(sunW);PE.sun=sun;
  const ER=Math.hypot(...eye);peProbe(g,eye.map(v=>v/ER),!PE.pr.ok);PE.camLat=Math.asin(Math.max(-1,Math.min(1,eye[1]/ER)))/D2R;
  // what the camera sees: frustum (or all around for fisheye and 360°), horizon, pixel scale
  const vw=photoTile?{x:photoTile.x,y:photoTile.y,w:photoTile.fw,h:photoTile.fh}:{x:0,y:0,w:W,h:H},mn=Math.min(vw.w,vw.h),tan=viewTan(),ortho=S.proj==='ortho',omni=S.proj==='fisheye'||S.proj==='pano';
  const ot=(S.camMode==='orbit'?cam.dist:4)*tan,sc=(ortho?ot:tan)/(mn/2);
  const K={fw,rt:rv,up,ortho,omni,occ:1+(g.TC[3]>.5?0:-12/g.R),fpx:omni?(S.proj==='pano'?vw.w/(2*Math.PI):mn/(S.fishFov*Math.PI/180)):ortho?1e-9:mn/(2*tan),
    x0:(vw.x-.5*vw.w)*sc,x1:(vw.x+W-.5*vw.w)*sc,y0:(vw.y-.5*vw.h)*sc,y1:(vw.y+H-.5*vw.h)*sc};
  if(ortho)K.fpx=mn/(2*ot)*Math.max(.1,Math.hypot(...eye)-1)/1;
  // pick the tiles; make the missing ones (coarse first, nearest first), a few a frame or all of them for a photo
  let draw,need=[],budget=photoTile?1e9:PE.boot>0?48:PE.budget,starved=false;PE.newTiles=false;
  for(let it=0;it<(photoTile?40:2);it++){need=[];draw=peSelect(eye,K,need);if(!need.length)break;
    need.sort((p,q)=>p.L-q.L||p.d-q.d);let n=0;for(const t of need){if(n>=budget)break;if(peGen(t))n++;else{starved=true;break;}}budget-=n;if(budget<=0||starved)break;}
  if(need.length||PE.newTiles){draw=peSelect(eye,K,[]);}
  if(PE.boot>0)PE.boot--;
  // when the view needs more tiles than the cache holds, coarsen the detail a little instead of thrashing; relax back after
  // every tile in use (drawn, their parents, the children being made) must fit in the cache at once
  PE.selA=PE.selA==null?PE.selN:PE.selA*.9+PE.selN*.1;
  if(starved||PE.selA>.9*PE.nslot)PE.tk=Math.min(6,PE.tk*(starved?1.06:1.02));else if(PE.selA<.65*PE.nslot)PE.tk=Math.max(1,PE.tk*.995);
  PE.pending=need.length;peBounds();
  {const lv={};for(const t of draw)lv[t.L]=(lv[t.L]||0)+1;PE.stat={n:draw.length,lv,need:need.length};}
  peVegFrame(g,eye,K);if(!omni){try{peRockFrame(g,eye,K);}catch(e){PE.rckOff=true;PE.rckDraw=null;console.warn(e);}}else PE.rckDraw=null;
  // sun shadows of the trees and the grass around the camera (either switches itself off rather than break the frame)
  {const er=Math.hypot(...eye);PE.wbR=Math.max(er,1);PE.wbMu=dot3(eye,sun)/er;}   // (where the camera is, for its white balance)
  if(!omni){try{peShadow(g,eye,sun);}catch(e){if(PE.sh)PE.sh.on=false;console.warn(e);}try{peGrassFrame(g,eye,K,sun,sI,CO);}catch(e){PE.grsOff=true;PE.grsDraw=null;console.warn(e);}}
  else{if(PE.sh)PE.sh.on=false;PE.grsDraw=null;}
  // tile instances, nearest first
  draw.sort((p,q)=>p.d-q.d);const n=draw.length,D=PE.idata&&PE.idata.length>=n*36?PE.idata:(PE.idata=new Float32Array(Math.max(64,n*2)*36));
  const dk=new Set(draw.map(t=>peKey(t.f,t.L,t.x,t.y)));
  draw.forEach((t,i)=>{const o=i*36,Ds=t.en*K.fpx/(32*PE.tgt*PE.tk),p=t.par,pr=p&&p.ready&&p.slot>=0;
    D.set([t.c[0]-eye[0],t.c[1]-eye[1],t.c[2]-eye[2],t.slot, ...t.T1,t.mo, ...t.T2,1/Math.max(Ds,1e-12), ...t.Css,t.L<10?0:1, ...t.Cst,t.e*.04+.4/g.R/1000, ...t.Ctt,t.f, ...t.c,peEdges(t,dk), t.u0,t.v0,t.du,t.du,
      pr?p.slot:0,t.x&1,t.y&1,pr?p.mo+1:0],o);});
  // jitter (subpixel offsets) only while still: each frame then adds new samples to the average
  total++;const still=frame>0,J=still?[halton((total&15)+1,2),halton((total&15)+1,3)]:[.5,.5];
  const blend=PE.newTiles?1:1/(frame+1);
  // --- terrain mesh ---
  gl.bindFramebuffer(gl.FRAMEBUFFER,PE.fbT);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.viewport(0,0,W,H);gl.clearBufferfv(gl.COLOR,0,[0,0,0,1]);gl.clearBufferfv(gl.COLOR,1,[6e4,0,0,0]);gl.clearDepth(1);gl.clear(gl.DEPTH_BUFFER_BIT);
  const T=Pp.TERR,u=T.u;gl.useProgram(T.p);
  for(const [nm,t,un,k] of [['uTA',PE.A,3,gl.TEXTURE_2D_ARRAY],['uTB',PE.B,4,gl.TEXTURE_2D_ARRAY],['uTC',PE.C,5,gl.TEXTURE_2D_ARRAY],['uNoise',noiseTex,2,gl.TEXTURE_3D],['uMac',PE.mac,6,gl.TEXTURE_CUBE_MAP]]){gl.activeTexture(gl.TEXTURE0+un);gl.bindTexture(k,t);gl.uniform1i(u[nm],un);}
  peLutBind(u);peAirU(u,g);peCamU(u,eye,fw,rv,up,sun,sI,J);peCloudU(u,CO);gl.uniform1f(u.uDbgG,PE.dbgG||0);gl.activeTexture(gl.TEXTURE11);gl.bindTexture(gl.TEXTURE_CUBE_MAP,PE.env||null);gl.uniform1i(u.uEnv,11);gl.activeTexture(gl.TEXTURE0);gl.uniform1f(u.uEnvK,PE.envK||0);gl.uniform1f(u.uForest,g.forest);gl.uniform1f(u.uTreeR,PE.vegDraw?PE.vegDraw.R_imp/(g.R*1000):0.);peShU(u);peMatU(u,g);gl.uniform1f(u.uGrassR,PE.grsDraw?PE.grsDraw.Rg:0);gl.uniform4fv(u.uBump,PE.bump||[1,1,1,1]);gl.uniform1f(u.uMShd,PE.mshOff?0:1);gl.uniform1i(u.uGSh,PE.gShOff?0:PE.gShDbg?9:(PE.gShMode||3));
  const cb=new Float32Array(PE_NOCT*3);{let v=[...eye];for(let k=0;k<PE_NOCT;k++){for(let i=0;i<3;i++){const x=v[i]+PE_OF[k][i];cb[k*3+i]=x-Math.floor(x/32)*32;}v=peQ(v).map(x=>2*x);}}
  gl.uniform3fv(u.uCB,cb);
  // wind ripples: crest normal along the wind (east-west, turned a little), and the camera's phase along it (double precision)
  // (one fixed direction for the whole world, so the crests stay put on the ground as the camera moves; the shader lays it along
  // the ground, and only within a few degrees of its two poles are there no ripples)
  {const dw=[.30,.94,.16].map(x=>x/Math.hypot(.30,.94,.16)),ph=(eye[0]*dw[0]+eye[1]*dw[1]+eye[2]*dw[2])*g.R*1000/2.4;gl.uniform4f(u.uRip,dw[0],dw[1],dw[2],ph-Math.floor(ph));}gl.uniform1f(u.uCamH,(Math.hypot(eye[0],eye[1],eye[2])-1)*g.R*1000);gl.uniform3fv(u.uVeg,g.veg);gl.uniform3fv(u.uDry,g.dry);gl.uniform3fv(u.uRock,g.rock);gl.uniform3fv(u.uIce,g.ice);gl.uniform3fv(u.uSand,g.sand);gl.uniform3fv(u.uOcean,g.ocean);
  gl.uniform3fv(u.uLavaC,g.lavaC);gl.uniform1f(u.uLava,g.lava);gl.uniform1f(u.uCity,S.cityLights?g.city:0);gl.uniform1f(u.uTime,PE.vt%1e4);gl.uniform1f(u.uPix,2*tan/mn*(omni?1.5:1));
  gl.uniform1f(u.uRough,g.rough);gl.uniform1i(u.uDbg,PE.dbg|0);gl.uniform1f(u.uCap,g.cap>=90?2.:Math.sin(g.cap*Math.PI/180));gl.uniform1i(u.uNDet,Math.max(0,S.terrainOct-1));
  const C=1e8,far=1e3;gl.uniform1f(u.uLogC,C);gl.uniform1f(u.uLogF,2/Math.log2(1+C*far));
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);
  gl.bindVertexArray(PE.vao);gl.bindBuffer(gl.ARRAY_BUFFER,PE.ib);gl.bufferData(gl.ARRAY_BUFFER,D.subarray(0,n*36),gl.STREAM_DRAW);
  if(!omni&&n)gl.drawElementsInstanced(gl.TRIANGLES,PE.nIdx,gl.UNSIGNED_SHORT,0,n);
  if(!omni){peVegDraw(g,eye,fw,rv,up,sun,sI,J,CO);try{peRockDraw(g,eye,fw,rv,up,sun,sI,J,CO);}catch(e){PE.rckOff=true;gl.bindVertexArray(VAO0);console.warn(e);}try{peGrassDraw(g,eye,fw,rv,up,sun,sI,J);}catch(e){PE.grsOff=true;gl.bindVertexArray(VAO0);console.warn(e);}}
  gl.bindVertexArray(VAO0);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  // --- air at half resolution, then its temporal resolve ---
  const bodies=peBodies(CO,a,sunW);
  const Vp=Pp.VOL;gl.bindFramebuffer(gl.FRAMEBUFFER,PE.vr.f);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.viewport(0,0,Math.ceil(W/PE.vs),Math.ceil(H/PE.vs));gl.useProgram(Vp.p);gl.uniform1f(Vp.u.uVS,PE.vs);gl.uniform1i(Vp.u.uDbgC,PE.dbgC||0);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,PE.tDs);gl.uniform1i(Vp.u.uTerD,0);peLutBind(Vp.u);peAirU(Vp.u,g);peCamU(Vp.u,eye,fw,rv,up,sun,sI,J);
  gl.uniform1ui(Vp.u.uFrame,total>>>0);gl.uniform1i(Vp.u.uSteps,PE.steps);peCloudU(Vp.u,CO);gl.uniform1i(Vp.u.uCSteps,PE.cst);gl.uniform1i(Vp.u.uLSteps,PE.lst);gl.uniform1i(Vp.u.uNB,bodies.n);gl.uniform4fv(Vp.u.uBS,bodies.bs);gl.uniform1i(Vp.u.uEnvF,-1);gl.drawArrays(gl.TRIANGLES,0,3);
  peEnv(g,eye,sun,sI,CO,bodies);
  const R=Pp.RES,src=PE.vh[PE.vp],dst=PE.vh[1-PE.vp];gl.bindFramebuffer(gl.FRAMEBUFFER,dst.f);gl.viewport(0,0,Math.ceil(W/PE.vs),Math.ceil(H/PE.vs));gl.useProgram(R.p);gl.uniform1f(R.u.uVS,PE.vs);
  [[PE.vr.t[0],'uC0'],[PE.vr.t[1],'uC1'],[src.t[0],'uH0'],[src.t[1],'uH1']].forEach(([t,nm],i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(R.u[nm],i);});
  peCamU(R.u,eye,fw,rv,up,sun,sI,J);const pv=PE.prev||{eye,fw,rt:rv,up,tan,J,ot};
  gl.uniform3fv(R.u.uPEye,pv.eye);gl.uniform3fv(R.u.uPFw,pv.fw);gl.uniform3fv(R.u.uPRt,pv.rt);gl.uniform3fv(R.u.uPUp,pv.up);gl.uniform1f(R.u.uPTanF,pv.tan);gl.uniform1f(R.u.uPOrtho,pv.ot);gl.uniform2fv(R.u.uPJ,pv.J);
  gl.uniform1f(R.u.uMov,still?0:1);gl.uniform1f(R.u.uHmax,S.animate&&(S.timeSpeed||1)>30?16:128);gl.uniform1i(R.u.uHist,!PE.hist?0:PE.newTiles?2:1);gl.drawArrays(gl.TRIANGLES,0,3);PE.vp=1-PE.vp;PE.hist=true;
  PE.prev={eye,fw,rt:rv,up,tan,J,ot};
  // --- composite into the frame history ---
  const Cp=Pp.COMP,cu=Cp.u;gl.bindFramebuffer(gl.FRAMEBUFFER,rt[1-ping].f);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(0,0,W,H);gl.useProgram(Cp.p);gl.uniform1f(cu.uVS,PE.vs);
  gl.uniform1i(cu.uSSL,PE.sslOff?0:(PE.sslMode||1));gl.uniform1i(cu.uSoftSky,still?0:1);[[PE.tC,'uTer'],[dst.t[0],'uV0'],[dst.t[1],'uV1'],[rt[ping].t[0],'uPrev'],[PE.tDs,'uTerD']].forEach(([t,nm],i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(cu[nm],i);});
  gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_3D,noiseTex);gl.uniform1i(cu.uNoise,6);gl.activeTexture(gl.TEXTURE0);
  peLutBind(cu);peAirU(cu,g);peCamU(cu,eye,fw,rv,up,sun,sI,J);gl.uniform1f(cu.uBlend,blend);gl.uniform1f(cu.uSpin,a);gl.uniform1f(cu.uRainT,PE.vt%1e4);if(peClouds()){peCloudU(cu,CO);}
  gl.uniform1f(cu.uStars,1e-5*Math.pow(2,S.starBoost));gl.uniform1f(cu.uGlare,drm().g);const sd=sunDiskU(CO);
  gl.uniform1f(cu.uSunK,sd[0]);gl.uniform1f(cu.uSunC0,sd[1]);gl.uniform1f(cu.uSunC1,sd[2]);
  gl.uniform1f(cu.uStarD,CO.starD||1e4);gl.uniform1f(cu.uRin,CO.rin||0);gl.uniform1f(cu.uRout,CO.rout||0);gl.uniform3fv(cu.uAxis,rot(CO.axis||[0,1,0]));gl.uniform3fv(cu.uRingC,CO.ringC||[.8,.72,.6]);
  for(const [k,v] of Object.entries(bodies.u))if(cu[k]&&v.length)gl.uniform4fv(cu[k],v);
  gl.drawArrays(gl.TRIANGLES,0,3);
  if(PE.newTiles)frame=-1;   // the ground is still filling in: start the average again next frame
}
function peCamU(u,eye,fw,rt,up,sun,sI,J){gl.uniform3fv(u.uEye,eye);gl.uniform3fv(u.uCam,eye);gl.uniform3fv(u.uFw,fw);gl.uniform3fv(u.uRt,rt);gl.uniform3fv(u.uUp,up);
  gl.uniform1f(u.uTanF,viewTan());gl.uniform2f(u.uRes,W,H);gl.uniform2fv(u.uJ,J);camUniforms(u);gl.uniform3fv(u.uSun,sun);gl.uniform3fv(u.uSunI,sI);}
// moons and the system's other planets, in the planet's frame
function peBodies(co,a,sunW){const ca=Math.cos(a),sa=Math.sin(a),rot=v=>[ca*v[0]-sa*v[2],v[1],sa*v[0]+ca*v[2]];
  const ml=moonList(co),bl=co.bodies||[],bs=[],u={uMoons:[],uMoonC:[],uBod:[],uBodA:[],uBodB:[],uBodC:[],uBodN:[]};
  ml.forEach(m=>{const t=PE.wt*2*Math.PI/(27.3*86400)*(m.speed??1),c=Math.cos(t),s=Math.sin(t),p=rot([m.p[0]*c-m.p[2]*s,m.p[1],m.p[0]*s+m.p[2]*c]);u.uMoons.push(...p,m.r);u.uMoonC.push(...m.col,0);bs.push(...p,m.r);});
  if(bl.length){const pos=sysPos(co,sunW);bl.forEach((b,i)=>{const p=rot(pos[i]);u.uBod.push(...p,b.r);bs.push(...p,b.r);u.uBodA.push(...b.c1,b.gas?1:0);u.uBodB.push(...b.c2,b.ring||0);u.uBodC.push(...b.air,b.airK);u.uBodN.push(...rot(b.axis||[0,.94,.34]),0);});}
  const n=Math.min(12,bs.length/4);while(bs.length<48)bs.push(0,0,0,0);return {n,bs:bs.slice(0,48),u};}

// auto exposure on a rocky world never brightens past the point where a sunlit white surface would clip (a camera in
// daylight exposes for the sun): a cloudless desert should look tan, not white. In shadow or at night it is free to.
function peExpCap(vmax){if(!peOn())return Infinity;const s=SCENES[S.scene].cosmos.sunI||[20,20,20],Ls=.9*(.2126*s[0]+.7152*s[1]+.0722*s[2])/Math.PI;
  return Math.pow(2,vmax)>.02*Ls?2.5/Ls:Infinity;}
