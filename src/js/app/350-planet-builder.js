/* ---------- planet builder: systems of planets around a star; the one you visit is rendered in full ---------- */
const moonList=co=>co.moons||(co.moon?[{p:co.moon.slice(0,3),r:co.moon[3],col:[1,.97,.93],speed:1}]:[]);
const PLPRE={
  earth:{type:'rocky',land:{hills:1,erosion:1,craters:0,canyons:0,mesas:.1,dunes:.6,lakes:.5},climate:{temp:0,rain:1,ice:0},life:{trees:true,forest:1},weather:{storms:1},day:24,surf:{low:'#1f4a22',high:'#5a4e3a',dry:'#8f7b52',ice:'#e8eef5',sea:.5,ocean:'water',oceanCol:'#10223a',relief:1},air:{density:1,height:1,sky:'#4a8fe6',haze:.4,hazeCol:'#ffffff',hazeH:1},clouds:{on:true,cover:.5},city:true},
  desert:{type:'rocky',land:{hills:1,erosion:.6,craters:.5,canyons:.6,mesas:.6,dunes:1,lakes:0},climate:{temp:-30,rain:.05,ice:.4},life:{trees:false,forest:0},weather:{storms:.5},day:24.6,surf:{low:'#9c5a33',high:'#c48a52',dry:'#7a3e1f',ice:'#e8ddd0',sea:-1,ocean:'none',oceanCol:'#10223a',relief:1.3},air:{density:.12,height:1.3,sky:'#7fa8e0',haze:.25,hazeCol:'#ffa060',hazeH:3.9},clouds:{on:false,cover:.4},city:false},
  mars:{type:'rocky',land:{hills:1,erosion:.6,craters:.8,canyons:.8,mesas:.6,dunes:.9,lakes:0,volcanoes:3,seed:11},climate:{temp:-55,rain:0,ice:.48},life:{trees:false,forest:0},weather:{storms:1},day:24.6,surf:{low:'#8d715e',high:'#9d806d',dry:'#aa8161',ice:'#ece7e1',sea:-1,ocean:'none',oceanCol:'#10223a',relief:1},
    air:{density:.012,height:1.3,sky:'#4a8fe6',haze:.25,hazeCol:'#ffa060',hazeH:3.9,adv:{on:true,tau:.55,h:11,alb:[.975,.94,.82],pk:.65,gp:.875,gs:.03,g:.42}},clouds:{on:false,cover:.4},city:false},
  ocean:{type:'rocky',land:{hills:.8,erosion:1.2,craters:0,canyons:0,mesas:0,dunes:.5,lakes:.6},climate:{temp:6,rain:1.3,ice:0},life:{trees:true,forest:1.2},weather:{storms:1.4},day:20,surf:{low:'#2f6b3a',high:'#6a6048',dry:'#9a8a5a',ice:'#f0f4f8',sea:.68,ocean:'water',oceanCol:'#0c2a44',relief:.8},air:{density:1.2,height:1,sky:'#4a8fe6',haze:.45,hazeCol:'#ffffff',hazeH:1},clouds:{on:true,cover:.62},city:false},
  ice:{type:'rocky',land:{hills:1.2,erosion:.8,craters:.1,canyons:.2,mesas:0,dunes:.4,lakes:.3},climate:{temp:-28,rain:.6,ice:.9},life:{trees:true,forest:.5},weather:{storms:.8},day:30,surf:{low:'#b8c6d4',high:'#8a9aae',dry:'#d6dde6',ice:'#ffffff',sea:.45,ocean:'water',oceanCol:'#0a1a2a',relief:1.2},air:{density:.6,height:.8,sky:'#9cc4ff',haze:.2,hazeCol:'#e8f0ff',hazeH:1.5},clouds:{on:true,cover:.35},city:false},
  lava:{type:'rocky',land:{hills:1.4,erosion:.3,craters:.3,canyons:.3,mesas:.2,dunes:.2,lakes:0},climate:{temp:35,rain:.1,ice:0},life:{trees:false,forest:0},weather:{storms:.3},day:40,surf:{low:'#2a2522',high:'#4a3a30',dry:'#3a2c24',ice:'#5a4a40',sea:.47,ocean:'lava',oceanCol:'#ff5a14',relief:1.6},air:{density:.4,height:1.2,sky:'#c08060',haze:.5,hazeCol:'#ff8a50',hazeH:3},clouds:{on:false,cover:.3},city:false},
  gas:{type:'gas',gas:{c1:'#e3cfa6',c2:'#a8805a',c3:'#f2e8d4',storm:'#b8502c'},air:{density:1,height:1,sky:'#9fb4d6',haze:.5,hazeCol:'#fff4e0',hazeH:1},rings:{on:false,inner:1.35,outer:2.3,col:'#d8c8a8'},tilt:20},
  icegiant:{type:'gas',gas:{c1:'#9fd3e0',c2:'#6aa6c4',c3:'#cfeef4',storm:'#3a6a9a'},air:{density:1.4,height:1.1,sky:'#7fc0ff',haze:.3,hazeCol:'#e0f4ff',hazeH:1},rings:{on:true,inner:1.5,outer:2,col:'#9aa8b8'},tilt:60}};
