/* ---------- interface ---------- */
const $=id=>document.getElementById(id);
const cap1=s=>s[0].toUpperCase()+s.slice(1);
let paused=false,UIS={stats:false,hint:false};
try{Object.assign(UIS,JSON.parse(localStorage.getItem('prism-ui')||'{}'));}catch(e){}
const saveUI=()=>{if(wiping)return;try{localStorage.setItem('prism-ui',JSON.stringify(UIS));}catch(e){}};

const META={
 'blue planet':{cat:'Space',name:'Earth',tag:'Forests, weather, oceans, city lights',sw:'radial-gradient(circle at 40% 38%,#d6efff 0,#4b98ec 20%,#1d55b0 36%,#0b1d44 50%,#060810 54%)'},
 'dust world':{cat:'Space',name:'Mars',tag:'Canyons, craters, dusty sky',sw:'radial-gradient(circle at 40% 38%,#ffd9b0 0,#dc7a3e 20%,#7c3517 38%,#200d06 52%,#060810 55%)'},
 'ringed giant':{cat:'Space',name:'Ringed Giant',tag:'Bands, storms, ring shadows',sw:'linear-gradient(165deg,transparent 44%,rgba(235,214,172,.85) 47%,rgba(160,130,90,.6) 50%,transparent 53%),radial-gradient(circle at 50% 50%,#f3e0b6 0,#c99c64 22%,#6b4a2a 34%,#060810 38%)'},
 'black hole':{cat:'Space',name:'Black Hole',tag:'Lensing, photon ring, beaming',sw:'linear-gradient(174deg,transparent 46%,rgba(255,226,170,.95) 50%,transparent 54%),radial-gradient(circle at 50% 50%,#000 0 16%,#fff0c8 18%,#e59a48 24%,#4a210c 34%,#060810 48%)'},
 'laser lab':{cat:'Studio',name:'Laser Lab',tag:'Move the mirrors, fire lasers',sw:'linear-gradient(160deg,transparent 30%,#ff2418 31% 32.5%,transparent 33.5%),linear-gradient(20deg,transparent 52%,#ff2418 53% 54%,transparent 55%),linear-gradient(100deg,transparent 60%,rgba(255,80,80,.9) 61% 61.6%,rgba(255,220,60,.9) 62.5% 63%,rgba(60,255,120,.9) 64% 64.6%,rgba(60,160,255,.9) 65.5% 66%,transparent 67%),#07080c'},
 'optics bench':{cat:'Studio',name:'Optics Bench',tag:'Lenses and prisms, rainbow edges',sw:'radial-gradient(circle at 28% 50%,rgba(255,255,255,.6) 0 15%,rgba(255,255,255,.15) 16%,transparent 17%),linear-gradient(90deg,#f2f2f2 0 12.5%,#f2e61a 0 25%,#1ad9e6 0 37.5%,#26cc33 0 50%,#d933cc 0 62.5%,#e6261f 0 75%,#2633e6 0 87.5%,#101012 0)'},
 'cornell box':{cat:'Studio',name:'Cornell Box',tag:'The 1984 original: two blocks, one light',sw:'radial-gradient(ellipse at 50% 8%,#fff6e0 0 10%,transparent 18%),linear-gradient(90deg,#b8261d 0 18%,#d9d3c9 18% 82%,#24a03a 82%)'},
 'stained glass':{cat:'Studio',name:'Stained Glass',tag:'Colored light through panes',sw:'repeating-linear-gradient(90deg,#1b1714 0 3px,transparent 3px 22px),linear-gradient(90deg,#ff3a3a,#ff9a26,#ffe040,#40e060,#33bfff,#4d59ff,#bf4dff,#ff59bf)'},
 'glass temple':{cat:'Studio',name:'Glass Temple',tag:'Pillars around a glowing core',sw:'radial-gradient(circle at 50% 50%,#fff0c0 0,#ff9a3a 8%,transparent 20%),repeating-linear-gradient(90deg,rgba(255,120,120,.5) 0 8px,transparent 8px 20px,rgba(120,200,255,.5) 20px 28px,transparent 28px 40px),#2a2420'},
};
const sceneName=k=>(custOf(k)&&custOf(k).name)||(META[k]||{}).name||cap1(k);
const MDESC={
 path:'Every bounce of light. Noisy at first, then exact.',
 hybrid:'Exact mirrors and glass plus one denoised bounce. Clean fast.',
 whitted:'Exact mirrors, glass and hard shadows. No bounce light.',
 raster:'Like a game engine: direct light only, no shadows. Fastest.',
 sdf:'Distance-field marching with soft shadows. No refraction.'};
const isPlanet=()=>isCosmos()&&SCENES[S.scene].cosmos.kind<2, isKind=k=>()=>isCosmos()&&SCENES[S.scene].cosmos.kind===k;
const obj=()=>!isCosmos(),cos=()=>isCosmos(),mode=m=>()=>!isCosmos()&&S.renderMode===m;
const pct=v=>Math.round(v*100)+'%',deg=v=>Math.round(v)+'°';
const REBUILD=new Set(['bounces','atmSteps','terrainOct','bhSteps','scale']);   // apply on release, not on every drag step

