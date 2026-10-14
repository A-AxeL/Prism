/* ---------- presets & settings ---------- */
const PRESETS={
  potato:   {giRate:'1/4',sdfSteps:64,atmSteps:8,terrainOct:4,bhSteps:90,scale:.33,adaptive:true,target:45,fpsCap:'unlimited',bounces:2,motionBounces:1,neeDepth:1,spp:1,reproj:true,tBlend:.08,denoise:.9,dnFade:96,accum:true,maxAcc:256,dispersion:false,aperture:0},
  battery:  {giRate:'1/4',sdfSteps:64,atmSteps:8,terrainOct:4,bhSteps:90,scale:.4,adaptive:true,target:30,fpsCap:'30',bounces:3,motionBounces:1,neeDepth:1,spp:1,reproj:true,tBlend:.07,denoise:.8,dnFade:64,accum:true,maxAcc:96,dispersion:false,aperture:0},
  balanced: {giRate:'1/2',sdfSteps:96,atmSteps:12,terrainOct:5,bhSteps:150,scale:.5,adaptive:true,target:45,fpsCap:'unlimited',bounces:4,motionBounces:2,neeDepth:2,spp:1,reproj:true,tBlend:.06,denoise:.7,dnFade:64,accum:true,maxAcc:512,dispersion:false,aperture:0},
  quality:  {giRate:'1/1',sdfSteps:128,atmSteps:16,terrainOct:6,bhSteps:220,scale:.75,adaptive:true,target:30,fpsCap:'unlimited',bounces:6,motionBounces:3,neeDepth:3,spp:1,reproj:true,tBlend:.05,denoise:.5,dnFade:48,accum:true,maxAcc:1024,dispersion:false,aperture:0},
  ultra:    {giRate:'1/1',sdfSteps:192,atmSteps:24,terrainOct:7,bhSteps:320,scale:1,adaptive:false,target:30,fpsCap:'unlimited',bounces:8,motionBounces:5,neeDepth:8,spp:2,reproj:true,tBlend:.04,denoise:.3,dnFade:32,accum:true,maxAcc:2048,dispersion:false,aperture:0},
  pc:       {giRate:'1/1',sdfSteps:256,atmSteps:48,terrainOct:8,bhSteps:500,scale:1,adaptive:false,target:60,fpsCap:'unlimited',bounces:8,motionBounces:5,neeDepth:8,spp:2,reproj:true,tBlend:.04,denoise:.2,dnFade:32,accum:true,maxAcc:2048,dispersion:false,aperture:0},
  cinematic:{giRate:'1/1',sdfSteps:256,atmSteps:32,terrainOct:8,bhSteps:400,scale:1,adaptive:false,target:30,fpsCap:'unlimited',bounces:8,motionBounces:4,neeDepth:8,spp:2,reproj:true,tBlend:.04,denoise:.2,dnFade:32,accum:true,maxAcc:2048,dispersion:true,aperture:.1},
};
const MODES=[['path','Path tracing','Path'],['hybrid','Prism hybrid','Hybrid'],['whitted','Whitted ray tracing','Whitted'],['raster','Raster-style shading','Raster'],['sdf','SDF sphere tracing','SDF']];
const MIDX=Object.fromEntries(MODES.map((m,i)=>[m[0],i]));
const PORDER=['potato','battery','balanced','quality','ultra','pc','cinematic'];
const pName=p=>p==='pc'?'PC':cap1(p);
const PKEYS=new Set(Object.values(PRESETS).flatMap(Object.keys));
const S=Object.assign({afPoints:'15',afPriority:'near',camMode:'orbit',autoMove:'off',moveSpeed:1,inertia:true,flySpeed:2,lookSens:1,roll:0,proj:'persp',fishFov:180,focusMode:'manual',afSpeed:6,blades:'0',anamorphic:false,showFocus:true,aeMode:'manual',ev:0,aeSpeed:2,wb:6500,wbAdapt:1,wbAuto:0,localTM:.4,sat:1,vignette:.2,grain:0,renderMode:'hybrid',ssCache:true,restir:true,upscale:true,cbMirror:false,drMode:'pro',bloom:.5,chromab:.1,starBoost:0,fovAxis:'short',photoAspect:'screen',photoRes:'2048',photoQ:'128',photoFmt:'jpg',preset:'balanced',scene:'blue planet',atmDensity:1,clouds:true,cloudCover:.5,cityLights:true,doppler:true,diskBright:1,stars:1,glassIOR:1.5,glassDensity:1.6,rough:.08,sun:false,sunAngle:40,sunAz:35,sky:'night',
  exposure:1.1,tonemap:'aces',fov:55,animate:false,timeSpeed:1,focus:6,floor:'matte',fog:.02,showGraph:true},PRESETS.balanced);
const VERSION='dev';   // bump with every release
const BUILD='dev',BENCH_URL='',REPO='';
const RELEASE='',NOTES=[];   // the release and its notes (RELEASE_NOTES.md), filled in by the build   // filled in by the build from project.json
let freshStart=true;try{const o=JSON.parse(localStorage.getItem('prism3')||'{}');freshStart=!Object.keys(o).length;Object.assign(S,o);}catch(e){}
let wiping=false;const save=()=>{if(wiping)return;try{localStorage.setItem('prism3',JSON.stringify(S));}catch(e){}};

