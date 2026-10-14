/* ---- forests: 3D trees over the terrain ----
   Trees grow in cells of the terrain quadtree (about 150 m across, 32×32 slots each). A GPU pass works out each slot from the
   terrain generator itself: where exactly the trunk stands, the ground height there, its slope, temperature and rain, and so
   which tree (if any) grows: spruce and fir in the cold, pines where it is dry, broadleaf woods in temperate rain, birch at
   the edges, tall rainforest trees, palms on tropical coasts, acacias in the savanna, shrubs in tundra and scrub, cacti in
   hot deserts. Near the camera each tree is a mesh with cut-out foliage; farther out an impostor (a picture of the same mesh
   baked from many directions, relit with its baked normals); beyond that the ground's own canopy shading takes over. */
const PE_VS=['none','spruce','pine','broadleaf','birch','tropical','palm','acacia','shrub','cactus'],PE_NSP=10,PE_NV=4,PE_NVS=PE_NSP*PE_NV,PE_VC=32,PE_VCAP=512;
// how many tree cells are kept (each 32×32 slots, some 150 m across on Earth): enough on the big presets to cover the whole
// impostor range, so forests reach the horizon instead of stopping a kilometre out
const peVCap=()=>({pc:3072,cinematic:2048,ultra:1536,quality:1024}[S.preset]||PE_VCAP),peVBudget=()=>S.preset==='pc'?[24,12]:S.preset==='cinematic'||S.preset==='ultra'?[12,6]:[6,3];
// each kind (a species in one of its PE_NV builds: species + 10 × build): height (m), crown center height (m), impostor half-size
// seen from the side (m), from above (m); measured on the meshes once they are made
const PE_VSP=Array.from({length:PE_NVS},()=>[0,0,0,0]);
// each build's crown as an ellipsoid fitted to its leaves (centre x,y,z; radii x,y,z), for the soft shadows
const PE_VCR=Array.from({length:PE_NVS*2},()=>[0,0,0,0]);
// which tree grows at a slot (shared by the scatter pass): 0 none, then the species above. T: mean temperature (°C), W: rain
// (0-1), hm: height above the water line (m), sl: slope (1-cos), r1, r2: random, nz: three patch noises (stands of one kind)
const PE_GLVEG=`
uniform float uVegK;
float gss(float x,float c,float s){return exp(-sq((x-c)/s));}
int vegPick(float T,float W,float hm,float sl,float r1,float r2,float r3,vec3 nz,out float vig,out float fcl){
  vig=0.;fcl=0.;if(hm<1.2||sl>.33)return 0;
  float steep=1.-smoothstep(.12,.3,sl);
  float fo=smoothstep(.3,.55,W+(nz.x-.5)*.12+(uVegK-1.)*.15)*smoothstep(-1.,7.,T)*steep*min(uVegK*2.,1.);   // closed forest (the ground's own forest)
  float sav=smoothstep(.1,.22,W)*(1.-smoothstep(.38,.52,W))*smoothstep(12.,20.,T)*steep;            // savanna: scattered trees
  float tun=smoothstep(-10.,-4.,T)*(1.-smoothstep(-2.,3.,T))*smoothstep(.08,.25,W);                // tundra: dwarf shrubs
  float des=(1.-smoothstep(.06,.16,W))*smoothstep(-2.,6.,T);                                      // desert scrub
  float open=(1.-fo)*smoothstep(.15,.32,W)*smoothstep(-1.,8.,T)*steep;                            // lone trees in grassland
  float dens=(fo*.82+sav*.08+open*.025+tun*.14+des*.03)*min(uVegK,1.5);fcl=fo;
  if(r1>dens){if(r1<dens+(fo*.08+sav*.2)*min(uVegK,1.5)&&T>-3.){vig=.45+.55*r2;fcl=fo;return 8;}return 0;}
  float w[10];w[0]=0.;
  w[1]=gss(T,1.,6.)*smoothstep(.25,.45,W)*(.4+nz.y);                                              // spruce, fir
  w[2]=gss(T,8.,8.)*smoothstep(.15,.3,W)*(1.-smoothstep(.55,.75,W))*(.3+nz.z)+.15*gss(T,2.,6.);  // pine
  w[3]=gss(T,13.,6.)*smoothstep(.36,.55,W)*(1.4-nz.y);                                            // broadleaf
  w[4]=gss(T,4.,5.)*smoothstep(.3,.5,W)*(.25+.5*nz.z);                                            // birch
  w[5]=smoothstep(17.,23.,T)*smoothstep(.45,.65,W)*1.6;                                           // tall rainforest
  w[6]=smoothstep(20.,25.,T)*(smoothstep(30.,4.,hm)*2.5+.15*smoothstep(.5,.7,W));                 // palms on tropical coasts
  w[7]=sav*14.+smoothstep(15.,22.,T)*(1.-smoothstep(.3,.45,W))*.4;                                // acacia
  w[8]=.12+tun*4.+des*2.+(1.-fo)*.5;                                                              // shrubs
  w[9]=des*smoothstep(15.,22.,T)*1.3;                                                             // cacti
  float s=0.;for(int i=1;i<10;i++)s+=w[i];float x=r2*s;int k=8;
  for(int i=1;i<10;i++){x-=w[i];if(x<=0.){k=i;break;}}
  // big crowns need room: a slot (4.7 m apart) keeps its tree with the odds of one crown per crown area
  const float room[10]=float[10](1.,.62,.5,.26,.9,.14,.3,.34,1.,1.);
  if(r3>room[k]*1.15){if(fract(r3*13.7)<fo*.3+sav*.3&&T>-3.){vig=.45+.55*r2;return 8;}return 0;}   // (an understory shrub instead)
  // vigor: bigger in the middle of a good climate, stunted at the cold and dry edges
  vig=clamp(.35+.65*(fo+sav*.6)+.2*smoothstep(.4,.7,W),0.,1.)*(1.-smoothstep(-6.,0.,-T)*.3);
  return k;}
`;
// ---- procedural meshes, one per species (metres, y up, the trunk at the origin) ----
// Trees grow as branch systems: a curved, tapering trunk sprouts limbs, limbs sprout branches, branches twigs, each turned
// round its parent by the golden angle, bending toward the light or drooping under its weight, kept inside the species'
// crown; leaf clusters sit along the outer twigs, so the crown has depth, gaps and inner shade. Two versions of each: the
// full one near the camera, and one without the finest twigs (the same leaves) farther out. Bark carries texture
// coordinates in metres (around the stem, along it) for the photo-scanned bark.
const PE_SHRUB=450;   // shrubs are left out beyond this (m)
const PE_TLOD=PE_NVS;   // mesh index offset of the far versions
function peTreeGen(){const ad=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sb=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],ml=(a,s)=>[a[0]*s,a[1]*s,a[2]*s],
    cr=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],ln=a=>Math.hypot(a[0],a[1],a[2]),nm=a=>{const l=ln(a)||1;return [a[0]/l,a[1]/l,a[2]/l];},cl=(x,a,b)=>Math.min(b,Math.max(a,x));
  const V=[],I=[],sp=[];let cur=null;
  // a vertex: position, normal, uv, ambient occlusion, wind weight, kind (0 bark, 1 foliage, 2 cactus skin)
  const vt=(p,n,uv,ao,w,k)=>{V.push(p[0],p[1],p[2],n[0],n[1],n[2],uv[0],uv[1],ao,w,k,0);return V.length/12-1;};
  const cellUV=i=>({u0:(i%4)/4,v0:(i>>2)/2,du:.25,dv:.5});
  // a foliage card: base C, U along it (base to tip), across Vv; normals bent outward by nf(p), occlusion by af(p)
  const card=(C,U,Vv,L,Wd,cell,nf,af,H,center)=>{const c=cellUV(cell),e=.004,b0=center?ad(C,ml(U,-L/2)):C;
    const P=[ad(b0,ml(Vv,-Wd/2)),ad(b0,ml(Vv,Wd/2)),ad(ad(b0,ml(U,L)),ml(Vv,Wd/2)),ad(ad(b0,ml(U,L)),ml(Vv,-Wd/2))];
    const T=[[c.u0+e,c.v0+c.dv-e],[c.u0+c.du-e,c.v0+c.dv-e],[c.u0+c.du-e,c.v0+e],[c.u0+e,c.v0+e]],Nc=nm(cr(U,Vv));
    const ids=P.map((p,j)=>vt(p,nm(ad(ml(nf(p),.82),ml(Nc,.18))),T[j],af(p),Math.pow(cl(p[1]/H,0,1),1.5),1));I.push(ids[0],ids[1],ids[2],ids[0],ids[2],ids[3]);};
  // a tapered tube along a path of points with radii (bark, or cactus skin); uv in metres: around the stem, along it
  const tube=(pts,rad,n,H,kind=0,ao=.38)=>{const base=V.length/12,rings=pts.length;let s=0,a=null;
    for(let i=0;i<rings;i++){const p=pts[i],d=nm(i<rings-1?sb(pts[i+1],p):sb(p,pts[i-1]));if(i>0)s+=ln(sb(p,pts[i-1]));
      // the ring's frame carried along the path (no twist where the stem bends)
      a=a?nm(sb(a,ml(d,a[0]*d[0]+a[1]*d[1]+a[2]*d[2]))):nm(cr(d,Math.abs(d[1])<.9?[0,1,0]:[1,0,0]));const b=cr(d,a);
      for(let k=0;k<=n;k++){const t=k/n*Math.PI*2,nr=ad(ml(a,Math.cos(t)),ml(b,Math.sin(t)));vt(ad(p,ml(nr,rad[i])),nr,[k/n*6.2832*Math.max(rad[0],.05),s],ao*(.8+.2*cl(p[1]/H*3,0,1)),Math.pow(cl(p[1]/H,0,1),2)*.6,kind);}}
    for(let i=0;i<rings-1;i++)for(let k=0;k<n;k++){const a=base+i*(n+1)+k,b=a+1,c=a+n+1,d=c+1;I.push(a,c,b,b,c,d);}};
  const begin=()=>{cur={i0:I.length};},end=()=>{cur.n=I.length-cur.i0;return cur;};
  const sphN=(Cc,Rr)=>p=>nm([(p[0]-Cc[0])/Rr[0],(p[1]-Cc[1])/Rr[1],(p[2]-Cc[2])/Rr[2]]);
  const sphA=(Cc,Rr,yb,yt)=>p=>{const d=ln([(p[0]-Cc[0])/Rr[0],(p[1]-Cc[1])/Rr[1],(p[2]-Cc[2])/Rr[2]]);return cl(.3+.7*d,.3,1)*(.72+.28*cl((p[1]-yb)/(yt-yb),0,1));};
  // one branch and everything that grows from it
  const branch=(S,p0,d0,len,rad,lv,X)=>{const segs=[7,5,3,2][Math.min(lv,3)],sides=Math.max(3,Math.min(X.lod?6:9,Math.round(rad*(X.lod?12:20))+3));
    const pts=[p0],rads=[rad*(lv===0?1.45:1)];let d=d0,p=p0;
    for(let i=1;i<=segs;i++){const t=i/segs;
      // toward the light, drooping toward the tip, wandering a little
      // (a trunk stays upright: it only wanders a little and is drawn back toward the vertical)
      d=nm(ad(ad(d,[0,lv?(S.photo[lv]||0)*.3-(S.droop[lv]||0)*t*.35:.12,0]),ml([X.r()-.5,(X.r()-.5)*.5,X.r()-.5],S.wig*(lv?1:.12))));
      // kept inside the crown: a branch that has grown out of it turns back in (and grows on more slowly)
      let st=len/segs;
      if(lv>0&&S.Rr){const q=[(p[0]-S.Cc[0])/S.Rr[0],(p[1]-S.Cc[1])/S.Rr[1],(p[2]-S.Cc[2])/S.Rr[2]],e=ln(q);
        if(e>.92&&p[1]>S.Cc[1]-S.Rr[1]*.6){d=nm(ad(d,ml(nm([-q[0]/S.Rr[0],-q[1]/S.Rr[1]*.5,-q[2]/S.Rr[2]]),(e-.9)*2.5)));st*=e>1.1?.35:1;}}
      p=ad(p,ml(d,st));
      pts.push(p);rads.push(rad*(1-t*(1-S.taper))*(lv===0&&i===1?1.12:1));}
    if(!(X.lod&&lv>=S.levels)&&rad>.008)tube(pts,rads,sides,S.H,0,.38+.35*lv/(S.levels+1));
    if(lv<S.levels){const n=S.kids[lv];for(let k=0;k<n;k++){const t=S.k0[lv]+(1-S.k0[lv])*(k+.25+.5*X.r())/n,i=Math.min(segs-1,Math.floor(t*segs)),f=t*segs-i;
        const q=ad(pts[i],ml(sb(pts[i+1],pts[i]),f)),bd=nm(sb(pts[i+1],pts[i]));X.az+=2.39996;
        const a1=nm(cr(bd,Math.abs(bd[1])<.95?[0,1,0]:[1,0,0])),a2=cr(bd,a1),side=ad(ml(a1,Math.cos(X.az)),ml(a2,Math.sin(X.az))),ang=S.ang[lv]*(.8+.4*X.r());
        const cd=nm(ad(ml(bd,Math.cos(ang)),ml(side,Math.sin(ang))));const lf=S.lenFn?S.lenFn(t,lv):1-.35*t;
        branch(S,q,cd,len*S.lr[lv]*lf*(.85+.3*X.r()),rad*S.rr[lv]*(1-.3*t),lv+1,X);}}
    // leaves along the outer part of the twigs (and, for some species, of the branches before them)
    if(lv>=S.levels-(S.leafUp||0)&&lv>0){const m=lv<S.levels?Math.ceil(S.leaves*.6):S.leaves;
      for(let k=0;k<m;k++){const t=.3+.7*(k+X.r())/m,i=Math.min(segs-1,Math.floor(t*segs)),f=t*segs-i,q=ad(pts[i],ml(sb(pts[i+1],pts[i]),f)),bd=nm(sb(pts[i+1],pts[i]));
        const L=S.leafL*(.75+.5*X.r());let U,Vv;
        // (flat crowns: cards tilted every way, so the crown still reads as foliage from the side)
        if(S.flat){const a=X.r()*6.283;U=nm([Math.cos(a),(X.r()-.5)*.5,Math.sin(a)]);Vv=nm([-Math.sin(a),.3+(X.r()-.5)*.8,Math.cos(a)]);}
        else{const ax=nm([X.r()-.5,X.r()-.5,X.r()-.5]);U=nm(ad(ml(bd,.55),ml(nm(cr(ax,bd)),.8)));Vv=nm(cr(U,ax));}
        card(ad(q,ml(U,L*.3)),U,Vv,L,L*(S.leafW||1),S.cell,S.nf,S.af,S.H,true);}}};
  const tree=(S,seed,lod)=>{const X={r:rng(seed),az:0,lod};begin();
    // the root flare, then the trunk and all it carries
    tube([[0,-.7,0],[0,.05,0],[0,.5,0]],[S.r0*1.9,S.r0*1.6,S.r0*1.2],lod?6:9,S.H);
    branch(S,[0,.4,0],nm([S.lean||0,1,0]),S.trunk,S.r0,0,X);return end();};
  // species: the shape of their crowns and how they branch
  const sp1={H:24,trunk:23.4,r0:.4,levels:2,kids:[42,3],k0:[.07,.3],ang:[1.72,.9],lr:[.165,.45],rr:[.3,.45],photo:[0,-.05,.15],droop:[0,.12,.3],wig:.12,taper:.08,
    lenFn:(t,lv)=>lv===0?Math.pow(1-t,.85)*1.08+.08:1-.3*t,leaves:4,leafUp:1,leafL:1.5,leafW:.75,cell:0,Cc:[0,10.5,0],Rr:[3.7,13,3.7]};
  const sp2={H:20,trunk:19,r0:.36,lean:.03,levels:2,kids:[13,4],k0:[.6,.35],ang:[1.2,.8],lr:[.2,.5],rr:[.35,.5],photo:[0,.35,.4],droop:[0,.05,0],wig:.3,taper:.15,leaves:4,leafL:1.5,cell:1,Cc:[0,16.4,0],Rr:[3.8,3,3.8]};
  const sp3={H:17,trunk:6.2,r0:.48,levels:3,kids:[4,4,4],k0:[.75,.3,.3],ang:[.7,.8,.85],lr:[1.05,.55,.5],rr:[.55,.5,.5],photo:[0,.5,.3,.2],droop:[0,.1,.3,.5],wig:.25,taper:.4,leaves:6,leafUp:1,leafL:1.7,cell:2,Cc:[0,11,0],Rr:[5.8,5,5.8]};
  const sp4={H:15,trunk:14.4,r0:.2,lean:.02,levels:2,kids:[18,4],k0:[.32,.25],ang:[.62,.9],lr:[.3,.45],rr:[.3,.5],photo:[0,.15,0],droop:[0,.25,.9],wig:.18,taper:.1,leaves:5,leafL:1.15,cell:3,Cc:[0,9.4,0],Rr:[2.7,5.2,2.7]};
  const sp5={H:30,trunk:21.5,r0:.72,levels:3,kids:[5,3,3],k0:[.85,.3,.3],ang:[1.05,.7,.8],lr:[.36,.55,.55],rr:[.42,.5,.5],photo:[0,.15,.3,.3],droop:[0,0,.2,.3],wig:.2,taper:.4,leaves:7,leafL:2.5,cell:4,Cc:[0,25.6,0],Rr:[8.2,3.8,8.2]};
  const sp7={H:7.5,trunk:2.5,r0:.26,levels:3,kids:[4,3,3],k0:[.9,.55,.4],ang:[.78,.55,.6],lr:[1.45,.55,.5],rr:[.6,.55,.5],photo:[0,.35,.12,0],droop:[0,0,.15,.3],wig:.3,taper:.35,leaves:6,leafL:1.5,leafW:.9,cell:6,flat:1,Cc:[0,6,0],Rr:[4.8,1.4,4.8]};
  const sp8={H:1.6,trunk:.25,r0:.05,levels:2,kids:[6,3],k0:[.4,.3],ang:[.65,.7],lr:[3.6,.5],rr:[.8,.6],photo:[0,.2,.2],droop:[0,.2,.3],wig:.3,taper:.3,leaves:4,leafL:.75,cell:7,Cc:[0,.8,0],Rr:[1,.85,1]};
  for(const S of [sp1,sp2,sp3,sp4,sp5,sp7,sp8]){S.nf=sphN(S.Cc,S.Rr);S.af=sphA(S.Cc,S.Rr,S.Cc[1]-S.Rr[1],S.H);}
  // 6 palm: a curved ringed trunk and a crown of long arching fronds
  const palm=v=>{const r=rng(67+v*31),H=13*(.8+.4*r()),nf=11+Math.floor(r()*5),lx=1.6*(.3+1.3*r()),la=r()*6.283,ca=Math.cos(la),sa=Math.sin(la);begin();const tp=[];
    for(let i=0;i<=6;i++){const t=i/6,x=lx*Math.pow(t,1.7),z=.3*t*t;tp.push([x*ca-z*sa,t*H,x*sa+z*ca]);}tube(tp,tp.map((_,i)=>.3-.1*i/6),7,H,0,.85);
    const top=tp[6];for(let k=0;k<nf;k++){const a=k*2.3999+v,d=[Math.cos(a),0,Math.sin(a)],side=nm(cr([0,1,0],d)),L=4.6+r()*.8,th0=.55+.35*r();let prev=null;const c=cellUV(5),nseg=5;
      for(let s=0;s<=nseg;s++){const u=s/nseg,th=th0-u*1.5,pos=ad(top,ad(ml(d,u*L*Math.cos(th*.8)),[0,u*L*Math.sin(th)*.7,0])),w=1.3*(1-u*.65);
        const n=nm(ad([0,1,0],ml(d,.3))),vv=c.v0+c.dv-(c.dv-.01)*u-.004,i0=vt(ad(pos,ml(side,-w/2)),n,[c.u0+.004,vv],.85,.4+.6*u,1),i1=vt(ad(pos,ml(side,w/2)),n,[c.u0+c.du-.004,vv],.85,.4+.6*u,1);
        if(prev){I.push(prev[0],prev[1],i1,prev[0],i1,i0);}prev=[i0,i1];}}return end();};
  // 9 cactus (saguaro): a ribbed column with two arms
  const cactus=v=>{const r=rng(5+v*17),H=6*(.7+.6*r());begin();tube([[0,0,0],[0,H*.5,0],[0,H*.97,0],[0,H,0]],[.34,.33,.3,.05],8,H,2,.9);
    const na=v===0?2:Math.floor(r()*4);for(let k=0;k<na;k++){const a=k*2.4+r()*1.2,y0=H*(.33+.25*r()),len=H*(.15+.22*r()),cx=Math.cos(a)*.85,cz=Math.sin(a)*.85;
      tube([[0,y0,0],[cx*.82,y0+.1,cz*.82],[cx,y0+.5,cz],[cx,y0+len,cz],[cx,y0+len+.2,cz]],[.22,.22,.22,.2,.04],7,H,2,.85);}return end();};
  // PE_NV builds of every species, no two alike: taller or squatter, wider or narrower crowns set a little off the trunk, more or
  // fewer limbs at other angles, a lean (each tree is also turned and stretched on its own where it stands)
  const vary=(S,v)=>{if(!v)return S;const r=rng(977+v*131+Math.round(S.H*10)),j=a=>1+(r()-.5)*2*a,f=j(.16),g=j(.2),T={...S};
    T.H=S.H*f;T.trunk=S.trunk*f*j(.08);T.Cc=[(r()-.5)*S.Rr[0]*.35,S.Cc[1]*f,(r()-.5)*S.Rr[2]*.35];T.Rr=[S.Rr[0]*g*j(.1),S.Rr[1]*f*j(.12),S.Rr[2]*g*j(.1)];
    T.kids=S.kids.map(k=>Math.max(2,Math.round(k*j(.22))));T.ang=S.ang.map(a=>a*j(.14));T.lr=S.lr.map((x,i)=>x*(i===0?g:1)*j(.1));
    T.k0=S.k0.map(x=>Math.min(.95,x*j(.12)));T.lean=(S.lean||0)+(r()-.5)*.1;T.wig=S.wig*j(.35);T.leaves=Math.max(2,Math.round(S.leaves*j(.2)));
    T.nf=sphN(T.Cc,T.Rr);T.af=sphA(T.Cc,T.Rr,T.Cc[1]-T.Rr[1],T.H);return T;};
  const out=[];
  for(let lod=0;lod<2;lod++)for(let v=0;v<PE_NV;v++){const b=lod*PE_NVS+v*PE_NSP,sd=v*1000;
    out[b]={i0:0,n:0};out[b+1]=tree(vary(sp1,v),11+sd,lod);out[b+2]=tree(vary(sp2,v),23+sd,lod);out[b+3]=tree(vary(sp3,v),37+sd,lod);out[b+4]=tree(vary(sp4,v),41+sd,lod);
    out[b+5]=tree(vary(sp5,v),53+sd,lod);out[b+6]=palm(v);out[b+7]=tree(vary(sp7,v),71+sd,lod);out[b+8]=tree(vary(sp8,v),83+sd,lod);out[b+9]=cactus(v);}
  return {V:new Float32Array(V),I:new Uint32Array(I),sp:out};}   // sp: kind (species + 10 × build) near, the same + PE_TLOD farther out