// control specs
const RG=(k,label,min,max,step,fmt,o={})=>({t:'range',k,label,min,max,step,fmt,...o});
// time speeds for the world clock: real time up to a day per second
const TSPD=[1,2,5,10,30,60,120,300,600,1800,3600,7200,21600,43200,86400];
const tspdIdx=v=>{let b=0;TSPD.forEach((x,i)=>{if(Math.abs(Math.log(x/(v||1)))<Math.abs(Math.log(TSPD[b]/(v||1))))b=i;});return b;};
const tspdTxt=v=>v===1?'Real time':v<60?v+'×':v<3600?(v/60)+' min per second':v<86400?(v/3600)+' h per second':'1 day per second';
const SW=(k,label,o={})=>({t:'switch',k,label,...o});
const SG=(k,label,opts,o={})=>({t:'seg',k,label,opts,...o});
const EB=(label,o={})=>({t:'eb',label,...o});
const NT=(text,o={})=>({t:'note',text,...o});
const ADV=(items,o={})=>({t:'adv',items,...o});
const PANES={
 render:[
  SG('preset','Quality preset',[...PORDER.map(p=>[p,pName(p)]),['custom','Custom']]),
  NT(()=>({potato:'For older phones. Soft but smooth.',
    battery:'30 fps cap to save battery.',
    balanced:'Good default for most phones.',
    quality:'Sharper, for newer devices.',
    ultra:'Best overall. Clear even while moving.',
    pc:'For desktop graphics cards: everything at full detail and range.',
    cinematic:'Best for still shots. Adds depth of field and dispersion.',
    custom:'Your own settings.'})[S.preset]||''),
  SG('renderMode','Rendering method',MODES.map(m=>[m[0],m[2]]),{when:obj}),
  NT(()=>MDESC[S.renderMode],{when:obj}),
  NT(()=>'Space scenes use their own ray marcher.',{when:cos}),
  EB('Resolution'),
  RG('scale','Render scale',.2,1,.05,pct),
  SW('upscale','Sharp upscaling',{help:'Renders fewer pixels and rebuilds a sharp full image from recent frames. Hybrid only.'}),
  SW('adaptive','Adaptive resolution',{help:'Adjusts render scale to hold the target frame rate.'}),
  RG('target','Target frame rate',20,60,5,v=>v+' fps',{when:()=>S.adaptive}),
  EB('Light'),
  RG('bounces','Bounces',1,8,1,null,{when:obj}),
  SG('giRate','Indirect light traced on',[['1/1','Every pixel'],['1/2','Half'],['1/4','Quarter']],{when:mode('hybrid'),help:'Fewer pixels per frame is faster.'}),
  RG('spp','Samples per frame',1,4,1,null,{when:mode('path')}),
  RG('sdfSteps','March steps',32,400,8,null,{when:mode('sdf')}),
  RG('atmSteps','Atmosphere samples',4,32,2,null,{when:isPlanet}),
  RG('terrainOct','Terrain and cloud detail',2,8,1,v=>v+' octaves',{when:isPlanet}),
  RG('bhSteps','Light-path steps',40,400,10,null,{when:isKind(2)}),
  EB('Noise'),
  SW('reproj','Reuse earlier frames while moving',{when:()=>!isCosmos()}),
  RG('denoise','Denoiser strength',0,1,.05,pct,{when:()=>!isDet()}),
  ADV([
   SG('fpsCap','Frame rate cap',[['unlimited','Off'],['60','60'],['45','45'],['30','30'],['20','20']]),
   RG('motionBounces','Bounces while moving',1,8,1,null,{when:mode('path')}),
   RG('neeDepth','Diffuse bounces with direct light',1,8,1,null,{when:mode('path')}),
   SW('ssCache','Reuse on-screen lighting for bounces',{when:mode('hybrid')}),
   SW('restir','Reuse light samples (ReSTIR)',{when:mode('hybrid'),help:'Shares light samples between pixels and frames. Lamps clean up faster.'}),
   RG('tBlend','History while moving',.02,.5,.01,v=>'≈'+Math.round(2/v-1)+' frames',{help:'Longer is smoother; shorter reacts faster.'}),
   RG('dnFade','Denoiser fades out after',8,512,8,v=>v+' samples',{when:()=>!isDet()}),
   SW('accum','Keep refining when still'),
   RG('maxAcc','Stop refining after',16,2048,16,v=>v+' frames',{when:()=>S.accum}),
  ]),
  {t:'html',html:'<button class="navrow" id="goCmp" type="button"><svg viewBox="0 0 24 24"><path d="M5 20v-8M11 20V5M17 20v-5M2.5 20.5h19"/></svg><span><b>Compare methods</b><small>Time and score every method on this scene</small></span><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>',when:obj},
  {t:'html',html:'<button class="navrow" id="goBench" type="button"><svg viewBox="0 0 24 24"><path d="M12 13l4-4M3.5 17a9 9 0 1 1 17 0"/><circle cx="12" cy="13" r="1.5"/></svg><span><b>Performance survey</b><small>Benchmark this device and choose whether to share the results</small></span><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>'},
  {t:'html',html:'<button class="navrow danger" id="goWipe" type="button"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4"/></svg><span><b>Reset everything</b><small>Erase all saved settings and start fresh</small></span></button><p class="credit"><span class="ver"></span> · made by AAxeL08</p>'}],
 look:[
  EB('Light',{when:()=>(obj()&&!SCENES[S.scene].force)||isPlanet()}),
  NT(()=>'The Cornell box sits in a black void, so these are fixed.',{when:()=>!!SCENES[S.scene].force}),
  SW('cbMirror','Mirror tall block',{when:()=>S.scene==='cornell box',help:'Off is the 1984 original. On is the later mirrored version.'}),
  SW('sun','Sun',{when:()=>obj()&&!SCENES[S.scene].force}),
  RG('sunAngle','Sun height',-180,180,1,deg,{when:()=>obj()?S.sun&&!SCENES[S.scene].force:isPlanet()}),
  RG('sunAz','Sun direction',-180,180,1,deg,{when:()=>obj()?S.sun&&!SCENES[S.scene].force:isPlanet()}),
  SG('sky','Sky',[['dusk','Dusk'],['noon','Noon'],['night','Night'],['studio','Studio'],['void','Black']],{when:()=>obj()&&!SCENES[S.scene].force}),
  RG('fog','Fog',0,.08,.002,v=>v?v.toFixed(3):'Off',{when:()=>obj()&&!SCENES[S.scene].force}),
  SG('floor','Floor',[['checker','Checker'],['matte','Matte'],['mirror','Mirror'],['wet','Wet'],['none','None']],{when:()=>obj()&&!SCENES[S.scene].force}),
  EB('Materials',{when:obj}),
  RG('glassIOR','Glass refraction',1,2.4,.01,v=>v.toFixed(2),{when:obj}),
  RG('glassDensity','Glass tint',0,5,.1,v=>v.toFixed(1),{when:obj}),
  RG('rough','Metal roughness',0,.6,.01,v=>v.toFixed(2),{when:obj}),
  SW('dispersion','Rainbow dispersion in glass',{when:()=>obj()&&['path','hybrid','whitted'].includes(S.renderMode),help:'Glass splits light into rainbow colors.'}),
  EB('Atmosphere',{when:isPlanet}),
  RG('atmDensity','Air density',0,4,.1,v=>v.toFixed(1)+'×',{when:isPlanet}),
  SW('clouds','Clouds',{when:()=>isPlanet()&&!custOf(S.scene)&&!!SCENES[S.scene].cosmos.clouds}),
  RG('cloudCover','Cloud cover',0,1,.01,pct,{when:()=>isPlanet()&&!custOf(S.scene)&&!!SCENES[S.scene].cosmos.clouds&&S.clouds}),
  SW('cityLights','City lights on the night side',{when:()=>isPlanet()&&!!SCENES[S.scene].cosmos.city}),
  NT(()=>'Edit this world in Build.',{when:()=>isPlanet()&&!!custOf(S.scene)}),
  EB('Accretion disk',{when:isKind(2)}),
  SW('doppler','Relativistic beaming',{when:isKind(2),help:'The side moving toward you is brighter and bluer.'}),
  RG('diskBright','Disk brightness',.2,3,.05,v=>v.toFixed(2),{when:isKind(2)}),
  EB('Motion'),
  SW('animate','Animate',{help:'Runs time: motion, planet spin, clouds and weather.'}),
  RG('timeSpeedI','Time speed',0,TSPD.length-1,1,i=>tspdTxt(TSPD[i]),{when:()=>isPlanet()&&peOn(),get:()=>tspdIdx(S.timeSpeed),set:i=>{S.timeSpeed=TSPD[i];save();},
    help:'1× is real time. Higher speeds are a time-lapse.'}),
  RG('starBoost','Star brightness',0,17,.5,v=>v?'+'+v+' stops':'Real',{when:cos,help:'Real is true to life. Each stop doubles brightness.'})],
 photo:[
  SG('photoAspect','Aspect ratio',[['screen','Screen'],['1:1','1:1'],['4:5','4:5'],['3:4','3:4'],['2:3','2:3'],['9:16','9:16'],['3:2','3:2'],['16:9','16:9'],['21:9','21:9']]),
  SG('photoRes','Size (long edge)',[['1080','1080'],['2048','2K'],['3072','3K'],['4096','4K']]),
  SG('photoQ','Quality',[['32','Draft'],['128','Good'],['512','Best'],['2048','Max']],{help:'Frames averaged per pixel. More frames, less noise.'}),
  SG('photoFmt','Format',[['jpg','JPEG'],['png','PNG']]),
  SG('fovAxis','Field of view measured across',[['short','Short side'],['vertical','Height'],['horizontal','Width']],{help:'Which side of the frame the field of view measures.'}),
  RG('fov','Field of view',25,100,1,deg,{when:()=>S.proj==='persp'||S.proj==='ortho'}),
  NT(()=>photoInfo()),
  {t:'html',html:'<div class="row-btns"><button class="btn primary" id="ppTake" type="button">Take photo</button></div>'}],
 camera:[
  {t:'sub',k:'camSub',opts:[['move','Move'],['lens','Lens'],['exposure','Exposure']]},
  {t:'html',html:'<dl class="readout" id="camInfo"></dl>'},
  // move
  SG('camMode','Camera',[['orbit','Orbit'],['fly','Fly']],{sub:'move'}),
  NT(()=>S.camMode==='fly'?(coarse?'Stick moves, ▲ ▼ rise and sink, drag to look, pinch to step.':'WASD moves, Q/E sink and rise, Shift is faster, drag to look.'):'Drag to orbit, pinch or scroll to zoom'+(coarse?', two fingers to pan.':', right-drag to pan.'),{sub:'move'}),
  SG('autoMove','Auto motion',[['off','Off'],['turntable','Turntable'],['flyby','Flyby'],['handheld','Handheld']],{sub:'move',help:'Flyby sweeps around the scene. Handheld adds a gentle sway.'}),
  RG('moveSpeed','Motion speed',.25,3,.05,v=>v.toFixed(2)+'×',{sub:'move',when:()=>S.autoMove!=='off'}),
  RG('flySpeed','Fly speed',.2,10,.1,v=>v.toFixed(1),{sub:'move',when:()=>S.camMode==='fly'}),
  EB('Shots',{sub:'move'}),
  {t:'html',sub:'move',html:'<div class="seg" id="shots"><button data-shot="front">Front</button><button data-shot="side">Side</button><button data-shot="top">Top</button><button data-shot="low">Low</button><button data-shot="close">Close</button><button data-shot="wide">Wide</button></div>'},
  EB('Saved views',{sub:'move'}),
  {t:'html',sub:'move',html:'<div class="views" id="views"></div>'},
  {t:'html',sub:'move',html:'<div class="row-btns"><button class="btn" id="bReset">Reset view</button><button class="btn" id="bHelp">Controls</button><button class="btn" id="bFull" hidden>Full screen</button></div>'},

  ADV([
  SW('inertia','Momentum after a swipe',{sub:'move',when:()=>S.camMode==='orbit'}),
  RG('lookSens','Drag sensitivity',.3,3,.05,v=>v.toFixed(2)+'×',{sub:'move'}),
  EB('Position',{sub:'move',when:()=>S.camMode==='orbit'}),
  {t:'range',k:'cDist',label:'Distance',sub:'move',when:()=>S.camMode==='orbit',min:0,max:1,step:.001,
    rng:()=>{const co=SCENES[S.scene].cosmos;return co&&co.kind===0?[-4.7,1.48,.005]:[Math.log10(co?(co.kind===1?1.25:2.6):1.5),Math.log10(co?150:40),.005];},
    get:()=>{const co=SCENES[S.scene].cosmos;return co&&co.kind===0?Math.log10(Math.max(1e-5,cam.dist-1)):Math.log10(cam.dist);},
    set:v=>{const co=SCENES[S.scene].cosmos;cam.dist=co&&co.kind===0?1+Math.pow(10,v):Math.pow(10,v);tween=null;inert=null;fbBase();nudge();},
    fmt:v=>{const co=SCENES[S.scene].cosmos;if(co&&co.kind===0){const km=Math.pow(10,v)*6371;return km<1?Math.round(km*1000)+' m up':(km<100?km.toFixed(1):Math.round(km).toLocaleString())+' km up';}return Math.pow(10,v).toFixed(1);}},
  {t:'range',k:'cYaw',label:'Orbit angle',sub:'move',when:()=>S.camMode==='orbit',min:-180,max:180,step:1,
    get:()=>{let d=cam.yaw*180/Math.PI%360;if(d>180)d-=360;if(d<-180)d+=360;return d;},set:v=>{cam.yaw=v*Math.PI/180;tween=null;inert=null;fbBase();nudge();},fmt:deg},
  {t:'range',k:'cPitch',label:'Height angle',sub:'move',when:()=>S.camMode==='orbit',min:-85,max:85,step:1,
    rng:()=>isCosmos()?[-85,85,1]:[-17,85,1],get:()=>cam.pitch*180/Math.PI,set:v=>{cam.pitch=clampPitch(v*Math.PI/180);tween=null;inert=null;fbBase();nudge();},fmt:deg},
  {t:'range',k:'cTy',label:'Target height',sub:'move',when:()=>S.camMode==='orbit'&&obj(),min:-1,max:6,step:.05,
    get:()=>cam.ty,set:v=>{cam.ty=v;tween=null;nudge();},fmt:v=>(+v).toFixed(2)},
  RG('roll','Roll',-45,45,1,v=>Math.round(v)+'°',{sub:'move'}),
  ],{sub:'move'}),
  // lens
  SG('proj','Projection',[['persp','Perspective'],['fisheye','Fisheye'],['pano','360°'],['ortho','Orthographic']],{sub:'lens',help:'Fisheye, 360° and orthographic turn off depth of field.'}),
  RG('fov','Field of view',25,100,1,deg,{sub:'lens',when:()=>S.proj==='persp'||S.proj==='ortho'}),
  SG('fovAxis','Field of view measured across',[['short','Short side'],['vertical','Height'],['horizontal','Width']],{sub:'lens',when:()=>S.proj==='persp'||S.proj==='ortho'}),
  RG('fishFov','Fisheye angle',100,240,5,deg,{sub:'lens',when:()=>S.proj==='fisheye'}),
  EB('Focus',{sub:'lens',when:()=>obj()&&S.proj==='persp'}),
  NT(()=>'Depth of field needs an object scene and the normal lens.',{sub:'lens',when:()=>!(obj()&&S.proj==='persp')}),
  RG('aperture','Aperture (blur amount)',0,.4,.01,v=>v?v.toFixed(2):'Off',{sub:'lens',when:()=>obj()&&S.proj==='persp'}),
  SG('focusMode','Focus mode',[['manual','Manual'],['center','Center AF'],['multi','Multi-point'],['tap','Tap to focus'],['target','Track target']],{sub:'lens',when:dofOn,
    help:'Center: the middle. Multi-point: picks a subject. Tap: where you tap. Track: the orbit target.'}),
  SG('afPoints','AF points',[['9','9'],['15','15'],['35','35']],{sub:'lens',when:()=>dofOn()&&S.focusMode==='multi'}),
  SG('afPriority','Subject priority',[['near','Nearest'],['center','Center first']],{sub:'lens',when:()=>dofOn()&&S.focusMode==='multi',help:'Which subject autofocus prefers.'}),
  RG('focus','Focus distance',.3,25,.1,v=>(+v).toFixed(1),{sub:'lens',when:()=>dofOn()&&S.focusMode==='manual'}),
  RG('afSpeed','Focus speed',.5,20,.5,v=>(+v).toFixed(1)+'×',{sub:'lens',when:()=>dofOn()&&S.focusMode!=='manual'}),
  SG('blades','Bokeh shape',[['0','Round'],['5','5 blades'],['6','6 blades'],['8','8 blades']],{sub:'lens',when:dofOn}),
  SW('anamorphic','Anamorphic (oval bokeh)',{sub:'lens',when:dofOn}),
  SW('showFocus','Show focus box',{sub:'lens',when:()=>dofOn()&&S.focusMode!=='manual'}),
  // exposure
  SG('aeMode','Exposure mode',[['manual','Manual'],['average','Average'],['center','Center'],['spot','Spot'],['highlight','Highlights']],{sub:'exposure',
    help:'Auto modes adjust like an eye. Highlights keeps bright areas from clipping.'}),
  RG('exposure','Exposure',-6,15,.1,v=>{const x=Math.pow(2,v);return x<10?x.toFixed(2)+'×':x<1e3?Math.round(x)+'×':(x/1e3).toFixed(x<1e4?1:0)+'k×';},
    {sub:'exposure',when:()=>S.aeMode==='manual',get:()=>Math.log2(Math.max(S.exposure,1e-4)),set:v=>{S.exposure=+Math.pow(2,v).toPrecision(3);changed('exposure');},
     help:'Each step doubles or halves the light.'}),
  RG('ev','Compensation',-3,3,.1,v=>(v>0?'+':v<0?'−':'±')+Math.abs(v).toFixed(1)+' EV',{sub:'exposure',when:()=>isAE()}),
  RG('aeSpeed','Adaptation speed',.2,10,.1,v=>(+v).toFixed(1)+'×',{sub:'exposure',when:()=>isAE()}),
  SG('tonemap','Tone mapping',[['camera','Camera'],['aces','Filmic'],['reinhard','Soft'],['none','Clip']],{sub:'exposure',help:'Camera keeps the color of bright lights, like a photo. Filmic bleaches them toward white.'}),
  SG('drMode','Dynamic range',[['phone','Phone'],['pro','Pro camera'],['eye','Eye'],['ideal','Unlimited']],{sub:'exposure',
    help:'Shadow detail and glare from bright light. Bright planets hide the stars, as in real photos.'}),
  RG('bloom','Bloom',0,1,.05,pct,{sub:'exposure',when:()=>fExt,help:'Soft glow around bright lights, from light scattered in the lens.'}),
  EB('Color and film',{sub:'exposure'}),
  RG('wb','White balance',2500,10000,100,v=>Math.round(v)+' K',{sub:'exposure',help:'Lower is cooler, higher is warmer. 6500 K is neutral.'}),
  RG('wbAdapt','Adapt to daylight',0,1,.01,v=>Math.round(v*100)+'%',{sub:'exposure',help:'On planets, adapts the camera to local daylight, like rover photos. 100%: midday light looks white. 0%: raw light.'}),
  RG('localTM','Local tone mapping',0,1,.01,v=>Math.round(v*100)+'%',{sub:'exposure',help:'Like the eye or phone HDR: brightens dark areas under a bright sky. 0% is a plain camera.'}),
  RG('wbAuto','Auto white balance',0,1,.01,v=>Math.round(v*100)+'%',{sub:'exposure',help:'Removes the scene’s overall warm or cool cast, like a phone camera. 0% keeps natural color.'}),
  RG('sat','Saturation',0,2,.05,pct,{sub:'exposure'}),
  RG('chromab','Chromatic aberration',0,1,.05,pct,{sub:'exposure',help:'Red and blue color fringes toward the edges of the frame, like a real lens.'}),
  RG('vignette','Vignette',0,1,.05,pct,{sub:'exposure',help:'Natural lens darkening toward the corners. Stronger with wide angles.'}),
  RG('grain','Sensor noise',0,1,.05,pct,{sub:'exposure',help:'Grain like a real sensor, stronger in shadows.'})]
};

