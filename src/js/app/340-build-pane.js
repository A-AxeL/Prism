/* ---------- Build pane: make scenes and planets, place and edit objects ---------- */
let bSel=null,bDrag=null,bPend=false;
const bScene=()=>{const d=custOf(S.scene);return d&&d.kind!=='planet'?d:null;};
const bObj=id=>{const d=bScene();return d&&d.objs.find(o=>o.id===id);};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const progSig=()=>[SC.length,BX.length,LI.length,LB.length,GR.length,BGR.length,INST.list.length>0].join();
// apply edits: rebuild the scene data (cheap), recompile only when the shader's layout changed
const bHist=new Map();let bLast=null,bLastK=null,bLastT=0;
// undo: the state before each burst of edits (edits closer than 0.7 s together count as one)
function bRecord(){const d=bScene();if(!d)return;const k=d.id,cur=JSON.stringify(d.objs),now=performance.now();
  if(bLastK!==k){bLastK=k;bLast=cur;bLastT=now;return;}
  if(cur!==bLast){if(now-bLastT>700){const h=bHist.get(k)||[];h.push(bLast);if(h.length>40)h.shift();bHist.set(k,h);}bLast=cur;bLastT=now;}}
function bUndo(){const d=bScene();if(!d)return;const h=bHist.get(d.id);if(!h||!h.length){toast('Nothing to undo');return;}
  d.objs=JSON.parse(h.pop());bLast=JSON.stringify(d.objs);bLastT=0;if(bSel&&!d.objs.some(o=>o.id===bSel))bSel=null;
  const s0=progSig();buildScene(true);if(progSig()!==s0)build();reset();custSave();drawBuild();toast('Undone');}
function bApply(){bRecord();const s0=progSig();buildScene(true);if(progSig()!==s0)build();reset();custSave();}
const bSoon=()=>{if(bPend)return;bPend=true;requestAnimationFrame(()=>{bPend=false;bApply();});};
function instOf(id){return INST.list.find(I=>I.bid===id);}
// world bounds of an object (shapes and models through their instance; lights from their size)
function bBounds(o){const I=instOf(o.id);if(I)return [I.wmin,I.wmax];const h=o.type==='panel'?[o.s[0]/2,.01,o.s[2]/2]:[o.s[0]/2,o.s[0]/2,o.s[0]/2];return [sub3(o.p,h),add3(o.p,h)];}
function bDrop(o){if(o.type==='bulb'||o.type==='panel')return;const sh=SHP[o.type]?null:o.type==='model'?MESHES.get(o.mesh):MESHES.get('shape:'+o.type)||shapeMesh(o.type);
  if(o.type==='model'&&!sh)return;
  const I=mkInst({shape:SHP[o.type]||0,mesh:sh?sh.id:null,p:o.p,r:o.r,h:o.s.map(v=>v/2)});if(I)o.p[1]=+(o.p[1]-I.wmin[1]-1e-4).toFixed(4);}
function bNew(type,extra={}){const d=bScene();if(!d)return;const at=floorAim()||add3(LV?LV.eye:[0,1,5],mul3(LV?LV.fw:[0,0,-1],4)),n=d.objs.filter(o=>o.type===type).length+1;
  const S0={sphere:[1,1,1],box:[1,1,1],cylinder:[.8,1.2,.8],cone:[1,1.2,1],torus:[1.2,1.2,1.2],prism:[1,1,1],pyramid:[1,1,1],model:[1.5,1.5,1.5],bulb:[.2,.2,.2],panel:[1.2,.02,.8]}[type];
  const o={id:uid(),type,name:BKIND[type]+(n>1?' '+n:''),p:[+at[0].toFixed(2),0,+at[2].toFixed(2)],s:S0.slice(),r:[0,0,0],
    mat:{kind:'matte',col:BCOL[d.objs.length%BCOL.length],rough:.2,ior:1.5,tint:.4,glow:4},...extra};
  if(type==='bulb'){o.p[1]=2;o.light={col:'#ffd9a8',power:6};}else if(type==='panel'){o.p[1]=3;o.light={col:'#fff1dc',power:8};}else bDrop(o);
  // step sideways until it no longer overlaps what is already there
  if(LV){const rt=LV.rt,fr=[rt[0],0,rt[2]],w=Math.max(o.s[0],o.s[2])*.6+.2,boxes=d.objs.map(bBounds);
    for(let k=0;k<12;k++){const a=[o.p[0]-w,o.p[2]-w],b=[o.p[0]+w,o.p[2]+w];if(!boxes.some(([m,M])=>m[0]<b[0]&&M[0]>a[0]&&m[2]<b[1]&&M[2]>a[1]))break;
      const st=(k>>1)+1,sg=k&1?-1:1;o.p[0]=+(at[0]+fr[0]*st*sg*w*1.7).toFixed(2);o.p[2]=+(at[2]+fr[2]*st*sg*w*1.7).toFixed(2);}}
  o.p[1]=+o.p[1].toFixed(3);d.objs.push(o);bSel=o.id;bApply();drawBuild();toast(o.name+' added');return o;}
