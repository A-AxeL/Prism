/* ---------- object instances (scene builder): shapes and models, kept in a texture so any number fit ---------- */
// world-from-local 3×4 for a position, a rotation (yaw, pitch, roll in degrees: R = Ry·Rx·Rz) and half sizes
function xform(p,r,h){const [y,x,z]=r.map(v=>v*Math.PI/180),cy=Math.cos(y),sy=Math.sin(y),cx=Math.cos(x),sx=Math.sin(x),cz=Math.cos(z),sz=Math.sin(z);
  const mm=(A,B)=>A.map(q=>[0,1,2].map(j=>q[0]*B[0][j]+q[1]*B[1][j]+q[2]*B[2][j]));
  const R=mm(mm([[cy,0,sy],[0,1,0],[-sy,0,cy]],[[1,0,0],[0,cx,-sx],[0,sx,cx]]),[[cz,-sz,0],[sz,cz,0],[0,0,1]]);
  return R.map((q,i)=>[q[0]*h[0],q[1]*h[1],q[2]*h[2],p[i]]);}
function inv34(M){const [a,b,c]=M[0],[d,e,f]=M[1],[g,h,k]=M[2],A=e*k-f*h,B=f*g-d*k,C=d*h-e*g,id=1/(a*A+b*B+c*C);
  const I=[[A*id,(c*h-b*k)*id,(b*f-c*e)*id],[B*id,(a*k-c*g)*id,(c*d-a*f)*id],[C*id,(b*g-a*h)*id,(a*e-b*d)*id]],t=[M[0][3],M[1][3],M[2][3]];
  return I.map(q=>[q[0],q[1],q[2],-(q[0]*t[0]+q[1]*t[1]+q[2]*t[2])]);}
const xfP=(M,v)=>M.map(q=>q[0]*v[0]+q[1]*v[1]+q[2]*v[2]+q[3]);
const INST={list:[],ver:0};let instTex=null,instRows=0;
const MESHES=new Map();   // id → {name,pos,idx,ntri,nodes,order,nnode,lmin,lmax,cn (corner normals)}
/* bounding-volume hierarchy, binned surface-area heuristic. Node: [min xyz, left child or first triangle, max xyz, count]
   (count 0 = interior; its children sit side by side at left, left+1). Leaves hold at most 8 triangles, depth stays below 38. */
