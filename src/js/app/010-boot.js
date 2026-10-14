
(()=>{
const cv=document.getElementById('c');
const gl=cv.getContext('webgl2',{antialias:false,depth:false,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
const errEl=document.getElementById('err');
if(!gl){errEl.style.display='grid';errEl.textContent='WebGL2 is not available on this browser.';return;}
const fFloat=!!gl.getExtension('EXT_color_buffer_float'),fExt=fFloat||gl.getExtension('EXT_color_buffer_half_float');

