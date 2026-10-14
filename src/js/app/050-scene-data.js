/* ---------- scene data: spheres sorted into bounding-sphere clusters ---------- */
let BGR=[],uBGa=new Float32Array(3),uBGb=new Float32Array(3),uBGr=new Int32Array(2),SC=[],BX=[],GR=[],LI=[],LB=[],PR=[],LN=[];
let uPrP,uPrM,uPrO,uPrB,uLnB,uLnC,uLnA,uLnS,uLnM,uLnO;
// prism: a triangle cross-section (edge planes [nx,ny,d] in local x/y) extruded ±len/2 along local z, turned by tilt (about z) then yaw (about y)
// type: 2 glass, 1 mirror, 0 matte; vert stands the extrusion axis upright; pitch tips local z up or down
function mkPrism({c,yaw=0,tilt=0,pitch=0,vert=false,len,tri,col=[1,1,1],ior=1.62,disp=.12,dens=0,type=2,ro=0}){
  const cy=Math.cos(yaw),sy=Math.sin(yaw),ct=Math.cos(tilt),st=Math.sin(tilt),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const rot=([x,y,z])=>{[x,y]=[x*ct-y*st,x*st+y*ct];if(vert)[y,z]=[z,-y];[y,z]=[y*cp-z*sp,y*sp+z*cp];return [x*cy+z*sy,y,-x*sy+z*cy];};
  const planes=[...tri.map(([nx,ny,d])=>[[nx,ny,0],d]),[[0,0,1],len/2],[[0,0,-1],len/2]].map(([n,d])=>{const w=rot(n);return [...w,d+w[0]*c[0]+w[1]*c[1]+w[2]*c[2]];});
  while(planes.length<6)planes.push([0,1,0,1e6]);
  // bounding radius from the cross-section's actual corners (edge-line intersections inside every edge)
  let rx=0;for(let i=0;i<tri.length;i++)for(let j=i+1;j<tri.length;j++){const [a,b,d]=tri[i],[e,f,g]=tri[j],det=a*f-b*e;if(Math.abs(det)<1e-9)continue;
    const x=(d*f-b*g)/det,y=(a*g-d*e)/det;if(tri.every(([p,q,h])=>p*x+q*y<=h+1e-6))rx=Math.max(rx,Math.hypot(x,y));}
  return {planes,col,ior,disp,dens,type,ro,c,r:Math.hypot(len/2,rx)};}
// flat slab (w × h, thickness t) facing local z: a mirror when type is 1; aimSlab turns its face to the normal n
const mkSlab=({c,w,h,t=.04,yaw=0,pitch=0,col=[.95,.95,.97],type=1,ro=0})=>mkPrism({c,yaw,pitch,len:t,tri:[[1,0,w/2],[-1,0,w/2],[0,1,h/2],[0,-1,h/2]],col,type,ro,dens:0});
const aimSlab=(c,n,o)=>mkSlab({c,yaw:Math.atan2(n[0],n[2]),pitch:-Math.asin(Math.max(-1,Math.min(1,n[1]))),...o});
// Laser Lab: the bench layout is a small settings object (mirrors, lens, prism, glass ball) that the scene is built from
const D2R=Math.PI/180;
const labN=(yaw,tilt)=>{const y=yaw*D2R,t=tilt*D2R;return [Math.sin(y)*Math.cos(t),Math.sin(t),Math.cos(y)*Math.cos(t)];};
function labDefaults(){const E=[-3.3,.9,2.5],M=[[2.8,.9,2],[2.6,.9,-1.6],[-2.6,.9,-1.4],[-1,.9,1]],chain=[E,...M,[.12,.9,-1.8]];
  return {mirrors:M.map((m,i)=>{const n=norm(sub3(norm(sub3(chain[i+2],m)),norm(sub3(m,chain[i]))));
      return {x:m[0],y:m[1],z:m[2],yaw:+(Math.atan2(n[0],n[2])/D2R).toFixed(1),tilt:+(Math.asin(n[1])/D2R).toFixed(1)};}),
    lens:{x:0,y:.9,z:-1.8,yaw:0,f:.87,kind:'converging'},prism:{x:1.4,z:.45,yaw:-31,spread:.1},sphere:{on:true,x:-1.5,z:-.2}};}