const ctl={},rows=[];const reg=(k,f)=>{(ctl['_'+k]=ctl['_'+k]||[]).push(f);ctl[k]=()=>ctl['_'+k].forEach(g=>g());};
function mk(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;}
function buildCtl(c,host){
  let el;
  if(c.t==='sub'){el=mk('div','seg subtabs');el.setAttribute('role','tablist');UIS[c.k]=UIS[c.k]||c.opts[0][0];
    for(const [v,l] of c.opts){const b=mk('button','',l);b.type='button';b.dataset.v=v;b.onclick=()=>{UIS[c.k]=v;saveUI();ctl[c.k]();refreshVis();$('panes').scrollTop=0;};el.appendChild(b);}
    reg(c.k,()=>{for(const b of el.children)b.setAttribute('aria-pressed',String(b.dataset.v===UIS[c.k]));});}
  else if(c.t==='eb'){el=mk('div','eb',c.label);}
  else if(c.t==='note'){el=mk('div','note');reg('_note',()=>el.textContent=c.text());}
  else if(c.t==='html'){el=mk('div','',c.html);}
  else if(c.t==='adv'){el=mk('details','adv');el.appendChild(mk('summary','','More settings<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>'));c.items.forEach(i=>buildCtl(i,el));}
  else{
    el=mk('div','ctl');const id='s_'+c.k+'_'+rows.length;
    if(c.t==='range'){
      const lab=mk('label','lab');lab.htmlFor=id;lab.append(c.label);const out=mk('output');lab.appendChild(out);
      const r=document.createElement('input');r.type='range';r.id=id;r.min=c.min;r.max=c.max;r.step=c.step;
      const show=v=>{out.textContent=c.fmt?c.fmt(+v):(+v).toString();r.style.setProperty('--p',((v-+r.min)/(+r.max-+r.min)*100)+'%');};
      r.oninput=()=>{show(r.value);if(c.set){c.set(+r.value);return;}if(!REBUILD.has(c.k)){S[c.k]=+r.value;changed(c.k);}};
      r.onchange=()=>{if(!c.set&&REBUILD.has(c.k)){S[c.k]=+r.value;changed(c.k);}};
      reg(c.k,()=>{if(c.rng){const [a,b,st]=c.rng();r.min=a;r.max=b;r.step=st;}if(c.set&&document.activeElement===r)return;const v=c.get?c.get():S[c.k];r.value=v;show(v);});el.append(lab,r);
    }else if(c.t==='switch'){
      const w=mk('label','swr');w.htmlFor=id;w.append(c.label);const s=mk('span','sw');
      const i=document.createElement('input');i.type='checkbox';i.setAttribute('role','switch');i.id=id;s.append(i,mk('i'));w.appendChild(s);
      i.onchange=()=>{S[c.k]=i.checked;changed(c.k);};reg(c.k,()=>i.checked=!!S[c.k]);el.appendChild(w);
    }else if(c.t==='seg'){
      el.appendChild(mk('div','lab',c.label));const g=mk('div','seg');g.setAttribute('role','group');g.setAttribute('aria-label',c.label);
      for(const [v,l] of c.opts){const b=mk('button','',l);b.type='button';b.dataset.v=v;
        if(c.k==='preset'&&v==='custom')b.disabled=true;
        b.onclick=()=>{if(S[c.k]===v&&c.k!=='preset')return;S[c.k]=v;changed(c.k);};g.appendChild(b);}
      reg(c.k,()=>{for(const b of g.children)b.setAttribute('aria-pressed',String(b.dataset.v===String(S[c.k])));});el.appendChild(g);
    }
    if(c.help)el.appendChild(mk('div','help',c.help));
  }
  if(c.when||c.sub){const w=c.when;rows.push([el,c.sub?()=>UIS.camSub===c.sub&&(!w||w()):w]);}
  host.appendChild(el);
}
const paneEl=p=>document.querySelector(`.pane[data-p="${p}"]`);
for(const p in PANES)PANES[p].forEach(c=>buildCtl(c,paneEl(p)));
function refreshVis(){for(const [el,w] of rows)el.hidden=!w();ctl._note&&ctl._note();}

