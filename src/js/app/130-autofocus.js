/* ---------- autofocus: CPU ray cast against the scene ---------- */
let curFocus=S.focus,focusTgt=S.focus,focusPt=null,afAuto=null,afT=1e9;
let pickObj=false;
function pickT(ro,rd){let t=1e9;pickObj=false;
  if(S.floor!=='none'&&rd[1]<-1e-4){const tp=-ro[1]/rd[1];if(tp>0)t=tp;}
  for(const o of SC){const oc=sub3(ro,[o.x,o.y,o.z]),b=dot3(oc,rd),c=dot3(oc,oc)-o.r*o.r,h=b*b-c;if(h<0)continue;
    const q=Math.sqrt(h);let tt=-b-q;if(tt<1e-3)tt=-b+q;if(tt>1e-3&&tt<t){t=tt;pickObj=true;}}
  for(const q of PR){let tn=-1e9,tf=1e9,ok=true;for(const pl of q.planes){const dn=pl[0]*rd[0]+pl[1]*rd[1]+pl[2]*rd[2],dist=pl[3]-(pl[0]*ro[0]+pl[1]*ro[1]+pl[2]*ro[2]);
    if(Math.abs(dn)<1e-9){if(dist<0)ok=false;continue;}const tt=dist/dn;if(dn<0)tn=Math.max(tn,tt);else tf=Math.min(tf,tt);}
    if(ok&&tf>=Math.max(tn,1e-3)){const tt=tn>1e-3?tn:tf;if(tt<t){t=tt;pickObj=true;}}}
  for(const q of LN){const oc=sub3(ro,q.c),b=dot3(oc,rd),c=dot3(oc,oc)-q.r*q.r,h=b*b-c;if(h>=0){const tt=-b-Math.sqrt(h);if(tt>1e-3&&tt<t){t=tt;pickObj=true;}}}
  for(const bx of BX){let tn=-1e9,tf=1e9;const c=[bx.x,bx.y,bx.z],h=[bx.hx,bx.hy,bx.hz];
    for(let i=0;i<3;i++){const inv=1/(rd[i]||1e-9),t0=(c[i]-h[i]-ro[i])*inv,t1=(c[i]+h[i]-ro[i])*inv;tn=Math.max(tn,Math.min(t0,t1));tf=Math.min(tf,Math.max(t0,t1));}
    if(tf>=Math.max(tn,1e-3)){const tt=tn>1e-3?tn:tf;if(tt<t){t=tt;pickObj=true;}}}
  for(const I of INST.list){const h=instHitJS(I,ro,rd);if(h&&h.t<t){t=h.t;pickObj=true;}}
  return t<1e9?t:null;}
// screen point in short-side units ([-1,1] across the shorter side) to a ray
function screenRay(V,sx,sy){const tf=viewTan();return norm(V.fw.map((v,i)=>v+(sx*V.rt[i]+sy*V.up[i])*tf));}
function clientToScreen(x,y){const m=Math.min(innerWidth,innerHeight)/2;return [(x-innerWidth/2)/m,-(y-innerHeight/2)/m];}
// multi-point AF: a grid of points across the frame; objects beat the floor, then the nearest (or most central) subject wins
const AFG={'9':[3,3],'15':[5,3],'35':[7,5]};let afPts=[],afSel=-1;
function afGrid(){const [c,r]=AFG[S.afPoints]||AFG['15'],a=[],ar=innerWidth/innerHeight,X=.6*Math.max(1,Math.min(1.6,ar)),Y=.4*Math.max(1,Math.min(1.6,1/ar));
  for(let j=0;j<r;j++)for(let i=0;i<c;i++)a.push([c>1?-X+2*X*i/(c-1):0,r>1?Y-2*Y*j/(r-1):0]);return a;}
function multiAF(V){const g=afGrid();afPts=g.map(([x,y])=>{const rd=screenRay(V,x,y),t=pickT(V.eye,rd);return t?{x,y,d:t*dot3(rd,V.fw),obj:pickObj}:{x,y,d:null,obj:false};});
  const objs=afPts.filter(p=>p.d&&p.obj),pool=objs.length?objs:afPts.filter(p=>p.d);if(!pool.length)return;
  const w=S.afPriority==='center'?.9:.12;let best=null,bs=1e9;for(const p of pool){const sc=p.d*(1+w*Math.hypot(p.x,p.y));if(sc<bs){bs=sc;best=p;}}
  afAuto=best.d;afSel=afPts.indexOf(best);}
function focusUpdate(V,dt){
  let t=S.focus;
  if(S.focusMode==='multi'){afT+=dt;if(afT>150){afT=0;multiAF(V);}t=afAuto??S.focus;}else
  if(S.focusMode==='center'){afT+=dt;if(afT>150){afT=0;const rd=V.fw,h=pickT(V.eye,rd);if(h)afAuto=h;}t=afAuto??S.focus;}
  else if(S.focusMode==='tap'){t=focusPt?dot3(sub3(focusPt,V.eye),V.fw):curFocus;}
  else if(S.focusMode==='target'){t=S.camMode==='orbit'?dot3(sub3([cam.tx,cam.ty,cam.tz],V.eye),V.fw):(afAuto??S.focus);
    if(S.camMode!=='orbit'){afT+=dt;if(afT>150){afT=0;const h=pickT(V.eye,V.fw);if(h)afAuto=h;}}}
  focusTgt=Math.max(.2,t);
  if(S.focusMode==='manual'){curFocus=focusTgt;return;}
  const nf=curFocus+(focusTgt-curFocus)*(1-Math.exp(-dt/1000*S.afSpeed));
  if(Math.abs(nf-curFocus)>curFocus*.0015)nudge();curFocus=nf;
}
const dofOn=()=>!isCosmos()&&S.aperture>0&&S.proj==='persp';

