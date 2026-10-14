/* ---------- model import: OBJ, STL, PLY, glTF / GLB ---------- */
const MAXTRI=500000;
function parseOBJ(buf){const text=new TextDecoder().decode(buf),V=[],I=[];let i=0;const n=text.length;
  while(i<n){let j=text.indexOf('\n',i);if(j<0)j=n;const l=text.slice(i,j).trim();i=j+1;
    if(l.startsWith('v ')){const a=l.split(/\s+/);V.push(+a[1],+a[2],+a[3]);}
    else if(l.startsWith('f ')){const nv=V.length/3,a=l.split(/\s+/).slice(1).map(x=>{const k=parseInt(x,10);return k<0?nv+k:k-1;}).filter(k=>k>=0&&k<nv);
      for(let k=1;k+1<a.length;k++)I.push(a[0],a[k],a[k+1]);}}
  return {pos:new Float32Array(V),idx:new Uint32Array(I)};}
function parseSTL(buf){const dv=new DataView(buf),head=new TextDecoder().decode(new Uint8Array(buf,0,Math.min(buf.byteLength,256)));
  const nb=buf.byteLength>=84?dv.getUint32(80,true):0;
  if(nb&&84+nb*50===buf.byteLength){const P=new Float32Array(nb*9);for(let t=0;t<nb;t++)for(let k=0;k<9;k++)P[t*9+k]=dv.getFloat32(84+t*50+12+k*4,true);
    const I=new Uint32Array(nb*3);for(let k=0;k<I.length;k++)I[k]=k;return {pos:P,idx:I};}
  if(!/^\s*solid/.test(head))throw new Error('This STL file looks damaged');
  const v=[...new TextDecoder().decode(buf).matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].flatMap(m=>[+m[1],+m[2],+m[3]]);
  const I=new Uint32Array(v.length/3);for(let k=0;k<I.length;k++)I[k]=k;return {pos:new Float32Array(v),idx:I};}
function parsePLY(buf){const u8=new Uint8Array(buf),hdrEnd=new TextDecoder().decode(u8.subarray(0,Math.min(u8.length,4096))).indexOf('end_header');
  if(hdrEnd<0)throw new Error('Not a PLY file');const hdr=new TextDecoder().decode(u8.subarray(0,hdrEnd)).split(/\r?\n/);
  let fmt='ascii',el=null;const els=[];for(const l of hdr){const a=l.trim().split(/\s+/);
    if(a[0]==='format')fmt=a[1];else if(a[0]==='element'){el={name:a[1],n:+a[2],props:[]};els.push(el);}else if(a[0]==='property'&&el)el.props.push(a[1]==='list'?{list:true,ct:a[2],t:a[3],name:a[4]}:{t:a[1],name:a[2]});}
  let off=hdrEnd+'end_header'.length;while(u8[off]!==10)off++;off++;
  const SZ={char:1,uchar:1,int8:1,uint8:1,short:2,ushort:2,int16:2,uint16:2,int:4,uint:4,int32:4,uint32:4,float:4,float32:4,double:8,float64:8};
  const dv=new DataView(buf),le=fmt!=='binary_big_endian',V=[],I=[];
  const rd=t=>{let v;switch(t){case'char':case'int8':v=dv.getInt8(off);break;case'uchar':case'uint8':v=dv.getUint8(off);break;case'short':case'int16':v=dv.getInt16(off,le);break;
    case'ushort':case'uint16':v=dv.getUint16(off,le);break;case'int':case'int32':v=dv.getInt32(off,le);break;case'uint':case'uint32':v=dv.getUint32(off,le);break;
    case'double':case'float64':v=dv.getFloat64(off,le);break;default:v=dv.getFloat32(off,le);}off+=SZ[t]||4;return v;};
  if(fmt==='ascii'){const toks=new TextDecoder().decode(u8.subarray(off)).trim().split(/\s+/);let k=0;
    for(const e of els)for(let r=0;r<e.n;r++){const row={};for(const p of e.props){if(p.list){const c=+toks[k++];row[p.name]=toks.slice(k,k+c).map(Number);k+=c;}else row[p.name]=+toks[k++];}
      if(e.name==='vertex')V.push(row.x,row.y,row.z);else if(e.name==='face'){const f=row.vertex_indices||row.vertex_index||[];for(let q=1;q+1<f.length;q++)I.push(f[0],f[q],f[q+1]);}}}
  else for(const e of els)for(let r=0;r<e.n;r++){const row={};for(const p of e.props){if(p.list){const c=rd(p.ct),a=[];for(let q=0;q<c;q++)a.push(rd(p.t));row[p.name]=a;}else row[p.name]=rd(p.t);}
    if(e.name==='vertex')V.push(row.x,row.y,row.z);else if(e.name==='face'){const f=row.vertex_indices||row.vertex_index||[];for(let q=1;q+1<f.length;q++)I.push(f[0],f[q],f[q+1]);}}
  return {pos:new Float32Array(V),idx:new Uint32Array(I)};}