function buildBVH(pos,idx){const n=idx.length/3,cen=new Float32Array(n*3),tb=new Float32Array(n*6);
  for(let i=0;i<n;i++)for(let a=0;a<3;a++){let lo=1e30,hi=-1e30;for(let v=0;v<3;v++){const x=pos[idx[i*3+v]*3+a];if(x<lo)lo=x;if(x>hi)hi=x;}tb[i*6+a]=lo;tb[i*6+3+a]=hi;cen[i*3+a]=(lo+hi)*.5;}
  const order=new Uint32Array(n);for(let i=0;i<n;i++)order[i]=i;
  const nodes=new Float32Array(Math.max(2,2*n+1)*8);let used=1;const NB=12,bn=new Int32Array(NB),bx=new Float32Array(NB*6),lA=new Float32Array(NB),lC=new Int32Array(NB);
  const area=(x0,y0,z0,x1,y1,z1)=>{const a=x1-x0,b=y1-y0,c=z1-z0;return a<0?0:a*b+b*c+c*a;};
  const st=[[0,0,n,0]];
  while(st.length){const [nd,s,c,dep]=st.pop();const mn=[1e30,1e30,1e30],mx=[-1e30,-1e30,-1e30],cm=[1e30,1e30,1e30],cx=[-1e30,-1e30,-1e30];
    for(let k=s;k<s+c;k++){const t=order[k];for(let a=0;a<3;a++){const l=tb[t*6+a],h=tb[t*6+3+a],m=cen[t*3+a];if(l<mn[a])mn[a]=l;if(h>mx[a])mx[a]=h;if(m<cm[a])cm[a]=m;if(m>cx[a])cx[a]=m;}}
    const o=nd*8;nodes[o]=mn[0];nodes[o+1]=mn[1];nodes[o+2]=mn[2];nodes[o+4]=mx[0];nodes[o+5]=mx[1];nodes[o+6]=mx[2];
    if(c<=2){nodes[o+3]=s;nodes[o+7]=c;continue;}
    let best=Infinity,ba=-1,bs=0;const pA=area(mn[0],mn[1],mn[2],mx[0],mx[1],mx[2])||1e-12;
    if(dep<34)for(let a=0;a<3;a++){const ext=cx[a]-cm[a];if(ext<1e-12)continue;bn.fill(0);
      for(let b=0;b<NB;b++){bx[b*6]=bx[b*6+1]=bx[b*6+2]=1e30;bx[b*6+3]=bx[b*6+4]=bx[b*6+5]=-1e30;}
      const sc=NB/ext;
      for(let k=s;k<s+c;k++){const t=order[k];const b=Math.min(NB-1,((cen[t*3+a]-cm[a])*sc)|0);bn[b]++;for(let q=0;q<3;q++){if(tb[t*6+q]<bx[b*6+q])bx[b*6+q]=tb[t*6+q];if(tb[t*6+3+q]>bx[b*6+3+q])bx[b*6+3+q]=tb[t*6+3+q];}}
      let x0=1e30,y0=1e30,z0=1e30,x1=-1e30,y1=-1e30,z1=-1e30,cnt=0;
      for(let b=0;b<NB-1;b++){if(bn[b]){x0=Math.min(x0,bx[b*6]);y0=Math.min(y0,bx[b*6+1]);z0=Math.min(z0,bx[b*6+2]);x1=Math.max(x1,bx[b*6+3]);y1=Math.max(y1,bx[b*6+4]);z1=Math.max(z1,bx[b*6+5]);}cnt+=bn[b];lA[b]=cnt?area(x0,y0,z0,x1,y1,z1):0;lC[b]=cnt;}
      x0=y0=z0=1e30;x1=y1=z1=-1e30;cnt=0;
      for(let b=NB-1;b>0;b--){if(bn[b]){x0=Math.min(x0,bx[b*6]);y0=Math.min(y0,bx[b*6+1]);z0=Math.min(z0,bx[b*6+2]);x1=Math.max(x1,bx[b*6+3]);y1=Math.max(y1,bx[b*6+4]);z1=Math.max(z1,bx[b*6+5]);}cnt+=bn[b];
        const L=lC[b-1];if(!L||!cnt)continue;const cost=lA[b-1]*L+area(x0,y0,z0,x1,y1,z1)*cnt;if(cost<best){best=cost;ba=a;bs=b;}}}
    let mid=-1;
    if(ba>=0){if(c<=8&&1+best/pA>=c){nodes[o+3]=s;nodes[o+7]=c;continue;}   // a leaf is cheaper
      const sc=NB/(cx[ba]-cm[ba]);let i=s,j=s+c-1;
      while(i<=j){const t=order[i];if(Math.min(NB-1,((cen[t*3+ba]-cm[ba])*sc)|0)<bs)i++;else{order[i]=order[j];order[j]=t;j--;}}
      mid=i;}
    if(mid<=s||mid>=s+c){if(c<=8&&dep>=34){nodes[o+3]=s;nodes[o+7]=c;continue;}
      let ax=0;for(let a=1;a<3;a++)if(cx[a]-cm[a]>cx[ax]-cm[ax])ax=a;
      const part=Array.from(order.subarray(s,s+c)).sort((p,q)=>cen[p*3+ax]-cen[q*3+ax]);order.set(part,s);mid=s+(c>>1);}
    const l=used;used+=2;nodes[o+3]=l;nodes[o+7]=0;st.push([l,s,mid-s,dep+1],[l+1,mid,s+c-mid,dep+1]);}
  return {nodes:nodes.subarray(0,used*8),order,nnode:used};}