function labCfg(){const d=labDefaults();UIS.lab=UIS.lab||d;for(const k in d)if(UIS.lab[k]==null)UIS.lab[k]=d[k];return UIS.lab;}
const EQUI=sd=>{const ri=sd/(2*Math.sqrt(3));return [[0,-1,ri],[Math.cos(Math.PI/6),Math.sin(Math.PI/6),ri],[-Math.cos(Math.PI/6),Math.sin(Math.PI/6),ri]];};
const RIGHT=sd=>[[0,-1,sd/3],[-1,0,sd/3],[Math.SQRT1_2,Math.SQRT1_2,sd/(3*Math.SQRT2)]];
// isosceles wedge: base width w, apex angle in degrees, apex up; planes relative to the centroid
const WEDGE=(w,deg)=>{const h=w/2/Math.tan(deg*Math.PI/360),V=[[-w/2,0],[w/2,0],[0,h]],cx=0,cy=h/3,out=[];
  for(let i=0;i<3;i++){const [x0,y0]=V[i],[x1,y1]=V[(i+1)%3];let nx=y1-y0,ny=-(x1-x0);const l=Math.hypot(nx,ny);nx/=l;ny/=l;out.push([nx,ny,nx*(x0-cx)+ny*(y0-cy)]);}
  return out;};
// spherical lens: aperture radius R along an axis; face radii r1 (toward +axis) and r2: positive convex, negative concave, 0 flat
function mkLens({c,axis,R,r1,r2,hc,col=[1,1,1],ior=1.52,disp=.05,dens=0}){
  const a=norm(axis),sag=q=>q?Math.abs(q)-Math.sqrt(q*q-R*R):0,he=hc+Math.max(r1<0?sag(r1):0,r2<0?sag(r2):0)+.004;
  return {c,a,R,r1,r2,hc,he,col,ior,disp,dens,r:Math.hypot(R,he)};}