function parseGLTF(buf,isGLB){let json,bin=null;
  if(isGLB){const dv=new DataView(buf);if(dv.getUint32(0,true)!==0x46546C67)throw new Error('Not a GLB file');let o=12;
    while(o<buf.byteLength){const len=dv.getUint32(o,true),type=dv.getUint32(o+4,true);if(type===0x4E4F534A)json=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,o+8,len)));else if(type===0x004E4942)bin=buf.slice(o+8,o+8+len);o+=8+len;}}
  else json=JSON.parse(new TextDecoder().decode(buf));
  if((json.extensionsUsed||[]).some(x=>/draco|meshopt/i.test(x)))throw new Error('This model is compressed (Draco or meshopt). Export it without compression.');
  const bufs=(json.buffers||[]).map((b,i)=>{if(!b.uri)return bin;if(b.uri.startsWith('data:')){const s=atob(b.uri.split(',')[1]),a=new Uint8Array(s.length);for(let k=0;k<s.length;k++)a[k]=s.charCodeAt(k);return a.buffer;}
    throw new Error('This glTF uses a separate .bin file. Use the single-file .glb version instead.');});
  const acc=i=>{const a=json.accessors[i],bv=json.bufferViews[a.bufferView],buf=bufs[bv.buffer],C={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],ct=a.componentType,
      bs={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[ct],st=bv.byteStride||C*bs,o0=(bv.byteOffset||0)+(a.byteOffset||0),dv=new DataView(buf),out=new Float64Array(a.count*C);
    const g={5120:o=>dv.getInt8(o),5121:o=>dv.getUint8(o),5122:o=>dv.getInt16(o,true),5123:o=>dv.getUint16(o,true),5125:o=>dv.getUint32(o,true),5126:o=>dv.getFloat32(o,true)}[ct];
    const nz=a.normalized?{5120:127,5121:255,5122:32767,5123:65535}[ct]||1:1;
    for(let k=0;k<a.count;k++)for(let c=0;c<C;c++)out[k*C+c]=g(o0+k*st+c*bs)/nz;return out;};
  const mul=(A,B)=>{const r=new Array(16).fill(0);for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)r[j*4+i]+=A[k*4+i]*B[j*4+k];return r;};
  const local=n=>{if(n.matrix)return n.matrix;const [x,y,z,w]=n.rotation||[0,0,0,1],[sx,sy,sz]=n.scale||[1,1,1],[tx,ty,tz]=n.translation||[0,0,0];
    return [(1-2*(y*y+z*z))*sx,2*(x*y+z*w)*sx,2*(x*z-y*w)*sx,0,2*(x*y-z*w)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+x*w)*sy,0,2*(x*z+y*w)*sz,2*(y*z-x*w)*sz,(1-2*(x*x+y*y))*sz,0,tx,ty,tz,1];};
  const P=[],I=[];let col=null;
  const walk=(ni,M)=>{const n=json.nodes[ni],W=mul(M,local(n));
    if(n.mesh!=null)for(const pr of json.meshes[n.mesh].primitives){if(pr.mode!=null&&pr.mode!==4)continue;if(pr.attributes.POSITION==null)continue;
      const p=acc(pr.attributes.POSITION),base=P.length/3,nv=p.length/3;
      for(let k=0;k<nv;k++){const x=p[k*3],y=p[k*3+1],z=p[k*3+2];P.push(W[0]*x+W[4]*y+W[8]*z+W[12],W[1]*x+W[5]*y+W[9]*z+W[13],W[2]*x+W[6]*y+W[10]*z+W[14]);}
      const det=W[0]*(W[5]*W[10]-W[6]*W[9])-W[4]*(W[1]*W[10]-W[2]*W[9])+W[8]*(W[1]*W[6]-W[2]*W[5]),ix=pr.indices!=null?acc(pr.indices):Array.from({length:nv},(_,k)=>k);
      for(let k=0;k+2<ix.length;k+=3)det<0?I.push(base+ix[k],base+ix[k+2],base+ix[k+1]):I.push(base+ix[k],base+ix[k+1],base+ix[k+2]);
      if(!col&&pr.material!=null){const m=json.materials[pr.material],f=m&&m.pbrMetallicRoughness&&m.pbrMetallicRoughness.baseColorFactor;if(f)col=f.slice(0,3);}}
    for(const c of n.children||[])walk(c,W);};
  const sc=json.scenes?json.scenes[json.scene||0]:{nodes:(json.nodes||[]).map((_,i)=>i)},I4=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  for(const r of sc.nodes||[])walk(r,I4);
  return {pos:new Float32Array(P),idx:new Uint32Array(I),col};}
