/* ---------- scenes ---------- */
// mat type: 0 diffuse, 1 metal, 2 glass, 3 emissive
const G=(x,y,z,r,c,t,ro=0,em=0)=>({x,y,z,r,c,t,ro,em,by:y,ph:Math.random()*6});
const B=(x,y,z,hx,hy,hz,c,t=0,ro=0,em=0,d=-1)=>({x,y,z,hx,hy,hz,c,t,ro,em,d});
const rng=s=>()=>(s=(s*16807)%2147483647)/2147483647;
const CLASSIC={sky:'dusk',floor:'checker',sun:true,sunAngle:40,fog:.015,exposure:1.1};
const CAM0={yaw:.6,pitch:.32,dist:8,tx:0,ty:.8,tz:0};
const SCENES={
 'blue planet':{cosmos:{kind:0,br:[3.9,9,22],bms:[16,16,16],bme:[17.6,17.6,17.6],bo:[.9,2.8,.1],hr:.012,hm:.0018,ra:1.072,g:.76,sea:.5,clouds:true,city:1,
   p1:[.05,.11,.03],p2:[.28,.24,.17],p3:[.42,.34,.21],p4:[.85,.88,.92],moon:[2.4,.5,-2.6,.27],ocean:[.003,.012,.032],
   pe:{R:6371,seed:3,veg:[.042,.078,.022],dry:[.42,.31,.18],rock:[.16,.14,.12],ice:[.8,.84,.88],sand:[.5,.43,.32]}},hint:{sunAngle:8,sunAz:100,exposure:1.2},cam:{yaw:.3,pitch:.25,dist:2.75,tx:0,ty:0,tz:0},f:()=>[[],[]]},
 'ringed giant':{cosmos:{kind:1,br:[1.2,2.2,4.5],bms:[5,4.6,4],bme:[5.5,5,4.4],bo:[0,0,0],hr:.02,hm:.008,ra:1.06,g:.7,
   p1:[.78,.64,.46],p2:[.55,.38,.24],p3:[.92,.88,.78],p4:[.72,.3,.17],axis:[0,.9404,.3401],rin:1.35,rout:2.35,moon:[3.6,.6,1.8,.12]},hint:{sunAngle:22,sunAz:55,exposure:1.4},cam:{yaw:.2,pitch:.32,dist:5,tx:0,ty:0,tz:0},f:()=>[[],[]]},
 'black hole':{cosmos:{kind:2,rin:3,rout:14,diskT:70},hint:{exposure:.9},cam:{yaw:0,pitch:.1,dist:23,tx:0,ty:0,tz:0},f:()=>[[],[]]},
 'dust world':{cosmos:{kind:0,sunR:.175,br:[.5,1.1,2.4],bms:[8.3,7.3,6.3],bme:[8.6,8.6,8.7],bo:[0,0,0],hr:.016,hm:.007,ra:1.09,g:[.52,.64,.8],sea:-1,clouds:false,dust:1,city:0,
   p1:[.36,.17,.08],p2:[.55,.32,.17],p3:[.24,.12,.06],p4:[.9,.86,.82],moon:[1.9,.25,1.3,.05],
   pe:{R:3390,seed:11,seas:false,gain:.6,crater:.8,canyon:.8,mesa:.6,dune:.9,volcano:3,vH:18,vR:280,vEsc:5,temp:-55,hum:0,cap:78,veg:[.24,.15,.1],dry:[.4,.22,.12],rock:[.22,.14,.1],ice:[.85,.82,.78],sand:[.44,.25,.13],
     air:{ray:[.07,.16,.4],mie:[48.75,47,41],mieE:[50,50,50],pk:.65,gp:[.86,.875,.89],hr:11,hm:11,g:[.45,.42,.4],oz:[0,0,0],ozC:25,ozW:15,top:110,ga:[.3,.18,.1]}}},hint:{sunAngle:10,sunAz:95,exposure:1.3},cam:{yaw:.4,pitch:.2,dist:2.7,tx:0,ty:0,tz:0},f:()=>[[],[]]},
 'optics bench':{hint:{sky:'studio',floor:'checker',sun:true,sunAngle:50,sunAz:25,fog:0,exposure:.72,dispersion:true},cam:{yaw:0,pitch:.17,dist:4.7,tx:0,ty:.95,tz:.3},f(){
   const bars=[[.95,.95,.95],[.95,.9,.1],[.1,.85,.9],[.15,.8,.2],[.85,.2,.8],[.9,.15,.12],[.15,.2,.9],[.06,.06,.07]],dark=[.12,.12,.14];
   const BX=bars.map((c,i)=>B(-2.45+i*.7,1.35,-2.6,.35,1.35,.05,c));
   BX.push(B(0,.62,-2.53,2.8,.035,.02,[.04,.04,.05]),B(0,2.02,-2.53,2.8,.035,.02,[.04,.04,.05]),
     B(-1.5,.315,.2,.035,.315,.035,dark),B(1.5,.35,.2,.035,.35,.035,dark),B(0,.47,.3,.05,.47,.05,dark),B(1.37,.17,1.35,.022,.17,.022,dark));
   const SC=[G(0,.4,1.35,.4,[.98,.98,1],2)],wh=.34/2/Math.tan(12.5*Math.PI/180);
   const PR=[mkPrism({c:[0,.94+wh/3,.3],yaw:Math.PI/2,len:1.1,tri:WEDGE(.34,25),ior:1.66,disp:.18}),
     mkPrism({c:[-1,.55/3,1.35],yaw:-Math.PI/2,len:.7,tri:RIGHT(.55),col:[.86,.95,1],ior:1.52,disp:.05,dens:.4})];
   const LN=[mkLens({c:[-1.5,1.25,.2],axis:[0,0,1],R:.62,r1:1.5,r2:1.5,hc:.16,col:[.95,.98,1],dens:.15}),
     mkLens({c:[1.5,1.25,.2],axis:[0,0,1],R:.55,r1:-1.1,r2:-1.1,hc:.05,col:[.97,1,.97],dens:.15}),
     mkLens({c:[.9,.35,1.35],axis:[0,1,0],R:.45,r1:.9,r2:0,hc:.07,col:[1,.98,.95],dens:.1})];
   return [SC,BX,{PR,LN}];}},
 'laser lab':{lab:true,hint:{sky:'night',floor:'matte',sun:false,fog:0,exposure:1.3,dispersion:true},cam:{yaw:.35,pitch:.5,dist:8.2,tx:0,ty:.5,tz:-.2},
  lights:[{type:'laser',name:'Red relay',wl:638,int:5,w:.012,o:[-3.3,.9,2.5],d:[6.1,0,-.5]},
   {type:'laser',name:'White into the prism',wl:0,int:6,w:.014,o:[3.45,.45,1.45],d:[-.934,0,-.385]},
   {type:'laser',name:'Green along the lens',wl:532,int:4,w:.01,o:[-.2,.9,2.6],d:[0,0,-1],on:false},
   {type:'laser',name:'Violet along the lens',wl:405,int:5,w:.01,o:[.2,.9,2.6],d:[0,0,-1],on:false},
   {type:'point',name:'Ceiling lamp',col:'#ffcf9a',int:2.5,r:.12,pos:[-.4,2.8,.9]}],
  // everything on the bench comes from the lab settings (Lights panel, Optics), so mirrors, the lens and the prism can be moved
  f(){const o=labCfg(),dark=[.1,.1,.12],PR=[],LN=[],SC=[],BX=[B(0,1.25,-3.65,3.8,1.25,.05,[.85,.85,.85])],tag=(x,id)=>(x.opt=id,x);
   o.mirrors.forEach((m,i)=>{PR.push(tag(aimSlab([m.x,m.y,m.z],labN(m.yaw,m.tilt),{w:.5,h:.5}),'m'+i));const ph=(m.y-.26)/2;if(ph>.01)BX.push(tag(B(m.x,ph,m.z,.025,ph,.025,dark),'m'+i));});
   const p=o.prism;PR.push(tag(mkPrism({c:[p.x,.45,p.z],vert:true,yaw:p.yaw*D2R,len:.5,tri:EQUI(.5).map(([x,y,d])=>[x,-y,d]),col:[.95,.97,1],ior:1.58,disp:p.spread}),'prism'));
   BX.push(tag(B(p.x,.1,p.z,.32,.1,.32,dark),'prism'));
   const l=o.lens,a=l.yaw*D2R,Rc=Math.max(.36,1.04*l.f),dv=l.kind==='diverging',sag=Rc-Math.sqrt(Rc*Rc-.34*.34);
   LN.push(tag(mkLens({c:[l.x,l.y,l.z],axis:[Math.sin(a),0,Math.cos(a)],R:.34,r1:dv?-Rc:Rc,r2:dv?-Rc:Rc,hc:dv?.03:sag+.01,col:[.95,.98,1],dens:.1}),'lens'));
   const lh=(l.y-.35)/2;if(lh>.01)BX.push(tag(B(l.x,lh,l.z,.025,lh,.025,dark),'lens'));
   if(o.sphere.on)SC.push(tag(G(o.sphere.x,.35,o.sphere.z,.35,[.9,.95,1],2),'sphere'));
   return [SC,BX,{PR,LN}];}},
 // The Cornell box as measured (Goral, Torrance, Greenberg and Battaile, 1984; Cornell Program of Computer Graphics data):
 // millimeters / 100, x mirrored about the center line so the camera sits on x = 0; matte white, red and green walls, two
 // matte white blocks turned on the floor, a 130 × 105 mm light just below the ceiling, open front, nothing outside.
 // Camera: 35 mm lens on a 25 mm square film (39.3° field of view) at (278, 273, −800) looking straight in.
 'cornell box':{force:{sky:'void',floor:'none',sun:false,fog:0},hint:{sky:'void',floor:'none',sun:false,fog:0,exposure:1.55,fov:31.9,focus:16.31,aeMode:'manual',dispersion:false,renderMode:'path',tonemap:'camera',bloom:.8,vignette:.5},cam:{yaw:Math.PI,pitch:0,dist:16.21,tx:-.12,ty:3.02,tz:2.796},f(){
   const W=[.78,.77,.75],RED=[.7,.15,.09],GRN=[.29,.46,.3],X=x=>(x-278)/100,
     blk=(cx,cz,w,d,h,deg)=>mkPrism({c:[X(cx),h/200,cz/100],vert:true,yaw:deg*D2R,len:h/100,tri:[[1,0,w/200],[-1,0,w/200],[0,1,d/200],[0,-1,d/200]],col:W,type:0});
   const BX=[B(0,-.05,2.796,2.83,.05,2.85,W),B(0,5.538,2.796,2.83,.05,2.85,W),B(0,2.744,5.642,2.83,2.794,.05,W),
     B(2.77+.05,2.744,2.796,.05,2.794,2.85,RED),B(-2.78-.05,2.744,2.796,.05,2.794,2.85,GRN),
     B(0,5.4975,2.795,.65,.01,.525,[1,.92,.8],3,0,17)];
   const PR=[blk(185.5,169,164.8,167.05,165,-16.57),blk(368.5,351.25,165.4,167.3,330,17.23)];
   if(S.cbMirror){PR[1].type=1;PR[1].col=[.86,.86,.86];}   // the mirror tall block from later renditions (e.g. Jensen's photon-mapping images)
   return [[],BX,{PR,LN:[]}];}},
 'stained glass':{f(){const cs=[[1,.2,.2],[1,.6,.15],[1,.95,.25],[.25,.9,.35],[.2,.75,1],[.3,.35,1],[.75,.3,1],[1,.35,.75]],stn=[.75,.72,.68];
   const BX=cs.map((c,i)=>B((i-3.5)*.9,1.6,0,.43,1.4,.04,c,2,0,0,3.5));BX.push(B(-3.85,1.6,0,.2,1.6,.2,stn),B(3.85,1.6,0,.2,1.6,.2,stn),B(0,3.15,0,4.05,.15,.25,stn));
   return [[G(0,.8,-2,.8,[.95,.95,.95],0),G(-2.2,.6,-1.8,.6,[.95,.95,.98],1,.05),G(2.2,.6,-1.8,.6,[.9,.9,.9],0),G(1.2,.35,1.5,.35,[.9,.9,1],2)],BX];}},
 'glass temple':{f(){const cs=[[1,.3,.3],[1,.75,.2],[.4,1,.4],[.3,.8,1],[.4,.4,1],[.9,.4,1],[1,.5,.6],[.5,1,.9]];
   const BX=cs.map((c,i)=>{const a=i/8*6.283;return B(Math.cos(a)*3,2.05,Math.sin(a)*3,.25,1.85,.25,c,2,0,0,2.5);});
   BX.push(B(0,.2,0,2.2,.2,2.2,[.85,.8,.75]),B(0,4.05,0,3.5,.15,3.5,[.95,.9,.8],1,.03));
   const SC=[G(0,1.6,0,1.2,[.95,.97,1],2),G(0,1.6,0,.28,[1,.6,.25],3,0,14)];
   for(const [x,z] of [[1.7,1.7],[-1.7,1.7],[1.7,-1.7],[-1.7,-1.7]])SC.push(G(x,.65,z,.25,[1,.8,.4],1,.02));return [SC,BX];}},
};