// scene cards (built in, then yours)
function drawScenes(){const host=paneEl('scenes');host.innerHTML='';
 for(const d of CUST){const k='u:'+d.id,pl=d.kind==='planet';let sw;
   if(pl){const q=d.planets[d.cur||0]||{};const c=q.type==='gas'?(q.gas||{}).c1||'#c99c64':(q.surf||{}).low||'#2d6a3a';sw=`radial-gradient(circle at 40% 38%,#fff6 0,${c} 22%,#0b1220 52%,#060810 56%)`;}
   else{const cs=d.objs.filter(o=>o.mat).slice(0,4).map(o=>o.mat.col);sw=`linear-gradient(135deg,${(cs.length?cs:['#556']).concat(cs.length===1?cs:[]).join(',')})`;}
   META[k]={cat:'Mine',name:d.name,tag:pl?`${d.planets.length} planet${d.planets.length>1?'s':''} · your system`:`${d.objs.length} object${d.objs.length===1?'':'s'} · your scene`,sw};}
 for(const cat of ['Mine','Space','Studio']){
  const ks=Object.keys(SCENES).filter(k=>(META[k]||{cat:'Studio'}).cat===cat);
  host.appendChild(mk('div','eb',{Mine:'Your scenes',Space:'Space · ray-marched',Studio:'Studio · light and glass'}[cat]));
  const g=mk('div','cards');
  for(const k of ks){const m=META[k]||{name:cap1(k),tag:'',sw:'#222'},b=mk('button','card');b.type='button';b.dataset.s=k;
    const sw=mk('div','swc');sw.style.background=m.sw;b.append(sw,mk('b','',''),mk('small','',''));b.children[1].textContent=m.name;b.children[2].textContent=m.tag;
    b.onclick=()=>{if(S.scene===k)return;S.scene=k;changed('scene');toast(m.name);};g.appendChild(b);}
  if(cat==='Mine')for(const [t,sub,fn] of [['New scene','Shapes, lights, models',newScene],['New planet','Worlds, moons, a star',newPlanet]]){const b=mk('button','card addcard');b.type='button';
    b.innerHTML=`<div class="swc"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div><b>${t}</b><small>${sub}</small>`;b.onclick=fn;g.appendChild(b);}
  host.appendChild(g);}
 for(const b of host.querySelectorAll('.card[data-s]'))b.setAttribute('aria-pressed',String(b.dataset.s===S.scene));}