// per-corner normals: smooth across edges flatter than the crease angle, sharp otherwise (welded by position)
function cornerNormals(pos,idx,crease=.82){const n=idx.length/3,key=new Map(),wid=new Uint32Array(pos.length/3);
  for(let v=0;v<pos.length/3;v++){const k=Math.round(pos[v*3]*1e5)+','+Math.round(pos[v*3+1]*1e5)+','+Math.round(pos[v*3+2]*1e5);let w=key.get(k);if(w===undefined){w=key.size;key.set(k,w);}wid[v]=w;}
  // face normals (area weighted) and, per welded vertex, the faces that touch it
  const fn=new Float32Array(n*3),fu=new Float32Array(n*3),cnt=new Uint32Array(key.size+1);
  for(let i=0;i<n;i++){const a=idx[i*3]*3,b=idx[i*3+1]*3,c=idx[i*3+2]*3,e1=[pos[b]-pos[a],pos[b+1]-pos[a+1],pos[b+2]-pos[a+2]],e2=[pos[c]-pos[a],pos[c+1]-pos[a+1],pos[c+2]-pos[a+2]];
    const f=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]],l=Math.hypot(...f)||1;fn.set(f,i*3);fu.set(f.map(x=>x/l),i*3);
    for(let v=0;v<3;v++)cnt[wid[idx[i*3+v]]+1]++;}
  for(let w=0;w<key.size;w++)cnt[w+1]+=cnt[w];
  const adj=new Uint32Array(n*3),fill=cnt.slice(0,key.size);
  for(let i=0;i<n;i++)for(let v=0;v<3;v++){const w=wid[idx[i*3+v]];adj[fill[w]++]=i;}
  // a corner averages only the faces within the crease angle of its own face, so sharp edges stay sharp and flat faces stay flat
  const cn=new Float32Array(n*9);
  for(let i=0;i<n;i++){const fx=fu[i*3],fy=fu[i*3+1],fz=fu[i*3+2];
    for(let v=0;v<3;v++){const w=wid[idx[i*3+v]];let sx=0,sy=0,sz=0;
      for(let k=cnt[w];k<cnt[w+1];k++){const j=adj[k];if(j!==i&&fu[j*3]*fx+fu[j*3+1]*fy+fu[j*3+2]*fz<=crease)continue;sx+=fn[j*3];sy+=fn[j*3+1];sz+=fn[j*3+2];}
      const l=Math.hypot(sx,sy,sz);if(l>1e-20&&(sx*fx+sy*fy+sz*fz)/l>.05)cn.set([sx/l,sy/l,sz/l],i*9+v*3);else cn.set([fx,fy,fz],i*9+v*3);}}
  return cn;}
// center a mesh and scale it so its largest half-extent is 1 (the instance transform sizes it); returns the extents
function meshNormalize(pos){const mn=[1e30,1e30,1e30],mx=[-1e30,-1e30,-1e30];
  for(let i=0;i<pos.length;i+=3)for(let a=0;a<3;a++){const v=pos[i+a];if(v<mn[a])mn[a]=v;if(v>mx[a])mx[a]=v;}
  const c=mn.map((v,a)=>(v+mx[a])/2),s=Math.max(...mx.map((v,a)=>(v-mn[a])/2))||1;
  for(let i=0;i<pos.length;i+=3)for(let a=0;a<3;a++)pos[i+a]=(pos[i+a]-c[a])/s;
  return mx.map((v,a)=>(v-mn[a])/2/s);}
function meshAdd(id,name,pos,idx,o={}){const ext=o.keep?null:meshNormalize(pos),bv=buildBVH(pos,idx),cn=cornerNormals(pos,idx,o.crease??.82);
  const m={id,name,pos,idx,ntri:idx.length/3,...bv,cn,ext:ext||[1,1,1],col:o.col};
  m.lmin=[m.nodes[0],m.nodes[1],m.nodes[2]];m.lmax=[m.nodes[4],m.nodes[5],m.nodes[6]];MESHES.set(id,m);meshKey='';return m;}