const PLMOD={land:{hills:1,erosion:1,craters:0,canyons:0,mesas:.1,dunes:.6,lakes:.5,seed:0},climate:{temp:0,rain:1,ice:0},life:{trees:true,forest:1},weather:{storms:1}};
const PLMODD={land:{hills:1,erosion:.6,craters:.5,canyons:.5,mesas:.5,dunes:.9,lakes:0,seed:0},climate:{temp:-30,rain:.05,ice:.4},life:{trees:false,forest:0},weather:{storms:.5}};
const plMod=(P,k)=>P[k]=Object.assign({},(P.surf&&P.surf.ocean==='none'?PLMODD:PLMOD)[k],P[k]||{});
const PLNAMES={earth:'Earth-like',mars:'Mars-like',desert:'Desert',ocean:'Ocean world',ice:'Ice world',lava:'Lava world',gas:'Gas giant',icegiant:'Ice giant'};
// spin axis (and ring plane): tilted away from straight up, then turned around it
const plAxis=P=>{const t=P.tilt*D2R,u=(P.turn||0)*D2R;return [Math.sin(t)*Math.sin(u),Math.cos(t),Math.sin(t)*Math.cos(u)];};
function mkPlanet(kind,name,orbit){const b=JSON.parse(JSON.stringify(PLPRE[kind]));
  const base={id:uid(),name,type:'rocky',size:1,orbit:{dist:120,angle:0,speed:1},spin:1,tilt:20,city:false,clouds:{on:false,cover:.5},
    surf:JSON.parse(JSON.stringify(PLPRE.earth.surf)),gas:JSON.parse(JSON.stringify(PLPRE.gas.gas)),air:JSON.parse(JSON.stringify(PLPRE.earth.air)),
    rings:{on:false,inner:1.35,outer:2.3,col:'#d8c8a8'},moons:[]};
  return Object.assign(base,b,{orbit:orbit||base.orbit});}
function newPlanet(){const n=CUST.filter(d=>d.kind==='planet').length+1;
  const P=[mkPlanet('desert','Ember',{dist:70,angle:-50,speed:1.6}),mkPlanet('earth','Home',{dist:120,angle:0,speed:1}),mkPlanet('gas','Titan',{dist:220,angle:28,speed:.5})];
  P[0].size=.6;P[2].size=7;P[2].rings.on=true;P[1].moons=[{id:uid(),name:'Moon',dist:2.6,size:.27,col:'#d6d0c6',speed:1,angle:40}];
  const d={id:uid(),kind:'planet',name:'My system'+(n>1?' '+n:''),cur:1,star:{temp:5800,bright:1,size:1},view:{sunAngle:12,sunAz:100,exposure:1.2},cam:{yaw:.3,pitch:.25,dist:2.9,tx:0,ty:0,tz:0},planets:P};
  CUST.push(d);custSave(true);const k=custReg(d);S.scene=k;changed('scene');drawScenes();if(openP!=='build')openPane('build');else drawBuild();toast('New planet system');}
// an editable copy of a built-in world: a system with that world (from its preset) at its distance from a Sun-like star
function customizeWorld(kind,name){const q=mkPlanet(kind,name,{dist:kind==='mars'?183:120,angle:0,speed:1});if(kind==='mars')q.size=.532;
  const d={id:uid(),kind:'planet',name:name+' (custom)',cur:0,star:{temp:5800,bright:1,size:1},view:{sunAngle:S.sunAngle,sunAz:S.sunAz,exposure:S.exposure},cam:{yaw:.3,pitch:.25,dist:2.9,tx:0,ty:0,tz:0},planets:[q]};
  CUST.push(d);custSave(true);custReg(d);S.scene='u:'+d.id;changed('scene');drawScenes();if(openP!=='build')openPane('build');else drawBuild();toast(name+': every setting is now yours to change');}