drawScenes();reg('scene',()=>{for(const b of paneEl('scenes').querySelectorAll('.card[data-s]'))b.setAttribute('aria-pressed',String(b.dataset.s===S.scene));});

// compare pane
paneEl('compare').innerHTML=`<p class="note">Times every method and scores it against a path-traced reference. Takes about 30 seconds.</p>
<div class="row-btns"><button class="btn primary" id="cmpRun">Run comparison</button></div>
<div id="cmpProg" hidden><div class="prog"><i id="cmpBar"></i></div><div id="cmpMsg"></div></div><div id="cmpOut"></div>`;
$('cmpRun').onclick=()=>runBench();$('goCmp').onclick=()=>openPane('compare');
{let armT=0;$('goWipe').onclick=()=>{const b=$('goWipe'),sm=b.querySelector('small'),now=performance.now();
  if(now-armT>4000){armT=now;b.classList.add('arm');sm.textContent='Tap again to erase everything and reload';
    setTimeout(()=>{if(performance.now()-armT>=3900){b.classList.remove('arm');sm.textContent='Erase all saved settings and start fresh';}},4000);return;}
  wiping=true;try{for(const k of Object.keys(localStorage))if(/^prism/.test(k))localStorage.removeItem(k);}catch(e){}try{indexedDB.deleteDatabase('prism');}catch(e){}setTimeout(()=>location.reload(),150);};}