// foliage pictures (sprays, tufts, leaf clusters, fronds), drawn once on a canvas: 4×2 cells of 256 px
function peLeafAtlas(){const W=1024,Hh=512,c=document.createElement('canvas');c.width=W;c.height=Hh;const x=c.getContext('2d'),r=rng(97),R=()=>r();
  const cell=(i,f)=>{x.save();x.translate((i%4)*256,(i>>2)*256);x.beginPath();x.rect(0,0,256,256);x.clip();f();x.restore();};
  const hsl=(h,s,l,a=1)=>`hsla(${h},${s}%,${l}%,${a})`,line=(a,b,w,col)=>{x.strokeStyle=col;x.lineWidth=w;x.lineCap='round';x.beginPath();x.moveTo(a[0],a[1]);x.lineTo(b[0],b[1]);x.stroke();};
  const leaf=(cx,cy,rx,ry,rot,col)=>{x.fillStyle=col;x.beginPath();x.ellipse(cx,cy,rx,ry,rot,0,6.283);x.fill();};
  // 0 spruce spray: a branch with side twigs, all bristling with short dark needles
  cell(0,()=>{const tw=(p,d,len,w,depth)=>{const n=Math.max(4,len/5|0);for(let i=0;i<=n;i++){const t=i/n,q=[p[0]+d[0]*len*t,p[1]+d[1]*len*t];
      for(const s of [-1,1]){const a=Math.atan2(d[1],d[0])+s*(1.05+.3*R()),l=(7+6*R())*(1-t*.4);line(q,[q[0]+Math.cos(a)*l,q[1]+Math.sin(a)*l],1.6,hsl(128+R()*20,30+R()*20,13+R()*12));}
      if(depth>0&&i%3===1&&t<.85){for(const s of [-1,1]){const a=Math.atan2(d[1],d[0])+s*(.9+.2*R());twig(q,[Math.cos(a),Math.sin(a)],len*(.42-.3*t),depth-1);}}}
      line(p,[p[0]+d[0]*len,p[1]+d[1]*len],w,'#3b2a1c');},twig=(p,d,len,depth)=>tw(p,d,len,1.4,depth);
    tw([128,250],[0,-1],236,2.4,2);});
  // 1 pine tuft: fans of long needles from a short twig
  cell(1,()=>{line([128,250],[128,150],3,'#4a3322');for(let k=0;k<7;k++){const p=[128+(R()-.5)*60,150-R()*90],a0=-1.57+(R()-.5)*1.2;
      for(let i=0;i<34;i++){const a=a0+(R()-.5)*2.2,l=40+35*R();line(p,[p[0]+Math.cos(a)*l,p[1]+Math.sin(a)*l],1.5,hsl(100+R()*25,28+R()*15,20+R()*14));}}});
  // 2 broadleaf cluster: overlapping leaves in a rounded clump, lighter on top
  cell(2,()=>{for(let k=0;k<5;k++){const a=R()*6.283;line([128,135],[128+Math.cos(a)*55,135+Math.sin(a)*45],1.6,'#3f3022');}
    for(let i=0;i<130;i++){const a=R()*6.283,d=Math.sqrt(R())*110,cx=128+Math.cos(a)*d,cy=125+Math.sin(a)*d*.9,top=1-(cy-15)/220;leaf(cx,cy,9+6*R(),5+3*R(),R()*3.14,hsl(88+R()*30,32+R()*25,14+R()*12+top*14));}});
  // 3 birch: small, light, sparse leaves on drooping twigs
  cell(3,()=>{for(let k=0;k<6;k++){const a=R()*6.283;line([128,128],[128+Math.cos(a)*60,128+Math.sin(a)*60],1.2,'#4b3a2c');}
    for(let i=0;i<110;i++){const a=R()*6.283,d=Math.sqrt(R())*110,cx=128+Math.cos(a)*d,cy=125+Math.sin(a)*d;leaf(cx,cy,6+3*R(),4+2*R(),R()*3.14,hsl(72+R()*22,38+R()*22,22+R()*18));}});
  // 4 rainforest: big glossy leaves, dark
  cell(4,()=>{for(let i=0;i<60;i++){const a=R()*6.283,d=Math.sqrt(R())*100,cx=128+Math.cos(a)*d,cy=128+Math.sin(a)*d;leaf(cx,cy,16+10*R(),7+5*R(),R()*3.14,hsl(118+R()*20,40+R()*20,11+R()*13));
      x.strokeStyle='rgba(20,40,20,.5)';x.lineWidth=1;x.beginPath();x.moveTo(cx-8,cy);x.lineTo(cx+8,cy);x.stroke();}});
  // 5 palm frond: a rachis with long narrow leaflets swept toward the tip
  cell(5,()=>{for(let i=0;i<40;i++){const t=i/40,y=248-t*238,l=(70+20*R())*(1-t*.7);for(const s of [-1,1]){const a=-1.57+s*(.85+.25*R());line([128,y],[128+Math.cos(a)*l,y+Math.sin(a)*l],3.4-t*1.5,hsl(88+R()*18,36+R()*14,18+R()*14));}}
    line([128,250],[128,8],3.5,'#5a5030');});
  // 6 acacia: fine leaflets in flat clumps along thin branches
  cell(6,()=>{for(let k=0;k<8;k++){const p=[128+(R()-.5)*170,128+(R()-.5)*100];line([128+(p[0]-128)*.55,128+(p[1]-128)*.55],p,1.2,'#3a2c20');
      for(let i=0;i<70;i++){const a=R()*6.283,d=R()*38;leaf(p[0]+Math.cos(a)*d*1.4,p[1]+Math.sin(a)*d*.6,3+1.5*R(),2+R(),R()*3.14,hsl(68+R()*20,30+R()*15,20+R()*14));}}});
  // 7 shrub: a dense ball of small leaves
  cell(7,()=>{for(let i=0;i<220;i++){const a=R()*6.283,d=Math.sqrt(R())*112,cx=128+Math.cos(a)*d,cy=130+Math.sin(a)*d*.85,top=1-(cy-18)/224;leaf(cx,cy,5+4*R(),3+2*R(),R()*3.14,hsl(78+R()*35,30+R()*20,19+R()*13+top*12));}});
  const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,c);gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.bindTexture(gl.TEXTURE_2D,null);return t;}