// built-in shapes as meshes (unit size, outward winding)
function shapeMesh(kind){const P=[],I=[],add=(...v)=>{P.push(...v);return P.length/3-1;},tri=(a,b,c,ref)=>{
    const A=a*3,B=b*3,C=c*3,e1=[P[B]-P[A],P[B+1]-P[A+1],P[B+2]-P[A+2]],e2=[P[C]-P[A],P[C+1]-P[A+1],P[C+2]-P[A+2]],
      nn=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]],cc=[(P[A]+P[B]+P[C])/3-ref[0],(P[A+1]+P[B+1]+P[C+1])/3-ref[1],(P[A+2]+P[B+2]+P[C+2])/3-ref[2]];
    if(nn[0]*cc[0]+nn[1]*cc[1]+nn[2]*cc[2]<0)I.push(a,c,b);else I.push(a,b,c);};
  const O=[0,0,0],N=48;
  if(kind==='cone'){const ap=add(0,1,0),bc=add(0,-1,0),r=[];for(let i=0;i<N;i++){const a=i/N*2*Math.PI;r.push(add(Math.cos(a),-1,Math.sin(a)));}
    for(let i=0;i<N;i++){tri(ap,r[i],r[(i+1)%N],O);tri(bc,r[(i+1)%N],r[i],O);}}
  else if(kind==='pyramid'){const ap=add(0,1,0),b=[add(-1,-1,-1),add(1,-1,-1),add(1,-1,1),add(-1,-1,1)];for(let i=0;i<4;i++)tri(ap,b[i],b[(i+1)%4],O);tri(b[0],b[1],b[2],O);tri(b[0],b[2],b[3],O);}
  else if(kind==='prism'){const v=[[-1,-1],[1,-1],[0,1]],f=v.map(([x,y])=>add(x,y,1)),k=v.map(([x,y])=>add(x,y,-1));tri(f[0],f[1],f[2],O);tri(k[0],k[1],k[2],O);
    for(let i=0;i<3;i++){const j=(i+1)%3;tri(f[i],f[j],k[j],O);tri(f[i],k[j],k[i],O);}}
  else if(kind==='torus'){const R=.65,r=.35,M=24,g=[];for(let i=0;i<N;i++){g.push([]);const a=i/N*2*Math.PI;for(let j=0;j<M;j++){const b=j/M*2*Math.PI;g[i].push(add((R+r*Math.cos(b))*Math.cos(a),r*Math.sin(b),(R+r*Math.cos(b))*Math.sin(a)));}}
    for(let i=0;i<N;i++){const a=(i+.5)/N*2*Math.PI,ref=[R*Math.cos(a),0,R*Math.sin(a)];for(let j=0;j<M;j++){const i1=(i+1)%N,j1=(j+1)%M;tri(g[i][j],g[i1][j],g[i1][j1],ref);tri(g[i][j],g[i1][j1],g[i][j1],ref);}}}
  return meshAdd('shape:'+kind,kind,new Float32Array(P),new Uint32Array(I),{keep:true,crease:kind==='torus'?0:.6});}
// all meshes the scene uses, packed into two float textures (triangles, hierarchy nodes)
let meshKey='',meshTex=null,bvhTex=null,meshOff=new Map();
function tex2D(old,w,h,data){const t=old||gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,w,h,0,gl.RGBA,gl.FLOAT,data);
  for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);return t;}
