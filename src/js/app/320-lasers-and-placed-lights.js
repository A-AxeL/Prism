/* ---------- lasers and placed lights ---------- */
// Lasers are traced on the CPU as exact rays: mirrors reflect, glass refracts at the beam's own wavelength (Cauchy dispersion),
// every glass surface splits off its Fresnel reflection, tinted glass absorbs along the path, and a white beam fans out into a
// continuous spectrum. The result goes to the GPU as primitives (beams, spectrum sheets, lit spots and stripes, culling boxes):
// the composite draws them sharp at screen resolution, and the ray tracer sees them in mirrors and through glass, and lets the
// lit spots light the room.
// a bulb's brightness setting is its power, so resizing it does not change how much it lights the scene
function bulbEm(L){return L.int*.5/(L.r*L.r);}
function hex2lin(h){return [1,3,5].map(i=>Math.pow(parseInt(h.substr(i,2),16)/255,2.2));}
function lin2hex(c){const m=Math.max(...c,1e-6);return '#'+c.map(v=>Math.round(255*Math.pow(Math.max(0,v/m),1/2.2)).toString(16).padStart(2,'0')).join('');}
const add3=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],mul3=(a,k)=>[a[0]*k,a[1]*k,a[2]*k],vmul=(a,b)=>[a[0]*b[0],a[1]*b[1],a[2]*b[2]];
const refl3=(d,n)=>sub3(d,mul3(n,2*dot3(d,n))),len3=a=>Math.hypot(a[0],a[1],a[2]),mix3=(a,b,f)=>[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f];
// CIE 1931 color matching functions (Wyman, Sloan and Shirley's analytic fit), converted to linear sRGB
function cie(l){const g=(m,a,b)=>{const t=(l-m)/(l<m?a:b);return Math.exp(-.5*t*t);};
  const X=1.056*g(599.8,37.9,31)+.362*g(442,16,26.7)-.065*g(501.1,20.4,26.2),Y=.821*g(568.8,46.9,40.5)+.286*g(530.9,16.3,31.1),Z=1.217*g(437,11.8,36)+.681*g(459,26,13.8);
  return [3.2406*X-1.5372*Y-.4986*Z,-.9689*X+1.8758*Y+.0415*Z,.0557*X-.204*Y+1.057*Z];}
// a laser's color: the spectral color (outside sRGB) pulled in with a little white and clipped, brightest channel 1
const monoRGB=l=>{let c=cie(l);const n=Math.min(...c);if(n<0)c=c.map(v=>v-n*.35);c=c.map(v=>Math.max(0,v));const m=Math.max(...c);return c.map(v=>v/m);};
// white light: 256 samples over 400–700 nm, scaled so the whole spectrum adds up to exactly white
const SPEC=(()=>{const a=[];for(let i=0;i<256;i++)a.push(cie(400+300*i/255).map(v=>Math.max(0,v)));const m=[0,1,2].map(k=>a.reduce((s,c)=>s+c[k],0)/256);return a.map(c=>c.map((v,k)=>v/m[k]));})();
const specAt=l=>{const x=Math.min(255,Math.max(0,(l-400)/300*255)),i=Math.floor(x),f=x-i,a=SPEC[i],b=SPEC[Math.min(255,i+1)];return a.map((v,k)=>v+(b[k]-v)*f);};
const specAvg=(l0,l1)=>{let s=[0,0,0];for(let i=0;i<6;i++)s=add3(s,specAt(l0+(l1-l0)*(i+.5)/6));return mul3(s,1/6);};
const nmName=l=>l<440?'violet':l<485?'blue':l<500?'cyan':l<565?'green':l<590?'yellow':l<625?'orange':'red';
const laserHex=L=>L.wl?lin2hex(monoRGB(L.wl)):'#ffffff';
const SPECGRAD='linear-gradient(90deg,'+Array.from({length:13},(_,i)=>lin2hex(monoRGB(400+25*i))+' '+(i/12*100).toFixed(1)+'%').join(',')+')';
document.documentElement.style.setProperty('--specgrad',SPECGRAD);
// a hex color to the nearest laser wavelength (0 for white): used to read lights saved by earlier versions
function hueNm(hex){const c=hex2lin(hex),mx=Math.max(...c),mn=Math.min(...c);if(mx<=0||(mx-mn)/mx<.35)return 0;let h;
  if(mx===c[0])h=((c[1]-c[2])/(mx-mn)+6)%6;else if(mx===c[1])h=(c[2]-c[0])/(mx-mn)+2;else h=(c[0]-c[1])/(mx-mn)+4;h/=6;if(h>.85)return 640;
  const T=[[0,645],[.08,605],[.16,578],[.33,532],[.5,490],[.62,465],[.72,440],[.85,405]];let i=0;while(i<T.length-2&&h>T[i+1][0])i++;
  const [a,x]=T[i],[b,y]=T[i+1];return Math.round(x+(y-x)*Math.min(1,(h-a)/(b-a)));}
// index of refraction at a wavelength (Cauchy), matched so the spread from 400 to 700 nm equals the material's dispersion
const iorAt=(ior,disp,l)=>ior+disp*(1/(l*l)-1/(589*589))/4.209e-6;
function sceneLights(){const k=S.scene;UIS.lights=UIS.lights||{};const defs=SCENES[k].lights||[];
  let L=UIS.lights[k];if(L&&defs.length&&L.some(x=>/^d\d/.test(x.id)))L=UIS.lights[k]=L.filter(x=>!/^d\d/.test(x.id));   // presets from an older version
  if(!L){L=UIS.lights[k]=[];}
  defs.forEach((d,i)=>{if(!L.some(x=>x.id==='p'+i))L.splice(Math.min(i,L.length),0,{id:'p'+i,on:true,preset:true,...JSON.parse(JSON.stringify(d))});});
  for(const L of UIS.lights[k])if(L.type==='laser'&&L.wl===undefined)L.wl=hueNm(L.col||'#ff2418');return UIS.lights[k];}