// ---- shaders: tree meshes, impostors, and the impostor bake ----
// shared: a tree's place and frame from the cell table and the slot pools
const PE_GLTREE=`
uniform highp sampler2D uVP,uVC;uniform mediump sampler2D uVS;uniform vec4 uSp[${PE_NVS}];uniform float uRkm;
struct TI{vec3 base,up,ex,ez;float sc,tint,ph,fc,ws;int sp,k;};
TI treeAt(int id){TI t;int cell=id>>10,slot=id&1023;ivec2 pt=ivec2((cell&15)*${PE_VC}+(slot&31),(cell>>4)*${PE_VC}+(slot>>5));
  vec4 P=texelFetch(uVP,pt,0),Sd=texelFetch(uVS,pt,0);t.sp=int(Sd.x*15.+.5);
  vec3 rel=texelFetch(uVC,ivec2(0,cell),0).xyz,c=texelFetch(uVC,ivec2(1,cell),0).xyz,T1=texelFetch(uVC,ivec2(2,cell),0).xyz,T2=texelFetch(uVC,ivec2(3,cell),0).xyz,
    Css=texelFetch(uVC,ivec2(4,cell),0).xyz,Cst=texelFetch(uVC,ivec2(5,cell),0).xyz,Ctt=texelFetch(uVC,ivec2(6,cell),0).xyz;
  vec2 st=P.xy;vec3 dl=T1*st.x+T2*st.y+.5*(Css*st.x*st.x+2.*Cst*st.x*st.y+Ctt*st.y*st.y);
  t.up=normalize(c+dl);t.base=rel+dl+t.up*P.z;float a=Sd.z*6.2832;vec3 e=normalize(cross(vec3(0,1,0),t.up)+vec3(1e-5,0,1e-5)),n=cross(t.up,e);
  t.ex=e*cos(a)+n*sin(a);t.ez=cross(t.ex,t.up);t.sc=(.62+.76*Sd.y)/(uRkm*1000.);float wb=floor(Sd.w*255.+.5);t.fc=floor(wb/16.)/15.;t.tint=mod(wb,16.)/15.;t.ph=Sd.z*40.;
  // which build of its species (the same hash on the CPU picks the mesh), and its own width
  t.k=t.sp+int((uint(id)*0x9E3779B1u)>>30u)*${PE_NSP};t.ws=.86+.28*float((uint(id)*0x85EBCA6Bu)>>24u)/255.;return t;}
`;
const PE_GLPROJ=`
uniform vec3 uRt,uUp,uFw;uniform float uTanF,uOrtho,uLogC,uLogF;uniform int uProj;uniform vec4 uView;uniform vec2 uRes,uJ;
vec4 proj(vec3 rel){float x=dot(rel,uRt),y=dot(rel,uUp),z=dot(rel,uFw),s=min(uView.z,uView.w)*.5;vec2 o=.5*uView.zw-uView.xy-uJ+.5;
  if(uProj==3){vec2 px=vec2(x,y)/uOrtho*s+o;return vec4(px/uRes*2.-1.,z<0.?-2.:log2(max(1e-12,1.+max(z,0.)*uLogC))*uLogF-1.,1.);}
  vec2 px=vec2(x,y)/uTanF*s+o*z;return vec4(px/uRes*2.-vec2(z),(log2(max(1e-12,1.+z*uLogC))*uLogF-1.)*z,z);}
`;
// bark of each species (the meshes and the impostor bake share it, so near and far trees match)
const PE_GLBARK=`
// the drawn bark (uv: metres around the stem, metres along it)
vec3 barkCol(int sp,vec2 uv0){vec2 uv=vec2(uv0.x/1.9,uv0.y/2.5);float n=fract(sin(dot(floor(uv*vec2(7.,30.)),vec2(12.9,78.2)))*43758.5),st=.85+.3*n;
  if(sp==4){float m=step(.82,fract(sin(floor(uv.y*14.+floor(uv.x*5.))*91.3)*471.3));return mix(vec3(.72,.71,.67),vec3(.06,.05,.05),m*.85)*st;}
  if(sp==6)return vec3(.33,.28,.21)*(.75+.35*step(.5,fract(uv.y*6.)))*st;
  // furrows running up the trunk between plates of bark, each plate its own shade (deep on oak and pine, faint on smooth
  // tropical bark)
  float fx=uv.x*(sp==2?6.:9.)+.3*sin(uv.y*2.3+floor(uv.x*9.)*1.7),pl=fract(sin(floor(fx)*17.1+floor(uv.y*(sp==2?1.5:3.)+sin(floor(fx)*3.7)*2.)*31.7)*4375.5);
  st*=(1.-(sp==5?.2:sp==1?.3:.5)*smoothstep(.3,.48,abs(fract(fx)-.5)))*(.88+.24*pl);
  if(sp==2)return mix(vec3(.2,.13,.09),vec3(.48,.26,.13),smoothstep(5.,9.,uv.y*2.5))*st;
  if(sp==1)return vec3(.16,.11,.08)*st;if(sp==5)return vec3(.3,.27,.22)*st;return vec3(.22,.19,.16)*st;}
// the photo-scanned bark of the species once the textures are in (a birch keeps its white, with the grain of smooth bark)
vec3 barkAlb(int sp,vec2 uv){if(uMatOn<.5||sp==9)return barkCol(sp,uv);
  if(sp==4){vec3 r=texture(uMatA,vec3(uv/1.2,26.)).rgb/max(uMatM[26],vec3(.004));return barkCol(sp,uv)*mix(vec3(1),clamp(r,.4,1.8),.6);}
  int L=sp==1||sp==2?25:sp==5?26:sp==6?27:sp==7?28:24;vec3 a=texture(uMatA,vec3(uv/1.3,float(L))).rgb;float h=texture(uMatN,vec3(uv/1.3,float(L))).b;
  return a*(.7+.6*h)*(sp==7?vec3(.8,.75,.7):vec3(1));}
`;
// the trees' sun shadows near the camera, looked up by the ground and the trees: (1 lit .. 0 shadowed, how much the map covers
// the point). bias in metres
const PE_GLSH=`
// the sun's shadows of trees and rocks near the camera, from a filtered (exponential variance) shadow map: each texel holds the
// mean of e^(k·depth) and of its square over a blurred patch, so one smooth lookup gives a soft-edged shadow by Chebyshev's
// bound, with no texel steps, no sawtooth and no shimmer (Lauritzen's warped variance shadow maps). Two cascades side by side:
// a near one some 80 m across with texels a few cm wide, and a far one over the whole range of shadow-casting trees
uniform highp sampler2D uShM;uniform vec3 uShO,uShX,uShY,uShZ,uShO2,uShX2,uShY2,uShZ2;uniform vec4 uShP,uShP2;
float shEV(vec3 s,float zb,float tx,float hx){vec2 u=clamp(s.xy,vec2(tx),vec2(1.-tx));vec2 m=texture(uShM,vec2(u.x*.5+hx,u.y)).rg;
  float w=exp(35.*(s.z-zb-1.));if(w<=m.x)return 1.;float v=max(m.y-m.x*m.x,1e-12*w*w+1e-30),d=w-m.x,p=v/(v+d*d);
  return smoothstep(.25,1.,p);}   // (the bound's tail cut off: no pale halo where shadows overlap)
vec2 shFar(vec3 rel,float bias){vec3 q=rel-uShO2;vec3 s=vec3(dot(q,uShX2),dot(q,uShY2),dot(q,uShZ2))*.5+.5;
  vec2 e=abs(s.xy-.5)*2.;float m=1.-smoothstep(.8,.97,max(e.x,e.y));if(m<=0.||s.z>1.)return vec2(1,0);return vec2(shEV(s,bias*uShP2.z,uShP2.y,.5),m);}
vec2 sunSh(vec3 rel,float bias){if(uShP.x<.5)return vec2(1,0);vec3 q=rel-uShO;vec3 s=vec3(dot(q,uShX),dot(q,uShY),dot(q,uShZ))*.5+.5;
  vec2 e=abs(s.xy-.5)*2.;float en=max(e.x,e.y);
  if(en<.95&&s.z<=1.){float v=shEV(s,bias*uShP.z,uShP.y,0.),wN=1.-smoothstep(.75,.95,en);if(wN>.999)return vec2(v,1);vec2 f=shFar(rel,bias);return vec2(mix(f.x,v,wN),max(f.y,wN));}
  return shFar(rel,bias);}
// the plain hard lookup (the ground's shadows, rebuilt one step at a time; step 1): the raw depth map, one texel, one comparison,
// no filtering of any kind. bias in metres (per cascade: near, far)
uniform highp sampler2D uShD;
float shHard1(vec3 rel,vec3 O,vec3 X,vec3 Y,vec3 Z,vec4 P,float bias,int ci,out bool hit){vec3 q=rel-O;vec3 s=vec3(dot(q,X),dot(q,Y),dot(q,Z))*.5+.5;
  hit=all(greaterThan(s.xy,vec2(0)))&&all(lessThan(s.xy,vec2(1)))&&s.z<=1.;if(!hit)return 1.;
  int N=int(1./P.y+.5);ivec2 t=min(ivec2(s.xy*float(N)),ivec2(N-1));float d=texelFetch(uShD,ivec2(t.x+ci*N,t.y),0).r;
  return s.z-bias*P.z>d?0.:1.;}
float shHard(vec3 rel,vec2 bias){if(uShP.x<.5)return 1.;bool h;float v=shHard1(rel,uShO,uShX,uShY,uShZ,uShP,bias.x,0,h);if(h)return v;
  return shHard1(rel,uShO2,uShX2,uShY2,uShZ2,uShP2,bias.y,1,h);}
// step 2: soft edges. The same depth map read through the hardware's comparison filter (each tap compares the four nearest
// texels and blends the answers bilinearly), 3×3 taps a texel apart with tent weights: a smooth edge some four texels wide.
// e: how far out in its cascade the point is (0 middle .. 1 edge)
uniform highp sampler2DShadow uShC;
float shSoft1(vec3 rel,vec3 O,vec3 X,vec3 Y,vec3 Z,vec4 P,float bias,int ci,out float e){vec3 q=rel-O;vec3 s=vec3(dot(q,X),dot(q,Y),dot(q,Z))*.5+.5;
  vec2 ea=abs(s.xy-.5)*2.;e=max(ea.x,ea.y);if(e>=1.||s.z>1.){e=1.;return 1.;}
  float tx=P.y;vec2 u=clamp(s.xy,vec2(2.5*tx),vec2(1.-2.5*tx));u.x=(u.x+float(ci))*.5;float r=s.z-bias*P.z,v=0.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++)v+=float((2-abs(i))*(2-abs(j)))*texture(uShC,vec3(u+vec2(float(i)*.5*tx,float(j)*tx),r));
  return v/16.;}
float shSoft(vec3 rel,vec2 bias){if(uShP.x<.5)return 1.;float e0,e1;float v=shSoft1(rel,uShO,uShX,uShY,uShZ,uShP,bias.x,0,e0);
  // (the near cascade hands over to the far one across its outer tenth, no seam)
  float wN=1.-smoothstep(.85,.97,e0);if(wN>.999)return v;float f=shSoft1(rel,uShO2,uShX2,uShY2,uShZ2,uShP2,bias.y,1,e1);
  return mix(f,v,wN);}
// step 3: edges as wide as the sun makes them (percentage-closer soft shadows). A 4×4 search of the raw depths around the
// point finds how far above it the casters are; the sun's disc (0.53°) then sets the penumbra, about a centimetre per metre of
// height: sharp where a trunk meets the ground, soft under a high crown. The comparisons are then filtered over a 5×5 tent
// that wide (never narrower than step 2's). P.w: a texel's width in metres
float shPC1(vec3 rel,vec3 O,vec3 X,vec3 Y,vec3 Z,vec4 P,float bias,int ci,out float e){vec3 q=rel-O;vec3 s=vec3(dot(q,X),dot(q,Y),dot(q,Z))*.5+.5;
  vec2 ea=abs(s.xy-.5)*2.;e=max(ea.x,ea.y);if(e>=1.||s.z>1.){e=1.;return 1.;}
  float tx=P.y,tm=P.w;int N=int(1./tx+.5);vec2 u=clamp(s.xy,vec2(8.*tx),vec2(1.-8.*tx));float r=s.z-bias*P.z;
  float sr=max(.12/tm,1.5),bs=0.,bn=0.;vec2 tc=u*float(N);
  for(int j=0;j<4;j++)for(int i=0;i<4;i++){ivec2 t=clamp(ivec2(tc+(vec2(i,j)-1.5)/1.5*sr),ivec2(0),ivec2(N-1));
    float d=texelFetch(uShD,ivec2(t.x+ci*N,t.y),0).r;if(d<r){bs+=d;bn+=1.;}}
  if(bn<.5)return 1.;
  float dz=(r-bs/bn)/P.z,pr=clamp(dz*.0093*.5/tm,1.,6.);
  vec2 au=vec2((u.x+float(ci))*.5,u.y);float v=0.;
  for(int j=-2;j<=2;j++)for(int i=-2;i<=2;i++)v+=float((3-abs(i))*(3-abs(j)))*texture(uShC,vec3(au+vec2(float(i)*.5*tx,float(j)*tx)*pr*.5,r));
  return v/81.;}
float shPCSS(vec3 rel,vec2 bias){if(uShP.x<.5)return 1.;float e0,e1;float v=shPC1(rel,uShO,uShX,uShY,uShZ,uShP,bias.x,0,e0);
  float wN=1.-smoothstep(.85,.97,e0);if(wN>.999)return v;float f=shPC1(rel,uShO2,uShX2,uShY2,uShZ2,uShP2,bias.y,1,e1);
  return mix(f,v,wN);}
`;
// the blur that turns the depth map into the filtered one: depth to moments and across (pass 0), then down (pass 1)
const PE_SHBL=()=>PE_HDR+`
uniform highp sampler2D uSrc;uniform int uMode;uniform ivec2 uDir;uniform ivec4 uRect;out vec4 o;
void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec2 m=vec2(0);const float W[9]=float[9](.028,.0663,.1238,.1802,.2034,.1802,.1238,.0663,.028);
  for(int i=-4;i<=4;i++){ivec2 q=clamp(p+uDir*i,uRect.xy,uRect.xy+uRect.zw-1);
    if(uMode==0){float e=exp(35.*(texelFetch(uSrc,q,0).r-1.));m+=W[i+4]*vec2(e,e*e);}else m+=W[i+4]*texelFetch(uSrc,q,0).rg;}
  o=vec4(m,0,1);}`;