function bDelete(o){const d=bScene();d.objs.splice(d.objs.indexOf(o),1);if(bSel===o.id)bSel=null;bApply();drawBuild();toast(o.name+' deleted');}
function bDup(o){const d=bScene(),c=JSON.parse(JSON.stringify(o));c.id=uid();c.name=o.name+' copy';c.p[0]+=Math.max(.3,c.s[0]*1.1);d.objs.push(c);bSel=c.id;bApply();drawBuild();}
// tap picking: the nearest builder object along a screen ray
function bPick(cx,cy){const d=bScene();if(!d||!LV||S.proj!=='persp')return null;const [sx,sy]=clientToScreen(cx,cy),rd=screenRay(LV,sx,sy),ro=LV.eye;let best=null;
  for(const I of INST.list){const h=instHitJS(I,ro,rd);if(h&&(!best||h.t<best.t))best={t:h.t,id:I.bid};}
  for(const o of SC)if(o.bid){const oc=sub3(ro,[o.x,o.y,o.z]),b=dot3(oc,rd),h=b*b-dot3(oc,oc)+o.r*o.r*4;if(h<0)continue;const t=-b-Math.sqrt(h);if(t>0&&(!best||t<best.t))best={t,id:o.bid};}
  for(const q of BX)if(q.bid){let tn=-1e9,tf=1e9;const c=[q.x,q.y,q.z],h=[q.hx,q.hy+.05,q.hz];for(let i=0;i<3;i++){const iv=1/(rd[i]||1e-9),t0=(c[i]-h[i]-ro[i])*iv,t1=(c[i]+h[i]-ro[i])*iv;tn=Math.max(tn,Math.min(t0,t1));tf=Math.min(tf,Math.max(t0,t1));}
    if(tf>=Math.max(tn,0)&&(!best||tn<best.t))best={t:tn,id:q.bid};}
  return best&&{...best,p:add3(ro,mul3(rd,best.t)),rd};}
// drag a selected object across the floor plane (its height stays)
function bDragStart(e){const o=bObj(bSel);if(!o||e.button===2||ptrs.size)return false;const h=bPick(e.clientX,e.clientY);if(!h||h.id!==o.id)return false;
  bDrag={id:e.pointerId,o,y:h.p[1],off:sub3(o.p,h.p),moved:false};cv.setPointerCapture(e.pointerId);return true;}
function bDragMove(e){if(!LV)return;const [sx,sy]=clientToScreen(e.clientX,e.clientY),rd=screenRay(LV,sx,sy);if(Math.abs(rd[1])<1e-3)return;
  const t=(bDrag.y-LV.eye[1])/rd[1];if(t<=0||t>200)return;const p=add3(LV.eye,mul3(rd,t)),o=bDrag.o;
  let x=p[0]+bDrag.off[0],z=p[2]+bDrag.off[2];if(UIS.snap){x=Math.round(x*10)/10;z=Math.round(z*10)/10;}
  o.p[0]=+x.toFixed(3);o.p[2]=+z.toFixed(3);bDrag.moved=true;bSoon();}
function bRing(el){const o=bObj(bSel);if(!o||!LV||document.body.classList.contains('photo-mode')){el.hidden=true;return;}const [a,b]=bBounds(o),c=mul3(add3(a,b),.5),r=Math.hypot(...sub3(b,a))/2;
  const p=project(c,LV),q=project(add3(c,mul3(LV.rt,r)),LV);if(!p||!q){el.hidden=true;return;}const R=Math.max(14,Math.min(innerWidth,Math.hypot(q[0]-p[0],q[1]-p[1])));
  el.hidden=false;Object.assign(el.style,{width:2*R+'px',height:2*R+'px',left:-R+'px',top:-R+'px',transform:`translate(${p[0]}px,${p[1]}px)`});}