function lensHitJS(ro,rd,q){
  const c=q.c,a=q.a,oc=sub3(ro,c),R=q.R,he=q.he,hc=q.hc;let tn=-1e9,tf=1e9,nn=[0,1,0],nf=[0,1,0];
  const dp=sub3(rd,mul3(a,dot3(rd,a))),op=sub3(oc,mul3(a,dot3(oc,a))),A=dot3(dp,dp),Bq=dot3(op,dp),Cq=dot3(op,op)-R*R;
  if(A<1e-9){if(Cq>0)return null;}
  else{let h=Bq*Bq-A*Cq;if(h<0)return null;h=Math.sqrt(h);tn=(-Bq-h)/A;tf=(-Bq+h)/A;nn=norm(add3(op,mul3(dp,tn)));nf=norm(add3(op,mul3(dp,tf)));}
  const cut=[];
  for(let s=0;s<2;s++){const rr=s?q.r2:q.r1,ax=mul3(a,s?-1:1);
    if(rr>0){const o2=sub3(ro,add3(c,mul3(ax,hc-rr))),b=dot3(o2,rd);let h=b*b-dot3(o2,o2)+rr*rr;if(h<0)return null;h=Math.sqrt(h);
      const t0=-b-h,t1=-b+h;if(t0>tn){tn=t0;nn=mul3(add3(o2,mul3(rd,t0)),1/rr);}if(t1<tf){tf=t1;nf=mul3(add3(o2,mul3(rd,t1)),1/rr);}}
    else{const lim=rr===0?hc:he,dn=dot3(rd,ax),dist=lim-dot3(oc,ax);
      if(Math.abs(dn)<1e-9){if(dist<0)return null;}else{const t=dist/dn;if(dn>0){if(t<tf){tf=t;nf=ax;}}else if(t>tn){tn=t;nn=ax;}}
      if(rr<0)cut.push([add3(c,mul3(ax,hc-rr)),-rr]);}}
  if(tf<=tn)return null;
  let iv=[[tn,tf,nn,nf]];
  for(const [cc,r] of cut){const o2=sub3(ro,cc),b=dot3(o2,rd);let h=b*b-dot3(o2,o2)+r*r;if(h<=0)continue;h=Math.sqrt(h);
    const s0=-b-h,s1=-b+h,n0=mul3(add3(o2,mul3(rd,s0)),-1/r),n1=mul3(add3(o2,mul3(rd,s1)),-1/r),out=[];
    for(const I of iv){if(s1<=I[0]||s0>=I[1]){out.push(I);continue;}if(s0>I[0])out.push([I[0],s0,I[2],n0]);if(s1<I[1])out.push([s1,I[1],n1,I[3]]);}
    iv=out;}
  let best=null;for(const I of iv){if(I[1]<=I[0])continue;const t=I[0]>1e-4?I[0]:I[1]>1e-4?I[1]:0;if(t&&(!best||t<best.t))best={t,n:t===I[0]?I[2]:I[3]};}
  return best;}
// nearest surface along a ray: outward normal, a key naming the surface, and its material
// (t: 0 matte, 1 mirror, 2 glass, 3 light; albedo; index of refraction, dispersion, absorption density)
function sceneHit(ro,rd){let best=null;const take=(t,n,m,key)=>{if(t>1e-4&&(!best||t<best.t))best={t,n,m,key};};
  if(S.floor!=='none'&&rd[1]<-1e-7){const t=-ro[1]/rd[1],x=ro[0]+rd[0]*t,z=ro[2]+rd[2]*t,f=S.floor;
    const a=f==='checker'?((Math.floor(x)+Math.floor(z))&1?.12:.82):f==='mirror'?.7:f==='wet'?.08:.5;take(t,[0,1,0],{t:f==='mirror'?1:0,col:[a,a,a]},'f');}
  SC.forEach((o,i)=>{const c=[o.x,o.y,o.z],oc=sub3(ro,c),b=dot3(oc,rd),h=b*b-dot3(oc,oc)+o.r*o.r;if(h<0)return;const q=Math.sqrt(h);
    let t=-b-q;if(t<=1e-4)t=-b+q;if(best&&t>=best.t)return;take(t,mul3(sub3(add3(ro,mul3(rd,t)),c),1/o.r),{t:o.t,col:o.c,ior:S.glassIOR,disp:.06,dens:S.glassDensity},'s'+i);});
  BX.forEach((bx,j)=>{let tn=-1e9,tf=1e9,an=0,af=0;const c=[bx.x,bx.y,bx.z],h=[bx.hx,bx.hy,bx.hz];
    for(let i=0;i<3;i++){const inv=1/(Math.abs(rd[i])<1e-12?1e-12:rd[i]),t0=(c[i]-h[i]-ro[i])*inv,t1=(c[i]+h[i]-ro[i])*inv,lo=Math.min(t0,t1),hi=Math.max(t0,t1);
      if(lo>tn){tn=lo;an=i;}if(hi<tf){tf=hi;af=i;}}
    if(tf<Math.max(tn,1e-4))return;const front=tn>1e-4,t=front?tn:tf,ax=front?an:af,n=[0,0,0];n[ax]=front?-Math.sign(rd[ax]):Math.sign(rd[ax]);
    take(t,n,{t:bx.t,col:bx.c,ior:S.glassIOR,disp:.06,dens:bx.d<0?S.glassDensity:bx.d*S.glassDensity/1.6},'b'+j);});
  PR.forEach((q,j)=>{let tn=-1e9,tf=1e9,a=null,b=null;
    for(const pl of q.planes){const dn=pl[0]*rd[0]+pl[1]*rd[1]+pl[2]*rd[2],dist=pl[3]-(pl[0]*ro[0]+pl[1]*ro[1]+pl[2]*ro[2]);
      if(Math.abs(dn)<1e-12){if(dist<0)return;continue;}const t=dist/dn;if(dn<0){if(t>tn){tn=t;a=pl;}}else if(t<tf){tf=t;b=pl;}}
    if(tf<Math.max(tn,1e-4))return;const front=tn>1e-4,pl=front?a:b;take(front?tn:tf,[pl[0],pl[1],pl[2]],{t:q.type??2,col:q.col,ior:q.ior,disp:q.disp,dens:q.dens},'p'+j);});
  LN.forEach((q,j)=>{const h=lensHitJS(ro,rd,q);if(h)take(h.t,h.n,{t:2,col:q.col,ior:q.ior,disp:q.disp,dens:q.dens},'l'+j);});
  INST.list.forEach((I,j)=>{const h=instHitJS(I,ro,rd);if(h)take(h.t,h.n,{t:I.em>0?3:I.mt,col:I.col,ior:I.ior,disp:I.disp??.06,dens:I.dens||0},'i'+j);});
  return best;}