// lighting of foliage, bark and cactus skin: the sun through the air, the clouds and the other trees (wrapped round and shining
// through for leaves), the sky through the gaps of the crown (ao), the ground's bounce from below, and the green light that the
// surrounding leaves scatter where they hide the sky. leaf: 1 foliage .. 0 bark; sv: the sun past the other trees (1 if unknown)
const PE_GLTLIT=`
uniform float uMesh0,uMesh1,uImp1,uImpB;uniform vec3 uLeafTint,uCam;
float gK=1.;   // the share of the colour that is direct sunlight (for the screen-space shadows and occlusion)
float tdith(){return fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));}
vec3 leafAlb(vec3 c){float l=dot(c,vec3(.3,.59,.11));return mix(vec3(l),c,.78)*.72;}
vec3 treeLight(vec3 alb,vec3 N,float ao,float leaf,vec3 rel,float sv,float fc){
  float dist=length(rel);vec3 V=-rel/dist,P=uCam+rel;float r=length(P);vec3 up=P/r;float mus=dot(up,uSun);vec3 Ts=trans(r,mus)*pSh(r,mus);
  float sc=1.,fp=dist*.002;
#if CLOUDS
  if(Ts.g>1e-5)sc=cShadow(P,max(.3,fp*uRkm));
#endif
  vec3 Ec=uSunI*Ts*sc,Es=Ec*sv,Ek=uSunI*irr(r,mus);
#if CLOUDS
  Ek=cAmb(P,mus,Ek);
#endif
  float nl=dot(N,uSun),nu=dot(N,up);vec3 Eg=Ec*max(mus,0.)*.5+Ek;   // light on the ground around (about half of it in shade)
  float ak=ao*(1.-.4*fc);vec3 amb=Ek*(.5+.5*nu)*ak+Eg*vec3(.16,.145,.1)*(.5-.5*nu)*(1.-.4*fc)+Eg*vec3(.045,.075,.028)*uLeafTint*(1.-ak);
  vec3 cB=alb/PI*(Es*max(nl,0.)+amb),sB=alb/PI*Es*max(nl,0.);
  float tr=pow(max(dot(-V,uSun),0.),5.)*.9+.32*max(-nl,0.);
  vec3 cL=alb/PI*(Es*max((nl+.45)/1.45,0.)*ao+amb)+alb*vec3(1.05,1.1,.6)*Ec*max(sv,.3)*tr*ao*.35;   // (light comes through the leaves above even in the crown's own shade)
  vec3 sL=alb/PI*Es*max((nl+.45)/1.45,0.)*ao+alb*vec3(1.05,1.1,.6)*Ec*max(sv,.3)*tr*ao*.35,c=mix(cB,cL,leaf),sn=mix(sB,sL,leaf);
  gK=clamp(dot(sn,vec3(.3,.59,.11))/max(dot(c,vec3(.3,.59,.11)),1e-9),0.,1.);return c;}
`;
const PE_TREEVS=()=>PE_HDR+PE_GLC()+PE_GLTREE+PE_GLPROJ+`
layout(location=0) in vec3 aP;layout(location=1) in vec3 aN;layout(location=2) in vec2 aUV;layout(location=3) in vec4 aX;layout(location=4) in float iId;
uniform float uTime,uWindA;
out vec3 vRel,vN;out vec2 vUV;out float vAO,vKind,vHf;flat out int vSp;flat out float vTint,vFc;
void main(){TI t=treeAt(int(iId+.5));vSp=t.sp;vTint=t.tint;vFc=t.sp==8?t.fc*.5:t.fc;if(t.sp==0){gl_Position=vec4(2,2,2,1);return;}
  // wind: the whole tree sways (more toward the top), the leaves flutter
  vec3 p=aP;float w=aX.y,s=sin(uTime*1.13+t.ph)+.45*sin(uTime*2.37+t.ph*1.7),hh=uSp[t.k].x;
  p.x+=w*s*uWindA*.012*hh;p.z+=w*s*uWindA*.004*hh;if(aX.z>.5&&aX.z<1.5)p+=aN*sin(uTime*7.+t.ph+aP.y*3.1+aP.x*2.)*.035*uWindA*w;
  vec3 o=(t.ex*p.x*t.ws+t.up*p.y+t.ez*p.z*t.ws)*t.sc;vRel=t.base+o;vN=t.ex*aN.x/t.ws+t.up*aN.y+t.ez*aN.z/t.ws;vUV=aUV;vAO=aX.x;vKind=aX.z;vHf=aP.y/hh;gl_Position=proj(vRel);}`;
const PE_TREEFS=()=>PE_HDR+`#define CLOUDS ${peClouds()?1:0}
`+PE_GLC()+PE_GLN+PE_GLA()+(peClouds()?peGLCLD():'')+PE_GLTLIT+peGLMat()+PE_GLBARK+PE_GLSH+`
uniform mediump sampler2D uLeaf;
in vec3 vRel,vN;in vec2 vUV;in float vAO,vKind,vHf;flat in int vSp;flat in float vTint,vFc;
layout(location=0) out vec4 o;layout(location=1) out vec4 oD;
void main(){float dist=length(vRel);
  // past the mesh range the impostor takes over: a dithered hand-over
  if(dist>uMesh0&&tdith()>(uMesh1-dist)/(uMesh1-uMesh0))discard;
  vec3 alb;vec3 N=normalize(vN);float leaf=0.;
  if(vKind>.5&&vKind<1.5){vec2 sz=vec2(textureSize(uLeaf,0));vec2 g=vUV*sz;float lod=log2(max(length(dFdx(g)),length(dFdy(g))));vec4 a=texture(uLeaf,vUV);
    if(a.a*(1.+max(lod,0.)*.4)<.5)discard;alb=leafAlb(a.rgb)*uLeafTint*(.85+.3*vTint);leaf=1.;}
  else if(vKind>1.5){alb=vec3(.16,.3,.12)*(.8+.3*step(.5,fract(vUV.x*16.)));}
  else alb=barkAlb(vSp,vUV);
  // the sun past the other trees: the shadow map where there is one; else the crown's own shade on its trunk, and in a closed
  // forest the canopy's shade over the lower part of every tree
  vec2 sh=sunSh(vRel+N*(.4/(uRkm*1000.)),1.);float sv=mix((leaf>.5?1.:min(vAO*1.6,1.))*(1.-.7*vFc*(1.-smoothstep(.35,.8,vHf))),sh.x,sh.y);
  o=vec4(treeLight(alb,N,vSp==8?max(vAO,.6):vAO,leaf,vRel,sv,vFc*(1.-smoothstep(.4,.95,vHf))),gK);oD=vec4(dist);}`;   // (a shrub's leaves are all near its surface)