function meshPack(ids){const key=[...ids].sort().join('|');if(key===meshKey&&meshTex)return;meshKey=key;meshOff=new Map();
  let nt=0,nn=0;for(const id of ids){const m=MESHES.get(id);if(!m)continue;meshOff.set(id,{tri:nt,node:nn});nt+=m.ntri;nn+=m.nnode;}
  const th=Math.max(1,Math.ceil(nt*6/4096)),nh=Math.max(1,Math.ceil(nn*2/4096)),T=new Float32Array(4096*th*4),Nd=new Float32Array(4096*nh*4);
  for(const id of ids){const m=MESHES.get(id),o=meshOff.get(id);if(!m)continue;const P=m.pos,I=m.idx;
    for(let j=0;j<m.ntri;j++){const t=m.order[j],q=(o.tri+j)*24,a=I[t*3]*3,b=I[t*3+1]*3,c=I[t*3+2]*3;
      T[q]=P[a];T[q+1]=P[a+1];T[q+2]=P[a+2];T[q+4]=P[b]-P[a];T[q+5]=P[b+1]-P[a+1];T[q+6]=P[b+2]-P[a+2];T[q+8]=P[c]-P[a];T[q+9]=P[c+1]-P[a+1];T[q+10]=P[c+2]-P[a+2];
      for(let v=0;v<3;v++)for(let k=0;k<3;k++)T[q+12+v*4+k]=m.cn[t*9+v*3+k];}
    for(let j=0;j<m.nnode;j++){const s=j*8,d=(o.node+j)*8;for(let k=0;k<8;k++)Nd[d+k]=m.nodes[s+k];Nd[d+3]+=m.nodes[s+7]>0?o.tri:o.node;}}
  meshTex=tex2D(meshTex,4096,th,T);bvhTex=tex2D(bvhTex,4096,nh,Nd);}
// instance record (8 texels) for every builder object that is a shape or a model
function instUpload(){const L=INST.list,ids=new Set();for(const I of L)if(I.mesh)ids.add(I.mesh);meshPack(ids);
  const n=L.length,rows=Math.max(1,Math.ceil(n*8/1024)),D=new Float32Array(1024*rows*4);
  L.forEach((I,i)=>{const q=i*32,R=I.inv,mo=I.mesh&&meshOff.get(I.mesh);for(let r=0;r<3;r++)for(let k=0;k<4;k++)D[q+r*4+k]=R[r][k];
    D.set([...I.wmin,I.shape],q+12);D.set([...I.wmax,mo?mo.node:0],q+16);D.set([...I.col,I.dens||0],q+20);D.set([I.mt,I.ro||0,I.ior||1.5,I.em||0],q+24);D.set([I.smooth?1:0,I.disp??.06,0,0],q+28);});
  instTex=tex2D(instTex,1024,rows,D);instRows=rows;INST.ver++;}
// one builder object → instance (world-from-local transform, its inverse and world bounds)
function mkInst(o){const shape=o.shape,m=shape===0?MESHES.get(o.mesh):null;if(shape===0&&!m)return null;
  const M=xform(o.p,o.r,o.h),lmin=m?m.lmin:[-1,-1,-1],lmax=m?m.lmax:[1,1,1],wmin=[1e30,1e30,1e30],wmax=[-1e30,-1e30,-1e30];
  for(let c=0;c<8;c++){const w=xfP(M,[c&1?lmax[0]:lmin[0],c&2?lmax[1]:lmin[1],c&4?lmax[2]:lmin[2]]);for(let a=0;a<3;a++){wmin[a]=Math.min(wmin[a],w[a]-1e-4);wmax[a]=Math.max(wmax[a],w[a]+1e-4);}}
  return {...o,M,inv:inv34(M),wmin,wmax};}