// exact dielectric interface: refracted and reflected directions and the unpolarised Fresnel reflectance
function glassStep(d,n,ior){let ci=dot3(d,n),nn=n,eta;if(ci<0){eta=1/ior;ci=-ci;}else{eta=ior;nn=mul3(n,-1);}
  const refl=sub3(d,mul3(nn,-2*ci)),k=1-eta*eta*(1-ci*ci);if(k<0)return {tir:true,refl,R:1};
  const ct=Math.sqrt(k),rs=(eta*ci-ct)/(eta*ci+ct),rp=(ci-eta*ct)/(ci+eta*ct);
  return {tir:false,refl,refr:norm(add3(mul3(d,eta),mul3(nn,eta*ci-ct))),R:(rs*rs+rp*rp)/2};}
const absorb=(c,m,t)=>m.dens?c.map((v,i)=>v*Math.exp(-(1-m.col[i])*m.dens*t)):c;
const LZI=.05;   // how much of a spot's light reaches the room (the beam itself is drawn much brighter than its real power)
function lzEmitter(){return {prims:[],spots:[],fanned:false,full(){return this.prims.length>=620;},
  add(kind,rows,pts,m){if(!this.full())this.prims.push({rows,pts,m});},
  beam(a,b,w,c,f){this.add(0,[[...a,w],[...b,f],[...c,0]],[a,b],.3);},
  spot(p,n,w,c,alb){this.add(2,[[...p,w],[...n,0],[...c,2]],[p],.35);this.spots.push({p,n,c:vmul(c,alb).map(v=>v*LZI)});},
  sheet(A0,B0,A1,B1,w,c,l0,l1,fl){this.add(1,[[...A0,w],[...B0,fl],[...c,1],[...A1,l0],[...B1,l1]],[A0,B0,A1,B1],.3);},
  stripe(B0,B1,n,w,c,l0,l1,alb){this.add(3,[[...B0,w],[...n,0],[...c,3],[...B1,l0],[0,0,0,l1]],[B0,B1],.35);
    this.spots.push({p:mix3(B0,B1,.5),n,c:vmul(vmul(specAvg(l0,l1),c),alb).map(v=>v*(l1-l0)/300*LZI)});},
  glare(p,w,c){this.add(0,[[...p,w],[...p,2],[...c,0]],[p],.35);}};}
const facing=(rd,n)=>dot3(rd,n)<0?n:mul3(n,-1);
// one monochrome (lam in nm) or white (lam 0) beam; Fresnel reflections at glass become their own, fainter beams
function traceMono(o,d,lam,c,w,gen,E,first){let ro=o,rd=d,fl=first?2:0;
  for(let k=0;k<24&&!E.full();k++){
    const h=sceneHit(ro,rd);
    if(!h){E.beam(ro,add3(ro,mul3(rd,80)),w,c,fl);return;}
    const p=add3(ro,mul3(rd,h.t)),m=h.m,inside=dot3(rd,h.n)>0;
    E.beam(ro,p,w,c,fl);fl=0;if(inside)c=absorb(c,m,h.t);
    if(m.t===1){c=vmul(c,m.col);rd=refl3(rd,h.n);}
    else if(m.t===2){const dk=m.disp||0;
      if(!lam&&dk>.005&&!E.fanned){E.fanned=true;fanOut(p,rd,h.n,m,c,w,E);return;}
      const g=glassStep(rd,h.n,lam?iorAt(m.ior,dk,lam):m.ior);
      if(g.tir)rd=g.refl;
      else{if(gen<2&&g.R*Math.max(...c)>.1)traceMono(add3(p,mul3(g.refl,1e-4)),g.refl,lam,mul3(c,g.R),w,gen+1,E,false);c=mul3(c,1-g.R);rd=g.refr;}}
    else{if(m.t!==3)E.spot(p,facing(rd,h.n),w,c,m.col);return;}
    ro=add3(p,mul3(rd,1e-4));if(Math.max(...c)<.01)return;}}
// one wavelength of a fanned-out white beam, as a polyline with the surfaces it touched
function traceSub(o,d,lam,a0){const pts=[o],keys=[],atts=[a0];let ro=o,rd=d,a=a0,end={type:'dim'};
  for(let k=0;k<20;k++){const h=sceneHit(ro,rd);
    if(!h){pts.push(add3(ro,mul3(rd,80)));keys.push('miss');end={type:'miss'};break;}
    const p=add3(ro,mul3(rd,h.t)),m=h.m,inside=dot3(rd,h.n)>0;if(inside)a=absorb(a,m,h.t);pts.push(p);keys.push(h.key);
    if(m.t===1){a=vmul(a,m.col);rd=refl3(rd,h.n);}
    else if(m.t===2){const g=glassStep(rd,h.n,iorAt(m.ior,m.disp||0,lam));if(g.tir)rd=g.refl;else{a=mul3(a,1-g.R);rd=g.refr;}}
    else{end=m.t===3?{type:'light'}:{type:'spot',n:facing(rd,h.n),alb:m.col};break;}
    ro=add3(p,mul3(rd,1e-4));atts.push(a);if(Math.max(...a)<.003)break;}
  return {lam,pts,keys,atts,end};}