// star color from its temperature, as linear light of the scene's usual brightness
function starI(st){const c=kRGB(st.temp).map(v=>Math.pow(v,2.2)),l=.2126*c[0]+.7152*c[1]+.0722*c[2];return c.map(v=>20*(st.bright??1)*v/l);}
const COC=new Map();const planetDirty=d=>COC.delete(d.id);
function planetCosmos(d){let co=COC.get(d.id);if(co)return co;const P=d.planets[d.cur]||d.planets[0],L=hex2lin,a=P.air,gas=P.type==='gas';
  const tn=c=>{const v=L(c),s=v[0]+v[1]+v[2]||1;return v.map(x=>x/s);},hc=L(a.hazeCol),hm=Math.max(...hc,1e-3);
  const bmeS=(gas?11:40)*a.haze,br=tn(a.sky).map(x=>x*(gas?8:35)*a.density),hr=(gas?.02:.012)*a.height,hmm=(gas?.008:.0018)*a.hazeH;
  const ab=a.hazeAbs??.3,gr=a.grain??.4,gb=.6+.25*gr,oz=a.ozone??(P.surf.ocean==='water'?1:.2);
  co={kind:gas?1:0,br,bms:hc.map(x=>bmeS*.9*x/hm),bme:hc.map(x=>bmeS*(.9*x/hm+ab*(1.1-x/hm))),bo:gas?[0,0,0]:[.9,2.8,.1].map(x=>x*a.density*.8*oz),
    hr,hm:hmm,ra:1+Math.max(gas?3*hr:6*hr,5*hmm),g:[gb-.05*gr,gb,gb+.07*gr],
    sea:gas?.5:P.surf.ocean==='none'?-1:P.surf.sea,clouds:!gas&&P.clouds.on,dust:!gas&&P.surf.ocean==='none'&&!P.clouds.on?1:0,cover:P.clouds.cover,city:!gas&&P.city?1:0,
    p1:L(gas?P.gas.c1:P.surf.low),p2:L(gas?P.gas.c2:P.surf.high),p3:L(gas?P.gas.c3:P.surf.dry),p4:L(gas?P.gas.storm:P.surf.ice),
    axis:plAxis(P),rin:P.rings.on?P.rings.inner:0,rout:P.rings.on?P.rings.outer:0,ringC:L(P.rings.col),
    ocean:P.surf.ocean==='water'?L(P.surf.oceanCol):[.01,.008,.007],lava:P.surf.ocean==='lava'?1:0,lavaC:P.surf.ocean==='lava'?L(P.surf.oceanCol).map(x=>x*1.4):[1,.35,.08],
    relief:gas?1:P.surf.relief,spin:P.spin,sunI:starI(d.star),sunSize:d.star.size,sunR:.265*120/Math.max(P.orbit.dist,1),starD:P.orbit.dist,
    moons:P.moons.map(m=>{const a=m.angle*D2R;return {p:[m.dist*Math.cos(a),m.dist*.12*Math.sin(a*1.7),m.dist*Math.sin(a)],r:m.size,col:L(m.col).map(x=>Math.min(2.5,x*3.5)),speed:m.speed};}),
    bodies:d.planets.filter(q=>q!==P).map(q=>{const g=q.type==='gas';return {r:q.size/P.size,dist:q.orbit.dist,angle:q.orbit.angle,speed:q.orbit.speed,gas:g,
      c1:L(g?q.gas.c1:q.surf.ocean==='water'?q.surf.oceanCol:q.surf.dry).map(x=>g?x:q.surf.ocean==='water'?x*4:x),c2:L(g?q.gas.c2:q.surf.low),
      ring:q.rings.on?q.rings.outer:0,axis:plAxis(q),air:L(q.air.sky),airK:Math.min(2,q.air.density)*(g?.4:1)};}),
    sys:d};
  if(!gas){const dry=P.surf.ocean==='none',L=plMod(P,'land'),C=plMod(P,'climate'),Lf=plMod(P,'life'),Wt=plMod(P,'weather');
    co.pe={R:6371*P.size,seed:L.seed||(parseInt(P.id,36)||7)%997,crater:L.craters,canyon:L.canyons,mesa:L.mesas,dune:L.dunes,hill:.55*L.hills,erode:L.erosion,lakes:L.lakes,
      volcano:L.volcanoes||0,hum:C.rain,temp:C.temp,cap:90-25*C.ice,trees:Lf.trees&&Lf.forest>0,forest:Lf.forest,storm:Wt.storms,day:P.day||24/Math.max(P.spin||1,.01),
      air:{ray:tn(a.sky).map(x=>x*52.46*a.density),mie:hc.map(x=>3.996*(a.haze/.4)*x/hm),mieE:hc.map(x=>4.4*(a.haze/.4)*(.9*x/hm+(a.hazeAbs??.3)*(1.1-x/hm))),hr:8*a.height,hm:1.2*a.hazeH,top:Math.max(60,100*a.height),ga:[.3,.3,.3],
        g:(gr=>[.6+.25*gr-.05*gr,.6+.25*gr,.6+.25*gr+.07*gr])(a.grain??.4),oz:[.65,1.881,.085].map(x=>x*(a.ozone??(P.surf.ocean==='water'?1:.2)))}};
    // the advanced (physical) haze: optical depth straight up, scale height (km), how much of each colour a grain keeps when it
    // scatters, the share of its extinction thrown into the narrow forward diffraction lobe and that lobe's width (narrower in
    // blue), and the broad lobe's forward bias. These replace the simple Haze controls' mapping
    const v=a.adv;if(v&&v.on){const A=co.pe.air,e=1e3*(v.tau??.5)/Math.max(v.h??10,.1),al=v.alb||[.97,.94,.85],gp=v.gp??.87,gs=v.gs??.03,gb=v.g??.45;
      Object.assign(A,{mie:al.map(x=>x*e),mieE:[e,e,e],hm:v.h??10,pk:v.pk??.5,gp:[gp-gs,gp,gp+gs*.5].map(x=>Math.min(.97,Math.max(0,x))),g:[gb+.03,gb,gb-.02]});}}
  co.orbit0=P.orbit;COC.set(d.id,co);return co;}