// impostors: a camera-facing quad showing the baked view nearest to the actual one
const PE_IMPN=17,PE_IMPC=32,PE_IMPS=128;   // views per species (8 around low, 8 around from 40° up, 1 from above), atlas columns, cell size
const PE_IMPVS=()=>PE_HDR+PE_GLC()+PE_GLTREE+PE_GLPROJ+`
layout(location=0) in vec2 aQ;layout(location=4) in float iId;
uniform float uTime,uWindA;
out vec3 vRel;out vec2 vUV;out float vHf;flat out int vSp;flat out float vTint,vFc;flat out vec3 vBR,vBQ,vBV;
void main(){TI t=treeAt(int(iId+.5));vSp=t.sp;vTint=t.tint;vFc=t.sp==8?t.fc*.5:t.fc;if(t.sp==0){gl_Position=vec4(2,2,2,1);return;}
  vec4 S=uSp[t.k];float sc=t.sc,hm=S.x;vec3 ctr=t.base+t.up*S.y*sc,V=normalize(-ctr);
  // the camera seen from the tree, in the tree's own frame: which baked view
  vec3 vl=vec3(dot(V,t.ex),dot(V,t.up),dot(V,t.ez));float el=asin(clamp(vl.y,-1.,1.)),az=atan(vl.x,vl.z);
  int view;vec3 R,Qv;float hs;
  if(el>1.15){view=16;R=t.ex;Qv=-t.ez;hs=S.w;vBR=t.ex;vBQ=-t.ez;vBV=t.up;}
  else{int ai=int(floor(az/.785398+.5))&7;view=ai+(el>.35?8:0);float a=float(ai)*.785398,ev=el>.35?.698:0.;
    // the baked view's own frame (its normals are stored in it)
    vec3 Vt=vec3(sin(a)*cos(ev),sin(ev),cos(a)*cos(ev)),Rt=vec3(cos(a),0.,-sin(a)),Qt=cross(Vt,Rt);
    vBV=t.ex*Vt.x+t.up*Vt.y+t.ez*Vt.z;vBR=t.ex*Rt.x+t.ez*Rt.z;vBQ=t.ex*Qt.x+t.up*Qt.y+t.ez*Qt.z;
    // face the camera itself (a slightly different direction than the bake's) so the quad never shows its edge
    R=normalize(cross(t.up,V));Qv=cross(V,R);hs=S.z;}
  int cell=t.k*${PE_IMPN}+view;vec2 c0=vec2(float(cell%${PE_IMPC}),float(cell/${PE_IMPC}));
  vUV=(c0+aQ*.5+.5)/vec2(${PE_IMPC}.,ceil(float(${PE_NVS*PE_IMPN})/${PE_IMPC}.));
  // a gentle sway of the whole picture
  float s=sin(uTime*1.13+t.ph)+.45*sin(uTime*2.37+t.ph*1.7);vec3 sw=t.ex*s*uWindA*.006*hm*sc*(aQ.y*.5+.5);
  vRel=ctr+(R*aQ.x*t.ws+Qv*aQ.y*(el>1.15?t.ws:1.))*hs*sc+sw;vHf=el>1.15?1.:clamp((S.y+dot(Qv,t.up)*aQ.y*hs)/hm,0.,1.);gl_Position=proj(vRel);}`;
const PE_IMPFS=()=>PE_HDR+`#define CLOUDS ${peClouds()?1:0}
`+PE_GLC()+PE_GLN+PE_GLA()+(peClouds()?peGLCLD():'')+PE_GLTLIT+PE_GLSH+`
uniform mediump sampler2D uIA,uIN;
in vec3 vRel;in vec2 vUV;in float vHf;flat in int vSp;flat in float vTint,vFc;flat in vec3 vBR,vBQ,vBV;
layout(location=0) out vec4 o;layout(location=1) out vec4 oD;
void main(){float dist=length(vRel),d=tdith();
  if(dist<uMesh1&&d<(uMesh1-dist)/(uMesh1-uMesh0))discard;          // the mesh is still drawn here
  if(dist>uImp1-uImpB&&d>(uImp1-dist)/uImpB)discard;                  // and far out the ground's canopy takes over
  // the atlas holds coverage-weighted values (so its mip levels average only what is there): divide by the coverage
  vec2 g=vUV*vec2(textureSize(uIA,0));float lod=log2(max(length(dFdx(g)),length(dFdy(g))));
  vec4 a=texture(uIA,vUV);if(a.a*(1.+max(lod,0.)*.3)<.5)discard;float ia=1./max(a.a,.05);vec4 n=texture(uIN,vUV)*ia;
  vec2 q=n.xy*2.-1.;vec3 N=normalize(vBR*q.x+vBQ*q.y+vBV*sqrt(max(1.-dot(q,q),0.)));
  float leaf=clamp(n.z,0.,1.);vec3 alb=a.rgb*ia;alb=mix(alb,leafAlb(alb)*uLeafTint*(.85+.3*vTint),leaf);
  vec2 sh=sunSh(vRel,4.);float lw=1.-smoothstep(.35,.8,vHf);
  o=vec4(treeLight(alb,N,max(n.w,vSp==8?.6:.25),leaf,vRel,mix(1.-.82*vFc*lw,sh.x,sh.y),vFc*(1.-smoothstep(.4,.95,vHf))),gK);oD=vec4(dist);}`;
// the bake: each species drawn orthographically from each view into its atlas cell. Albedo (sRGB) with coverage in alpha; the
// normal in the view's own frame (x, y), how leafy (1 foliage, 0 bark) and the occlusion. Empty texels stay zero.
const PE_TBVS=()=>PE_HDR+`
layout(location=0) in vec3 aP;layout(location=1) in vec3 aN;layout(location=2) in vec2 aUV;layout(location=3) in vec4 aX;
uniform vec3 uBR,uBQ,uBV,uBC;uniform float uBS;
out vec3 vN;out vec2 vUV;out float vAO,vKind;
void main(){vec3 p=aP-uBC;gl_Position=vec4(dot(p,uBR)/uBS,dot(p,uBQ)/uBS,-dot(p,uBV)/(uBS*4.),1);vN=vec3(dot(aN,uBR),dot(aN,uBQ),dot(aN,uBV));vUV=aUV;vAO=aX.x;vKind=aX.z;}`;
const PE_TBFS=()=>PE_HDR+peGLMat()+PE_GLBARK+`
uniform mediump sampler2D uLeaf;uniform int uSpB;
in vec3 vN;in vec2 vUV;in float vAO,vKind;
layout(location=0) out vec4 oA;layout(location=1) out vec4 oN;
void main(){vec3 alb;float leaf=0.;
  if(vKind>.5&&vKind<1.5){vec2 g=vUV*vec2(textureSize(uLeaf,0));float lod=log2(max(length(dFdx(g)),length(dFdy(g))));vec4 a=texture(uLeaf,vUV);
    if(a.a*(1.+max(lod,0.)*.4)<.5)discard;alb=a.rgb;leaf=1.;}
  else if(vKind>1.5)alb=vec3(.16,.3,.12)*(.8+.3*step(.5,fract(vUV.x*16.)));else alb=barkAlb(uSpB,vUV);
  vec3 N=normalize(vN);oA=vec4(alb,1);oN=vec4(N.xy*.5+.5,leaf,vAO);}`;
// the trees' shadow casters: each tree's impostor seen from the sun (the nearest baked view), a quad through the crown's center
// the trees' crowns in the sun's shadow map: not their cards (a flat card seen edge-on prints a sharp sliver, and a crown's
// shade becomes a saw of them) but a soft volume, an ellipsoid fitted to each build's leaves with a lumpy outline, through which
// the sun is dimmed by the length it crosses (leaf clumps thicker or thinner along the way). That partial dimming is written
// as a dither of the map's texels, which the receivers' filtered lookups average into dappled shade. Trunks and limbs of the
// near trees are drawn as meshes (below)
const PE_SHVS=()=>PE_HDR+PE_GLC()+PE_GLTREE+`
layout(location=0) in vec2 aQ;layout(location=4) in float iId;
uniform vec3 uShO,uShX,uShY,uShZ;uniform vec4 uCr[${2*PE_NVS}];
out vec3 vP;flat out vec3 vC,vA,vB,vE,vR;flat out float vSd;
void main(){TI t=treeAt(int(iId+.5));vec4 c=uCr[2*t.k],r=uCr[2*t.k+1];if(t.sp==0||r.w<.5){gl_Position=vec4(2,2,2,1);return;}
  float sc=t.sc;vC=t.base+(t.ex*c.x*t.ws+t.up*c.y+t.ez*c.z*t.ws)*sc;vR=r.xyz*sc*vec3(t.ws,1,t.ws);vA=t.ex;vB=t.up;vE=t.ez;vSd=fract(t.ph*.37)*50.;
  float hs=max(max(vR.x,vR.y),vR.z)*1.25;vP=vC+(normalize(uShX)*aQ.x+normalize(uShY)*aQ.y)*hs;vec3 q=vP-uShO;
  gl_Position=vec4(dot(q,uShX),dot(q,uShY),dot(q,uShZ),1);}`;
const PE_SHFS=()=>PE_HDR+`
uniform vec3 uShO,uShZ,uSunD;uniform float uRkm;uniform ivec2 uShT;uniform int uDith,uCi;
in vec3 vP;flat in vec3 vC,vA,vB,vE,vR;flat in float vSd;out vec4 o;
uint hq(uint h){h^=h>>16;h*=0x7feb352du;h^=h>>15;h*=0x846ca68bu;h^=h>>16;return h;}
float hf(ivec3 c){return float(hq(uint(c.x)*1597334677u^uint(c.y)*3812015801u^uint(c.z)*2798796415u)>>8)/16777216.;}
float vn(vec3 p){vec3 i=floor(p),f=p-i;f=f*f*(3.-2.*f);ivec3 c=ivec3(i);
  return mix(mix(mix(hf(c),hf(c+ivec3(1,0,0)),f.x),mix(hf(c+ivec3(0,1,0)),hf(c+ivec3(1,1,0)),f.x),f.y),
             mix(mix(hf(c+ivec3(0,0,1)),hf(c+ivec3(1,0,1)),f.x),mix(hf(c+ivec3(0,1,1)),hf(c+ivec3(1,1,1)),f.x),f.y),f.z);}
void main(){vec3 d=vP-vC,u=vec3(dot(d,vA),dot(d,vB),dot(d,vE))/vR,s=vec3(dot(uSunD,vA),dot(uSunD,vB),dot(uSunD,vE))/vR;
  float a=dot(s,s),b=dot(u,s),cc=dot(u,u);vec3 m=u-s*(b/a);
  // the outline wavers with direction, fixed to the tree
  float rho=.72+.5*vn(normalize(m+1e-4)*2.3+vSd)+.12*vn(m*5.+vSd);
  float disc=b*b-a*(cc-rho*rho);if(disc<=0.)discard;float sq=sqrt(disc),t1=(-b-sq)/a,t2=(-b+sq)/a;
  float chord=(t2-t1)*uRkm*1000.,cl=vn(m*3.1+vSd*1.7);
  float tr=exp(-.6*chord*(.15+1.7*cl*cl));
  // the partial dimming as an ordered (Bayer) dither of the map's texels, fixed to the ground and shifted for each tree: the
  // filtered map's blur averages a 4×4 patch of it back to the exact fraction, smooth, where a random dither left blotches
  ivec2 bq=(ivec2(gl_FragCoord.xy)+uShT+ivec2(int(vSd*7.),int(vSd*13.)))&3;const float BY[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  vec3 pm=vP+uSunD*(.5*(t1+t2));
  if(uDith>0){if((BY[bq.y*4+bq.x]+.5)/16.<tr)discard;}
  // the near cascade: gaps between clumps of leaves, a pattern fixed to the tree (two sizes, some 45 and 20 cm), opening as
  // much of the crown as lets light through, so the sun comes through in flecks; the far cascade's texels (some 30 cm) are too
  // coarse for gaps, so there a crown is solid where it passes less than half the light
  else if(uCi==0){vec3 wq=(pm-vC)*uRkm*1000.;float g=.65*vn(wq*2.2+vSd)+.35*vn(wq*5.3+vSd*1.3+17.);if(g<.5+.4*(tr-.5))discard;}
  else if(.5<tr)discard;gl_FragDepth=dot(pm-uShO,uShZ)*.5+.5;o=vec4(0);}`;
