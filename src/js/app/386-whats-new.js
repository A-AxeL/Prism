/* ---------- what's new: the release notes for each update, shown once after it arrives ---------- */
// NOTES comes from RELEASE_NOTES.md (newest first), filled in by the build. A first visit marks the current release as
// seen without showing anything; after an update the notes of every release since the last one seen are shown.
const vcmp=(a,b)=>{a=String(a).split('.').map(Number);b=String(b).split('.').map(Number);for(let i=0;i<3;i++)if((a[i]||0)!==(b[i]||0))return (a[i]||0)-(b[i]||0);return 0;};
const notesSeen=()=>{try{return localStorage.getItem('prism-seen');}catch(e){return null;}};
const notesMark=()=>{try{localStorage.setItem('prism-seen',RELEASE);}catch(e){}};
function notesShow(list,title){if(!list.length||$('notes'))return;
  const e=document.createElement('div');e.id='notes';e.className='modal';e.setAttribute('role','dialog');e.setAttribute('aria-modal','true');e.setAttribute('aria-labelledby','notesT');
  e.innerHTML=`<div class="wcard glass"><h3 id="notesT">${esc(title)}</h3><div class="nscroll">${list.map(n=>`<h4>Prism ${esc(n.v)}${n.date?` <small>${esc(n.date)}</small>`:''}</h4><ul>${n.items.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`).join('')}</div>
    <div class="row-btns"><button class="btn primary" id="notesOk" type="button">Got it</button></div></div>`;
  document.body.appendChild(e);const close=()=>{notesMark();e.remove();};$('notesOk').onclick=close;e.onclick=ev=>{if(ev.target===e)close();};$('notesOk').focus();}
function notesMaybe(){if(!RELEASE||!NOTES.length)return;const seen=notesSeen();if(seen===RELEASE)return;
  if(warmJobs===null){setTimeout(notesMaybe,1500);return;}   // wait until the shader warm-up knows whether it needs its window
  if(warmShow||$('warm'))return;   // the warm-up finishes first, then calls this again
  if(seen===null&&freshStart){notesMark();return;}
  const list=seen?NOTES.filter(n=>vcmp(n.v,seen)>0&&vcmp(n.v,RELEASE)<=0):NOTES.slice(0,1);
  if(!list.length){notesMark();return;}
  notesShow(list,list.length>1?'What’s new since '+seen:'What’s new in Prism '+list[0].v);}
setTimeout(notesMaybe,2500);
$('goNotes').onclick=()=>notesShow(NOTES,'Release notes');
