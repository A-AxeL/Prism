/* ---------- camera rig: orbit and fly modes, auto motion, tweens, momentum ---------- */
const cam=Object.assign({px:0,py:1,pz:6,lyaw:Math.PI,lpitch:0},SCENES[S.scene].cam||CAM0);
let moved=true,camMove=false,needBlit=true;
function reset(){frame=0;moved=true;needBlit=true;taValid=false;}
const reOK=()=>!isCosmos()&&S.reproj&&fExt&&S.proj==='persp';   // the planet and black hole renderer always starts fresh: it is clean in one frame
function nudge(){if(reOK())camMove=true;else reset();}
const ptrs=new Map();let lastTap=0,pinch0=null,inert=null,tween=null,lastMove=0,vel={y:0,p:0},fb={t:0,yaw:0,pitch:0,dist:1},clock=0,LV=null;
const joy={x:0,y:0,u:0},keys=new Set();
const dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],sub3=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dirOf=(y,p)=>[Math.sin(y)*Math.cos(p),Math.sin(p),Math.cos(y)*Math.cos(p)];
const angDiff=(a,b)=>{let d=(b-a)%(2*Math.PI);if(d>Math.PI)d-=2*Math.PI;if(d<-Math.PI)d+=2*Math.PI;return d;};
const clampPitch=p=>isCosmos()?Math.max(-1.5,Math.min(1.5,p)):Math.max(-.3,Math.min(1.5,p));
function orbitEye(c=cam){const cp=Math.cos(c.pitch);return [c.tx+Math.sin(c.yaw)*cp*c.dist,c.ty+Math.sin(c.pitch)*c.dist,c.tz+Math.cos(c.yaw)*cp*c.dist];}
function basis(fw){let r=cross(fw,[0,1,0]);if(Math.hypot(...r)<1e-4)r=cross(fw,[0,0,1]);r=norm(r);return [r,cross(r,fw)];}
function toFly(){const e0=LV&&isCosmos()?LV.eye:orbitEye(),e=peSpinV(e0,1);cam.px=e[0];cam.py=e[1];cam.pz=e[2];const f=LV&&isCosmos()?peSpinV(LV.fw,1):norm(sub3([cam.tx,cam.ty,cam.tz],e));flyAim(f);}
function peSpinV(v,s){if(!peOn())return v;const a=s*peSpinA(),c=Math.cos(a),n=Math.sin(a);return [c*v[0]-n*v[2],v[1],n*v[0]+c*v[2]];}
function toOrbit(){
  if(isCosmos()){{const q=peSpinV([cam.px,cam.py,cam.pz],-1);cam.px=q[0];cam.py=q[1];cam.pz=q[2];}const r=Math.hypot(cam.px,cam.py,cam.pz);cam.tx=cam.ty=cam.tz=0;cam.dist=r;cam.pitch=clampPitch(Math.asin(cam.py/r));cam.yaw=Math.atan2(cam.px,cam.pz);return;}
  const d=dirOf(cam.lyaw,cam.lpitch),k=Math.max(2,Math.min(12,cam.dist||6));
  cam.tx=cam.px+d[0]*k;cam.ty=Math.max(0,cam.py+d[1]*k);cam.tz=cam.pz+d[2]*k;
  const e=sub3([cam.px,cam.py,cam.pz],[cam.tx,cam.ty,cam.tz]);cam.dist=Math.hypot(...e);cam.yaw=Math.atan2(e[0],e[2]);cam.pitch=clampPitch(Math.asin(e[1]/cam.dist));}
function fbBase(){fb={t:0,yaw:cam.yaw,pitch:cam.pitch,dist:cam.dist};}
/* CPU mirror of the shader's terrain (n3 → hgt → groundAt), so the camera can stay above the ground */
function n3js(x,y,z){const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);let fx=x-ix,fy=y-iy,fz=z-iz;
  fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);fz=fz*fz*(3-2*fz);const N=NOISE,X0=ix&31,X1=(ix+1)&31,Y0=iy&31,Y1=(iy+1)&31,Z0=iz&31,Z1=(iz+1)&31;
  const v=(a,b,c)=>N[a+32*(b+32*c)],l=(a,b,t)=>a+(b-a)*t;
  return l(l(l(v(X0,Y0,Z0),v(X1,Y0,Z0),fx),l(v(X0,Y1,Z0),v(X1,Y1,Z0),fx),fy),l(l(v(X0,Y0,Z1),v(X1,Y0,Z1),fx),l(v(X0,Y1,Z1),v(X1,Y1,Z1),fx),fy),fz)/255;}