const PE_TSMVS=()=>PE_HDR+PE_GLC()+PE_GLTREE+`
layout(location=0) in vec3 aP;layout(location=2) in vec2 aUV;layout(location=3) in vec4 aX;layout(location=4) in float iId;
uniform vec3 uShO,uShX,uShY,uShZ;uniform vec4 uCr[${2*PE_NVS}];
out vec2 vUV;out float vKind,vIn;out vec3 vQ;
void main(){TI t=treeAt(int(iId+.5));if(t.sp==0){gl_Position=vec4(2,2,2,1);return;}
  vec4 cc=uCr[2*t.k],cr=uCr[2*t.k+1];vIn=cr.w>.5?max(length((aP-cc.xyz)/max(cr.xyz,vec3(.05))),aP.y<cc.y?9.:0.):9.;
  vec3 q=t.base+(t.ex*aP.x*t.ws+t.up*aP.y+t.ez*aP.z*t.ws)*t.sc-uShO;vUV=aUV;vKind=aX.z;vQ=q*1e4;gl_Position=vec4(dot(q,uShX),dot(q,uShY),dot(q,uShZ),1);}`;
const PE_TSMFS=()=>PE_HDR+`
uniform mediump sampler2D uLeaf;uniform int uDbgK;uniform vec3 uSunD;in vec2 vUV;in float vKind,vIn;in vec3 vQ;out vec4 o;
// (only the trunk below the crown casts here: the limbs inside it are part of the crown's soft volume, and drawn sharp they
// stuck out of its shade as a row of thin wedges)
// (the leaves' picture is read sharp, whatever the map's texel size: averaged out it would fill each card to a solid rectangle,
// and a crown's shade would be a fence of cards with straight gaps)
void main(){bool lf=vKind>.5&&vKind<1.5;if(uDbgK!=2&&lf||uDbgK==2&&!lf||!lf&&vIn<1.15)discard;if(lf){vec2 g=vUV*vec2(textureSize(uLeaf,0));float lod=log2(max(length(dFdx(g)),length(dFdy(g))));
    if(textureLod(uLeaf,vUV,min(lod,1.5)).a<.5)discard;
    // a card is a flat stand-in for a ball of leaves: seen edge-on from the sun it would print a long sharp sliver (a row of
    // them a saw along the crown's shadow), so edge-on cards cast a thinning dither instead, as loose foliage does
    vec3 n=cross(dFdx(vQ),dFdy(vQ));float c=abs(dot(n,uSunD))/max(length(n),1e-30);
    if(fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))<smoothstep(.55,.12,c))discard;}
  o=vec4(0);}`;
/* ---- cell layers: things grown in cells of the terrain quadtree (trees, grass), each cell a pool of 32×32 slots ---- */
function peLayer(L,cap,R){const V={L,cap,W:Math.PI/2*R*1000/2**L,cells:new Map(),free:[...Array(cap).keys()].reverse(),tab:new Float32Array(cap*32),camK:'',want:[]},w=16*PE_VC,h=Math.ceil(cap/16)*PE_VC;
  V.P=peTex(gl.TEXTURE_2D,gl.RGBA32F,w,h,1,false);V.S=peTex(gl.TEXTURE_2D,gl.RGBA8,w,h,1,false);V.T=peTex(gl.TEXTURE_2D,gl.RGBA32F,8,cap,1,false);
  V.fb=peFB();gl.bindFramebuffer(gl.FRAMEBUFFER,V.fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,V.P,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,V.S,0);return V;}
function peLayerFree(V){if(!V)return;for(const t of [V.P,V.S,V.T])gl.deleteTexture(t);gl.deleteFramebuffer(V.fb);for(const c of V.cells.values())if(c.rb){gl.deleteSync(c.rb.sync);gl.deleteBuffer(c.rb.pb);}}
// the cells within R metres of the camera: sampled on a grid in the camera's tangent plane, so cube-face edges need no care
function peLayerCells(V,g,eye,R,gh=1){const er=Math.hypot(...eye),u=eye.map(x=>x/er),alt=Math.max(er-gh,0)*g.R*1000;if(alt>R*1.2)return [];
  const a=Math.abs(u[1])<.9?[0,1,0]:[1,0,0],e1=(()=>{const c=[a[1]*u[2]-a[2]*u[1],a[2]*u[0]-a[0]*u[2],a[0]*u[1]-a[1]*u[0]],l=Math.hypot(...c);return c.map(x=>x/l);})(),e2=[u[1]*e1[2]-u[2]*e1[1],u[2]*e1[0]-u[0]*e1[2],u[0]*e1[1]-u[1]*e1[0]];
  const rh=Math.sqrt(Math.max(R*R-alt*alt,0)),st=V.W/2,n=Math.ceil(rh/st),s=st/(g.R*1000),out=new Map(),N=2**V.L;
  for(let j=-n;j<=n;j++)for(let i=-n;i<=n;i++){if((i*i+j*j)*st*st>(rh+V.W)*(rh+V.W))continue;const q=[u[0]+e1[0]*i*s+e2[0]*j*s,u[1]+e1[1]*i*s+e2[1]*j*s,u[2]+e1[2]*i*s+e2[2]*j*s];
    const [f,uu,vv]=peUV(q),x=Math.min(N-1,Math.max(0,Math.floor((uu+1)/2*N))),y=Math.min(N-1,Math.max(0,Math.floor((vv+1)/2*N))),k=peKey(f,V.L,x,y);
    const d=Math.hypot(i,j)*st;if(!out.has(k)||out.get(k).d>d)out.set(k,{f,x,y,d});}
  return [...out.entries()].sort((p,q)=>p[1].d-q[1].d);}
// the scatter pass for one cell (TGEN pass 8 trees, 9 grass): every slot worked out from the terrain generator. Its kinds are read
// back a frame or two later (no stall) to know which slots hold anything. o: {pass, mo (finest octave), e (slope baseline, m)}
function peLayerScatter(V,g,c,o){const G=PE.P.TGEN,t=c.node,b=peBases(t.c),bx=(c.slot%16)*PE_VC,by=Math.floor(c.slot/16)*PE_VC;
  gl.bindFramebuffer(gl.FRAMEBUFFER,V.fb);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.viewport(bx,by,PE_VC,PE_VC);gl.useProgram(G.p);peTgenSamp(G);
  peTerrU(G.u,g);peTileU(G.u,t);gl.uniform3iv(G.u.uOI,b.I);gl.uniform3fv(G.u.uOF,b.F);gl.uniform1i(G.u.uPass,o.pass);
  gl.uniform1i(G.u.uMO,o.mo);gl.uniform3i(G.u.uCellI,c.f,c.x,c.y);gl.uniform2i(G.u.uBlk,bx,by);
  gl.uniform1f(G.u.uVegE,2*o.e/V.W);gl.uniform1f(G.u.uVegK,g.forest);gl.uniform1i(G.u.uKP,Math.min(PE_NOCT-1,Math.round(Math.log2(g.R/.45))));gl.drawArrays(gl.TRIANGLES,0,3);
  const pb=gl.createBuffer();gl.bindBuffer(gl.PIXEL_PACK_BUFFER,pb);gl.bufferData(gl.PIXEL_PACK_BUFFER,PE_VC*PE_VC*4,gl.STREAM_READ);gl.readBuffer(gl.COLOR_ATTACHMENT1);
  gl.readPixels(bx,by,PE_VC,PE_VC,gl.RGBA,gl.UNSIGNED_BYTE,0);gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
  c.rb={pb,sync:gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0)};c.state=1;}
function peLayerRead(c){const r=c.rb;if(!r||gl.clientWaitSync(r.sync,0,0)===gl.TIMEOUT_EXPIRED)return false;gl.deleteSync(r.sync);
  const a=new Uint8Array(PE_VC*PE_VC*4);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,r.pb);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,a);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);gl.deleteBuffer(r.pb);c.rb=null;
  const ids=[];for(let s=0;s<PE_VC*PE_VC;s++)if(a[s*4]>8)ids.push(s);c.ids=Int32Array.from(ids);c.sp=Uint8Array.from(ids.map(s=>Math.round(a[s*4]/255*15)));c.rk=Uint8Array.from(ids.map(s=>a[s*4+2]));c.state=2;
  c.idf=new Float32Array(ids.length);for(let i=0;i<ids.length;i++)c.idf[i]=c.slot*1024+ids[i];return true;}
// once a frame: the wanted cells (recomputed when the camera has moved a quarter cell), finished read-backs, a few missing cells
// scattered (nearest first; the farthest unwanted cell's slot reused when the pool is full), and the cell table: each cell's place
// relative to the camera and its quadratic map, as the terrain tiles use. Distances are measured from the ground under the camera
// (the cells sit on it, not at sea level). Returns that ground's radius.
function peLayerKeep(V,g,eye,R,budget,o){const Rm=g.R*1000,gh=1+(PE.pr.ok?Math.max(PE.pr.h,PE.pr.wl):0);
  // (the height above the ground matters, not above sea level: grass only wants cells while the camera is a few metres up)
  const ck=eye.map(x=>Math.round(x*Rm/(V.W/4))).join()+(PE.pr.ok?'g':'');if(ck!==V.camK){V.camK=ck;V.want=peLayerCells(V,g,eye,R,gh);}
  const want=V.want,wk=new Set(want.map(w=>w[0]));
  for(const c of V.cells.values())if(c.state===1)peLayerRead(c);
  for(const [k,w] of want){if(budget<=0)break;if(V.cells.has(k))continue;let slot=V.free.pop();
    if(slot==null){let far=null;for(const c of V.cells.values())if(!wk.has(c.k)&&c.state!==1&&(!far||c.d>far.d))far=c;if(!far)break;V.cells.delete(far.k);slot=far.slot;}
    const c={k,f:w.f,x:w.x,y:w.y,slot,node:peNode(w.f,V.L,w.x,w.y,null),state:0,d:w.d};V.cells.set(k,c);peLayerScatter(V,g,c,o);budget--;}
  const T=V.tab;
  for(const c of V.cells.values()){const t=c.node,q=c.slot*32;c.d=Math.hypot(t.c[0]*gh-eye[0],t.c[1]*gh-eye[1],t.c[2]*gh-eye[2])*Rm;
    T.set([t.c[0]-eye[0],t.c[1]-eye[1],t.c[2]-eye[2],0, ...t.c,0, ...t.T1,0, ...t.T2,0, ...t.Css,0, ...t.Cst,0, ...t.Ctt,0,0,0,0,0],q);}
  gl.bindTexture(gl.TEXTURE_2D,V.T);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,8,V.cap,gl.RGBA,gl.FLOAT,T);gl.bindTexture(gl.TEXTURE_2D,null);
  return gh;}
