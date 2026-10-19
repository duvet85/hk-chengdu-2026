// Travel Wallet v1: private data only in Supabase, NEVER in GitHub.
const el=id=>document.getElementById(id);
const cfg=window.TRAVEL_WALLET_CONFIG||{};
const S={api:null,session:null,member:false,trips:[],trip:null,stops:[],reservations:[],documents:[],guide:null,tab:'guide'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hidden=(id,yes)=>el(id).classList.toggle('hidden',yes);
const date=v=>v?new Date(v.slice(0,10)+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'';
const safe=u=>{try{let x=new URL(u);return x.protocol==='https:'?x.href:''}catch{return''}};
const toast=(msg,bad=false)=>{let x=el('toast');x.textContent=msg;x.style.background=bad?'#a03232':'#173a32';x.style.display='block';setTimeout(()=>x.style.display='none',4500)};
const blank=(icon,title,msg)=>'<div class="blank"><div class="big">'+icon+'</div><h3>'+esc(title)+'</h3><p>'+esc(msg)+'</p></div>';
function note(msg,type){el('message').innerHTML=msg?'<div class="'+(type||'notice')+'">'+esc(msg)+'</div>':''}
function screen(){
 let active=Boolean(S.api&&S.session&&S.member),configured=Boolean(cfg.supabaseUrl&&cfg.supabasePublishableKey);
 hidden('setup-section',configured);hidden('auth-section',!configured||active);hidden('wallet-section',!active);hidden('logout-btn',!S.session);
 el('user-email').textContent=S.session?.user?.email||'';
 el('hero-actions').innerHTML=active?'<button id="quick-add" class="btn light">＋ New trip</button>':configured?'<span class="status">Members-only sign in</span>':'<span class="status pending">Secure vault setup required</span>';
 if(active)el('quick-add').onclick=()=>editor('trip');
}
async function bootstrap(){
 el('logout-btn').onclick=async()=>{await S.api.auth.signOut();S.session=null;S.member=false;screen()};
 el('login-form').onsubmit=login;
 el('new-trip').onclick=()=>editor('trip');
 el('back-to-trips').onclick=()=>{S.trip=null;hidden('trip-screen',true);hidden('list-screen',false)};
 el('add-entry').onclick=()=>editor(S.tab==='stops'?'stop':S.tab==='reservations'?'reservation':'document');
 el('close-dialog').onclick=()=>el('editor').close();
 el('editor-form').onsubmit=save;
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.tab;tab()});
 el('trip-list').onclick=e=>{let a=e.target.closest('[data-trip]');if(a)openTrip(a.dataset.trip)};
 el('tab-content').onclick=e=>{
   const max=e.target.closest('[data-guide-max]');if(max){toggleGuideMax();return}
   let a=e.target.closest('[data-open]');if(a){openDocument(a.dataset.open);return}
   let d=e.target.closest('[data-remove]');if(d){removeDocument(d.dataset.remove);return}
 };
 screen();
 if(!cfg.supabaseUrl||!cfg.supabasePublishableKey)return;
 try {
   const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
   S.api=mod.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
   let res=await S.api.auth.getSession();if(res.error)throw res.error;
   S.session=res.data.session;await authorize();
   S.api.auth.onAuthStateChange((_ev,session)=>{S.session=session;setTimeout(()=>authorize(),0)});
 }catch(err){note('Unable to initialise Supabase: '+err.message,'error')}
}
async function authorize(){
 S.member=false;
 if(S.session){
   let r=await S.api.from('wallet_members').select('user_id').eq('user_id',S.session.user.id).maybeSingle();
   if(r.error)note('The vault database is not ready: '+r.error.message,'error');
   else if(!r.data){
     // Inserting membership is permitted by RLS only for a pre-approved, exact family email.
     const invite=await S.api.from('wallet_members').insert({user_id:S.session.user.id,display_name:'Family member'});
     if(!invite.error){S.member=true;note('')}
     else note('Login succeeded, but this account is not approved for the family wallet.');
   }
   else{S.member=true;note('')}
 }
 screen();if(S.member)await loadTrips();
}
async function login(e){
 e.preventDefault();let button=e.target.querySelector('button');button.disabled=true;
 let email=new FormData(e.target).get('email');
 try{
  let r=await S.api.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname,shouldCreateUser:true}});
  if(r.error)throw r.error;note('Sign-in link sent. Open the email and follow the link on this device.','success');
 }catch(err){note(err.message,'error')}finally{button.disabled=false}
}
async function loadTrips(){
 let r=await S.api.from('trips').select('*').order('start_date',{ascending:false});
 if(r.error){toast(r.error.message,true);return}S.trips=r.data||[];renderTrips();
}
function renderTrips(){
 if(!S.trips.length){
   el('trip-list').innerHTML='<div class="card" style="grid-column:1/-1">'+blank('🧳','Your wallet is empty','Create a trip, then add bookings and upload your private tickets and hotel vouchers.')+'<div style="padding:0 18px 24px;text-align:center"><button id="first-trip" class="btn primary">＋ Create first trip</button></div></div>';
   el('first-trip').onclick=()=>editor('trip');return;
 }
 el('trip-list').innerHTML=S.trips.map(t=>
  '<article class="card trip-card" data-trip="'+esc(t.id)+'"><div class="cover"><small>'+esc(t.destinations.toUpperCase())+'</small><span class="emoji">'+esc(t.emoji)+'</span></div><div class="card-body"><span class="status '+esc(t.status)+'">'+esc(t.status)+'</span><h3>'+esc(t.title)+'</h3><p class="muted small">'+date(t.start_date)+' — '+date(t.end_date)+'</p><p class="muted small">'+esc(t.description)+'</p></div></article>'
 ).join('');
}
async function openTrip(id){
 S.trip=S.trips.find(t=>t.id===id);if(!S.trip)return;
 hidden('list-screen',true);hidden('trip-screen',false);
 el('trip-title').textContent=S.trip.emoji+' '+S.trip.title;
 el('trip-meta').textContent=S.trip.destinations+' · '+date(S.trip.start_date)+' — '+date(S.trip.end_date);
 el('trip-status').innerHTML='<span class="status '+esc(S.trip.status)+'">'+esc(S.trip.status)+'</span>';
 S.tab='guide';await loadData();tab();window.scrollTo(0,0);
}
async function loadData(){
 let id=S.trip.id,results=await Promise.all([
  S.api.from('trip_stops').select('*').eq('trip_id',id).order('stop_date').order('stop_time'),
  S.api.from('reservations').select('*').eq('trip_id',id).order('created_at',{ascending:false}),
  S.api.from('documents').select('*').eq('trip_id',id).order('created_at',{ascending:false}),
  S.api.from('trip_guides').select('html,filename').eq('trip_id',id).maybeSingle()
 ]);
 for(let r of results){if(r.error){toast(r.error.message,true);return}}
 S.stops=results[0].data||[];S.reservations=results[1].data||[];S.documents=results[2].data||[];S.guide=results[3].data||null;
}
function tab(){
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===S.tab));
 let desc={guide:['Interactive travel guide',''],stops:['Timeline','＋ Add stop'],reservations:['Bookings','＋ Add booking'],documents:['Private documents','＋ Upload file']};
 el('tab-title').textContent=desc[S.tab][0];el('add-entry').textContent=desc[S.tab][1];hidden('add-entry',S.tab==='guide');
 if(S.tab==='guide'){renderGuide();return}
 if(S.tab==='stops'){
  if(!S.stops.length){el('tab-content').innerHTML=blank('🗺️','No stops yet','Create a timed journey with notes and one-tap map directions.');return}
  let day='';el('tab-content').innerHTML=S.stops.map(s=>{
   let head=s.stop_date!==day?'<h3>'+date(s.stop_date)+'</h3>':'';day=s.stop_date;
   let u=safe(s.map_url);
   return head+'<div class="line"><time>'+esc(s.stop_time?.slice(0,5)||'Flexible')+'</time><div class="line-content"><b>'+esc(s.title)+'</b><span class="small muted">'+esc(s.place)+'</span><p>'+esc(s.details)+'</p>'+(u?'<div class="line-actions"><a class="pill-link" target="_blank" rel="noopener noreferrer" href="'+esc(u)+'">↗ Directions</a></div>':'')+'</div></div>';
  }).join('');
 }else if(S.tab==='reservations'){
  if(!S.reservations.length){el('tab-content').innerHTML=blank('🎟️','No bookings yet','Keep flight and hotel references, transfers and dining confirmations together.');return}
  const emojis={flight:'✈️',hotel:'🏨',train:'🚆',transfer:'🚕',activity:'🎟️',dining:'🍜'};
  el('tab-content').innerHTML=S.reservations.map(r=>
   '<div class="line"><div class="doc-icon">'+(emojis[r.category]||'🧾')+'</div><div class="line-content"><b>'+esc(r.title)+'</b><span class="status '+esc(r.status)+'">'+esc(r.status)+'</span><p>'+esc(r.provider)+(r.reservation_at?' · '+esc(new Date(r.reservation_at).toLocaleString()):'')+'</p><p>'+(r.reference?'Reference: '+esc(r.reference)+' · ':'')+esc(r.notes)+'</p></div></div>'
  ).join('');
 }else{
  if(!S.documents.length){el('tab-content').innerHTML=blank('🔐','Private document vault','Upload your boarding passes, hotel vouchers, tickets and PDFs. Nothing is stored on GitHub.');return}
  el('tab-content').innerHTML=S.documents.map(d=>
   '<div class="line"><div class="doc-icon">'+(d.content_type==='application/pdf'?'📄':'🖼️')+'</div><div class="line-content"><b>'+esc(d.title)+'</b><p>'+esc(d.filename)+' · '+esc(d.category.replaceAll('_',' '))+' · '+(d.byte_size/1048576).toFixed(1)+' MB</p><div class="line-actions"><button class="btn sm primary" data-open="'+esc(d.id)+'">🔒 Open securely</button><button class="btn sm danger" data-remove="'+esc(d.id)+'">Delete</button></div></div></div>'
  ).join('');
 }
}