function groundJS(dir,eyeR){const co=SCENES[S.scene].cosmos;if(!co||co.kind!==0||!NOISE)return 1;if(peOn())return peGround();
  const dw=1-sstep(.012,.035,eyeR-1);if(dw<=0)return 1;
  const a=simT*.03,c=Math.cos(a),sn=Math.sin(a);let p=[(c*dir[0]-sn*dir[2])*2.2,dir[1]*2.2,(sn*dir[0]+c*dir[2])*2.2];
  const OCT=S.terrainOct,nd=OCT+4,sea=co.sea??.5;let A=.5,s=0,w=0,d=0;
  for(let i=0;i<nd;i++){const v=n3js(p[0],p[1],p[2]);if(i<OCT){s+=A*v;w+=A;}else d+=A*2.6*(1-Math.abs(2*v-1)-.62);   // mountain ranges: the first detail octaves count 2.6×
    p=[p[0]*2.07+5.3,p[1]*2.07+1.9,p[2]*2.07+7.7];A*=.5;}
  const h0=s/w,h=h0+d/w*(.45+1.5*sstep(sea-.02,sea+.18,h0)),x=Math.max(h-(sea>0?sea:.45),0);
  return 1+.0016*(co.relief??1)*dw*x*(.4+1.6*x)/.3;}
const GROUND_CLEAR=.00003;   // about 200 m (the old ray marcher); the planet engine allows 2 m
const gClear=()=>peOn()?.002/peCfg(SCENES[S.scene].cosmos).R:GROUND_CLEAR;
function clampEye(eye){const r=Math.hypot(...eye),g=groundJS(eye.map(v=>v/r),r)+gClear();return r<g?eye.map(v=>v*g/r):eye;}
function flyClamp(){const co=SCENES[S.scene].cosmos;
  if(co){const r=Math.hypot(cam.px,cam.py,cam.pz),mn=co.kind===2?1.6:co.kind===1?1.0008:groundJS([cam.px/r,cam.py/r,cam.pz/r],r)+gClear();if(r<mn){const s=mn/r;cam.px*=s;cam.py*=s;cam.pz*=s;}}
  else if(S.floor!=='none'&&cam.py<.08)cam.py=.08;}
function flySpd(){const co=SCENES[S.scene].cosmos;if(!co)return S.flySpeed;const r=Math.hypot(cam.px,cam.py,cam.pz);
  if(peOn()){const R=peCfg(co).R;return S.flySpeed*Math.min(.48,Math.max((r-peGround())*.12,.01/R));}
  return co.kind===2?S.flySpeed*.8:S.flySpeed*.12*Math.min(4,Math.max(.00015,r-1));}
/* flying near a planet: yaw and pitch are measured in the local horizon frame (up = away from the planet's center), so the
   horizon stays level wherever you are. The frame's "north" (cam.ref) is carried along as you move (re-projected onto
   the new horizon each step), so your heading stays steady across the whole globe, poles included. */
const planetFly=()=>{const co=SCENES[S.scene].cosmos;return S.camMode==='fly'&&!!co&&co.kind!==2;};
function localFrame(){const P=[cam.px,cam.py,cam.pz],U=norm(P);let ref=cam.ref||[0,1,0],d=dot3(ref,U);
  ref=sub3(ref,U.map(v=>v*d));if(Math.hypot(...ref)<1e-6){ref=Math.abs(U[0])<.9?[1,0,0]:[0,0,1];d=dot3(ref,U);ref=sub3(ref,U.map(v=>v*d));}
  ref=norm(ref);cam.ref=ref;return {U,N:ref,E:cross(U,ref)};}
function flyDir(){if(!planetFly())return dirOf(cam.lyaw,cam.lpitch);const {U,N,E}=localFrame(),d=dirOf(cam.lyaw,cam.lpitch);
  return norm([0,1,2].map(i=>E[i]*d[0]+U[i]*d[1]+N[i]*d[2]));}
function flyRight(f){if(!planetFly())return basis(f)[0];const U=norm([cam.px,cam.py,cam.pz]);let r=cross(f,U);return Math.hypot(...r)<1e-6?basis(f)[0]:norm(r);}
// point the fly camera along a world direction (used when switching from orbit), expressed in the local frame
function flyAim(f){if(!planetFly()){cam.lyaw=Math.atan2(f[0],f[2]);cam.lpitch=Math.asin(Math.max(-1,Math.min(1,f[1])));return;}
  cam.ref=null;const {U,N,E}=localFrame();cam.lyaw=Math.atan2(dot3(f,E),dot3(f,N));cam.lpitch=Math.max(-1.5,Math.min(1.5,Math.asin(Math.max(-1,Math.min(1,dot3(f,U))))));}