// gestures (touch vs pointer wording)
const coarse=matchMedia('(pointer:coarse)').matches;
const GEST=coarse?[['1 finger drag','Orbit around the scene'],['Pinch','Zoom in and out'],['2 finger drag','Pan (object scenes)'],['Double-tap','Reset the view'],['Tap','Close this panel']]
  :[['Drag','Orbit around the scene'],['Scroll','Zoom in and out'],['Right-drag','Pan (object scenes)'],['Space · H · R','Pause · hide · reset'],['1 – 5','Open a panel']];
const gestHTML=GEST.map(([a,b])=>`<kbd>${a}</kbd><span>${b}</span>`).join('');
$('hintList').innerHTML=gestHTML;$('bHelp').onclick=()=>{closePane();$('hint').hidden=false;};
$('bReset').onclick=()=>{resetView();toast('View reset');};
function shot(n){const b=SCENES[S.scene].cam||CAM0,co=SCENES[S.scene].cosmos,c=co&&co.kind===0,D=d=>c?1+(b.dist-1)*d:b.dist*d;
  const T={front:{yaw:b.yaw,pitch:c?.15:.12,dist:D(1)},side:{yaw:b.yaw+Math.PI/2,pitch:c?.15:.12,dist:D(1)},top:{yaw:cam.yaw,pitch:1.42,dist:D(1.1)},
    low:{yaw:cam.yaw,pitch:co?-.35:.02,dist:D(.85)},close:{yaw:cam.yaw,pitch:cam.pitch,dist:D(c?.35:.5)},wide:{yaw:cam.yaw,pitch:cam.pitch,dist:D(1.7)}}[n];
  tweenTo({...T,tx:b.tx,ty:b.ty,tz:b.tz});}
for(const b of document.querySelectorAll('#shots button')){b.type='button';b.onclick=()=>shot(b.dataset.shot);}
UIS.views=UIS.views||{};
function drawViews(){const v=UIS.views[S.scene]||[];$('views').innerHTML=[0,1,2].map(i=>`<div class="vslot"><span>View ${i+1}</span><button data-go="${i}" ${v[i]?'':'disabled'}>Go</button><button data-save="${i}">${v[i]?'Replace':'Save'}</button></div>`).join('');
  for(const b of $('views').querySelectorAll('[data-save]'))b.onclick=()=>{const l=UIS.views[S.scene]=UIS.views[S.scene]||[];if(S.camMode==='fly')toOrbit();
    l[+b.dataset.save]={yaw:cam.yaw,pitch:cam.pitch,dist:cam.dist,tx:cam.tx,ty:cam.ty,tz:cam.tz,roll:S.roll,fov:S.fov};saveUI();drawViews();toast('Saved as view '+(+b.dataset.save+1));};
  for(const b of $('views').querySelectorAll('[data-go]'))b.onclick=()=>{const w=(UIS.views[S.scene]||[])[+b.dataset.go];if(!w)return;
    if(S.roll!==w.roll||S.fov!==w.fov){S.roll=w.roll;S.fov=w.fov;ctl.roll();ctl.fov();save();}tweenTo(w);};}
reg('scene',drawViews);
// joystick for fly mode on touch screens
{const ring=$('joyRing'),knob=$('joyKnob');let id=null;
 const mv=e=>{const b=ring.getBoundingClientRect(),x=e.clientX-b.left-b.width/2,y=e.clientY-b.top-b.height/2,R=b.width/2-14,l=Math.hypot(x,y),k=l>R?R/l:1;
   knob.style.transform=`translate(${x*k}px,${y*k}px)`;joy.x=x*k/R;joy.y=-y*k/R;};
 ring.addEventListener('pointerdown',e=>{id=e.pointerId;ring.setPointerCapture(id);mv(e);});
 ring.addEventListener('pointermove',e=>{if(e.pointerId===id)mv(e);});
 const end=e=>{if(e.pointerId!==id)return;id=null;knob.style.transform='';joy.x=joy.y=0;};ring.addEventListener('pointerup',end);ring.addEventListener('pointercancel',end);
 for(const [b,v] of [[$('joyU'),1],[$('joyD'),-1]]){b.addEventListener('pointerdown',e=>{b.setPointerCapture(e.pointerId);joy.u=v;});const z=()=>{joy.u=0;};b.addEventListener('pointerup',z);b.addEventListener('pointercancel',z);}}
