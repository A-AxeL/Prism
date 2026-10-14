/* ---------- photo mode: frame a shot, then render it offscreen at any size and save it ----------
   The live view zooms so the frame on screen shows exactly what the photo will hold (its own aspect ratio, and the field
   of view measured across the chosen side). Taking the photo freezes the camera and renders the image in tiles, each
   accumulated for the chosen number of frames with the current method and settings (no upscaling, no motion reuse),
   composited with the same exposure and color, then assembled, encoded and offered to save. */
const PHOTO_AR={screen:0,'1:1':1,'4:5':4/5,'3:4':3/4,'2:3':2/3,'9:16':9/16,'16:9':16/9,'3:2':3/2,'21:9':21/9};
function photoDims(){const a=S.photoAspect==='screen'||!PHOTO_AR[S.photoAspect]?innerWidth/innerHeight:PHOTO_AR[S.photoAspect],L=+S.photoRes||2048;
  let w=a>=1?L:Math.round(L*a),h=a>=1?Math.round(L/a):L;const k=Math.min(1,Math.sqrt(16e6/(w*h)));return [Math.max(16,Math.round(w*k)),Math.max(16,Math.round(h*k))];}
// the frame on screen: the photo's shape, as large as fits around the screen center (the projection center)
function photoRect(){const [pw,ph]=photoDims(),a=pw/ph,mx=16;
  // clear of the top bar and the shutter bar, kept symmetric so the frame stays on the projection center
  let my=Math.min(140,innerHeight*.2);const tb=document.querySelector('.top, #top'),bar=$('photoBar');
  if(bar&&!bar.hidden){const r=bar.getBoundingClientRect();if(r.height)my=Math.max(innerHeight-r.top+6,tb?tb.getBoundingClientRect().bottom+6:0);}
  my=Math.min(my,innerHeight*.3);const aw=innerWidth-2*mx,ah=innerHeight-2*my;
  const w=aw/ah>a?ah*a:aw,h=w/a;return {x:(innerWidth-w)/2,y:(innerHeight-h)/2,w,h};}
function photoFrameDraw(){const el=$('pframe');if(!photoMode){el.hidden=true;return;}const r=photoRect(),[pw,ph]=photoDims();el.hidden=false;
  Object.assign(el.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});
  $('pbSize').textContent=`${S.photoAspect==='screen'?'Screen':S.photoAspect} · ${pw}×${ph}`;}
function setPhotoMode(on){photoMode=on;document.body.classList.toggle('photo-mode',on);$('photoBar').hidden=!on;$('tPhoto').setAttribute('aria-pressed',String(on));
  if(!on&&openP==='photo')closePane();if(on&&openP&&narrow())closePane();photoFrameDraw();reset();if(on)toast('Frame your shot, then press the shutter');}
const photoInfo=()=>{const [w,h]=photoDims(),f=isDet()?Math.min(S.photoQ,32):+S.photoQ;return `${w} × ${h} pixels (${(w*h/1e6).toFixed(1)} MP), ${f} frames per tile. A 4K Best photo can take a few minutes.`;};
let photoNS;   // the page's save capability (resolved lazily; null where the viewer cannot save files)
async function savePhoto(blob,name){
  if(photoNS===undefined){try{photoNS=window.claude&&window.claude.use?await window.claude.use('downloads'):null;}catch(e){photoNS=null;}}
  if(photoNS){try{await photoNS.save({filename:name,data:blob});toast('Saved');return;}
    catch(e){const c=e&&e.code;if(c==='declined')return;if(c==='rate_limited'){toast('A save prompt is already open');return;}}}
  const file=new File([blob],name,{type:blob.type});
  if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:'Prism photo'});return;}catch(e){if(e&&e.name==='AbortError')return;}}
  const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),8000);}
let photoURL=null;
function showPhoto(blob,w,h){if(photoURL)URL.revokeObjectURL(photoURL);photoURL=URL.createObjectURL(blob);$('pdImg').src=photoURL;
  const ext=blob.type==='image/png'?'png':'jpg',d=new Date(),z=n=>String(n).padStart(2,'0');
  const name=`prism-${S.scene.replace(/\s+/g,'-')}-${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.${ext}`;
  $('pdInfo').textContent=`${w} × ${h} · ${(blob.size/1e6).toFixed(1)} MB · ${ext.toUpperCase()}`;
  $('pdSave').onclick=()=>savePhoto(blob,name);$('photoDone').hidden=false;}
function takePhoto(){if(photoJob||!TR||broken||!OUT)return;
  const [pw,ph]=photoDims(),CO=SCENES[S.scene].cosmos,V=LV||view(CO),T=768,tiles=[];
  for(let y=0;y<ph;y+=T)for(let x=0;x<pw;x+=T)tiles.push({x,y,w:Math.min(T,pw-x),h:Math.min(T,ph-y)});
  const c2=document.createElement('canvas');c2.width=pw;c2.height=ph;const ctx=c2.getContext('2d');
  if(!ctx){toast('This device can’t create an image that large');return;}
  if(tiles.length>1&&glareK()>0){const k=Math.min(.5,Math.sqrt(2.4e6/(pw*ph)));tiles.unshift({glare:true,x:0,y:0,w:Math.max(8,Math.ceil(pw*k)),h:Math.max(8,Math.ceil(ph*k))});}   // whole frame at half size (at most 2.4 MP): the lens glare source
  photoJob={V,CO,tan:axisTan(pw,ph),tiles,ti:0,f:0,N:isDet()?Math.min(+S.photoQ,32):+S.photoQ,pw,ph,c2,ctx,k:1,lastT:performance.now(),cancel:false,fb:null,started:false,sync:null};
  if(openP)closePane();$('pbBar').style.width='0%';$('pbMsg').textContent='Starting…';$('photoBusy').hidden=false;}