// a white beam entering dispersive glass: 32 wavelengths are traced, neighbors that touch the same surfaces are joined
// into sheets (merged while the fan stays straight), so the spectrum is continuous; landing fans become rainbow stripes
function fanOut(p,rd,n,m,c,w,E){
  const K=32,dk=m.disp||0,dl=300/(K-1),subs=[],g0=glassStep(rd,n,m.ior);
  if(!g0.tir&&g0.R*Math.max(...c)>.1)traceMono(add3(p,mul3(g0.refl,1e-4)),g0.refl,0,mul3(c,g0.R),w,1,E,false);
  for(let k=0;k<K;k++){const lam=400+dl*k,g=glassStep(rd,n,iorAt(m.ior,dk,lam)),d=g.tir?g.refl:g.refr;
    const s=traceSub(add3(p,mul3(d,1e-4)),d,lam,g.tir?[1,1,1]:[1-g.R,1-g.R,1-g.R]);s.pts[0]=p;subs.push(s);}
  const has=(s,j)=>s.pts.length>j+1,same=(a,b,j)=>{for(let i=0;i<=j;i++)if(a.keys[i]!==b.keys[i])return false;return true;};
  const comp=(k,j)=>k+1<K&&has(subs[k],j)&&has(subs[k+1],j)&&same(subs[k],subs[k+1],j);
  // can rays s..e be drawn as one quad whose color runs linearly across it?
  const lin=(s,e,j,side)=>{const P0=subs[s].pts[side],P1=subs[e].pts[side],tol=Math.max(w*.5,.015*len3(sub3(P1,P0)))+1e-5;
    for(let i=s+1;i<e;i++){const f=(subs[i].lam-subs[s].lam)/(subs[e].lam-subs[s].lam);if(len3(sub3(subs[i].pts[side],mix3(P0,P1,f)))>tol)return false;}return true;};
  const maxJ=Math.max(...subs.map(s=>s.pts.length-1));
  for(let j=0;j<maxJ;j++){let k=0;
    while(k<K){const s0=subs[k];
      if(!has(s0,j)){k++;continue;}
      if(!comp(k,j)){if(!(k>0&&comp(k-1,j))){const col=vmul(vmul(c,specAt(s0.lam)),s0.atts[j]).map(v=>v*dl/300);E.beam(s0.pts[j],s0.pts[j+1],w,col,0);
          if(s0.pts.length===j+2&&s0.end.type==='spot')E.spot(s0.pts[j+1],s0.end.n,w,col,s0.end.alb);}k++;continue;}
      let b=k;while(comp(b,j))b++;
      for(let s=k;s<b;){let e=s+1;while(e<b&&lin(s,e+1,j,j)&&lin(s,e+1,j,j+1))e++;
        E.sheet(subs[s].pts[j],subs[s].pts[j+1],subs[e].pts[j],subs[e].pts[j+1],w,vmul(c,subs[s].atts[j]),subs[s].lam,subs[e].lam,(s===k?1:0)|(e===b?2:0));s=e;}
      const q=subs[k];
      if(q.pts.length===j+2&&q.end.type==='spot')for(let s=k;s<b;){let e=s+1;while(e<b&&lin(s,e+1,j,j+1))e++;
        E.stripe(subs[s].pts[j+1],subs[e].pts[j+1],q.end.n,w,vmul(c,subs[s].atts[j]),subs[s].lam,subs[e].lam,q.end.alb);s=e;}
      k=b+1;}}}
// GPU layout (RGBA32F, MAXP columns): rows 0–4 primitives, row 5 the white spectrum, rows 6–8 lit spots for lighting
let nLz=0,nSpot=0,lzBuilt=false,placePrev=null;const lzBuf=new Float32Array(MAXP*9*4);
SPEC.forEach((c,i)=>lzBuf.set([...c,0],(5*MAXP+i)*4));
const lzTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,lzTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,MAXP,9,0,gl.RGBA,gl.FLOAT,lzBuf);
for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST]])gl.texParameteri(gl.TEXTURE_2D,k,v);
function rebuildBeams(){const E=lzEmitter();
  if(!isCosmos()){const all=sceneLights().filter(L=>L.type==='laser'&&L.on!==false&&!(placePrev&&placePrev.skip===L.id));if(placePrev&&placePrev.type==='laser')all.push(placePrev);
    for(const L of all){const I=L.int*(L.prev?.6:1);E.fanned=false;traceMono(L.o,norm(L.d),L.wl||0,L.wl?mul3(monoRGB(L.wl),I):[I,I,I],L.w,0,E,true);}
    if(placePrev&&placePrev.type==='point')E.glare(placePrev.pos,placePrev.r*.5,mul3(hex2lin(placePrev.col),2));
    if(placePrev&&placePrev.type==='mark')E.glare(placePrev.pos,.04,[1.2,2.4,3.2]);}
  // groups of 8 with a bounding box each, so a ray skips whole stretches of beam it cannot see
  const P=E.prims,rows=[];
  for(let i=0;i<P.length;i+=8){const g=P.slice(i,i+8),mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
    for(const p of g)for(const q of p.pts)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],q[k]-p.m);mx[k]=Math.max(mx[k],q[k]+p.m);}
    rows.push([[...mn,g.length],[...mx,0],[0,0,0,4]]);for(const p of g)rows.push(p.rows);}
  nLz=Math.min(rows.length,MAXP);rows.slice(0,nLz).forEach((r,i)=>r.forEach((v,k)=>lzBuf.set(v,(k*MAXP+i)*4)));
  const sp=E.spots.sort((a,b)=>Math.max(...b.c)-Math.max(...a.c)).slice(0,MAXSPOT);nSpot=sp.length;
  sp.forEach((s,i)=>{lzBuf.set([...s.p,0],(6*MAXP+i)*4);lzBuf.set([...s.n,0],(7*MAXP+i)*4);lzBuf.set([...s.c,0],(8*MAXP+i)*4);});
  // upload only the columns in use (rows 0–4 primitives, rows 6–8 spots); the spectrum row never changes
  gl.bindTexture(gl.TEXTURE_2D,lzTex);gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);gl.pixelStorei(gl.UNPACK_ROW_LENGTH,MAXP);
  if(nLz)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,nLz,5,gl.RGBA,gl.FLOAT,lzBuf);
  if(nSpot){gl.pixelStorei(gl.UNPACK_SKIP_ROWS,6);gl.texSubImage2D(gl.TEXTURE_2D,0,0,6,nSpot,3,gl.RGBA,gl.FLOAT,lzBuf);gl.pixelStorei(gl.UNPACK_SKIP_ROWS,0);}
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH,0);
  needBlit=true;if(TR)reset();}