function newScene(){const n=CUST.filter(d=>d.kind!=='planet').length+1;
  const d={id:uid(),kind:'objects',name:'My scene'+(n>1?' '+n:''),env:{sky:'dusk',floor:'checker',sun:true,sunAngle:38,sunAz:35,fog:0,exposure:.55},
    cam:{yaw:.55,pitch:.3,dist:6.5,tx:0,ty:.6,tz:0},objs:[
      {id:uid(),type:'sphere',name:'Sphere',p:[-1.2,.6,0],s:[1.2,1.2,1.2],r:[0,0,0],mat:{kind:'matte',col:'#c8463c',rough:.2,ior:1.5,tint:.4,glow:4}},
      {id:uid(),type:'box',name:'Glass cube',p:[.9,.5,.3],s:[1,1,1],r:[25,0,0],mat:{kind:'glass',col:'#e8f2ff',rough:.2,ior:1.5,tint:.4,glow:4}}]};
  CUST.push(d);custSave(true);const k=custReg(d);bSel=null;S.scene=k;changed('scene');drawScenes();if(openP!=='build')openPane('build');else drawBuild();toast('New scene: add shapes, lights and models');}
function custDelete(d){const k='u:'+d.id;CUST.splice(CUST.indexOf(d),1);custSave(true);delete SCENES[k];delete META[k];if(UIS.lights)delete UIS.lights[k];if(UIS.views)delete UIS.views[k];saveUI();
  const used=new Set(CUST.flatMap(c=>(c.objs||[]).filter(o=>o.type==='model').map(o=>o.mesh)));
  for(const o of d.objs||[])if(o.type==='model'&&!used.has(o.mesh)){MESHES.delete(o.mesh);IDB.del(o.mesh).catch(()=>{});}
  S.scene='blue planet';changed('scene');drawScenes();toast(d.name+' deleted');}
// models: read the file, build its hierarchy, keep it, add it to the scene
async function importModel(file){const d=bScene();if(!d)return;toast('Reading '+file.name+'…');await new Promise(r=>setTimeout(r,30));
  try{const r=parseModel(file.name,await file.arrayBuffer()),id='m:'+uid(),nm=file.name.replace(/\.[^.]+$/,'');
    const m=meshAdd(id,nm,r.pos,r.idx);if(r.col)m.col=r.col;
    IDB.put(id,{name:nm,pos:m.pos,idx:m.idx,col:m.col||null}).catch(()=>{if(IDB.ok){IDB.ok=false;toast('Models can’t be saved in the browser. Export the scene to keep them.');}});
    const col=r.col?lin2hex(r.col):'#d9d4cc';bNew('model',{mesh:id,name:nm,mat:{kind:'matte',col,rough:.2,ior:1.5,tint:.4,glow:4}});
    toast(`${nm}: ${m.ntri.toLocaleString()} triangles`);}
  catch(e){toast(String(e&&e.message||e));}}
async function ensureMeshes(d){if(!d||d.kind==='planet')return;let got=0;
  for(const o of d.objs)if(o.type==='model'&&!MESHES.has(o.mesh)){try{const v=await IDB.get(o.mesh);if(v){meshAdd(o.mesh,v.name,v.pos,v.idx,{keep:true}).col=v.col;got++;}}catch(e){}}
  if(got&&custOf(S.scene)===d)bApply();}
// scene files: everything in one JSON (models inline), so a scene can move between devices
function exportScene(d){const out={format:'prism-scene',version:1,scene:JSON.parse(JSON.stringify(d)),meshes:{}};
  for(const o of d.objs||[])if(o.type==='model'){const m=MESHES.get(o.mesh);if(m)out.meshes[o.mesh]={name:m.name,col:m.col||null,pos:b64e(m.pos),idx:b64e(m.idx)};}
  savePhoto(new Blob([JSON.stringify(out)],{type:'application/json'}),d.name.replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'-')+'.json');}