const joyVis=()=>{$('joy').hidden=!(S.camMode==='fly'&&coarse);};
addEventListener('keydown',e=>{if(S.camMode!=='fly'||e.target.tagName==='INPUT'&&e.target.type!=='checkbox')return;
  if(/^(Key[WASDQE]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(e.code)){keys.add(e.code);if(e.code.startsWith('Arrow'))e.preventDefault();}});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
// focus box: where the lens is focusing, green once it has locked
function project(P,V){const v=sub3(P,V.eye),z=dot3(v,V.fw);if(z<=.01)return null;const tf=viewTan(),m=Math.min(innerWidth,innerHeight)/2;
  return [innerWidth/2+dot3(v,V.rt)/z/tf*m,innerHeight/2-dot3(v,V.up)/z/tf*m];}
function afGridDraw(){const g=$('afGrid'),on=S.showFocus&&dofOn()&&S.focusMode==='multi';g.hidden=!on;if(!on)return;
  const pts=afPts.length?afPts:afGrid().map(([x,y])=>({x,y,d:null}));if(g.children.length!==pts.length)g.innerHTML=pts.map(()=>'<i></i>').join('');
  const m=Math.min(innerWidth,innerHeight)/2,sel=afPts[afSel],lock=Math.abs(curFocus-focusTgt)<focusTgt*.02;
  pts.forEach((p,i)=>{const e=g.children[i];e.style.transform=`translate(${innerWidth/2+p.x*m}px,${innerHeight/2-p.y*m}px)`;
    const act=sel&&p.d&&Math.abs(p.d-sel.d)<sel.d*.06;e.className=act?(lock?'on ok':'on'):'';});}
function afBox(){const el=$('af');afGridDraw();if(!(S.showFocus&&dofOn()&&S.focusMode!=='manual'&&S.focusMode!=='multi'&&LV)){el.hidden=true;return;}
  let p=null;if(S.focusMode==='center')p=[innerWidth/2,innerHeight/2];else if(S.focusMode==='tap')p=focusPt&&project(focusPt,LV);
  else if(S.camMode==='orbit')p=project([cam.tx,cam.ty,cam.tz],LV);else p=[innerWidth/2,innerHeight/2];
  if(!p){el.hidden=true;return;}el.hidden=false;el.style.transform=`translate(${p[0]}px,${p[1]}px)`;el.classList.toggle('ok',Math.abs(curFocus-focusTgt)<focusTgt*.02);}
if(document.fullscreenEnabled){$('bFull').hidden=false;$('bFull').onclick=()=>{(document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()).catch(()=>toast('Full screen is not available here'));};}

// sheet + dock
const sheet=$('sheet');let openP=null;
const TITLES={photo:'Photo',scenes:'Scenes',render:'Render',look:'Look',camera:'Camera',compare:'Compare methods',bench:'Performance survey',lights:'Lights and lasers',build:'Build'};
function openPane(p){
  if(openP===p){closePane();return;}
  openP=p;for(const el of document.querySelectorAll('.pane'))el.hidden=el.dataset.p!==p;
  for(const t of document.querySelectorAll('.tab'))t.setAttribute('aria-selected',String(t.dataset.p===p||((p==='compare'||p==='bench')&&t.dataset.p==='render')));
  if(p==='lights')drawLights();
  if(p==='build')drawBuild();
  $('shTitle').textContent=p==='lights'&&SCENES[S.scene].lab?'Laser lab':p==='build'&&custOf(S.scene)?custOf(S.scene).name:TITLES[p];sheet.classList.add('open');document.body.classList.add('sheet-open');$('panes').scrollTop=0;refreshVis();
  if(!$('stats').hidden&&narrow())setStats(false);
}
function closePane(){openP=null;sheet.classList.remove('open');document.body.classList.remove('sheet-open');
  for(const t of document.querySelectorAll('.tab'))t.setAttribute('aria-selected','false');}
for(const t of document.querySelectorAll('.tab'))t.onclick=()=>openPane(t.dataset.p);
$('shClose').onclick=closePane;

// top tools
const narrow=()=>!matchMedia('(min-width:760px),(orientation:landscape) and (max-height:520px)').matches;
function setStats(on){UIS.stats=on;saveUI();$('stats').hidden=!on;$('pill').setAttribute('aria-expanded',String(on));if(on&&narrow()&&openP)closePane();}
$('pill').onclick=()=>setStats($('stats').hidden);
const PAUSE='<svg viewBox="0 0 24 24"><path d="M8.5 5v14M15.5 5v14"/></svg>',PLAY='<svg viewBox="0 0 24 24"><path d="M7.5 4.8v14.4L19 12Z"/></svg>';
function setPaused(v){paused=v;const b=$('tPause');b.innerHTML=v?PLAY:PAUSE;b.setAttribute('aria-pressed',String(v));b.setAttribute('aria-label',v?'Resume rendering':'Pause rendering');needBlit=true;}
$('tPause').onclick=()=>setPaused(!paused);
function setHidden(v){document.body.classList.toggle('ui-off',v);$('showUI').hidden=!v;if(v)toastNow=0;}
$('tHide').onclick=()=>setHidden(true);$('showUI').onclick=()=>setHidden(false);

// toast
let toastT=0,toastNow=0;
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),1600);}

// first-run hint
if(!UIS.hint){$('hint').hidden=false;}
document.querySelectorAll('.ver').forEach(e=>e.textContent='Prism v'+VERSION);
$('hintOk').onclick=()=>{$('hint').hidden=true;UIS.hint=true;saveUI();};