function flyStep(f,r,mz,mx,my,s){const u=planetFly()?norm([cam.px,cam.py,cam.pz]):[0,1,0];
  cam.px+=(f[0]*mz+r[0]*mx+u[0]*my)*s;cam.py+=(f[1]*mz+r[1]*mx+u[1]*my)*s;cam.pz+=(f[2]*mz+r[2]*mx+u[2]*my)*s;flyClamp();}
// the view for this frame: position, forward/right/up, with handheld sway, the planet-landing horizon tilt and roll
function view(CO){
  let eye,fw;
  if(S.camMode==='fly'){eye=[cam.px,cam.py,cam.pz];fw=flyDir();}
  else{eye=orbitEye();if(!CO&&S.floor!=='none'&&eye[1]<.05)eye[1]=.05;fw=norm(sub3([cam.tx,cam.ty,cam.tz],eye));}
  if(S.autoMove==='handheld'){const t=clock*S.moveSpeed,[r0,u0]=basis(fw),a=.011*(Math.sin(t*1.13)+.6*Math.sin(t*2.71+1.3)),b=.008*(Math.sin(t*1.61+2.1)+.5*Math.sin(t*3.37)),
      m=(S.camMode==='fly'?.25:Math.min(cam.dist,8)*.004)*Math.sin(t*.7),n=(S.camMode==='fly'?.18:Math.min(cam.dist,8)*.003)*Math.sin(t*.93+1);
    fw=norm(fw.map((v,i)=>v+r0[i]*a+u0[i]*b));eye=eye.map((v,i)=>v+r0[i]*m+u0[i]*n);}
  let [rt,up]=basis(fw);
  if(planetFly()){rt=flyRight(fw);up=cross(rt,fw);}   // level with the planet's horizon
  if(CO&&CO.kind===0)eye=clampEye(eye);
  if(CO&&CO.kind===0&&S.camMode!=='fly'){const a=(1-sstep(0,.35,cam.dist-1))*1.42,c=Math.cos(a),s=Math.sin(a);const f2=fw.map((v,i)=>v*c+up[i]*s);up=up.map((v,i)=>v*c-fw[i]*s);fw=f2;}
  if(S.roll){const a=S.roll*Math.PI/180,c=Math.cos(a),s=Math.sin(a),r2=rt.map((v,i)=>v*c+up[i]*s);up=up.map((v,i)=>v*c-rt[i]*s);rt=r2;}
  return {eye,fw,rt,up};
}
function camUpdate(dt,CO){
  const s=dt/1000;clock+=s;
  if(tween){tween.t=Math.min(1,tween.t+s/tween.d);const x=tween.t,e=x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
    for(const k of ['pitch','dist','tx','ty','tz'])cam[k]=tween.a[k]+(tween.b[k]-tween.a[k])*e;
    cam.yaw=tween.a.yaw+angDiff(tween.a.yaw,tween.b.yaw)*e;nudge();if(tween.t>=1){tween=null;fbBase();}}
  if(inert&&!ptrs.size){cam.yaw+=inert.y*dt;cam.pitch=clampPitch(cam.pitch+inert.p*dt);const f=Math.exp(-dt*.0035);inert.y*=f;inert.p*=f;nudge();if(Math.hypot(inert.y,inert.p)<2e-5)inert=null;}
  if(!ptrs.size&&!tween&&!B_){
    if(S.autoMove==='turntable'){if(S.camMode==='fly')cam.lyaw+=s*.12*S.moveSpeed;else cam.yaw+=s*.12*S.moveSpeed;nudge();}
    else if(S.autoMove==='flyby'&&S.camMode==='orbit'){fb.t+=s*S.moveSpeed;cam.yaw=fb.yaw+fb.t*.16;cam.pitch=clampPitch(fb.pitch+.22*Math.sin(fb.t*.37));
      cam.dist=CO&&CO.kind===0?1+(fb.dist-1)*(1+.45*Math.sin(fb.t*.23)):fb.dist*(1+.3*Math.sin(fb.t*.23));nudge();}
    else if(S.autoMove==='handheld')nudge();
  }
  if(S.camMode==='fly'){let mx=joy.x,mz=joy.y,my=joy.u;
    if(keys.has('KeyW')||keys.has('ArrowUp'))mz+=1;if(keys.has('KeyS')||keys.has('ArrowDown'))mz-=1;
    if(keys.has('KeyD')||keys.has('ArrowRight'))mx+=1;if(keys.has('KeyA')||keys.has('ArrowLeft'))mx-=1;
    if(keys.has('KeyE'))my+=1;if(keys.has('KeyQ'))my-=1;
    if(mx||my||mz){const f=flyDir(),r=flyRight(f),boost=keys.has('ShiftLeft')||keys.has('ShiftRight')?3:1;flyStep(f,r,mz,mx,my,flySpd()*boost*s);nudge();}}
}
function tweenTo(b,d=.9){if(S.camMode==='fly'){toOrbit();S.camMode='orbit';ctl.camMode&&ctl.camMode();refreshVis&&refreshVis();}
  inert=null;tween={a:{...cam},b:{...cam,...b},t:0,d};}