async function importScene(file){try{const j=JSON.parse(await file.text());if(j.format!=='prism-scene'||!j.scene)throw new Error('Not a Prism scene file');
    const d=j.scene,map={};d.id=uid();
    for(const [id,m] of Object.entries(j.meshes||{})){const nid='m:'+uid();map[id]=nid;const pos=b64d(m.pos,Float32Array),idx=b64d(m.idx,Uint32Array);meshAdd(nid,m.name,pos,idx,{keep:true}).col=m.col;IDB.put(nid,{name:m.name,pos,idx,col:m.col}).catch(()=>{});}
    for(const o of d.objs||[])if(o.type==='model')o.mesh=map[o.mesh]||o.mesh;
    CUST.push(d);custSave(true);const k=custReg(d);S.scene=k;changed('scene');drawScenes();toast('Imported '+d.name);}
  catch(e){toast(String(e&&e.message||e));}}
const fileIn=(accept,fn)=>{const i=document.createElement('input');i.type='file';i.accept=accept;i.onchange=()=>{if(i.files[0])fn(i.files[0]);};i.click();};
// pane
const tin=(val,label,on)=>{const el=mk('div','ctl'),i=document.createElement('input');i.type='text';i.className='tin';i.value=val;i.maxLength=40;i.setAttribute('aria-label',label);
  i.onchange=()=>on(i.value.trim()||val);el.append(mk('div','lab',label),i);return el;};
const segCtl=(label,opts,cur,on)=>{const el=mk('div','ctl');if(label)el.appendChild(mk('div','lab',label));const g=mk('div','seg');g.setAttribute('role','group');
  for(const [v,t] of opts){const b=mk('button','',t);b.type='button';b.setAttribute('aria-pressed',String(cur===v));b.onclick=()=>{for(const c of g.children)c.setAttribute('aria-pressed',String(c===b));on(v);};g.appendChild(b);}
  el.appendChild(g);return el;};
function drawBuild(){const host=paneEl('build');if(!host)return;host.innerHTML='';const d=custOf(S.scene);
  if(openP==='build')$('shTitle').textContent=d?d.name:'Build';
  if(!d)return drawBuildHome(host);if(d.kind==='planet')return drawPlanetEd(host,d);drawSceneEd(host,d);}
function drawBuildHome(host){host.appendChild(mk('p','note','Make your own scenes from shapes, lights and 3D models, or design a planet system.'));
  const nr=(ic,t,s,fn)=>{const b=mk('button','navrow');b.type='button';b.innerHTML=`<svg viewBox="0 0 24 24">${ic}</svg><span><b>${t}</b><small>${s}</small></span>`;b.onclick=fn;host.appendChild(b);};
  nr(BGLY.box,'New scene','Shapes, lights and your own 3D models',newScene);
  nr('<circle cx="12" cy="12" r="5.5"/><ellipse cx="12" cy="12" rx="10" ry="3.2" transform="rotate(-18 12 12)"/>','New planet system','Worlds, moons and a star',newPlanet);
  {const b0={'blue planet':['earth','Earth'],'dust world':['mars','Mars']}[S.scene];if(b0)nr('<circle cx="12" cy="12" r="6"/><path d="M4 20l4-4"/>','Customize '+b0[1],'An editable copy of this world, every setting open',()=>customizeWorld(b0[0],b0[1]));}
  nr('<path d="M12 15V4M8 8l4-4 4 4M5 14v5h14v-5"/>','Open a scene file','A .json file exported from Prism',()=>fileIn('.json,application/json',importScene));
  if(CUST.length){host.appendChild(mk('div','eb','Your scenes'));for(const c of CUST){const r=mk('button','lrow brow');r.type='button';
    r.innerHTML=`<span class="lgl">${c.kind==='planet'?'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/></svg>':bIcon('box')}</span><span><b></b><small></small></span>`;
    r.querySelector('b').textContent=c.name;r.querySelector('small').textContent=c.kind==='planet'?(c.planets.length+' planet'+(c.planets.length>1?'s':'')):c.objs.length+' objects';
    r.onclick=()=>{S.scene='u:'+c.id;changed('scene');};host.appendChild(r);}}}