/* ---- trees: their layer, meshes and impostors, and what is drawn ---- */
function peVegQ(){const q={potato:[0,0],battery:[0,400],balanced:[90,1100],quality:[130,1500],ultra:[180,2200],cinematic:[200,3000],pc:[200,4000]}[S.preset]||[90,1100];return q;}
function peVegOn(g){return !!(g.veg3d&&PE.P&&PE.P.TREE&&PE.P.IMP&&PE.P.TBAKE&&peVegQ()[1]>0);}
function peVegInit(g){const R=g.R;PE.veg=peLayer(Math.max(8,Math.min(20,Math.round(Math.log2(Math.PI/2*R/.15)))),peVCap(),R);
  if(!PE.vegM){const M=peTreeGen();PE.vegM=M;
    // each species' height and reach, measured on its mesh: the impostors are framed to fit
    for(let s=1;s<PE_NVS;s++){if(s%PE_NSP===0)continue;const m=M.sp[s];let y=0,r=0;for(let i=m.i0;i<m.i0+m.n;i++){const v=M.I[i]*12;y=Math.max(y,M.V[v+1]);r=Math.max(r,Math.hypot(M.V[v],M.V[v+2]));}
      PE_VSP[s]=[y,y/2,Math.max(y/2,r)*1.04,r*1.04];
      const lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];for(let i=m.i0;i<m.i0+m.n;i++){const v=M.I[i]*12;if(M.V[v+10]!==1)continue;for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],M.V[v+a]);hi[a]=Math.max(hi[a],M.V[v+a]);}}
      if(hi[0]>lo[0]){PE_VCR[2*s]=[0,1,2].map(a=>(lo[a]+hi[a])/2).concat(0);PE_VCR[2*s+1]=[0,1,2].map(a=>(hi[a]-lo[a])/2*.86).concat(1);}}const vao=gl.createVertexArray();gl.bindVertexArray(vao);const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,M.V,gl.STATIC_DRAW);
    [[0,3,0],[1,3,12],[2,2,24],[3,4,32]].forEach(([l,n,o])=>{gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,n,gl.FLOAT,false,48,o);});
    const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,M.I,gl.STATIC_DRAW);
    PE.vegIB=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,PE.vegIB);gl.enableVertexAttribArray(4);gl.vertexAttribPointer(4,1,gl.FLOAT,false,4,0);gl.vertexAttribDivisor(4,1);PE.vegVAO=vao;
    // the bake shares the mesh buffers through its own vertex array (no instance attribute)
    const vb2=gl.createVertexArray();gl.bindVertexArray(vb2);gl.bindBuffer(gl.ARRAY_BUFFER,vb);[[0,3,0],[1,3,12],[2,2,24],[3,4,32]].forEach(([l,n,o])=>{gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,n,gl.FLOAT,false,48,o);});
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);PE.vegBVAO=vb2;
    const qv=gl.createVertexArray();gl.bindVertexArray(qv);const qb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,qb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);PE.vegQB=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,PE.vegQB);gl.enableVertexAttribArray(4);gl.vertexAttribPointer(4,1,gl.FLOAT,false,4,0);gl.vertexAttribDivisor(4,1);PE.vegQVAO=qv;
    gl.bindVertexArray(VAO0);PE.leaf=peLeafAtlas();peImpBake();}}
// the impostor atlas: every species from every view
function peImpBake(){if(PE.impA){gl.deleteTexture(PE.impA);gl.deleteTexture(PE.impN);}PE.impM=!!(PE.mat&&PE.mat.A);const P=PE.P.TBAKE,M=PE.vegM,rows=Math.ceil(PE_NVS*PE_IMPN/PE_IMPC),W=PE_IMPC*PE_IMPS,H=rows*PE_IMPS;
  const mkT=f=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texStorage2D(gl.TEXTURE_2D,6,f,W,H);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.bindTexture(gl.TEXTURE_2D,null);return t;};
  // albedo in sRGB (dark foliage keeps its shades), the rest linear
  PE.impA=mkT(gl.SRGB8_ALPHA8);PE.impN=mkT(gl.RGBA8);const fb=peFB(),db=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,db);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,W,H);
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,PE.impA,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,PE.impN,0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,db);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
  gl.viewport(0,0,W,H);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(P.p);gl.bindVertexArray(PE.vegBVAO);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.disable(gl.CULL_FACE);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,PE.leaf);gl.uniform1i(P.u.uLeaf,0);peMatU(P.u,PE.cfg);gl.activeTexture(gl.TEXTURE0);
  for(let s=1;s<PE_NVS;s++){if(s%PE_NSP===0)continue;const [Hs,cy,hs,ht]=PE_VSP[s];gl.uniform1i(P.u.uSpB,s%PE_NSP);
    for(let v=0;v<PE_IMPN;v++){let R,Q,Vd,C,S;
      if(v===16){Vd=[0,1,0];R=[1,0,0];Q=[0,0,-1];C=[0,cy,0];S=ht;}
      else{const a=(v%8)*Math.PI/4,e=v>=8?.698:0;Vd=[Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e)];const r0=[Vd[2],0,-Vd[0]],l=Math.hypot(...r0);R=r0.map(x=>x/l);
        Q=[Vd[1]*R[2]-Vd[2]*R[1],Vd[2]*R[0]-Vd[0]*R[2],Vd[0]*R[1]-Vd[1]*R[0]];C=[0,cy,0];S=hs;}
      const cell=s*PE_IMPN+v;gl.viewport((cell%PE_IMPC)*PE_IMPS,Math.floor(cell/PE_IMPC)*PE_IMPS,PE_IMPS,PE_IMPS);
      gl.uniform3fv(P.u.uBR,R);gl.uniform3fv(P.u.uBQ,Q);gl.uniform3fv(P.u.uBV,Vd);gl.uniform3fv(P.u.uBC,C);gl.uniform1f(P.u.uBS,S);
      gl.drawElements(gl.TRIANGLES,M.sp[s].n,gl.UNSIGNED_INT,M.sp[s].i0*4);}}
  gl.disable(gl.DEPTH_TEST);gl.bindVertexArray(VAO0);for(const t of [PE.impA,PE.impN]){gl.bindTexture(gl.TEXTURE_2D,t);gl.generateMipmap(gl.TEXTURE_2D);}gl.bindTexture(gl.TEXTURE_2D,null);
  gl.deleteFramebuffer(fb);gl.deleteRenderbuffer(db);gl.clearColor(0,0,0,1);}
// once a frame: keep the cells around the camera, scatter new ones, and list what to draw
function peVegFrame(g,eye,K){PE.vegDraw=null;if(!peVegOn(g)){return;}if(!PE.veg||PE.veg.key!==g.vKey||PE.veg.cap!==peVCap()){if(PE.veg)peVegFree();peVegInit(g);PE.veg.key=g.vKey;}
  // the impostors are baked again once the photo bark has loaded
  if(PE.vegM&&PE.impA&&PE.impM!==!!(PE.mat&&PE.mat.A))peImpBake();
  const V=PE.veg,[R_mesh,R_imp]=peVegQ(),Rm=g.R*1000;
  const gh=peLayerKeep(V,g,eye,R_imp,peVBudget()[PE.boot>0?0:1],{pass:8,mo:Math.min(PE_NOCT-1,Math.floor(Math.log2(g.R*1000/2.5))),e:3}),want=V.want;
  // what to draw: impostors for every tree of the visible cells, meshes for the near ones
  const Wc=V.W,mesh=[],imp=[],per=[],shd=[],shm=[],shQ=peShQ(),Rsh=shQ?Math.max(R_mesh,60)*shQ[1]*1.42+Wc:0;for(let s=0;s<PE_NVS+PE_TLOD;s++){per.push([]);shm.push([]);}
  const kind=(c,i)=>c.sp[i]+PE_NSP*(Math.imul(c.idf[i],0x9E3779B1)>>>30);   // the species' build this tree uses (as treeAt)
  // the trees this near cast their shadows with their meshes (once that program is in), the rest with their impostors
  const Rsm=shQ&&PE.P.TSM?Math.min(R_mesh*.6,110):0;let shK=0;
  for(const [k] of want){const c=V.cells.get(k);if(!c||c.state!==2||!c.ids.length)continue;
    const t=c.node,cp=[t.c[0]*gh,t.c[1]*gh,t.c[2]*gh],rho=Wc*.75/Rm+300/Rm;
    // every tree near enough to shade what the camera sees casts a shadow, whether or not it is itself in view
    if(c.d<Rsh){shK=(shK*31+c.slot*7+c.ids.length)%1e9;
      if(c.d<Rsm+Wc){for(let i=0;i<c.ids.length;i++){const s=c.ids[i],sx=((s&31)+.5)/16-1,sy=((s>>5)+.5)/16-1,
          d=Math.hypot((t.c[0]+t.T1[0]*sx+t.T2[0]*sy)*gh-eye[0],(t.c[1]+t.T1[1]*sx+t.T2[1]*sy)*gh-eye[1],(t.c[2]+t.T1[2]*sx+t.T2[2]*sy)*gh-eye[2])*Rm;
        if(d<Rsm)shm[kind(c,i)+PE_TLOD].push(c.idf[i]);shd.push(c.idf[i]);}}
      else for(let i=0;i<c.idf.length;i++)if(c.sp[i]!==8||c.d<Rsm+Wc)shd.push(c.idf[i]);}
    if(!K.omni){const v=[cp[0]-eye[0],cp[1]-eye[1],cp[2]-eye[2]],z=dot3(v,K.fw);if(z<-rho)continue;const x=dot3(v,K.rt),y=dot3(v,K.up),pl=(a,b)=>(a-b*z)/Math.sqrt(1+b*b)>rho;if(pl(x,K.x1)||pl(-x,-K.x0)||pl(y,K.y1)||pl(-y,-K.y0))continue;}
    if(c.d<R_mesh*1.15+Wc){for(let i=0;i<c.ids.length;i++){const s=c.ids[i],sx=((s&31)+.5)/16-1,sy=((s>>5)+.5)/16-1,
        px=(t.c[0]+t.T1[0]*sx+t.T2[0]*sy)*gh-eye[0],py=(t.c[1]+t.T1[1]*sx+t.T2[1]*sy)*gh-eye[1],pz=(t.c[2]+t.T1[2]*sx+t.T2[2]*sy)*gh-eye[2],d=Math.hypot(px,py,pz)*Rm;
        if(d<R_mesh*1.15+12)per[kind(c,i)+(d<45?0:PE_TLOD)].push(c.idf[i]);if(d>R_mesh-12&&(c.sp[i]!==8||d<PE_SHRUB))imp.push(c.idf[i]);}}
    else for(let i=0;i<c.idf.length;i++)if(c.sp[i]!==8||c.d<PE_SHRUB)imp.push(c.idf[i]);}
  const nSm=shm.reduce((s,a)=>s+a.length,0);PE.vegDraw={per,imp,shd,shm,nSm,shK:shK+':'+(Rsm>0),R_mesh,R_imp};PE.vegStat={cells:V.cells.size,want:want.length,mesh:per.reduce((s,a)=>s+a.length,0),imp:imp.length,shd:shd.length};}
/* ---- sun shadows near the camera ----
   Every tree in range is drawn as seen from the sun (its impostor from the nearest baked direction) into a depth map that the
   ground and the trees look up: shade under the crowns, sun flecks through the gaps, trunks dark below their crowns, trees in
   each other's shade. The map is redrawn only when the camera has moved a stretch, the sun has turned or new trees have grown. */