const guideKey=k=>/^japan-check-[0-9]{1,4}$/.test(k)||/^hkc_2026_task_[a-zA-Z0-9_-]{1,120}$/.test(k);
function guidePreferences(){
 const prefs={};
 try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(guideKey(k)){const v=localStorage.getItem(k);if(['0','1','true','false'].includes(v))prefs[k]=v}}}catch(_){}
 return prefs;
}
window.addEventListener('message',event=>{
 const frame=el('original-guide-frame');
 if(!frame||event.source!==frame.contentWindow)return;
 const d=event.data;
 if(!d||d.type!=='wallet-guide-check'||!guideKey(d.key)||!['0','1','true','false'].includes(d.value))return;
 try{localStorage.setItem(d.key,d.value)}catch(_){}
});
function toggleGuideMax(){
 const view=el('guide-view');if(!view)return;
 const active=view.classList.toggle('fullscreen');
 document.body.classList.toggle('guide-open',active);
 const button=el('guide-toggle');
 if(button)button.textContent=active?'✕ Close full screen':'⛶ Full screen';
}
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&el('guide-view')?.classList.contains('fullscreen'))toggleGuideMax();
});
function renderGuide(){
 document.body.classList.remove('guide-open');
 const target=el('tab-content');
 if(!S.guide?.html){target.innerHTML=blank('📖','No interactive guide yet','A complete HTML itinerary can be attached to this trip privately.');return}
 target.innerHTML='<div id="guide-view" class="guide-view"><div class="guide-toolbar"><p>Original itinerary · Private family view</p><button type="button" id="guide-toggle" class="btn sm" data-guide-max="1">⛶ Full screen</button></div><iframe id="original-guide-frame" class="guide-frame" title="Interactive itinerary" loading="eager" referrerpolicy="no-referrer" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"></iframe></div>';
 const frame=el('original-guide-frame');
 // Sandbox remains opaque-origin. Do not use allow-same-origin: original HTML may contain scripts.
 // A small virtual localStorage lets legacy trip checklist code work inside a sandboxed iframe.
 const preload=JSON.stringify(guidePreferences()).replace(/</g,'\\u003c');
 const shim='<'+'script>(function(){var cache='+preload+';var api={getItem:function(k){return Object.prototype.hasOwnProperty.call(cache,k)?cache[k]:null},setItem:function(k,v){cache[k]=String(v);try{parent.postMessage({type:"wallet-guide-check",key:k,value:String(v)},"*")}catch(e){}},removeItem:function(k){delete cache[k]},clear:function(){cache={}},key:function(i){return Object.keys(cache)[i]||null},get length(){return Object.keys(cache).length}};try{Object.defineProperty(window,"localStorage",{configurable:true,value:api})}catch(e){}})();<'+'/script>';
 let html=S.guide.html;
 if(/<head\b[^>]*>/i.test(html)){
   html=html.replace(/<head\b[^>]*>/i,match=>match+'<base target="_blank">'+shim);
 }else{
   html='<!doctype html><html><head><base target="_blank">'+shim+'</head><body>'+html+'</body></html>';
 }
 frame.srcdoc=html;
}