function drawSceneEd(host,d){
  host.appendChild(tin(d.name,'Scene name',v=>{d.name=v;custSave();drawScenes();$('shTitle').textContent=v;}));
  host.appendChild(mk('div','eb','Add'));const g=mk('div','addg');
  for(const t of ['sphere','box','cylinder','cone','torus','prism','pyramid','bulb','panel','model']){const b=mk('button','addb');b.type='button';b.innerHTML=bIcon(t)+`<span>${t==='model'?'Model…':BKIND[t]}</span>`;
    b.onclick=()=>t==='model'?fileIn('.obj,.stl,.ply,.glb,.gltf',importModel):bNew(t);g.appendChild(b);}
  host.appendChild(g);
  {const h=bHist.get(d.id),ur=mk('div','row-btns');const ub=btn('Undo','',bUndo);ub.disabled=!(h&&h.length);ur.appendChild(ub);host.appendChild(ur);}
  if(S.renderMode==='sdf'&&d.objs.some(o=>o.type==='model'||['cone','torus','prism','pyramid'].includes(o.type)))host.appendChild(mk('p','note','Models and faceted shapes are not drawn in SDF mode.'));
  host.appendChild(mk('div','eb',`Objects · ${d.objs.length}`));
  if(!d.objs.length)host.appendChild(mk('p','note','Empty. Add a shape above.'));
  for(const o of d.objs)host.appendChild(bRow(d,o));
  host.appendChild(mk('p','note','Tap an object to select it, then drag to move it.'));
  const sw=mk('div','ctl');sw.appendChild(segCtl('Drag snapping',[['off','Off'],['on','10 cm grid']],UIS.snap?'on':'off',v=>{UIS.snap=v==='on';saveUI();}));host.appendChild(sw);
  host.appendChild(mk('div','eb','Scene'));
  const r1=mk('div','row-btns');r1.append(btn('Use this view at start','',()=>{if(S.camMode==='fly')toOrbit();d.cam={yaw:cam.yaw,pitch:cam.pitch,dist:cam.dist,tx:cam.tx,ty:cam.ty,tz:cam.tz};SCENES[S.scene].cam=d.cam;custSave();toast('Start view saved');}),
    btn('Sky, sun and floor','',()=>openPane('look')));host.appendChild(r1);
  const r2=mk('div','row-btns');r2.append(btn('Export file','',()=>exportScene(d)),btn('Duplicate','',()=>{const c=JSON.parse(JSON.stringify(d));c.id=uid();c.name=d.name+' copy';CUST.push(c);custSave(true);const k=custReg(c);S.scene=k;changed('scene');drawScenes();}));
  let arm=0;const del=btn('Delete scene','danger',()=>{if(performance.now()-arm>3000){arm=performance.now();del.textContent='Tap again to delete';return;}custDelete(d);});r2.appendChild(del);host.appendChild(r2);}
