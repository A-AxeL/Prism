/* ---------- scene builder: your own scenes (shapes, lights, imported models) ---------- */
const SHP={sphere:1,box:2,cylinder:3,cone:0,torus:0,prism:0,pyramid:0,model:0};
const BKIND={sphere:'Sphere',box:'Box',cylinder:'Cylinder',cone:'Cone',torus:'Torus',prism:'Prism',pyramid:'Pyramid',model:'Model',bulb:'Bulb',panel:'Light panel'};
const BGLY={sphere:'<circle cx="12" cy="12" r="7.5"/><path d="M4.5 12c2 2.3 13 2.3 15 0"/>',box:'<path d="M12 3.5 20 8v8l-8 4.5L4 16V8Z"/><path d="M4 8l8 4.5L20 8M12 12.5V20.5"/>',
  cylinder:'<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/>',cone:'<path d="M12 3.5 19 18c0 1.4-3.1 2.5-7 2.5S5 19.4 5 18Z"/>',
  torus:'<ellipse cx="12" cy="12" rx="8.5" ry="5.5"/><ellipse cx="12" cy="11.5" rx="3.5" ry="1.6"/>',prism:'<path d="M8 5 3 18h10l5-13Z"/><path d="M8 5l5 13M18 5l3 13h-8"/>',
  pyramid:'<path d="M12 3.5 3.5 17 12 20.5 20.5 17Z"/><path d="M12 3.5v17"/>',model:'<path d="M7 8.5c0-3 2.2-5 5-5s5 2 5 5c2 .5 3.5 2.2 3.5 4.5 0 2.9-2 5-5 5H8.5c-3 0-5-2.1-5-5 0-2.3 1.5-4 3.5-4.5Z"/><path d="M12 9v7M9 13l3 3 3-3"/>',
  bulb:'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/>',panel:'<path d="M4 6h16v3H4Z"/><path d="M6 13l-1.5 4M12 13v5M18 13l1.5 4"/>'};
const bIcon=t=>`<svg viewBox="0 0 24 24">${BGLY[t]||BGLY.box}</svg>`;
const BCOL=['#d9d4cc','#c8463c','#3c7ec8','#e0b43a','#4fae6a','#8a5cc2','#ef8a3a','#2a2c33'];
const CUST=custLoad();
function custLoad(){try{const a=JSON.parse(localStorage.getItem('prism-scenes')||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
let custT=0;function custSave(now){clearTimeout(custT);const f=()=>{if(wiping)return;try{localStorage.setItem('prism-scenes',JSON.stringify(CUST));}catch(e){toast('Couldn’t save: browser storage is full');}};if(now)f();else custT=setTimeout(f,250);}
const custOf=k=>SCENES[k]&&SCENES[k].custom;
function custReg(d){const k='u:'+d.id;
  if(d.kind==='planet')SCENES[k]={custom:d,get cosmos(){return planetCosmos(d);},hint:d.view,cam:d.cam||{yaw:.3,pitch:.25,dist:2.9,tx:0,ty:0,tz:0},f:()=>[[],[]]};
  else SCENES[k]={custom:d,hint:d.env,cam:d.cam||{yaw:.6,pitch:.35,dist:9,tx:0,ty:.8,tz:0},f(){return custBuild(d);}};
  return k;}
function objMat(o){const m=o.mat||{},k=m.kind||'matte';
  return {col:hex2lin(m.col||'#cccccc'),mt:k==='metal'||k==='mirror'?1:k==='glass'?2:0,ro:k==='metal'?(m.rough??.2):0,ior:m.ior??1.5,dens:k==='glass'?(m.tint??.4):0,em:k==='glow'?(m.glow??4):0};}
function custBuild(d){const SCx=[],BXx=[],INS=[];
  for(const o of d.objs){if(o.hide)continue;
    if(o.type==='bulb'){const r=Math.max(.01,o.s[0]/2),g=G(o.p[0],o.p[1],o.p[2],r,hex2lin(o.light.col),3,0,o.light.power*.5/(r*r));g.bid=o.id;SCx.push(g);}
    else if(o.type==='panel'){const b=B(o.p[0],o.p[1],o.p[2],Math.max(.01,o.s[0]/2),.01,Math.max(.01,o.s[2]/2),hex2lin(o.light.col),3,0,o.light.power);b.bid=o.id;BXx.push(b);}
    else{let mid=null;if(o.type==='model')mid=o.mesh;else if(!SHP[o.type]){mid='shape:'+o.type;if(!MESHES.has(mid))shapeMesh(o.type);}
      if(mid&&!MESHES.has(mid))continue;
      INS.push({shape:SHP[o.type]||0,mesh:mid,p:o.p,r:o.r,h:o.s.map(v=>Math.max(.005,v/2)),...objMat(o),smooth:o.smooth!==false,bid:o.id});}}
  return [SCx,BXx,{PR:[],LN:[],INS}];}
CUST.forEach(custReg);

let photoMode=false,photoTile=null,photoJob=null;   // photo mode: framing on screen; a tile being rendered; the photo in progress
if(!SCENES[S.scene])S.scene='blue planet';
if(freshStart&&SCENES[S.scene].cosmos){const sc=SCENES[S.scene];S.aeMode=sc.cosmos.kind===0?'highlight':'average';Object.assign(S,sc.hint||{});}   // a first visit starts the way picking the scene would: its own metering, sun and exposure
if(!(S.renderMode in MIDX))S.renderMode='hybrid';
if(S.autoOrbit){S.autoMove='turntable';delete S.autoOrbit;}S.camMode='orbit';

