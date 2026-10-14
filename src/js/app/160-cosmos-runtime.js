/* ---------- cosmos runtime ---------- */
let NOISE=null;const noiseTex=gl.createTexture();{gl.bindTexture(gl.TEXTURE_3D,noiseTex);const nd=new Uint8Array(32*32*32),r=rng(1234567);for(let i=0;i<nd.length;i++)nd[i]=r()*256;NOISE=nd;
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage3D(gl.TEXTURE_3D,0,gl.R8,32,32,32,0,gl.RED,gl.UNSIGNED_BYTE,nd);
  for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.REPEAT],[gl.TEXTURE_WRAP_T,gl.REPEAT],[gl.TEXTURE_WRAP_R,gl.REPEAT]])gl.texParameteri(gl.TEXTURE_3D,k,v);}
let LUTP=null,lutRT=null;
function renderLUT(){const co=SCENES[S.scene].cosmos;if(!co||co.kind===2)return;
  try{LUTP=LUTP||prog(lutFS);}catch(e){errEl.style.display='grid';errEl.textContent='Shader error:\n'+e;return;}
  if(!lutRT){const sw=W,sh=H;W=256;H=64;lutRT=mkRT(1);W=sw;H=sh;}
  const k=S.atmDensity,u=LUTP.u;gl.bindFramebuffer(gl.FRAMEBUFFER,lutRT.f);gl.viewport(0,0,256,64);gl.useProgram(LUTP.p);
  gl.uniform3fv(u.uBR,co.br.map(x=>x*k));gl.uniform3fv(u.uBMe,co.bme.map(x=>x*k));gl.uniform3fv(u.uBO,co.bo.map(x=>x*k));
  gl.uniform1f(u.uHR,co.hr);gl.uniform1f(u.uHM,co.hm);gl.uniform1f(u.uRa,co.ra);gl.drawArrays(gl.TRIANGLES,0,3);}
function drawCosmos(u,co,re,eye,fw,rtv,upv,el,az){
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,lutRT?lutRT.t[0]:null);gl.uniform1i(u.uLut,1);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_3D,noiseTex);gl.uniform1i(u.uNoise,2);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,rt[ping].t[0]);gl.uniform1i(u.uPrev,0);
  gl.uniform1f(u.uBlend,re?Math.max(S.tBlend,1/(frame+1)):1/(frame+1));gl.uniform1i(u.uReproj,re?1:0);
  gl.uniform3fv(u.uPEye,P.eye||eye);gl.uniform3fv(u.uPFw,P.fw||fw);gl.uniform3fv(u.uPRt,P.rt||rtv);gl.uniform3fv(u.uPUp,P.up||upv);
  gl.uniform1ui(u.uFrame,(total++)>>>0);gl.uniform2f(u.uRes,W,H);gl.uniform3fv(u.uEye,eye);gl.uniform3fv(u.uFw,fw);gl.uniform3fv(u.uRt,rtv);gl.uniform3fv(u.uUp,upv);
  gl.uniform1f(u.uTanF,viewTan());gl.uniform1f(u.uTime,simT*(co.spin??1));
  const sun=[Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az)];gl.uniform3fv(u.uSun,sun);
  const k=S.atmDensity,z=[0,0,0];
  gl.uniform3fv(u.uBR,(co.br||z).map(x=>x*k));gl.uniform3fv(u.uBMs,(co.bms||z).map(x=>x*k));gl.uniform3fv(u.uBMe,(co.bme||z).map(x=>x*k));gl.uniform3fv(u.uBO,(co.bo||z).map(x=>x*k));
  gl.uniform1f(u.uHR,co.hr||1);gl.uniform1f(u.uHM,co.hm||1);gl.uniform1f(u.uRa,co.ra||1.1);gl.uniform1f(u.uG,Array.isArray(co.g)?co.g[1]:co.g||.7);
  for(const n of ['p1','p2','p3','p4'])gl.uniform3fv(u['uP'+n[1]],co[n]||z);
  gl.uniform3fv(u.uAxis,co.axis||[0,1,0]);gl.uniform1f(u.uSea,co.sea??.5);
  gl.uniform1f(u.uCloud,.78-.42*(co.cover??S.cloudCover));gl.uniform1f(u.uCity,S.cityLights?(co.city||0):0);
  gl.uniform1f(u.uRin,co.rin||0);gl.uniform1f(u.uRout,co.rout||0);gl.uniform1f(u.uDisk,S.diskBright);gl.uniform1f(u.uDiskT,co.diskT||70);
  gl.uniform1f(u.uDop,S.doppler?1:0);gl.uniform1f(u.uStars,1e-5*Math.pow(2,S.starBoost));gl.uniform1f(u.uGlare,drm().g);
  // star, surface extras, moons and the other planets of a system
  gl.uniform3fv(u.uSunI,co.sunI||[20,20,20]);const sd=sunDiskU(co);gl.uniform1f(u.uSunK,sd[0]);gl.uniform1f(u.uSunC0,sd[1]);gl.uniform1f(u.uSunC1,sd[2]);
  gl.uniform3fv(u.uOcean,co.ocean||[.004,.016,.04]);gl.uniform1f(u.uLava,co.lava||0);gl.uniform3fv(u.uLavaC,co.lavaC||[1,.35,.08]);gl.uniform3fv(u.uRingC,co.ringC||[.8,.72,.6]);
  gl.uniform1f(u.uRelief,co.relief??1);gl.uniform1f(u.uStarD,co.starD||1e4);
  const ml=moonList(co);if(ml.length){const P4=new Float32Array(ml.length*4),C4=new Float32Array(ml.length*4);
    ml.forEach((m,i)=>{const a=simT*.08*(m.speed??1),c=Math.cos(a),s=Math.sin(a);P4.set([m.p[0]*c-m.p[2]*s,m.p[1],m.p[0]*s+m.p[2]*c,m.r],i*4);C4.set([...m.col,0],i*4);});
    gl.uniform4fv(u.uMoons,P4);gl.uniform4fv(u.uMoonC,C4);}
  const bl=co.bodies||[];if(bl.length){const pos=sysPos(co,sun),a=new Float32Array(bl.length*16);
    bl.forEach((b,i)=>{a.set([...pos[i],b.r],i*4);});gl.uniform4fv(u.uBod,a.subarray(0,bl.length*4));
    gl.uniform4fv(u.uBodA,new Float32Array(bl.flatMap(b=>[...b.c1,b.gas?1:0])));gl.uniform4fv(u.uBodB,new Float32Array(bl.flatMap(b=>[...b.c2,b.ring||0])));gl.uniform4fv(u.uBodC,new Float32Array(bl.flatMap(b=>[...b.air,b.airK])));gl.uniform4fv(u.uBodN,new Float32Array(bl.flatMap(b=>[...(b.axis||[0,.94,.34]),0])));}
  gl.drawArrays(gl.TRIANGLES,0,3);
}