// where the other planets are, seen from the one being visited (at the origin; the star sits toward the sun direction)
function sysPos(co,sun){const d=co.sys,t=peOn()?PE.wt*2*Math.PI/(365.25*86400):simT*.02,D=co.starD;let e=sub3([0,1,0],mul3(sun,sun[1]));if(Math.hypot(...e)<1e-3)e=[1,0,0];e=norm(e);const e2=norm(cross(e,sun));
  const th0=co.orbit0.angle*D2R+co.orbit0.speed*t;
  return co.bodies.map(b=>{const th=b.angle*D2R+b.speed*t-th0;return add3(mul3(sun,D),mul3(add3(mul3(sun,-Math.cos(th)),mul3(e2,Math.sin(th))),b.dist));});}
const cosSig=co=>[co.kind,co.clouds,co.rin>0,moonList(co).length,(co.bodies||[]).length].join();
// apply an edit to the system: recompile only when the shader's shape changed, redo the air table when the air changed
function plApply(d,air){const k='u:'+d.id,o=COC.get(d.id),s0=o&&cosSig(o);planetDirty(d);if(S.scene!==k){custSave();return;}
  const co=planetCosmos(d);if(cosSig(co)!==s0)build();if(air)renderLUT();refreshVis();reset();custSave();}
let plPend=0;const plSoon=(d,air)=>{plPend|=air?2:1;if(plPend&4)return;plPend|=4;requestAnimationFrame(()=>{const a=!!(plPend&2);plPend=0;plApply(d,a);});};
let plSel=null,plTab='surface';
const colorPick=(label,val,on)=>{const el=mk('div','ctl cpick'),i=document.createElement('input');i.type='color';i.value=val;i.setAttribute('aria-label',label);i.oninput=()=>on(i.value);el.append(mk('div','lab',label),i);return el;};
function drawSysMap(c,d,tries=0){if(!c||!c.isConnected)return;if(c.clientWidth<60){if(tries<30)requestAnimationFrame(()=>drawSysMap(c,d,tries+1));return;}const x=c.getContext('2d'),W=c.width=c.clientWidth*devicePixelRatio,H=c.height=c.clientHeight*devicePixelRatio,cx=W/2,cy=H/2;x.clearRect(0,0,W,H);
  const mx=Math.max(...d.planets.map(q=>q.orbit.dist),1),sc=(Math.min(W,H)/2-14*devicePixelRatio)/mx,st=kRGB(d.star.temp);
  const g=x.createRadialGradient(cx,cy,0,cx,cy,16*devicePixelRatio);g.addColorStop(0,`rgb(${st.map(v=>v*255|0)})`);g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.beginPath();x.arc(cx,cy,16*devicePixelRatio,0,7);x.fill();
  const pos=[];d.planets.forEach((q,i)=>{const r=q.orbit.dist*sc,a=(q.orbit.angle+q.orbit.speed*simT*.02/D2R)*D2R;x.strokeStyle='rgba(150,170,210,.25)';x.lineWidth=devicePixelRatio;x.beginPath();x.arc(cx,cy,r,0,7);x.stroke();
    const px=cx+Math.cos(a)*r,py=cy-Math.sin(a)*r,rr=(3+Math.sqrt(q.size)*3)*devicePixelRatio;pos.push([px,py,rr]);
    x.fillStyle=q.type==='gas'?q.gas.c1:q.surf.ocean==='water'?'#3d7fd0':q.surf.low;x.beginPath();x.arc(px,py,rr,0,7);x.fill();
    if(i===plSel){x.strokeStyle='#86d8ff';x.lineWidth=2*devicePixelRatio;x.beginPath();x.arc(px,py,rr+4*devicePixelRatio,0,7);x.stroke();}
    if(i===d.cur){x.fillStyle='#e9edf5';x.font=`600 ${11*devicePixelRatio}px Manrope,sans-serif`;x.fillText('You are here',px+rr+5*devicePixelRatio,py+4*devicePixelRatio);}});
  c.onclick=e=>{const b=c.getBoundingClientRect(),X=(e.clientX-b.left)*devicePixelRatio,Y=(e.clientY-b.top)*devicePixelRatio;let best=-1,bd=1e9;
    pos.forEach(([px,py,rr],i)=>{const dd=Math.hypot(X-px,Y-py);if(dd<rr+18*devicePixelRatio&&dd<bd){bd=dd;best=i;}});if(best>=0){plSel=best;drawBuild();}};}