// placing: the center of the view aims; a live preview shows where it will land
let place=null,lEdit=null;
const LCOLS=['#ffcf9a','#fff4e6','#ff2418','#ff7a12','#ffe11a','#2bff4d','#16e0ff','#2a5cff','#a52aff','#ff2aa4'];
// where the center of the view meets the floor (for setting optics down), else the first surface
function floorAim(){const V=LV;if(!V)return null;if(V.fw[1]<-.02){const t=-V.eye[1]/V.fw[1];if(t<40)return add3(V.eye,mul3(V.fw,t));}
  const t=pickT(V.eye,V.fw);return t?add3(V.eye,mul3(V.fw,t)):null;}
function placeTarget(kind){const V=LV;if(!V)return null;
  if(kind==='optic'){const p=floorAim();return p?{at:p}:null;}
  const t=pickT(V.eye,V.fw),hit=t?add3(V.eye,mul3(V.fw,t)):null;
  if(kind==='laser'){const o=add3(add3(V.eye,mul3(V.fw,.15)),mul3(V.up,-.06));return {o,d:hit?norm(sub3(hit,o)):V.fw.slice()};}
  return {pos:hit?sub3(hit,mul3(V.fw,Math.min(.35,t*.3))):add3(V.eye,mul3(V.fw,2))};}
const lightOf=id=>sceneLights().find(L=>L.id===id);
function placeUpdate(){if(!place||!LV)return;
  if(place.kind==='optic'){const tg=placeTarget('optic');placePrev=tg?{type:'mark',pos:[tg.at[0],.03,tg.at[2]],prev:true}:null;rebuildBeams();return;}
  const src=place.edit?lightOf(place.edit):UIS.lnew;if(!src)return;
  placePrev={type:place.kind,col:src.col,wl:src.wl,int:src.int,w:src.w,r:src.r,prev:true,skip:place.edit,...placeTarget(place.kind)};rebuildBeams();}
function startPlace(kind,edit){if(!LV)return;closePane();place={kind,edit};
  $('xh').hidden=false;$('placeBar').hidden=false;$('placeCam').hidden=kind!=='point';
  $('placeMsg').textContent=kind==='laser'?'Aim the center at the target':kind==='optic'?'Aim at the floor where it goes':'Aim at a surface';
  $('placeOk').textContent=edit?(kind==='laser'?'Aim here':'Move here'):kind==='laser'?'Fire':kind==='optic'?'Place mirror':'Place';placeUpdate();}
function endPlace(reopen){const k=place&&place.kind;place=null;placePrev=null;$('xh').hidden=true;$('placeBar').hidden=true;rebuildBeams();if(reopen)openLights(k==='optic'?'optics':null);}
function commitPlace(atCam){if(!place)return;
  if(place.kind==='optic'){const tg=placeTarget('optic');if(!tg){toast('Aim at the floor');return;}const o=labCfg(),x=+tg.at[0].toFixed(2),z=+tg.at[2].toFixed(2),isNew=!place.edit;
    if(!isNew){const it=optItem(place.edit);if(it){it.x=x;it.z=z;}lEdit=place.edit;}
    else{const V=LV;o.mirrors.push({x,y:.9,z,yaw:+(Math.atan2(V.eye[0]-x,V.eye[2]-z)/D2R).toFixed(1),tilt:0});lEdit='m'+(o.mirrors.length-1);}
    endPlace(false);labApply(isNew);toast(isNew?'Mirror placed, facing you':'Moved');openLights('optics');return;}
  const L=sceneLights(),nw=UIS.lnew,tg=atCam?{pos:LV.eye.slice()}:placeTarget(place.kind);
  if(place.edit){const x=lightOf(place.edit);if(x)Object.assign(x,tg);lEdit=place.edit;}
  else{const id='u'+Date.now().toString(36),n=L.filter(l=>l.type===place.kind&&!l.preset).length+1;
    L.push(place.kind==='laser'?{id,type:'laser',name:'Laser '+n,wl:nw.wl,int:nw.int,w:nw.w,on:true,...tg}:{id,type:'point',name:'Light '+n,col:nw.col,int:nw.int,r:nw.r,on:true,...tg});lEdit=id;}
  const kind=place.kind,isNew=!place.edit;endPlace(false);applyLight(lightOf(lEdit),kind==='point'?(isNew?'struct':'move'):'beam');
  toast(isNew?(kind==='laser'?'Laser placed':'Light placed'):'Moved');openLights('scene');}
// after an edit: lasers only re-trace; a bulb that moved or changed updates its sphere; adding or removing one recompiles
function applyLight(L,what){saveUI();
  if(what==='struct'||(L&&L.type==='point'&&what!=='beam'&&!SC.some(o=>o.lid===L.id))){buildScene(true);build();reset();}
  else if(L&&L.type==='point'){const o=SC.find(o=>o.lid===L.id);if(o){o.x=L.pos[0];o.by=o.y=L.pos[1];o.z=L.pos[2];o.r=L.r;o.c=hex2lin(L.col);o.em=bulbEm(L);upload(simT);reset();}}
  rebuildBeams();}