let uLb,uS,uC,uM,uG,uGr,uLi,uBp,uBh,uBc,uBm;const uBB=new Float32Array(6);
function cluster(list,max=6){
  const out=[];const rec=a=>{if(a.length<=max){out.push(a);return;}
    const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(const o of a){const p=[o.x,o.by,o.z];for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k]);}}
    let ax=0;for(let k=1;k<3;k++)if(mx[k]-mn[k]>mx[ax]-mn[ax])ax=k;const key=o=>[o.x,o.by,o.z][ax];
    a.sort((p,q)=>key(p)-key(q));const m=a.length>>1;rec(a.slice(0,m));rec(a.slice(m));};
  rec(list.slice());return out;
}
function buildScene(fresh){
  // some scenes fix their surroundings (the Cornell box sits in a black void), even when restored from saved settings
  const fz=SCENES[S.scene].force;if(fz)for(const k in fz)if(S[k]!==fz[k]){S[k]=fz[k];if(typeof ctl!=='undefined'&&ctl[k])ctl[k]();}
  if(fresh||!SC.length){
    const [s,b,x]=SCENES[S.scene].f();
    {const bg=cluster(b.map(q=>(q.by=q.y,q)),4);BX=bg.flat();let k=0;BGR=bg.map(g=>{const r=[k,k+g.length];k+=g.length;return r;});
     const ng=Math.max(1,BGR.length);uBGa=new Float32Array(ng*3);uBGb=new Float32Array(ng*3);uBGr=new Int32Array(ng*2);
     bg.forEach((g,i)=>{const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(const q of g){const p=[q.x,q.y,q.z],h=[q.hx,q.hy,q.hz];for(let a=0;a<3;a++){mn[a]=Math.min(mn[a],p[a]-h[a]);mx[a]=Math.max(mx[a],p[a]+h[a]);}}
       uBGa.set(mn,i*3);uBGb.set(mx,i*3);uBGr.set(BGR[i],i*2);});}if(!SCENES[S.scene].cosmos)for(const L of sceneLights())if(L.type==='point'&&L.on!==false){const o=G(...L.pos,L.r,hex2lin(L.col),3,0,bulbEm(L));o.lid=L.id;s.push(o);}PR=(x&&x.PR)||[];LN=(x&&x.LN)||[];INST.list=((x&&x.INS)||[]).map(mkInst).filter(Boolean);instUpload();
    const np=Math.max(1,PR.length),nl=Math.max(1,LN.length);
    uPrP=new Float32Array(np*24);uPrM=new Float32Array(np*4);uPrO=new Float32Array(np*4);uPrB=new Float32Array(np*4);uLnB=new Float32Array(nl*4);
    PR.forEach((q,i)=>{q.planes.forEach((pl,k)=>uPrP.set(pl,(i*6+k)*4));uPrM.set([...q.col,q.dens],i*4);uPrO.set([q.ior,q.disp,q.type??2,q.ro||0],i*4);uPrB.set([...q.c,q.r*1.01],i*4);});
    uLnC=new Float32Array(nl*4);uLnA=new Float32Array(nl*4);uLnS=new Float32Array(nl*4);uLnM=new Float32Array(nl*4);uLnO=new Float32Array(nl*4);
    LN.forEach((q,i)=>{uLnC.set([...q.c,q.R],i*4);uLnA.set([...q.a,q.he],i*4);uLnS.set([q.r1,q.r2,q.hc,0],i*4);uLnM.set([...q.col,q.dens],i*4);uLnO.set([q.ior,q.disp,0,0],i*4);uLnB.set([...q.c,q.r*1.01],i*4);});
    const groups=cluster(s);SC=groups.flat();let i=0;GR=groups.map(g=>{const r=[i,i+g.length];i+=g.length;return r;});
    LI=SC.map((o,i)=>o.t===3?i:-1).filter(i=>i>=0);
    const ns=Math.max(1,SC.length),nb=Math.max(1,BX.length);
    uS=new Float32Array(ns*4);uC=new Float32Array(ns*4);uM=new Float32Array(ns*4);
    uG=new Float32Array(Math.max(1,GR.length)*4);uGr=new Int32Array(Math.max(1,GR.length)*2);GR.forEach((r,i)=>uGr.set(r,i*2));
    uLi=new Int32Array(Math.max(1,LI.length));uLi.set(LI);
    LB=BX.map((b,i)=>b.t===3?i:-1).filter(i=>i>=0);uLb=new Int32Array(Math.max(1,LB.length));uLb.set(LB);
    uBp=new Float32Array(nb*4);uBh=new Float32Array(nb*4);uBc=new Float32Array(nb*4);uBm=new Float32Array(nb*4);
  }
  upload(simT);
  if(typeof rebuildBeams==='function')rebuildBeams();
}
let sceneVer=0;
function upload(time){sceneVer++;
  SC.forEach((o,i)=>{
    o.y=S.animate?o.by+Math.abs(Math.sin(time*1.5+o.ph))*.6:o.by;
    uS.set([o.x,o.y,o.z,o.r],i*4);uC.set([...o.c,S.glassDensity],i*4);
    uM.set([o.t,o.t===1?S.rough:o.ro,S.glassIOR,o.t===3?o.em:0],i*4);
  });
  GR.forEach(([a,b],g)=>{let cx=0,cy=0,cz=0;for(let i=a;i<b;i++){cx+=SC[i].x;cy+=SC[i].y;cz+=SC[i].z;}const n=b-a;cx/=n;cy/=n;cz/=n;
    let r=0;for(let i=a;i<b;i++)r=Math.max(r,Math.hypot(SC[i].x-cx,SC[i].y-cy,SC[i].z-cz)+SC[i].r);uG.set([cx,cy,cz,r+1e-3],g*4);});
  const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  BX.forEach((b,i)=>{uBp.set([b.x,b.y,b.z,0],i*4);uBh.set([b.hx,b.hy,b.hz,0],i*4);
    uBc.set([...b.c,b.d<0?S.glassDensity:b.d*S.glassDensity/1.6],i*4);uBm.set([b.t,b.t===1?Math.min(b.ro,S.rough):b.ro,S.glassIOR,b.em],i*4);
    const p=[b.x,b.y,b.z],h=[b.hx,b.hy,b.hz];for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]-h[k]);mx[k]=Math.max(mx[k],p[k]+h[k]);}});
  uBB.set([...mn,...mx]);
}