function bRow(d,o){const open=bSel===o.id,r=mk('div','lrow'+(o.hide?' off':'')),hd=mk('div','lhead'),nb=mk('button','lname');nb.type='button';nb.setAttribute('aria-expanded',String(open));
  const isL=o.type==='bulb'||o.type==='panel',col=isL?o.light.col:o.mat.col;
  nb.innerHTML=`<i class="lgl" style="color:${col}">${bIcon(o.type)}</i><span><b></b><small></small></span>${CHEV(open)}`;nb.querySelector('b').textContent=o.name;
  const sub=()=>isL?`${BKIND[o.type]} · ${o.light.power.toFixed(1)}×`:`${BKIND[o.type]} · ${cap1(o.mat.kind)}${o.type==='model'&&MESHES.get(o.mesh)?' · '+MESHES.get(o.mesh).ntri.toLocaleString()+' triangles':''}`;
  nb.querySelector('small').textContent=sub();nb.onclick=()=>{bSel=open?null:o.id;drawBuild();if(bSel)requestAnimationFrame(()=>r.scrollIntoView({block:'nearest',behavior:'smooth'}));};hd.appendChild(nb);
  const s=mk('label','sw'),ck=document.createElement('input');ck.type='checkbox';ck.setAttribute('role','switch');ck.setAttribute('aria-label','Show '+o.name);ck.checked=!o.hide;
  ck.onchange=()=>{o.hide=!ck.checked;r.classList.toggle('off',o.hide);bApply();};s.append(ck,mk('i'));hd.appendChild(s);r.appendChild(hd);
  if(open){const ed=mk('div','ledit'),u=()=>{nb.querySelector('small').textContent=sub();bSoon();};
    ed.appendChild(tin(o.name,'Name',v=>{o.name=v;nb.querySelector('b').textContent=v;custSave();}));
    [['Left – right',0,-15,15],['Height',1,o.type==='panel'||o.type==='bulb'?0:-5,12],['Back – front',2,-15,15]].forEach(([l,i,a,b])=>ed.appendChild(rangeCtl(l,a,b,.01,o.p[i],fmtM,v=>{o.p[i]=v;u();})));
    if(isL){ed.appendChild(colorRow(o.light.col,c=>{o.light.col=c;nb.querySelector('.lgl').style.color=c;u();}));
      ed.appendChild(rangeCtl('Brightness',.5,o.type==='panel'?60:40,.5,o.light.power,fmtI,v=>{o.light.power=v;u();}));
      if(o.type==='bulb')ed.appendChild(rangeCtl('Bulb size',.04,1,.01,o.s[0],v=>fmtR(v),v=>{o.s=[v,v,v];u();}));
      else{ed.appendChild(rangeCtl('Width',.1,6,.01,o.s[0],fmtM,v=>{o.s[0]=v;u();}));ed.appendChild(rangeCtl('Depth',.1,6,.01,o.s[2],fmtM,v=>{o.s[2]=v;u();}));}}
    else{const mx=()=>Math.max(...o.s);
      ed.appendChild(rangeCtl('Size',.05,10,.01,mx(),fmtM,v=>{const k=v/mx();o.s=o.s.map(x=>+(x*k).toFixed(4));u();}));
      const adv=mk('details','adv');adv.appendChild(mk('summary','','Stretch and turn<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>'));
      [['Width',0],['Height',1],['Depth',2]].forEach(([l,i])=>adv.appendChild(rangeCtl(l,.02,10,.01,o.s[i],fmtM,v=>{o.s[i]=v;u();})));
      [['Turn',0,-180,180],['Tip forward',1,-90,90],['Roll',2,-180,180]].forEach(([l,i,a,b])=>adv.appendChild(rangeCtl(l,a,b,1,o.r[i],fmtD,v=>{o.r[i]=v;u();})));
      ed.appendChild(adv);
      const m=o.mat,mb=mk('div');
      const drawMat=()=>{mb.innerHTML='';mb.appendChild(colorRow(m.col,c=>{m.col=c;nb.querySelector('.lgl').style.color=c;u();}));
        if(m.kind==='metal')mb.appendChild(rangeCtl('Roughness',0,.6,.01,m.rough,v=>(+v).toFixed(2),v=>{m.rough=v;u();}));
        if(m.kind==='glass'){mb.appendChild(rangeCtl('Refraction',1,2.4,.01,m.ior,v=>(+v).toFixed(2),v=>{m.ior=v;u();}));mb.appendChild(rangeCtl('Tint',0,5,.05,m.tint,v=>(+v).toFixed(2),v=>{m.tint=v;u();}));}
        if(m.kind==='glow')mb.appendChild(rangeCtl('Glow',.2,40,.1,m.glow,fmtI,v=>{m.glow=v;u();}));};
      ed.appendChild(segCtl('Material',[['matte','Matte'],['metal','Metal'],['mirror','Mirror'],['glass','Glass'],['glow','Glow']],m.kind,v=>{m.kind=v;drawMat();u();}));
      drawMat();ed.appendChild(mb);
      if(o.type==='model'){ed.appendChild(segCtl('Shading',[['smooth','Smooth'],['flat','Faceted']],o.smooth===false?'flat':'smooth',v=>{o.smooth=v==='smooth';u();}));}}
    const bb=mk('div','row-btns');
    if(!isL)bb.appendChild(btn('Drop to floor','',()=>{bDrop(o);bApply();drawBuild();}));
    bb.append(btn('Look at it','',()=>{const [a,b]=bBounds(o);lookAt(mul3(add3(a,b),.5));}),btn('Duplicate','',()=>bDup(o)),btn('Delete','danger',()=>bDelete(o)));
    ed.appendChild(bb);r.appendChild(ed);}
  return r;}