function photoStep(){const J=photoJob;if(J.cancel){photoEnd(false);return;}
  if(pending&&!pollBuild(false))return;
  const t=J.tiles[J.ti];photoTile=t.glare?{x:0,y:0,fw:t.w,fh:t.h,tan:J.tan}:{x:t.x,y:J.ph-t.y-t.h,fw:J.pw,fh:J.ph,tan:J.tan};LV=J.V;const NT=t.glare?Math.min(J.N,24):J.N;
  if(!J.started){if(W!==t.w||H!==t.h||!rt.length||rt[0].t.length!==nTargets()){W=t.w;H=t.h;rt.forEach(r=>{r.t.forEach(x=>gl.deleteTexture(x));gl.deleteFramebuffer(r.f);});rt=[mkRT(nTargets()),mkRT(nTargets())];}
    if(!J.fb||J.fb.w!==t.w||J.fb.h!==t.h){if(J.fb){gl.deleteTexture(J.fb.t);gl.deleteFramebuffer(J.fb.f);}
      const x=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,x);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,t.w,t.h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,x,0);J.fb={t:x,f,w:t.w,h:t.h};}
    frame=0;P={};J.f=0;J.started=true;}
  // as many frames per animation frame as keep the page responsive (about 30–60 ms of GPU work)
  // keep one batch in flight: wait for the GPU to finish the last one (a fence), so a phone never queues seconds of work
  if(J.sync){const st=gl.getSyncParameter(J.sync,gl.SYNC_STATUS);if(st!==gl.SIGNALED&&performance.now()-J.lastT<4000)return;
    gl.deleteSync(J.sync);J.sync=null;const dt=performance.now()-J.lastT;if(dt<35)J.k=Math.min(J.k*2,32);else if(dt>70)J.k=Math.max(1,J.k>>1);}
  for(let n=0;n<J.k&&J.f<NT;n++){traceDraw(J.V,J.CO,false);ping=1-ping;frame++;P={eye:J.V.eye,fw:J.V.fw,rt:J.V.rt,up:J.V.up};J.f++;}
  J.lastT=performance.now();J.sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
  const done=(J.ti+J.f/NT)/J.tiles.length;$('pbBar').style.width=(done*100).toFixed(1)+'%';
  $('pbMsg').textContent=J.tiles.length>1?`Tile ${J.ti+1} of ${J.tiles.length} · ${Math.round(done*100)}%`:`${Math.round(done*100)}%`;
  if(J.f<NT)return;
  if(t.glare){glareBuild(t.w,t.h,drawLasers(t.w,t.h),J.fb,0);J.gReady=true;J.ti++;J.started=false;return;}
  blit(J.fb);gl.bindFramebuffer(gl.FRAMEBUFFER,J.fb.f);const px=new Uint8Array(t.w*t.h*4);gl.readPixels(0,0,t.w,t.h,gl.RGBA,gl.UNSIGNED_BYTE,px);
  const img=J.ctx.createImageData(t.w,t.h);for(let r=0;r<t.h;r++)img.data.set(px.subarray((t.h-1-r)*t.w*4,(t.h-r)*t.w*4),r*t.w*4);   // GL rows run bottom-up
  J.ctx.putImageData(img,t.x,t.y);J.ti++;J.started=false;if(J.ti>=J.tiles.length)photoEnd(true);}
function photoEnd(ok){const J=photoJob;photoJob=null;photoTile=null;if(!ok)$('photoBusy').hidden=true;
  if(J.fb){gl.deleteTexture(J.fb.t);gl.deleteFramebuffer(J.fb.f);}if(J.sync){gl.deleteSync(J.sync);J.sync=null;}
  W=0;H=0;resize();reset();   // back to the screen's own targets
  if(!ok){toast('Photo canceled');return;}
  $('pbMsg').textContent='Encoding…';
  $('pbBar').style.width='100%';$('pbCancel').disabled=true;
  J.c2.toBlob(b=>{$('photoBusy').hidden=true;$('pbCancel').disabled=false;J.c2.width=J.c2.height=0;if(!b){toast('The image couldn’t be saved');return;}showPhoto(b,J.pw,J.ph);},S.photoFmt==='png'?'image/png':'image/jpeg',.95);}
$('tPhoto').onclick=()=>setPhotoMode(!photoMode);$('pbClose').onclick=()=>setPhotoMode(false);$('pbShutter').onclick=takePhoto;$('pbSet').onclick=()=>openPane('photo');
$('pbCancel').onclick=()=>{if(photoJob)photoJob.cancel=true;};$('pdClose').onclick=()=>{$('photoDone').hidden=true;};
addEventListener('resize',photoFrameDraw);
$('ppTake').onclick=takePhoto;
for(const k of ['photoAspect','photoRes','fov','fovAxis'])reg(k,photoFrameDraw);