// the lab bench: items by id (m0… mirrors, lens, prism, sphere); edits rebuild the scene, recompiling only when the count changes
const optItem=id=>{const o=labCfg();return id[0]==='m'&&/^m\d+$/.test(id)?o.mirrors[+id.slice(1)]:o[id];};
const optName=id=>/^m\d+$/.test(id)?'Mirror '+(+id.slice(1)+1):{lens:'Lens',prism:'Prism',sphere:'Glass ball'}[id];
const optPos=id=>{const it=optItem(id);return it?[it.x,id==='prism'?.45:id==='sphere'?.35:it.y,it.z]:null;};
function labApply(struct){saveUI();buildScene(true);if(struct)build();reset();}
let labPend=false;const labSoon=()=>{if(labPend)return;labPend=true;requestAnimationFrame(()=>{labPend=false;labApply(false);});};
// tapping an optic in the Laser Lab selects it for editing
function pickOptic(cx,cy){if(!LV||!SCENES[S.scene].lab||S.proj!=='persp')return null;const [sx,sy]=clientToScreen(cx,cy),h=sceneHit(LV.eye,screenRay(LV,sx,sy));
  if(!h)return null;const o=({p:PR,b:BX,l:LN,s:SC}[h.key[0]]||[])[+h.key.slice(1)];return o&&o.opt||null;}
function openLights(sub){if(sub)UIS.lsub=sub;if(openP==='lights')drawLights();else openPane('lights');}
// selection ring over the optic being edited
function selRing(){const el=$('sel');if(bScene()){bRing(el);return;}el.style.width=el.style.height='';el.style.left=el.style.top='';const id=lEdit,ok=openP==='lights'&&UIS.lsub==='optics'&&id&&SCENES[S.scene].lab&&LV&&optItem(id);
  if(!ok){el.hidden=true;return;}const p=project(optPos(id),LV);if(!p){el.hidden=true;return;}el.hidden=false;el.style.transform=`translate(${p[0]}px,${p[1]}px)`;}
function rangeCtl(label,min,max,step,val,fmt,on){const el=mk('div','ctl'),lab=mk('div','lab',label),out=mk('output');lab.appendChild(out);
  const r=document.createElement('input');r.type='range';r.min=min;r.max=max;r.step=step;r.value=val;r.setAttribute('aria-label',label);
  const show=()=>{out.textContent=fmt(+r.value);r.style.setProperty('--p',((r.value-min)/(max-min)*100)+'%');};show();
  r.oninput=()=>{show();on(+r.value);};el.append(lab,r);return el;}
function colorRow(cur,on){const el=mk('div','ctl');el.appendChild(mk('div','lab','Color'));const g=mk('div','cols');
  const mark=v=>{for(const b of g.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.c===v));};
  for(const c of LCOLS){const b=mk('button');b.type='button';b.dataset.c=c;b.style.background=c;b.setAttribute('aria-label','Color '+c);b.onclick=()=>{mark(c);pk.value=c;on(c);};g.appendChild(b);}
  const pk=document.createElement('input');pk.type='color';pk.value=cur;pk.setAttribute('aria-label','Custom color');pk.oninput=()=>{mark(pk.value);on(pk.value);};g.appendChild(pk);
  mark(cur);el.appendChild(g);return el;}
// laser color: any wavelength from 400 to 700 nm on a spectrum slider, or white (the full spectrum)
function spectrumCtl(src,on){const el=mk('div','ctl'),lab=mk('div','lab','Wavelength'),out=mk('output');lab.appendChild(out);
  const r=document.createElement('input');r.type='range';r.min=400;r.max=700;r.step=1;r.className='spec';r.value=src.wl||532;r.setAttribute('aria-label','Wavelength in nanometers');
  const wb=mk('button','chip','White');wb.type='button';
  const show=()=>{out.textContent=src.wl?`${src.wl} nm · ${nmName(src.wl)}`:'White · full spectrum';wb.setAttribute('aria-pressed',String(!src.wl));r.classList.toggle('dim',!src.wl);};
  r.oninput=()=>{src.wl=+r.value;show();on();};wb.onclick=()=>{src.wl=src.wl?0:+r.value;show();on();};
  show();const row=mk('div','specrow');row.append(r,wb);el.append(lab,row);return el;}
const fmtW=v=>(v*1000).toFixed(0)+' mm',fmtR=v=>(v*100).toFixed(0)+' cm',fmtI=v=>v.toFixed(1)+'×',fmtM=v=>(+v).toFixed(2).replace('-','−')+' m',fmtD=v=>String(Math.round(v)).replace('-','−')+'°';
const sw0=x=>x.type==='laser'?laserHex(x):x.col,sub0=x=>(x.type==='laser'?(x.wl?x.wl+' nm':'White')+' · '+fmtW(x.w):'Bulb · '+fmtR(x.r))+' · '+fmtI(x.int);
const CHEV=o=>`<svg viewBox="0 0 24 24"><path d="${o?'M6 15l6-6 6 6':'M6 9l6 6 6-6'}"/></svg>`;
const btn=(label,cls,fn)=>{const b=mk('button','btn'+(cls?' '+cls:''),label);b.type='button';b.onclick=fn;return b;};
const lookAt=p=>tweenTo({tx:p[0],ty:p[1],tz:p[2],dist:Math.max(2,Math.min(cam.dist,5))});
// an expandable row: swatch or glyph, name, summary, optional switch, editor when open
function row(id,{sw,glyph,name,sub,on,onToggle,edit}){const r=mk('div','lrow'+(on===false?' off':'')),hd=mk('div','lhead'),open=lEdit===id;
  const nb=mk('button','lname');nb.type='button';nb.setAttribute('aria-expanded',String(open));
  nb.innerHTML=`${glyph?`<i class="lgl">${glyph}</i>`:`<i class="lsw" style="background:${sw};--c:${sw}"></i>`}<span><b></b><small></small></span>${CHEV(open)}`;
  nb.querySelector('b').textContent=name;nb.querySelector('small').textContent=sub;nb.onclick=()=>{lEdit=open?null:id;drawLights();};hd.appendChild(nb);
  if(onToggle){const s=mk('label','sw'),ck=document.createElement('input');ck.type='checkbox';ck.setAttribute('role','switch');ck.setAttribute('aria-label','On: '+name);ck.checked=on!==false;
    ck.onchange=()=>{r.classList.toggle('off',!ck.checked);onToggle(ck.checked);};s.append(ck,mk('i'));hd.appendChild(s);}
  r.appendChild(hd);if(open){const ed=mk('div','ledit');edit(ed,t=>nb.querySelector('small').textContent=t,c=>{const e=nb.querySelector('.lsw');if(e){e.style.background=c;e.style.setProperty('--c',c);}});r.appendChild(ed);}
  return r;}