function fld(label,name,type='text',options={}){
 let attr=options.required?' required':'';
 let val=options.value===undefined?'':esc(options.value);
 if(type==='select')return '<label>'+esc(label)+'<select name="'+esc(name)+'">'+options.options.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('')+'</select></label>';
 if(type==='textarea')return '<label>'+esc(label)+'<textarea name="'+esc(name)+'">'+val+'</textarea></label>';
 return '<label>'+esc(label)+'<input type="'+esc(type)+'" name="'+esc(name)+'"'+attr+(type==='file'?' accept=".pdf,.jpg,.jpeg,.png,.webp,.pkpass"':' value="'+val+'"')+' placeholder="'+esc(options.placeholder||'')+'"></label>';
}
function editor(kind){
 el('dialog-title').textContent=({trip:'Create new trip',stop:'Add itinerary stop',reservation:'Save a booking',document:'Upload a private file'})[kind];
 let form=el('editor-form');form.dataset.kind=kind;
 let s='';
 if(kind==='trip')s=fld('Name','title','text',{required:true})+fld('Destinations','destinations')+fld('Start date','start_date','date',{required:true})+fld('End date','end_date','date',{required:true})+fld('Status','status','select',{options:['planning','upcoming','completed']})+fld('Emoji cover','emoji','text',{value:'✈️'})+fld('Description','description','textarea');
 if(kind==='stop')s=fld('Date','stop_date','date',{required:true,value:S.trip.start_date})+fld('Time (optional)','stop_time','time')+fld('Activity','title','text',{required:true})+fld('Place','place')+fld('Google Maps / Amap link','map_url','url')+fld('Transport and other notes','details','textarea');
 if(kind==='reservation')s=fld('Category','category','select',{options:['flight','hotel','train','transfer','activity','dining','other']})+fld('Booking title','title','text',{required:true})+fld('Provider','provider')+fld('Reference (kept private)','reference')+fld('Date/time','reservation_at','datetime-local')+fld('Status','status','select',{options:['confirmed','pending','cancelled']})+fld('Notes','notes','textarea');
 if(kind==='document')s='<div class="notice">Private storage only. Up to 15 MB each. Documents need internet access and authentication to open.</div>'+fld('Document title','title','text',{required:true})+fld('Category','category','select',{options:['boarding_pass','hotel_voucher','ticket','confirmation','insurance','other']})+fld('File','file','file',{required:true});
 form.innerHTML=s+'<button class="btn primary" type="submit">'+(kind==='document'?'🔒 Upload securely':'Save')+'</button>';
 el('editor').showModal();
}
async function save(e){
 e.preventDefault();let f=e.target,kind=f.dataset.kind,button=f.querySelector('[type=submit]'),d=Object.fromEntries(new FormData(f));button.disabled=true;
 try{
  if(kind==='trip'){
   if(d.end_date<d.start_date)throw Error('End date must not be earlier than start date.');
   let r=await S.api.from('trips').insert({title:d.title,destinations:d.destinations,start_date:d.start_date,end_date:d.end_date,status:d.status,description:d.description,emoji:d.emoji||'✈️'});
   if(r.error)throw r.error;await loadTrips();
  }else if(kind==='stop'){
   if(d.map_url&&!safe(d.map_url))throw Error('Only HTTPS map links are permitted.');
   let r=await S.api.from('trip_stops').insert({trip_id:S.trip.id,stop_date:d.stop_date,stop_time:d.stop_time||null,title:d.title,place:d.place,details:d.details,map_url:d.map_url});
   if(r.error)throw r.error;
  }else if(kind==='reservation'){
   let r=await S.api.from('reservations').insert({trip_id:S.trip.id,category:d.category,title:d.title,provider:d.provider,reference:d.reference,reservation_at:d.reservation_at?new Date(d.reservation_at).toISOString():null,status:d.status,notes:d.notes});
   if(r.error)throw r.error;
  }else if(kind==='document'){await uploadDocument(d)}
  el('editor').close();toast('Saved securely');
  if(kind!=='trip'){await loadData();tab()}
 }catch(err){toast(err.message||'Save failed',true)}finally{button.disabled=false}
}
async function uploadDocument(d){
 const file=d.file;
 if(!(file instanceof File)||file.size<1)throw Error('Choose a file.');
 if(file.size>15*1024*1024)throw Error('Maximum file size: 15 MB.');
 let ext=file.name.split('.').pop()?.toLowerCase();
 if(!['pdf','jpg','jpeg','png','webp','pkpass'].includes(ext))throw Error('Please use PDF, JPG, PNG, WebP or PKPASS.');
 let types=['application/pdf','image/jpeg','image/png','image/webp','application/vnd.apple.pkpass','application/octet-stream'];
 let mime=file.type||'application/octet-stream';if(!types.includes(mime))throw Error('Unsupported file type.');
 let path=S.trip.id+'/'+crypto.randomUUID()+'.'+ext;
 let u=await S.api.storage.from('travel-documents').upload(path,file,{contentType:mime,upsert:false});if(u.error)throw u.error;
 let r=await S.api.from('documents').insert({trip_id:S.trip.id,title:d.title,category:d.category,object_path:path,filename:file.name,content_type:mime,byte_size:file.size});
 if(r.error){await S.api.storage.from('travel-documents').remove([path]);throw r.error}
}
async function openDocument(id){
 let d=S.documents.find(x=>x.id===id);if(!d)return;
 let tab=window.open('about:blank','_blank');
 if(tab)tab.document.write('<p>Loading private document…</p>');
 let r=await S.api.storage.from('travel-documents').createSignedUrl(d.object_path,90);
 if(r.error){tab?.close();toast(r.error.message,true);return}
 if(tab)tab.location.href=r.data.signedUrl;else toast('Allow popups to view the private file.',true);
}
async function removeDocument(id){
 let d=S.documents.find(x=>x.id===id);if(!d||!confirm('Permanently delete this document?'))return;
 let r=await S.api.storage.from('travel-documents').remove([d.object_path]);if(r.error){toast(r.error.message,true);return}
 let rr=await S.api.from('documents').delete().eq('id',d.id);
 if(rr.error){toast(rr.error.message,true);return}
 await loadData();tab();toast('Document deleted');
}
bootstrap();
