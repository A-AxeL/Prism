/* ---- materials: photo-scanned textures for the ground and the bark ----
   Real CC0 textures (Poly Haven), packed by tools/textures.html into assets/textures and embedded in the page by the build
   (window.PRISM_TEX). They live in two texture arrays: colour (sRGB) and detail (normal x, y and height). The ground takes
   only their detail: each texture is divided by its own average colour, so the world keeps the colours of its climate and
   palette (and of the planet editor), and the photo adds the grain, the pebbles, the blades, the cracks and their relief.
   Layers are blended by height (stones stand out of the sand) and mapped three ways in world-anchored space, so cliffs are
   not stretched. */
const PE_MATR=['grass','grass_lush','grass_dry','forest_floor','forest_leaves','dirt','dry_ground','dry_mud','beach_sand','desert_sand','gravel',
  'rocky_ground','rock','cliff','scree','lichen_rock','mossy_rock','snow','dark_rock','mars_sand','mars_ground','mars_cracked','mars_stony','mars_rock',
  'bark_broadleaf','bark_pine','bark_smooth','bark_palm','bark_acacia','bark_willow'];
const PE_NMAT=PE_MATR.length;
// the layers' texture size by preset (0: no textures)
const peMatQ=()=>({potato:0,battery:0,balanced:512,quality:512,ultra:1024,cinematic:1024,pc:1024})[S.preset]??512;
// the shader side: the layers and their averages, and one layer sampled three ways
function peGLMat(){return `
uniform highp sampler2DArray uMatA,uMatN;uniform vec3 uMatM[${PE_NMAT}];uniform float uMatOn;uniform int uMatSet;
// one layer, triplanar in the noise ladder's space (x in texture repeats, n the unit normal there): colour divided by the
// layer's average, height, and the normal's tilt as a vector in that space (to be resolved onto the ground's own axes)
void matTri(int L,vec3 x,vec3 n,out vec3 a,out vec3 gv,out float h){
  vec3 b=pow(abs(n),vec3(6.));b/=b.x+b.y+b.z;a=vec3(0);gv=vec3(0);h=0.;float fl=float(L);
  if(b.x>.03){vec3 A=texture(uMatA,vec3(x.zy,fl)).rgb,D=texture(uMatN,vec3(x.zy,fl)).rgb;a+=A*b.x;h+=D.z*b.x;gv+=vec3(0.,D.y*2.-1.,D.x*2.-1.)*b.x;}
  if(b.y>.03){vec3 A=texture(uMatA,vec3(x.xz,fl)).rgb,D=texture(uMatN,vec3(x.xz,fl)).rgb;a+=A*b.y;h+=D.z*b.y;gv+=vec3(D.x*2.-1.,0.,D.y*2.-1.)*b.y;}
  if(b.z>.03){vec3 A=texture(uMatA,vec3(x.xy,fl)).rgb,D=texture(uMatN,vec3(x.xy,fl)).rgb;a+=A*b.z;h+=D.z*b.z;gv+=vec3(D.x*2.-1.,D.y*2.-1.,0.)*b.z;}
  a/=max(uMatM[L],vec3(.004));}
// the same with the coordinate's screen derivatives given (for callers in branches, where the GPU's own are undefined and
// the wrong mip level sparkles)
void matTriG1(int L,vec3 x,vec3 n,vec3 gx,vec3 gy,out vec3 a,out vec3 gv,out float h){
  vec3 b=pow(abs(n),vec3(6.));b/=b.x+b.y+b.z;a=vec3(0);gv=vec3(0);h=0.;float fl=float(L);
  if(b.x>.03){vec3 A=textureGrad(uMatA,vec3(x.zy,fl),gx.zy,gy.zy).rgb,D=textureGrad(uMatN,vec3(x.zy,fl),gx.zy,gy.zy).rgb;a+=A*b.x;h+=D.z*b.x;gv+=vec3(0.,D.y*2.-1.,D.x*2.-1.)*b.x;}
  if(b.y>.03){vec3 A=textureGrad(uMatA,vec3(x.xz,fl),gx.xz,gy.xz).rgb,D=textureGrad(uMatN,vec3(x.xz,fl),gx.xz,gy.xz).rgb;a+=A*b.y;h+=D.z*b.y;gv+=vec3(D.x*2.-1.,0.,D.y*2.-1.)*b.y;}
  if(b.z>.03){vec3 A=textureGrad(uMatA,vec3(x.xy,fl),gx.xy,gy.xy).rgb,D=textureGrad(uMatN,vec3(x.xy,fl),gx.xy,gy.xy).rgb;a+=A*b.z;h+=D.z*b.z;gv+=vec3(D.x*2.-1.,D.y*2.-1.,0.)*b.z;}
  a/=max(uMatM[L],vec3(.004));}
// against visible tiling: the picture is read twice, at two sizes turned against each other, and the two are blended by a
// slow, irregular pattern, so no repeat lines up across the ground
float matN(vec3 p){vec3 i=floor(p),f=p-i;f=f*f*(3.-2.*f);
  #define MH(c) (float(((uint(ivec3(c).x)*1597334677u)^(uint(ivec3(c).y)*3812015801u)^(uint(ivec3(c).z)*2798796415u))*747796405u>>8)/16777216.)
  return mix(mix(mix(MH(i),MH(i+vec3(1,0,0)),f.x),mix(MH(i+vec3(0,1,0)),MH(i+vec3(1,1,0)),f.x),f.y),mix(mix(MH(i+vec3(0,0,1)),MH(i+vec3(1,0,1)),f.x),mix(MH(i+vec3(0,1,1)),MH(i+vec3(1,1,1)),f.x),f.y),f.z);}
// the texture's own shadows (its fine size, laid flat): a few steps toward the sun across its height map; wherever the relief
// rises above the line to the sun, the point is in a pebble's shadow (softened by how far below the line it is). sT: the sun in
// the same space as x, hS: the height of the map's full range in its own repeats
float matShadow(int L,vec3 x,vec3 n,vec3 sT,vec3 gx,vec3 gy,float hS){float fl=float(L);vec3 an=abs(n);
  // the projection the ground is mapped with (the axis the normal is nearest), the sun in it: across, and up out of the map
  vec2 u,du,dx,dy;float su;
  if(an.y>=an.x&&an.y>=an.z){u=x.xz;du=sT.xz;su=sT.y*sign(n.y);dx=gx.xz;dy=gy.xz;}
  else if(an.x>=an.z){u=x.zy;du=sT.zy;su=sT.x*sign(n.x);dx=gx.zy;dy=gy.zy;}
  else{u=x.xy;du=sT.xy;su=sT.z*sign(n.z);dx=gx.xy;dy=gy.xy;}
  float dl=length(du);if(dl<1e-4||su<=0.)return 1.;du/=dl;float tE=su/dl;
  float h0=textureGrad(uMatN,vec3(u,fl),dx,dy).z*hS,s=1.,t=.0025;
  for(int i=0;i<6;i++){float hp=textureGrad(uMatN,vec3(u+du*t,fl),dx,dy).z*hS,ray=h0+t*tE+.002*hS;s=min(s,clamp(1.+(ray-hp)/(.15*hS),0.,1.));t*=1.8;}
  return s;}
void matTriG(int L,vec3 x,vec3 n,vec3 gx,vec3 gy,out vec3 a,out vec3 gv,out float h){
  // three sizes of the picture, each fixed to the ground (none moves or swaps as the camera comes and goes): the fine one,
  // one 8 times bigger and one 64 times bigger, each turned against the others. A size fades out only once its repeats would
  // shrink to a few pixels, and the bigger ones lay their slow variations over it, so no repeat lines up anywhere
  const mat3 R=mat3(.6,0,.8,0,1,0,-.8,0,.6),R2=mat3(-.28,0,.96,0,1,0,-.96,0,-.28);
  float lf=log2(max(length(gx),length(gy))*160.),wf=1.-smoothstep(0.,1.5,lf),wm=1.-smoothstep(3.,4.5,lf),w2=smoothstep(1.,3.,lf)*(1.-smoothstep(6.,7.5,lf));
  vec3 A=vec3(1),G=vec3(0);float H=0.,HW=0.;vec3 a1,g1;float h1;
  if(wf>0.){matTriG1(L,x,n,gx,gy,a1,g1,h1);A*=mix(vec3(1),a1,wf);G+=g1*wf;H+=h1*wf;HW+=wf;}
  if(wm>0.){float k=mix(.55,1.,1.-wf);matTriG1(L,R*x*.125+vec3(.37,.11,.71),R*n,R*gx*.125,R*gy*.125,a1,g1,h1);A*=mix(vec3(1),a1,wm*k);G+=transpose(R)*g1*wm*k;H+=h1*wm*k;HW+=wm*k;}
  if(w2>0.){matTriG1(L,R2*x*.015625+vec3(.73,.29,.17),R2*n,R2*gx*.015625,R2*gy*.015625,a1,g1,h1);A*=mix(vec3(1),a1,w2*.6);G+=transpose(R2)*g1*w2*.6;H+=h1*w2*.6;HW+=w2*.6;}
  a=A;gv=G;h=HW>0.?H/HW:.5;}

`;}
// load the layers: from the page's embedded textures (the build puts them there), else from the dev server's assets folder
async function peMatLoad(){const n=peMatQ();if(!n||PE.matBusy||(PE.mat&&PE.mat.n===n))return;PE.matBusy=true;
  try{const src=window.PRISM_TEX||null,big=n>=1024;let man=src&&src.manifest;
    if(!man){try{man=await (await fetch('assets/textures/manifest.json',{cache:'no-store'})).json();}catch(e){man=null;}}
    if(!man){PE.matBusy=false;PE.mat={n,none:true};return;}
    // the embedded page may hold only the small versions: take what there is, scaled to the layer size
    const url=(role,k)=>{const f1=role+'_'+k+'.webp',f5=role+'_'+k+'5.webp';if(src&&src.files)return big?(src.files[f1]||src.files[f5]):(src.files[f5]||src.files[f1]);return 'assets/textures/'+(big?f1:f5);};
    const load=async u=>{if(!u)return null;try{const b=await (await fetch(u)).blob();return await createImageBitmap(b,{imageOrientation:'none',premultiplyAlpha:'none',colorSpaceConversion:'none',resizeWidth:n,resizeHeight:n,resizeQuality:'high'});}catch(e){return null;}};
    const levels=Math.floor(Math.log2(n))+1,mk=fmt=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,t);gl.texStorage3D(gl.TEXTURE_2D_ARRAY,levels,fmt,n,n,PE_NMAT);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.REPEAT);
      const an=gl.getExtension('EXT_texture_filter_anisotropic');if(an)gl.texParameterf(gl.TEXTURE_2D_ARRAY,an.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(16,gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));return t;};
    const A=mk(gl.SRGB8_ALPHA8),D=mk(gl.RGBA8),mean=new Float32Array(PE_NMAT*3).fill(.5);
    // a missing layer stays neutral: mid grey (its own average, so a ratio of 1) and flat
    const flat=(t,c)=>{const p=new Uint8Array(n*n*4);for(let i=0;i<p.length;i+=4){p[i]=c[0];p[i+1]=c[1];p[i+2]=c[2];p[i+3]=255;}gl.bindTexture(gl.TEXTURE_2D_ARRAY,t);return p;};
    const grey=flat(A,[188,188,188]),flatN=flat(D,[128,128,128]);let got=0;
    for(let i=0;i<PE_NMAT;i++){const role=PE_MATR[i],e=man[role];const [a,d]=e?await Promise.all([load(url(role,'a')),load(url(role,'n'))]):[null,null];
      gl.bindTexture(gl.TEXTURE_2D_ARRAY,A);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      if(a&&d){gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,i,n,n,1,gl.RGBA,gl.UNSIGNED_BYTE,a);gl.bindTexture(gl.TEXTURE_2D_ARRAY,D);gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,i,n,n,1,gl.RGBA,gl.UNSIGNED_BYTE,d);
        mean.set(e.mean,i*3);got++;}
      else{gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,i,n,n,1,gl.RGBA,gl.UNSIGNED_BYTE,grey);gl.bindTexture(gl.TEXTURE_2D_ARRAY,D);gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,i,n,n,1,gl.RGBA,gl.UNSIGNED_BYTE,flatN);
        mean.set([.497,.497,.497],i*3);}}
    for(const t of [A,D]){gl.bindTexture(gl.TEXTURE_2D_ARRAY,t);gl.generateMipmap(gl.TEXTURE_2D_ARRAY);}gl.bindTexture(gl.TEXTURE_2D_ARRAY,null);
    if(PE.mat&&PE.mat.A){gl.deleteTexture(PE.mat.A);gl.deleteTexture(PE.mat.D);}
    PE.mat={n,A,D,mean,got};if(typeof reset==='function')reset();}
  catch(e){console.warn('Prism: textures did not load',e);PE.mat={n,none:true};}
  PE.matBusy=false;}
// bind the layers for a program (units 16 and 17); off until they are loaded
function peMatU(u,g){if(!u.uMatA)return;const M=PE.mat,on=!!(M&&M.A);
  gl.activeTexture(gl.TEXTURE16);gl.bindTexture(gl.TEXTURE_2D_ARRAY,on?M.A:peMatDummy());gl.activeTexture(gl.TEXTURE17);gl.bindTexture(gl.TEXTURE_2D_ARRAY,on?M.D:peMatDummy());gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(u.uMatA,16);gl.uniform1i(u.uMatN,17);gl.uniform1f(u.uMatOn,on?1:0);if(on)gl.uniform3fv(u.uMatM,M.mean);
  if(u.uMatSet)gl.uniform1i(u.uMatSet,g&&g.TC[3]<.5&&g.TC[2]<.3?1:0);}
function peMatDummy(){if(PE.matD)return PE.matD;const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,t);gl.texStorage3D(gl.TEXTURE_2D_ARRAY,1,gl.RGBA8,1,1,1);
  gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,0,1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([128,128,128,255]));gl.bindTexture(gl.TEXTURE_2D_ARRAY,null);return PE.matD=t;}