const GLY={mirror:'<svg viewBox="0 0 24 24"><path d="M7 20 17 4M9.5 21h5"/></svg>',lens:'<svg viewBox="0 0 24 24"><path d="M12 3c3 3 3 15 0 18-3-3-3-15 0-18Z"/></svg>',
  prism:'<svg viewBox="0 0 24 24"><path d="M12 4 20 19H4Z"/></svg>',sphere:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5"/><path d="M8.5 9.5a4 4 0 0 1 3-2"/></svg>'};
function drawLights(){const host=paneEl('lights');if(!host)return;host.innerHTML='';
  const lab=!!SCENES[S.scene].lab;if(openP==='lights')$('shTitle').textContent=lab?'Laser lab':'Lights and lasers';
  if(isCosmos()){host.appendChild(mk('p','note','Lights work in object scenes only.'));
    const r=mk('div','row-btns');r.appendChild(btn('Open Laser Lab','',()=>{S.scene='laser lab';changed('scene');}));host.appendChild(r);return;}
  const tabs=lab?[['optics','Optics'],['scene','Lasers'],['add','Add']]:[['scene','In scene'],['add','Add']];
  if(!tabs.some(t=>t[0]===UIS.lsub))UIS.lsub=tabs[0][0];
  const tb=mk('div','seg subtabs');tb.setAttribute('role','tablist');
  for(const [v,l] of tabs){const b=mk('button','',l);b.type='button';b.setAttribute('aria-pressed',String(UIS.lsub===v));b.onclick=()=>{UIS.lsub=v;saveUI();drawLights();$('panes').scrollTop=0;};tb.appendChild(b);}
  host.appendChild(tb);
  ({optics:drawOptics,scene:drawList,add:drawAdd})[UIS.lsub](host,lab);}
function drawAdd(host){const nw=UIS.lnew;
  const kc=mk('div','ctl'),seg=mk('div','seg');seg.setAttribute('role','group');seg.setAttribute('aria-label','Kind');
  for(const [v,l] of [['laser','Laser'],['point','Light bulb']]){const b=mk('button','',l);b.type='button';b.setAttribute('aria-pressed',String(nw.kind===v));b.onclick=()=>{nw.kind=v;saveUI();drawLights();};seg.appendChild(b);}
  kc.appendChild(seg);host.appendChild(kc);
  host.appendChild(nw.kind==='laser'?spectrumCtl(nw,()=>saveUI()):colorRow(nw.col,c=>{nw.col=c;saveUI();}));
  host.appendChild(rangeCtl('Brightness',.5,nw.kind==='laser'?20:40,.5,nw.int,fmtI,v=>{nw.int=v;saveUI();}));
  host.appendChild(nw.kind==='laser'?rangeCtl('Beam width',.003,.05,.001,nw.w,fmtW,v=>{nw.w=v;saveUI();}):rangeCtl('Bulb size',.03,.3,.01,nw.r,fmtR,v=>{nw.r=v;saveUI();}));
  const rb=mk('div','row-btns');rb.appendChild(btn(nw.kind==='laser'?'Aim and fire':'Aim and place','primary',()=>startPlace(nw.kind,null)));host.appendChild(rb);
  host.appendChild(mk('p','note',nw.kind==='laser'?'Fires toward the center of the view.':'Placed where the center of the view points.'));}
function drawList(host,lab){const L=sceneLights();
  if(!L.length)host.appendChild(mk('p','note','Nothing placed yet. Use Add to fire a laser or place a bulb.'));
  for(const x of L){const pre=!!x.preset;
    host.appendChild(row(x.id,{sw:sw0(x),name:x.name,sub:(pre?'Preset · ':'')+sub0(x),on:x.on,onToggle:v=>{x.on=v;applyLight(x,x.type==='point'?'struct':'beam');},
      edit:(ed,setSub,setSw)=>{const up=w=>{setSub((pre?'Preset · ':'')+sub0(x));applyLight(x,w);};
        ed.appendChild(x.type==='laser'?spectrumCtl(x,()=>{setSw(sw0(x));up('look');}):colorRow(x.col,c=>{x.col=c;setSw(c);up('look');}));
        ed.appendChild(rangeCtl('Brightness',.5,x.type==='laser'?20:40,.5,x.int,fmtI,v=>{x.int=v;up('look');}));
        ed.appendChild(x.type==='laser'?rangeCtl('Beam width',.003,.05,.001,x.w,fmtW,v=>{x.w=v;up('look');}):rangeCtl('Bulb size',.03,.3,.01,x.r,fmtR,v=>{x.r=v;up('look');}));
        const bb=mk('div','row-btns');bb.append(btn(x.type==='laser'?'Re-aim':'Move','',()=>startPlace(x.type,x.id)),btn('Look at it','',()=>lookAt(x.type==='laser'?x.o:x.pos)));
        if(!pre)bb.appendChild(btn('Delete','danger',()=>{L.splice(L.indexOf(x),1);lEdit=null;applyLight(x,x.type==='point'?'struct':'beam');drawLights();toast(x.name+' deleted');}));
        ed.appendChild(bb);}}));}
  const r=mk('div','row-btns');
  if(SCENES[S.scene].lights)r.appendChild(btn(lab?'Reset lasers':'Reset lights','',()=>{delete UIS.lights[S.scene];sceneLights();lEdit=null;applyLight(null,'struct');drawLights();toast('Back to the preset lights');}));
  else if(L.length)r.appendChild(btn('Remove all','',()=>{const pt=L.some(l=>l.type==='point');L.length=0;lEdit=null;applyLight(null,pt?'struct':'beam');drawLights();toast('All lights removed');}));
  if(r.children.length)host.appendChild(r);}
function drawOptics(host){const o=labCfg();
  host.appendChild(mk('p','note','Tap a mirror, lens, or prism to select it. Lasers update as you drag.'));
  const xz=(it,ed)=>{ed.appendChild(rangeCtl('Left – right',-3.6,3.6,.01,it.x,fmtM,v=>{it.x=v;labSoon();}));ed.appendChild(rangeCtl('Back – front',-3.4,3.4,.01,it.z,fmtM,v=>{it.z=v;labSoon();}));};
  const acts=(ed,id,extra)=>{const bb=mk('div','row-btns');bb.append(btn('Move to aim point','',()=>startPlace('optic',id)),btn('Look at it','',()=>lookAt(optPos(id))));if(extra)bb.appendChild(extra);ed.appendChild(bb);};
  o.mirrors.forEach((m,i)=>{const id='m'+i,sb=()=>`Turned ${fmtD(m.yaw)} · tilted ${fmtD(m.tilt)}`;
    host.appendChild(row(id,{glyph:GLY.mirror,name:optName(id),sub:sb(),edit:(ed,setSub)=>{const u=()=>{setSub(sb());labSoon();};
      xz(m,ed);ed.appendChild(rangeCtl('Height',.3,2,.01,m.y,fmtM,v=>{m.y=v;u();}));
      ed.appendChild(rangeCtl('Turn',-180,180,.5,m.yaw,fmtD,v=>{m.yaw=v;u();}));ed.appendChild(rangeCtl('Tilt',-60,60,.5,m.tilt,fmtD,v=>{m.tilt=v;u();}));
      acts(ed,id,btn('Remove','danger',()=>{o.mirrors.splice(i,1);lEdit=null;labApply(true);drawLights();toast(optName(id)+' removed');}));}}));});
  const l=o.lens,ls=()=>`${l.kind==='diverging'?'Diverging':'Converging'} · focal length ${fmtM(l.f)}`;
  host.appendChild(row('lens',{glyph:GLY.lens,name:'Lens',sub:ls(),edit:(ed,setSub)=>{const u=()=>{setSub(ls());labSoon();};
    const kc=mk('div','ctl'),seg=mk('div','seg');for(const [v,t] of [['converging','Converging'],['diverging','Diverging']]){const b=mk('button','',t);b.type='button';b.setAttribute('aria-pressed',String(l.kind===v));
      b.onclick=()=>{l.kind=v;for(const c of seg.children)c.setAttribute('aria-pressed',String(c===b));u();};seg.appendChild(b);}kc.appendChild(seg);ed.appendChild(kc);
    ed.appendChild(rangeCtl('Focal length',.4,3,.01,l.f,fmtM,v=>{l.f=v;u();}));
    xz(l,ed);ed.appendChild(rangeCtl('Height',.4,2,.01,l.y,fmtM,v=>{l.y=v;u();}));ed.appendChild(rangeCtl('Turn',-180,180,.5,l.yaw,fmtD,v=>{l.yaw=v;u();}));acts(ed,'lens');}}));
  const p=o.prism,ps=()=>`Turned ${fmtD(p.yaw)} · spread ${p.spread.toFixed(2)}`;
  host.appendChild(row('prism',{glyph:GLY.prism,name:'Prism',sub:ps(),edit:(ed,setSub)=>{const u=()=>{setSub(ps());labSoon();};
    xz(p,ed);ed.appendChild(rangeCtl('Turn',-180,180,.5,p.yaw,fmtD,v=>{p.yaw=v;u();}));
    ed.appendChild(rangeCtl('Color spread',.02,.25,.005,p.spread,v=>(+v).toFixed(3),v=>{p.spread=v;u();}));acts(ed,'prism');}}));
  const g=o.sphere;
  host.appendChild(row('sphere',{glyph:GLY.sphere,name:'Glass ball',sub:g.on?'On the bench':'Off',on:g.on,onToggle:v=>{g.on=v;labApply(true);drawLights();},
    edit:ed=>{xz(g,ed);acts(ed,'sphere');}}));
  const r=mk('div','row-btns');
  if(o.mirrors.length<8)r.appendChild(btn('Add mirror','primary',()=>startPlace('optic',null)));
  r.appendChild(btn('Reset bench','',()=>{const n=o.mirrors.length,b=o.sphere.on;UIS.lab=labDefaults();lEdit=null;labApply(n!==UIS.lab.mirrors.length||b!==UIS.lab.sphere.on);drawLights();toast('Bench back to the original layout');}));
  host.appendChild(r);}
reg('scene',()=>{if(openP==='build')drawBuild();});
UIS.lnew=Object.assign({kind:'laser',wl:638,col:'#ffcf9a',int:5,w:.012,r:.08},UIS.lnew||{});if(UIS.lnew.wl===undefined)UIS.lnew.wl=638;
reg('scene',()=>{if(place)endPlace(false);lEdit=null;drawLights();document.querySelector('.tab[data-p="lights"] span').textContent=SCENES[S.scene].lab?'Lab':'Lights';});
$('placeNo').onclick=()=>endPlace(true);$('placeOk').onclick=()=>commitPlace(false);$('placeCam').onclick=()=>commitPlace(true);