function drawPlanetEd(host,d){if(plSel==null||plSel>=d.planets.length)plSel=d.cur;const P=d.planets[plSel],vis=plSel===d.cur,U=air=>plSoon(d,air);
  host.appendChild(tin(d.name,'System name',v=>{d.name=v;custSave();drawScenes();$('shTitle').textContent=v;}));
  const cv2=mk('canvas','sysmap');cv2.setAttribute('aria-label','System map: tap a planet');host.appendChild(cv2);requestAnimationFrame(()=>drawSysMap(cv2,d));
  const top=mk('div','row-btns');
  if(!vis)top.appendChild(btn('Visit '+P.name,'primary',()=>{d.cur=plSel;plApply(d,true);Object.assign(cam,{yaw:.3,pitch:.25,dist:2.9,tx:0,ty:0,tz:0});if(S.camMode==='fly'){S.camMode='orbit';ctl.camMode();}fbBase();build();renderLUT();drawBuild();toast('Arrived at '+P.name);}));
  if(d.planets.length<7)top.appendChild(btn('Add planet','',()=>{const mx=Math.max(...d.planets.map(q=>q.orbit.dist));const q=mkPlanet('ice','Planet '+(d.planets.length+1),{dist:Math.round(mx*1.4),angle:Math.round(Math.random()*360-180),speed:+(.4+Math.random()*.6).toFixed(2)});
    q.size=.8;d.planets.push(q);plSel=d.planets.length-1;plApply(d,false);drawBuild();}));
  if(d.planets.length>1)top.appendChild(btn('Remove','danger',()=>{d.planets.splice(plSel,1);if(d.cur>=plSel&&d.cur>0)d.cur--;plSel=d.cur;plApply(d,true);build();drawBuild();toast(P.name+' removed');}));
  host.appendChild(top);
  host.appendChild(mk('div','eb',(vis?'Here: ':'Editing: ')+P.name));
  host.appendChild(tin(P.name,'Planet name',v=>{P.name=v;custSave();drawBuild();}));
  const pre=mk('div','chips');for(const [k,t] of Object.entries(PLNAMES)){const b=mk('button','chip',t);b.type='button';b.onclick=()=>{const keep={id:P.id,name:P.name,size:P.size,orbit:P.orbit,moons:P.moons,spin:P.spin};
    Object.assign(P,JSON.parse(JSON.stringify(PLPRE[k])),keep);if(k==='gas'&&P.size<3)P.size=6;if(k==='icegiant'&&P.size<2)P.size=4;if(k!=='gas'&&k!=='icegiant'&&P.size>3)P.size=1;plApply(d,true);drawBuild();toast(t);};pre.appendChild(b);}
  const pc=mk('div','ctl');pc.append(mk('div','lab','Start from'),pre);host.appendChild(pc);
  const tabs=P.type==='gas'?[['surface','Surface'],['air','Air'],['rings','Rings & moons'],['orbit','Orbit']]:[['surface','Surface'],['land','Land'],['climate','Climate'],['air','Air'],['rings','Moons'],['orbit','Orbit']];
  host.appendChild(segCtl(null,tabs,plTab,v=>{plTab=v;drawBuild();}));
  const gas=P.type==='gas',ed=mk('div');host.appendChild(ed);
  if(plTab==='surface'){
    ed.appendChild(segCtl('Type',[['rocky','Rocky'],['gas','Gas giant']],P.type,v=>{P.type=v;if(v==='gas'&&P.size<3)P.size=6;if(v==='rocky'&&P.size>3)P.size=1;U(true);drawBuild();}));
    if(gas){[['Bands','c1'],['Dark bands','c2'],['Light bands','c3'],['Storms','storm']].forEach(([l,k])=>ed.appendChild(colorPick(l,P.gas[k],v=>{P.gas[k]=v;U();})));
      ed.appendChild(rangeCtl('Axis tilt',-180,180,1,P.tilt,fmtD,v=>{P.tilt=v;U();}));ed.appendChild(rangeCtl('Axis turn',-180,180,1,P.turn||0,fmtD,v=>{P.turn=v;U();}));}
    else{const sf=P.surf;[['Lowlands','low'],['Highlands','high'],['Deserts','dry'],['Ice caps','ice']].forEach(([l,k])=>ed.appendChild(colorPick(l,sf[k],v=>{sf[k]=v;U();})));
      ed.appendChild(segCtl('Seas',[['water','Water'],['lava','Lava'],['none','None']],sf.ocean,v=>{sf.ocean=v;if(v!=='none'&&sf.sea<0)sf.sea=.5;if(v==='lava'&&sf.oceanCol==='#10223a')sf.oceanCol='#ff5a14';if(v==='water'&&sf.oceanCol==='#ff5a14')sf.oceanCol='#10223a';U(true);drawBuild();}));
      if(sf.ocean!=='none'){ed.appendChild(rangeCtl('Sea level',.3,.78,.01,Math.max(.3,sf.sea),pct,v=>{sf.sea=v;U();}));ed.appendChild(colorPick(sf.ocean==='lava'?'Lava color':'Sea color',sf.oceanCol,v=>{sf.oceanCol=v;U();}));}
      const cs=mk('div','ctl');cs.appendChild(segCtl('City lights',[['off','Off'],['on','On']],P.city?'on':'off',v=>{P.city=v==='on';U();}));ed.appendChild(cs);}}
  else if(plTab==='land'&&!gas){const L=plMod(P,'land'),sf=P.surf;
    ed.appendChild(rangeCtl('Mountains',.2,3,.05,sf.relief,fmtI,v=>{sf.relief=v;U();}));
    ed.appendChild(rangeCtl('Hills',0,3,.05,L.hills,fmtI,v=>{L.hills=v;U();}));
    ed.appendChild(rangeCtl('Erosion',0,2,.05,L.erosion,fmtI,v=>{L.erosion=v;U();}));
    ed.appendChild(rangeCtl('Craters',0,1,.01,L.craters,pct,v=>{L.craters=v;U();}));
    ed.appendChild(rangeCtl('Canyons',0,1,.01,L.canyons,pct,v=>{L.canyons=v;U();}));
    ed.appendChild(rangeCtl('Mesas',0,1,.01,L.mesas,pct,v=>{L.mesas=v;U();}));
    ed.appendChild(rangeCtl('Dunes',0,1.5,.01,L.dunes,pct,v=>{L.dunes=v;U();}));
    ed.appendChild(rangeCtl('Volcanoes',0,4,1,L.volcanoes||0,v=>String(Math.round(v)),v=>{L.volcanoes=Math.round(v);U();}));
    if(sf.ocean==='water')ed.appendChild(rangeCtl('Lakes',0,1,.01,L.lakes,pct,v=>{L.lakes=v;U();}));
    const bb=mk('div','row-btns');bb.appendChild(btn('New landscape','',()=>{L.seed=1+Math.floor(Math.random()*9990);U();toast('New landscape');}));ed.appendChild(bb);
    ed.appendChild(mk('p','note','The same settings always make the same world.'));}
  else if(plTab==='climate'&&!gas){const C=plMod(P,'climate'),Lf=plMod(P,'life');
    ed.appendChild(rangeCtl('Temperature',-60,40,1,C.temp,v=>(v>0?'+':v<0?'−':'')+Math.abs(Math.round(v))+' °C',v=>{C.temp=v;U();}));
    ed.appendChild(rangeCtl('Rain',0,2,.05,C.rain,fmtI,v=>{C.rain=v;U();}));
    ed.appendChild(rangeCtl('Polar ice',0,1,.01,C.ice,pct,v=>{C.ice=v;U();}));
    ed.appendChild(mk('div','eb','Life'));
    ed.appendChild(segCtl('Trees',[['off','Off'],['on','On']],Lf.trees?'on':'off',v=>{Lf.trees=v==='on';U();drawBuild();}));
    if(Lf.trees)ed.appendChild(rangeCtl('Forests',0,2,.05,Lf.forest,fmtI,v=>{Lf.forest=v;U();}));
    ed.appendChild(mk('p','note','Trees follow the climate, from pines in the cold to palms in the tropics and cacti in deserts. Leaves use the Lowlands color.'));}
  else if(plTab==='air'){const a=P.air;
    ed.appendChild(rangeCtl('Air',0,3,.02,a.density,fmtI,v=>{a.density=v;U(true);}));
    ed.appendChild(colorPick('Sky color',a.sky,v=>{a.sky=v;U(true);}));
    ed.appendChild(rangeCtl('Haze',0,1,.01,a.haze,pct,v=>{a.haze=v;U(true);}));
    ed.appendChild(colorPick('Haze color',a.hazeCol,v=>{a.hazeCol=v;U(true);}));
    ed.appendChild(rangeCtl('Haze height',.5,5,.05,a.hazeH,fmtI,v=>{a.hazeH=v;U(true);}));
    // what the haze is made of: how much light its grains swallow (the colours missing from its color), how big they are
    // (big grains throw light forward, blue the most: Mars's blue sunsets), and the ozone that tints a sky toward blue at dusk
    ed.appendChild(rangeCtl('Haze absorbs',0,1,.01,a.hazeAbs??.3,pct,v=>{a.hazeAbs=v;U(true);}));
    ed.appendChild(rangeCtl('Haze grain size',0,1,.01,a.grain??.4,pct,v=>{a.grain=v;U(true);}));
    if(!gas)ed.appendChild(rangeCtl('Ozone',0,3,.05,a.ozone??(P.surf.ocean==='water'?1:.2),fmtI,v=>{a.ozone=v;U(true);}));
    ed.appendChild(rangeCtl('Air height',.4,2.5,.05,a.height,fmtI,v=>{a.height=v;U(true);}));
    // the haze as physics: what a rover's instruments would measure
    if(!gas){const v=a.adv=a.adv||{on:false,tau:.5,h:10,alb:[.97,.94,.85],pk:.5,gp:.87,gs:.03,g:.45};
      ed.appendChild(segCtl('Haze physics',[['off','Simple'],['on','Advanced']],v.on?'on':'off',x=>{v.on=x==='on';U(true);drawBuild();}));
      if(v.on){const f2=x=>(+x).toFixed(2);
        ed.appendChild(rangeCtl('Haze optical depth',0,4,.01,v.tau,f2,x=>{v.tau=x;U(true);}));
        ed.appendChild(rangeCtl('Haze scale height',1,30,.5,v.h,x=>(+x).toFixed(1)+' km',x=>{v.h=x;U(true);}));
        [['Keeps red',0],['Keeps green',1],['Keeps blue',2]].forEach(([l,i])=>ed.appendChild(rangeCtl(l,.3,1,.005,v.alb[i],f2,x=>{v.alb[i]=x;U(true);})));
        ed.appendChild(rangeCtl('Forward glow share',0,.85,.01,v.pk,pct,x=>{v.pk=x;U(true);}));
        ed.appendChild(rangeCtl('Glow tightness',.6,.97,.005,v.gp,f2,x=>{v.gp=x;U(true);}));
        ed.appendChild(rangeCtl('Blue glow tighter',0,.08,.005,v.gs,f2,x=>{v.gs=x;U(true);}));
        ed.appendChild(rangeCtl('Scatter forward',0,.85,.01,v.g,f2,x=>{v.g=x;U(true);}));
        ed.appendChild(mk('p','note','Large dust grains scatter light forward around the sun, giving blue sunsets under a tan sky. Optical depth: about 0.1 on Earth, 0.5 on a clear Mars day, 2 when dusty.'));}}
    if(!gas){ed.appendChild(segCtl('Clouds',[['off','Off'],['on','On']],P.clouds.on?'on':'off',v=>{P.clouds.on=v==='on';U();drawBuild();}));
      if(P.clouds.on){ed.appendChild(rangeCtl('Cloud cover',0,1,.01,P.clouds.cover,pct,v=>{P.clouds.cover=v;U();}));
        const Wt=plMod(P,'weather');ed.appendChild(rangeCtl('Storms',0,2,.05,Wt.storms,fmtI,v=>{Wt.storms=v;U();}));}}}
  else if(plTab==='rings'){const r=P.rings;
    ed.appendChild(segCtl('Rings',[['off','Off'],['on','On']],r.on?'on':'off',v=>{r.on=v==='on';U();drawBuild();}));
    if(r.on){ed.appendChild(rangeCtl('Inner edge',1.1,3,.01,r.inner,v=>(+v).toFixed(2)+'×',v=>{r.inner=Math.min(v,r.outer-.05);U();}));
      ed.appendChild(rangeCtl('Outer edge',1.2,4,.01,r.outer,v=>(+v).toFixed(2)+'×',v=>{r.outer=Math.max(v,r.inner+.05);U();}));
      ed.appendChild(colorPick('Ring color',r.col,v=>{r.col=v;U();}));ed.appendChild(rangeCtl('Tilt',-180,180,1,P.tilt,fmtD,v=>{P.tilt=v;U();}));ed.appendChild(rangeCtl('Turn',-180,180,1,P.turn||0,fmtD,v=>{P.turn=v;U();}));}
    ed.appendChild(mk('div','eb','Moons · '+P.moons.length));
    P.moons.forEach((m,i)=>{const box=mk('div','lrow mrow'),e2=mk('div','ledit');box.appendChild(e2);
      e2.appendChild(tin(m.name,'Moon name',v=>{m.name=v;custSave();}));
      e2.appendChild(rangeCtl('Size',.02,.6,.01,m.size,v=>(+v).toFixed(2)+'×',v=>{m.size=v;U();}));
      e2.appendChild(rangeCtl('Distance',1.6,12,.05,m.dist,v=>(+v).toFixed(1)+'×',v=>{m.dist=v;U();}));
      e2.appendChild(rangeCtl('Position',-180,180,1,m.angle,fmtD,v=>{m.angle=v;U();}));
      e2.appendChild(colorPick('Color',m.col,v=>{m.col=v;U();}));
      const bb=mk('div','row-btns');bb.appendChild(btn('Remove moon','danger',()=>{P.moons.splice(i,1);U();drawBuild();}));e2.appendChild(bb);ed.appendChild(box);});
    if(P.moons.length<4){const bb=mk('div','row-btns');bb.appendChild(btn('Add moon','',()=>{P.moons.push({id:uid(),name:'Moon '+(P.moons.length+1),dist:+(2.4+P.moons.length*1.6).toFixed(1),size:.18,col:'#cfc8bd',speed:1,angle:Math.round(Math.random()*360-180)});U();drawBuild();}));ed.appendChild(bb);}
    if(!vis)ed.appendChild(mk('p','note','Moons show up close while you visit this planet.'));}
  else{ed.appendChild(rangeCtl('Size',.2,12,.05,P.size,v=>(+v).toFixed(2)+'× Earth',v=>{P.size=v;U();}));
    ed.appendChild(rangeCtl('Distance from the star',20,600,1,P.orbit.dist,v=>Math.round(v)+' units',v=>{P.orbit.dist=v;U();drawSysMap(host.querySelector('.sysmap'),d);}));
    ed.appendChild(rangeCtl('Position on orbit',-180,180,1,P.orbit.angle,fmtD,v=>{P.orbit.angle=v;U();drawSysMap(host.querySelector('.sysmap'),d);}));
    ed.appendChild(rangeCtl('Orbit speed',0,3,.05,P.orbit.speed,fmtI,v=>{P.orbit.speed=v;U();}));
    if(gas)ed.appendChild(rangeCtl('Spin speed',0,5,.05,P.spin,fmtI,v=>{P.spin=v;U();}));
    else ed.appendChild(rangeCtl('Day length',2,240,1,P.day||Math.round(24/Math.max(P.spin||1,.01)),v=>Math.round(v)+' hours',v=>{P.day=v;U();}));
    ed.appendChild(mk('p','note','Orbits and spin move while Animate is on (Look).'));}
  host.appendChild(mk('div','eb','Star'));const st=d.star;
  ed.dataset.x=1;
  const tc=rangeCtl('Temperature',2400,12000,50,st.temp,v=>Math.round(v)+' K',v=>{st.temp=v;U();});tc.querySelector('input').className='kel';host.appendChild(tc);
  host.appendChild(rangeCtl('Brightness',.2,3,.05,st.bright,fmtI,v=>{st.bright=v;U();}));
  host.appendChild(rangeCtl('Size in the sky',.5,6,.05,st.size,fmtI,v=>{st.size=v;U();}));
  host.appendChild(mk('p','note','Move the star in Look › Sun height and direction.'));
  host.appendChild(mk('div','eb','System'));
  const r1=mk('div','row-btns');r1.append(btn('Use this view at start','',()=>{if(S.camMode==='fly')toOrbit();d.cam={yaw:cam.yaw,pitch:cam.pitch,dist:cam.dist,tx:0,ty:0,tz:0};SCENES['u:'+d.id].cam=d.cam;custSave();toast('Start view saved');}),
    btn('Export file','',()=>exportScene(d)));host.appendChild(r1);
  const r2=mk('div','row-btns');r2.appendChild(btn('Duplicate','',()=>{const c=JSON.parse(JSON.stringify(d));c.id=uid();c.name=d.name+' copy';CUST.push(c);custSave(true);const k=custReg(c);S.scene=k;changed('scene');drawScenes();}));
  let arm=0;const del=btn('Delete system','danger',()=>{if(performance.now()-arm>3000){arm=performance.now();del.textContent='Tap again to delete';return;}custDelete(d);});r2.appendChild(del);host.appendChild(r2);}