// CPU copy of the GPU intersection (picking, autofocus, lasers): {t, n (world, outward)} or null
function instHitJS(I,ro,rd){const R=I.inv,lo=R.map(q=>q[0]*ro[0]+q[1]*ro[1]+q[2]*ro[2]+q[3]),ld=R.map(q=>q[0]*rd[0]+q[1]*rd[1]+q[2]*rd[2]);
  let t=Infinity,nl=null;
  const slabJS=(a,b)=>{let tn=-Infinity,tf=Infinity,an=0,af=0;for(let k=0;k<3;k++){const iv=1/(Math.abs(ld[k])<1e-15?1e-15:ld[k]),t0=(a[k]-lo[k])*iv,t1=(b[k]-lo[k])*iv;
    if(Math.min(t0,t1)>tn){tn=Math.min(t0,t1);an=k;}if(Math.max(t0,t1)<tf){tf=Math.max(t0,t1);af=k;}}return [tn,tf,an,af];};
  if(I.shape===1){const a=dot3(ld,ld),b=dot3(lo,ld),c=dot3(lo,lo)-1,h=b*b-a*c;if(h<0)return null;const s=Math.sqrt(h),t0=(-b-s)/a,t1=(-b+s)/a,tt=t0>1e-4?t0:t1;if(tt<=1e-4)return null;t=tt;nl=lo.map((v,k)=>v+ld[k]*tt);}
  else if(I.shape===2){const [tn,tf,an,af]=slabJS([-1,-1,-1],[1,1,1]);if(tf<Math.max(tn,1e-4))return null;const f=tn>1e-4;t=f?tn:tf;const ax=f?an:af,q=lo[ax]+ld[ax]*t;nl=[0,0,0];nl[ax]=Math.sign(q);}
  else if(I.shape===3){const a=ld[0]*ld[0]+ld[2]*ld[2],b=lo[0]*ld[0]+lo[2]*ld[2],c=lo[0]*lo[0]+lo[2]*lo[2]-1;let tn=-Infinity,tf=Infinity,nn,nf;
    if(a>1e-14){const h=b*b-a*c;if(h<0)return null;const s=Math.sqrt(h);tn=(-b-s)/a;tf=(-b+s)/a;nn=[lo[0]+ld[0]*tn,0,lo[2]+ld[2]*tn];nf=[lo[0]+ld[0]*tf,0,lo[2]+ld[2]*tf];}else if(c>0)return null;
    if(Math.abs(ld[1])<1e-14){if(Math.abs(lo[1])>1)return null;}else{const y0=(-1-lo[1])/ld[1],y1=(1-lo[1])/ld[1];if(Math.min(y0,y1)>tn){tn=Math.min(y0,y1);nn=[0,-Math.sign(ld[1]),0];}if(Math.max(y0,y1)<tf){tf=Math.max(y0,y1);nf=[0,Math.sign(ld[1]),0];}}
    if(tf<Math.max(tn,1e-4))return null;t=tn>1e-4?tn:tf;nl=tn>1e-4?nn:nf;}
  else{const m=MESHES.get(I.mesh);if(!m)return null;const N=m.nodes,P=m.pos,X=m.idx,stk=[0];let tri=-1;
    while(stk.length){const nd=stk.pop(),o=nd*8;const [tn,tf]=slabJS([N[o],N[o+1],N[o+2]],[N[o+4],N[o+5],N[o+6]]);if(tf<Math.max(tn,0)||tn>t)continue;
      const cnt=N[o+7];if(cnt>0){for(let k=0;k<cnt;k++){const tt0=m.order[N[o+3]+k],a=X[tt0*3]*3,b=X[tt0*3+1]*3,c=X[tt0*3+2]*3,
          e1=[P[b]-P[a],P[b+1]-P[a+1],P[b+2]-P[a+2]],e2=[P[c]-P[a],P[c+1]-P[a+1],P[c+2]-P[a+2]],pv=cross(ld,e2),det=dot3(e1,pv);if(Math.abs(det)<1e-18)continue;
          const tv=[lo[0]-P[a],lo[1]-P[a+1],lo[2]-P[a+2]],u=dot3(tv,pv)/det;if(u<0||u>1)continue;const qv=cross(tv,e1),v=dot3(ld,qv)/det;if(v<0||u+v>1)continue;
          const tt=dot3(e2,qv)/det;if(tt>1e-4&&tt<t){t=tt;tri=tt0;nl=cross(e1,e2);}}}
      else{stk.push(N[o+3],N[o+3]+1);}}
    if(tri<0)return null;}
  const n=norm([0,1,2].map(k=>R[0][k]*nl[0]+R[1][k]*nl[1]+R[2][k]*nl[2]));return {t,n};}