// keyboard (desktop)
addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'&&e.target.type!=='checkbox'&&e.key!=='Escape')return;
  if((e.metaKey||e.ctrlKey)&&bScene()){const k=e.key.toLowerCase();if(k==='z'){e.preventDefault();bUndo();return;}if(k==='d'&&bObj(bSel)){e.preventDefault();bDup(bObj(bSel));return;}}
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const k=e.key.toLowerCase();
  if(k===' '){e.preventDefault();setPaused(!paused);}
  else if(k==='h')setHidden(!document.body.classList.contains('ui-off'));
  else if(bScene()&&(e.key==='Delete'||e.key==='Backspace')&&bObj(bSel)){e.preventDefault();bDelete(bObj(bSel));}
  else if(k==='p')setPhotoMode(!photoMode);
  else if(k==='r'){resetView();toast('View reset');}
  else if(k==='escape'){if(openP)closePane();else if(!$('stats').hidden)setStats(false);}
  else if('123456'.includes(k)&&k.length===1)openPane(['scenes','render','look','camera','lights','build'][+k-1]);});

// tap on the scene (no drag) closes panels on phones
let tapStart=null;
cv.addEventListener('pointerdown',e=>{tapStart={x:e.clientX,y:e.clientY,t:performance.now()};if(!$('hint').hidden){$('hint').hidden=true;UIS.hint=true;saveUI();}},{capture:true});
cv.addEventListener('pointerup',e=>{if(!tapStart)return;const d=Math.hypot(e.clientX-tapStart.x,e.clientY-tapStart.y);
  if(d<6&&performance.now()-tapStart.t<280){
    const opt=!(dofOn()&&S.focusMode==='tap')&&!place&&pickOptic(e.clientX,e.clientY),bh=!opt&&!place&&!(dofOn()&&S.focusMode==='tap')&&bScene()?bPick(e.clientX,e.clientY):undefined;
    if(bh!==undefined&&(bh||bSel)){bSel=bh?bh.id:null;if(bh){const o=bObj(bh.id);toast(o.name);if(openP!=='build'&&!coarse)openPane('build');else if(openP==='build')drawBuild();}else if(openP==='build')drawBuild();}
    else if(opt){lEdit=opt;openLights('optics');toast(optName(opt));requestAnimationFrame(()=>{const x=document.querySelector('.pane[data-p="lights"] .lname[aria-expanded=true]');if(x)x.closest('.lrow').scrollIntoView({block:'start',behavior:'smooth'});});}
    else if(dofOn()&&S.focusMode==='tap'&&LV){const [sx,sy]=clientToScreen(e.clientX,e.clientY),rd=screenRay(LV,sx,sy),t=pickT(LV.eye,rd);
      if(t){focusPt=LV.eye.map((v,i)=>v+rd[i]*t);toast('Focus locked');}else toast('Nothing to focus on there');}
    else if(coarse){if(openP)closePane();else if(!$('stats').hidden)setStats(false);}}
  tapStart=null;},{capture:true});

function resetView(){if(S.camMode==='fly'){S.camMode='orbit';ctl.camMode();joyVis();refreshVis();}tween=null;inert=null;Object.assign(cam,SCENES[S.scene].cam||CAM0);if(S.roll){S.roll=0;ctl.roll();save();}fbBase();reset();}

// presets and setting changes
const syncAll=()=>{for(const k in ctl)if(k[0]!=='_')ctl[k]();refreshVis();};
function applyPreset(p){if(!PRESETS[p])return;S.preset=p;Object.assign(S,PRESETS[p]);syncAll();save();build();resize();reset();toast(pName(p)+' preset');}
const POST=new Set(['exposure','tonemap','ev','wb','wbAdapt','wbAuto','localTM','sat','vignette','grain','bloom','chromab']),NOOP=new Set(['afPoints','afPriority','moveSpeed','inertia','flySpeed','lookSens','afSpeed','showFocus','aeSpeed']);
function changed(k){
  if(k==='preset'){applyPreset(S.preset);return;}
  {const d=custOf(S.scene);if(d&&k!=='scene'){const env=d.kind==='planet'?d.view:d.env;if(env&&k in env){env[k]=S[k];custSave();}}}
  if(POST.has(k)||NOOP.has(k)){if(ctl[k])ctl[k]();save();needBlit=true;refreshVis();return;}
  if(k==='camMode'){if(S.camMode==='fly'){toFly();if(S.autoMove==='flyby'){S.autoMove='off';ctl.autoMove();}}else toOrbit();tween=null;inert=null;joyVis();fbBase();
    toast(S.camMode==='fly'?(coarse?'Fly: left stick moves, drag to look':'Fly: W A S D to move, drag to look'):'Orbit');}
  if(k==='autoMove'){if(S.autoMove==='flyby'&&S.camMode==='fly'){S.camMode='orbit';toOrbit();ctl.camMode();joyVis();}fbBase();}
  if(k==='aeMode'){if(isAE()&&!aeCur)aeCur=S.exposure;if(!isAE()){S.exposure=+(aeCur*Math.pow(2,S.ev)).toPrecision(3);ctl.exposure();}else aeCur=aeCur||S.exposure;}
  if(k==='focusMode'){if(S.focusMode==='manual'){S.focus=Math.round(curFocus*10)/10;ctl.focus();}if(S.focusMode==='tap'){focusPt=null;toast('Tap the scene to focus');}afT=1e9;afAuto=null;afPts=[];afSel=-1;}
  if(k==='scene'){focusPt=null;afAuto=null;}
  if(PKEYS.has(k)&&S.preset!=='custom'){S.preset='custom';ctl.preset();toast('Preset: Custom');}
  if(k==='scene'){const sc=SCENES[S.scene];Object.assign(S,{fov:55,focus:6,aeMode:sc.cosmos?(sc.cosmos.kind===0?'highlight':'average'):'manual',ev:0},sc.hint||CLASSIC);aeCur=aeTarget=S.exposure;veilT=veilCur=0;if(S.camMode==='fly'){S.camMode='orbit';joyVis();}Object.assign(cam,sc.cam||CAM0);tween=null;inert=null;fbBase();syncAll();}
  if(ctl[k])ctl[k]();
  if(k==='scene'){bSel=null;bDrag=null;ensureMeshes(custOf(S.scene));bLastK=null;bRecord();}
  save();
  if(k==='scale'||k==='adaptive'||k==='upscale')resize();
  buildScene(k==='scene'||k==='cbMirror');
  if(['bounces','dispersion','scene','atmSteps','terrainOct','bhSteps','clouds','renderMode','restir'].includes(k))build();
  if(k==='renderMode'||k==='scene')resize();
  if(k==='scene'||k==='atmDensity')renderLUT();
  if(k==='renderMode')toast(MODES[MIDX[S.renderMode]][1]);
  refreshVis();reset();
}