cv.addEventListener('pointerdown',e=>{if(bScene()&&bDragStart(e))return;cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY,b:e.button});inert=null;tween=null;vel={y:0,p:0};
  if(ptrs.size===1&&e.pointerType==='touch'){const now=performance.now();if(now-lastTap<300){resetView();}lastTap=now;}
  pinch0=null;});
cv.addEventListener('pointermove',e=>{if(bDrag&&e.pointerId===bDrag.id){bDragMove(e);return;}const p=ptrs.get(e.pointerId);if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;
  const fly=S.camMode==='fly';
  if(ptrs.size===1){
    if(fly){const k=.0045*S.lookSens;cam.lyaw-=dx*k;cam.lpitch=Math.max(-1.5,Math.min(1.5,cam.lpitch-dy*k));}
    else if((p.b===2||e.shiftKey)&&!isCosmos())pan(dx,dy);
    else{const k=rotK()*.006*S.lookSens,now=performance.now(),dtm=Math.max(8,now-lastMove);lastMove=now;
      cam.yaw-=dx*k;cam.pitch=clampPitch(cam.pitch+dy*k);vel={y:vel.y*.5+.5*(-dx*k/dtm),p:vel.p*.5+.5*(dy*k/dtm)};}
    p.x=e.clientX;p.y=e.clientY;nudge();
  }else if(ptrs.size===2){
    p.x=e.clientX;p.y=e.clientY;const [a,b]=[...ptrs.values()];
    const d=Math.hypot(a.x-b.x,a.y-b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    if(pinch0){if(fly){const f=flyDir(),r=flyRight(f),sp=flySpd();flyStep(f,r,(1-pinch0.d/d)*6,-(mx-pinch0.mx)*.01,(my-pinch0.my)*.01,sp);}
      else{zoom(pinch0.d/d);if(!isCosmos())pan(mx-pinch0.mx,my-pinch0.my);}nudge();}
    pinch0={d,mx,my};
  }});
const up=e=>{if(bDrag&&e.pointerId===bDrag.id){const m=bDrag.moved;bDrag=null;if(m){bApply();if(openP==='build')drawBuild();}return;}ptrs.delete(e.pointerId);pinch0=null;
  if(!ptrs.size&&S.camMode==='orbit'){if(S.inertia&&performance.now()-lastMove<70&&Math.hypot(vel.y,vel.p)>2e-4)inert={...vel};fbBase();}};
cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('wheel',e=>{e.preventDefault();
  if(S.camMode==='fly'){const f=flyDir(),r=flyRight(f);flyStep(f,r,-e.deltaY*.004,0,0,flySpd());}else{zoom(Math.exp(e.deltaY*.001));fbBase();}nudge();},{passive:false});
function zoom(f){const co=SCENES[S.scene].cosmos;
  if(co&&co.kind===0){cam.dist=1+Math.max(.00002,Math.min(30,(cam.dist-1)*f));}
  else{const mn=co?(co.kind===1?1.25:2.6):1.5;cam.dist=Math.max(mn,Math.min(co?150:40,cam.dist*f));}}
const rotK=()=>{const co=SCENES[S.scene].cosmos;return co&&co.kind===0?Math.min(1,Math.max(.04,(cam.dist-1)*.9)):1;};
function pan(dx,dy){const k=cam.dist*.0015;const cy=Math.cos(cam.yaw),sy=Math.sin(cam.yaw);cam.tx-=(cy*dx)*k;cam.tz-=(-sy*dx)*k;cam.ty=Math.max(-5,cam.ty+dy*k);}