// glTF and most modelling tools are y-up; STL files from 3D printing are usually z-up
function parseModel(name,buf){const ext=(name.split('.').pop()||'').toLowerCase();let r;
  if(ext==='obj')r=parseOBJ(buf);else if(ext==='stl'){r=parseSTL(buf);r.zup=true;}else if(ext==='ply')r=parsePLY(buf);
  else if(ext==='glb')r=parseGLTF(buf,true);else if(ext==='gltf')r=parseGLTF(buf,false);
  else throw new Error('Unsupported file. Use OBJ, STL, PLY, GLB or glTF.');
  const nt=r.idx.length/3;if(!nt)throw new Error('No triangles found in this file');if(nt>MAXTRI)throw new Error(`Too many triangles (${nt.toLocaleString()}). Simplify the model to under ${MAXTRI.toLocaleString()}.`);
  for(let k=0;k<r.idx.length;k++)if(r.idx[k]>=r.pos.length/3)throw new Error('This model has broken face indices');
  if(r.zup)for(let k=0;k<r.pos.length;k+=3){const y=r.pos[k+1];r.pos[k+1]=r.pos[k+2];r.pos[k+2]=-y;}
  return r;}
// model geometry is kept in IndexedDB (localStorage is far too small)
const IDB={p:null,ok:true,open(){if(!this.p)this.p=new Promise((res,rej)=>{try{const r=indexedDB.open('prism',1);r.onupgradeneeded=()=>r.result.createObjectStore('meshes');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);}catch(e){rej(e);}});return this.p;},
  async run(mode,fn){const db=await this.open();return new Promise((res,rej)=>{const t=db.transaction('meshes',mode),q=fn(t.objectStore('meshes'));t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error);});},
  put(k,v){return this.run('readwrite',s=>s.put(v,k));},get(k){return this.run('readonly',s=>s.get(k));},del(k){return this.run('readwrite',s=>s.delete(k));}};
const b64e=a=>{const u=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s);};
const b64d=(s,T)=>{const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new T(u.buffer);};