function peShQ(){return {balanced:[1024,1.25],quality:[2048,1.25],ultra:[2048,1.3],cinematic:[2048,1.45],pc:[4096,1.5]}[S.preset]||null;}
function peShDummy(){if(PE.shD)return PE.shD;const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RG32F,1,1);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,1,1,gl.RG,gl.FLOAT,new Float32Array([1,1]));
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.bindTexture(gl.TEXTURE_2D,null);return PE.shD=t;}
function peShDummyD(){if(PE.shDD)return PE.shDD;const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texStorage2D(gl.TEXTURE_2D,1,gl.DEPTH_COMPONENT24,1,1);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.bindTexture(gl.TEXTURE_2D,null);return PE.shDD=t;}
// the receivers' side: the map on unit 1 and where it lies (a 1×1 stand-in when there is none, so the sampler always has a depth texture)
function peShU(u){if(!u.uShM&&!u.uShD)return;const Sh=PE.sh,on=!!(Sh&&Sh.on);
  if(u.uShM){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,on?Sh.m:peShDummy());gl.activeTexture(gl.TEXTURE0);gl.uniform1i(u.uShM,1);}
  // (units 18 and 19: nothing else uses them; 14 and 15 hold the sky's irradiance and scattering tables)
  if(u.uShD){gl.activeTexture(gl.TEXTURE18);gl.bindTexture(gl.TEXTURE_2D,on?Sh.t:peShDummyD());gl.activeTexture(gl.TEXTURE0);gl.uniform1i(u.uShD,18);}
  // the same depth texture through a comparing, bilinear sampler object on unit 19 (the texture's own settings stay as they are
  // for the passes that read raw depth)
  if(u.uShC){if(!PE.shCS){const s=PE.shCS=gl.createSampler();gl.samplerParameteri(s,gl.TEXTURE_COMPARE_MODE,gl.COMPARE_REF_TO_TEXTURE);gl.samplerParameteri(s,gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL);
      gl.samplerParameteri(s,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.samplerParameteri(s,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.samplerParameteri(s,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.samplerParameteri(s,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
    gl.activeTexture(gl.TEXTURE19);gl.bindTexture(gl.TEXTURE_2D,on?Sh.t:peShDummyD());gl.bindSampler(19,PE.shCS);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(u.uShC,19);}
  if(!on){gl.uniform4f(u.uShP,0,0,0,0);return;}const [a,b]=Sh.C;
  gl.uniform3fv(u.uShO,a.O);gl.uniform3fv(u.uShX,a.X);gl.uniform3fv(u.uShY,a.Y);gl.uniform3fv(u.uShZ,a.Z);gl.uniform4f(u.uShP,1,1/Sh.N,a.dpm,a.tm||0);
  gl.uniform3fv(u.uShO2,b.O);gl.uniform3fv(u.uShX2,b.X);gl.uniform3fv(u.uShY2,b.Y);gl.uniform3fv(u.uShZ2,b.Z);gl.uniform4f(u.uShP2,1,1/Sh.N,b.dpm,b.tm||0);}
function peShadow(g,eye,sun){const Q=peShQ(),D=PE.vegDraw,RD=PE.rckDraw,Rm=g.R*1000,Sh=PE.sh=PE.sh||{};Sh.on=false;
  const nT=D?D.shd.length:0,nM=D&&PE.P.TSM?D.nSm:0,nR=RD?RD.shd.reduce((s,a)=>s+a.length,0):0;if(!Q||!(nT+nR+nM)||!PE.P.TSHD||!PE.P.SHBL)return;
  const er=Math.hypot(...eye),u=eye.map(x=>x/er),mus=dot3(u,sun);if(mus<.03)return;   // the sun down (or grazing): nothing sharp to cast
  // two cascades of N×N side by side: near (some 40 m each way, or less on small presets) and far (the shadow range)
  const N=Q[0]/2,k=Q[1],Rf=Math.max(D?D.R_mesh:0,60)*k/Rm,Rn=Math.min(40/Rm,Rf*.3);
  if(!Sh.t||Sh.N!==N){if(Sh.t)gl.deleteTexture(Sh.t);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texStorage2D(gl.TEXTURE_2D,1,gl.DEPTH_COMPONENT24,2*N,N);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.bindTexture(gl.TEXTURE_2D,null);
    Sh.t=t;Sh.N=N;Sh.fb=Sh.fb||peFB();gl.bindFramebuffer(gl.FRAMEBUFFER,Sh.fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,t,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);Sh.C=[{key:''},{key:''}];
    // the filtered map (moments) and the blur's halfway texture
    gl.getExtension('OES_texture_float_linear');for(const k of ['m','m2']){if(Sh[k])gl.deleteTexture(Sh[k]);const q=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,q);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RG32F,2*N,N);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,k==='m'?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,k==='m'?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);Sh[k]=q;
      const f=Sh[k+'F']=Sh[k+'F']||peFB();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,q,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);}
    gl.bindTexture(gl.TEXTURE_2D,null);}
  // the light's frame: z toward the sun, x and y across it (fixed for a given sun, so the texels stay put on the ground)
  const nz=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);},cr=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  // the sun the shadows are drawn for moves in steps of a third of a degree: while the sun travels (animated time) the map is
  // redrawn only at each step, not every frame with a slightly turned grid of texels (which made every shadow edge crawl)
  if(!Sh.sun||dot3(Sh.sun,sun)<Math.cos(.0058))Sh.sun=nz(sun);
  const lz=Sh.sun,lx=nz(cr(Math.abs(lz[1])<.9?[0,1,0]:[1,0,0],lz)),ly=cr(lz,lx);
  const gh=1+(PE.pr.ok?Math.max(PE.pr.h,PE.pr.wl):0),c=u.map(x=>x*gh);Sh.on=true;
  const V=PE.veg,lists=(D?D.shK:0)+'|'+(RD?RD.shK:0);
  for(let ci=0;ci<2;ci++){const Rs=ci?Rf:Rn,hd=Rs+500/Rm,C=Sh.C[ci];
    // the cascade's middle: the ground under the camera, snapped to a grid of 64 texels across the light
    const G=2*Rs/N*64,cx=Math.round(dot3(c,lx)/G)*G,cy=Math.round(dot3(c,ly)/G)*G,cz=dot3(c,lz);
    // (its depth origin stays where it was drawn until it is drawn again: taken afresh each frame it would slide along the
    // sun's direction as the camera moves, and the shadows would come and go)
    const key=[cx,cy,...lz.map(x=>x.toFixed(5)),lists,Rs].join(),redraw=key!==C.key;if(redraw||C.cz==null)C.cz=cz;
    C.O=[0,1,2].map(i=>lx[i]*cx+ly[i]*cy+lz[i]*C.cz-eye[i]);C.X=lx.map(x=>x/Rs);C.Y=ly.map(x=>x/Rs);C.Z=lz.map(x=>-x/hd);C.dpm=.5/(hd*Rm);C.tm=2*Rs*Rm/N;
    C.T0=[Math.round(cx/(2*Rs/N)),Math.round(cy/(2*Rs/N))];
    if(!redraw)continue;C.key=key;PE.shN=(PE.shN||0)+1;
    Sh.O=C.O;Sh.X=C.X;Sh.Y=C.Y;Sh.Z=C.Z;   // (for the rocks' caster pass)
    gl.bindFramebuffer(gl.FRAMEBUFFER,Sh.fb);gl.viewport(ci*N,0,N,N);gl.enable(gl.SCISSOR_TEST);gl.scissor(ci*N,0,N,N);gl.clearDepth(1);gl.clear(gl.DEPTH_BUFFER_BIT);gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.disable(gl.CULL_FACE);if(nR)peRockShadow(g,Sh);
    // trunks and limbs of the near trees as meshes (the leaves are left to the crown volumes below)
    if(nM){const M=PE.P.TSM,uu=M.u,all=[],off=[];gl.useProgram(M.p);
      for(const [nm,t,un] of [['uVP',V.P,3],['uVS',V.S,4],['uVC',V.T,5],['uLeaf',PE.leaf,2]]){gl.activeTexture(gl.TEXTURE0+un);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(uu[nm],un);}gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(uu.uDbgK,PE.dbgK|0);gl.uniform4fv(uu.uCr,PE_VCR.flat());gl.uniform3fv(uu.uSunD,lz);gl.uniform4fv(uu.uSp,PE_VSP.flat());gl.uniform1f(uu.uRkm,g.R);gl.uniform3fv(uu.uShO,C.O);gl.uniform3fv(uu.uShX,C.X);gl.uniform3fv(uu.uShY,C.Y);gl.uniform3fv(uu.uShZ,C.Z);
      for(let s=0;s<D.shm.length;s++){off.push(all.length);for(const x of D.shm[s])all.push(x);}
      gl.bindVertexArray(PE.vegVAO);gl.bindBuffer(gl.ARRAY_BUFFER,PE.vegIB);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(all),gl.STREAM_DRAW);
      for(let s=1;s<D.shm.length;s++){const n=D.shm[s].length;if(!n)continue;gl.vertexAttribPointer(4,1,gl.FLOAT,false,4,off[s]*4);gl.drawElementsInstanced(gl.TRIANGLES,PE.vegM.sp[s].n,gl.UNSIGNED_INT,PE.vegM.sp[s].i0*4,n);}
      gl.vertexAttribPointer(4,1,gl.FLOAT,false,4,0);gl.bindVertexArray(VAO0);}
    // every tree's crown as a soft volume
    if(nT){const P=PE.P.TSHD;gl.useProgram(P.p);
      for(const [nm,t,un] of [['uVP',V.P,3],['uVS',V.S,4],['uVC',V.T,5]]){gl.activeTexture(gl.TEXTURE0+un);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(P.u[nm],un);}gl.activeTexture(gl.TEXTURE0);
      gl.uniform4fv(P.u.uCr,PE_VCR.flat());gl.uniform2i(P.u.uShT,C.T0[0]-N/2-ci*N,C.T0[1]-N/2);gl.uniform1i(P.u.uDith,PE.shDith?1:0);gl.uniform1i(P.u.uCi,PE.shGaps===0?1:ci);gl.uniform3fv(P.u.uSunD,lz);gl.uniform1f(P.u.uRkm,g.R);gl.uniform3fv(P.u.uShO,C.O);gl.uniform3fv(P.u.uShX,C.X);gl.uniform3fv(P.u.uShY,C.Y);gl.uniform3fv(P.u.uShZ,C.Z);
      gl.bindVertexArray(PE.vegQVAO);gl.bindBuffer(gl.ARRAY_BUFFER,PE.vegQB);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(D.shd),gl.STREAM_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,D.shd.length);gl.bindVertexArray(VAO0);}
    gl.disable(gl.DEPTH_TEST);
    // depth to moments, blurred across then down, into this cascade's half of the filtered map
    const B=PE.P.SHBL;if(B){gl.useProgram(B.p);gl.bindVertexArray(VAO0);gl.uniform4i(B.u.uRect,ci*N,0,N,N);gl.uniform1i(B.u.uSrc,0);gl.activeTexture(gl.TEXTURE0);gl.viewport(ci*N,0,N,N);
      gl.bindFramebuffer(gl.FRAMEBUFFER,Sh.m2F);gl.bindTexture(gl.TEXTURE_2D,Sh.t);gl.uniform1i(B.u.uMode,0);gl.uniform2i(B.u.uDir,1,0);gl.drawArrays(gl.TRIANGLES,0,3);
      gl.bindFramebuffer(gl.FRAMEBUFFER,Sh.mF);gl.bindTexture(gl.TEXTURE_2D,Sh.m2);gl.uniform1i(B.u.uMode,1);gl.uniform2i(B.u.uDir,0,1);gl.drawArrays(gl.TRIANGLES,0,3);gl.bindTexture(gl.TEXTURE_2D,null);}}}
function peVegDraw(g,eye,fw,rv,up,sun,sI,J,CO){const D=PE.vegDraw;if(!D||!peVegOn(g))return;const V=PE.veg,{per,imp,R_mesh,R_imp}=D,Rm=g.R*1000;
  // draw (depth tested against the ground, both sides of the cards)
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.disable(gl.CULL_FACE);
  const bindCommon=(Pp,isImp)=>{const u=Pp.u;gl.useProgram(Pp.p);
    for(const [nm,t,un] of [['uVP',V.P,3],['uVS',V.S,4],['uVC',V.T,5]]){gl.activeTexture(gl.TEXTURE0+un);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(u[nm],un);}
    gl.activeTexture(gl.TEXTURE0+(isImp?2:2));gl.bindTexture(gl.TEXTURE_2D,isImp?PE.impA:PE.leaf);gl.uniform1i(u[isImp?'uIA':'uLeaf'],2);
    if(isImp){gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,PE.impN);gl.uniform1i(u.uIN,6);}gl.activeTexture(gl.TEXTURE0);
    peLutBind(u);peAirU(u,g);peCamU(u,eye,fw,rv,up,sun,sI,J);if(peClouds())peCloudU(u,CO);peShU(u);peMatU(u,g);
    gl.uniform4fv(u.uSp,PE_VSP.flat());gl.uniform1f(u.uRkm,g.R);gl.uniform1f(u.uTime,PE.vt%1e4);gl.uniform1f(u.uWindA,PE.windA||.6);
    const C=1e8,far=1e3;gl.uniform1f(u.uLogC,C);gl.uniform1f(u.uLogF,2/Math.log2(1+C*far));
    gl.uniform1f(u.uMesh0,(R_mesh-12)/Rm);gl.uniform1f(u.uMesh1,(R_mesh+12)/Rm);gl.uniform1f(u.uImp1,R_imp/Rm);gl.uniform1f(u.uImpB,Math.max(60,R_imp*.15)/Rm);
    const vt=g.veg,base=[.042,.078,.022];gl.uniform3fv(u.uLeafTint,vt.map((x,i)=>Math.min(4,Math.max(.25,x/base[i]))));};
  let nMesh=0;
  if(per.some(a=>a.length)){const Pt=PE.P.TREE;bindCommon(Pt,false);gl.bindVertexArray(PE.vegVAO);
    const all=[],off=[];for(let s=0;s<per.length;s++){off.push(all.length);for(const x of per[s])all.push(x);}
    gl.bindBuffer(gl.ARRAY_BUFFER,PE.vegIB);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(all),gl.STREAM_DRAW);
    for(let s=1;s<per.length;s++){const n=per[s].length;if(!n)continue;gl.vertexAttribPointer(4,1,gl.FLOAT,false,4,off[s]*4);gl.drawElementsInstanced(gl.TRIANGLES,PE.vegM.sp[s].n,gl.UNSIGNED_INT,PE.vegM.sp[s].i0*4,n);nMesh+=n;}}
  if(imp.length){const Pi=PE.P.IMP;bindCommon(Pi,true);gl.bindVertexArray(PE.vegQVAO);gl.bindBuffer(gl.ARRAY_BUFFER,PE.vegQB);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(imp),gl.STREAM_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,imp.length);}
  gl.bindVertexArray(VAO0);}
function peVegFree(){peLayerFree(PE.veg);PE.veg=null;}
