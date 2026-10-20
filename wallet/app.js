// Travel Wallet v1: private data only in Supabase, NEVER in GitHub.
const el=id=>document.getElementById(id);
const cfg=window.TRAVEL_WALLET_CONFIG||{};
const S={api:null,session:null,member:false,trips:[],trip:null,stops:[],reservations:[],documents:[],guide:null,tab:'guide',packingItems:[],baseItems:[],packingFilter:'all',packingBaseReturn:'list',packingBusy:false};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hidden=(id,yes)=>el(id).classList.toggle('hidden',yes);
const date=v=>v?new Date(v.slice(0,10)+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'';
const safe=u=>{try{let x=new URL(u);return x.protocol==='https:'?x.href:''}catch{return''}};
const toast=(msg,bad=false)=>{let x=el('toast');x.textContent=msg;x.style.background=bad?'#a03232':'#173a32';x.style.display='block';setTimeout(()=>x.style.display='none',4500)};
const blank=(icon,title,msg)=>'<div class="blank"><div class="big">'+icon+'</div><h3>'+esc(title)+'</h3><p>'+esc(msg)+'</p></div>';
function note(msg,type){el('message').innerHTML=msg?'<div class="'+(type||'notice')+'">'+esc(msg)+'</div>':''}
function screen(){
 let active=Boolean(S.api&&S.session&&S.member),configured=Boolean(cfg.supabaseUrl&&cfg.supabasePublishableKey);
 hidden('setup-section',configured);hidden('auth-section',!configured||active);hidden('wallet-section',!active);hidden('logout-btn',!S.session);hidden('set-password-btn',!active);
 el('user-email').textContent=S.session?.user?.email||'';
 el('hero-actions').innerHTML=active?'<button id="quick-add" class="btn light">＋ New trip</button>':configured?'<span class="status">Members-only sign in</span>':'<span class="status pending">Secure vault setup required</span>';
 if(active)el('quick-add').onclick=()=>editor('trip');
}
async function bootstrap(){
 el('logout-btn').onclick=async()=>{await S.api.auth.signOut();S.session=null;S.member=false;screen()};
 el('login-form').onsubmit=login;
 el('password-login-form').onsubmit=loginPassword;
 el('set-password-btn').onclick=()=>el('password-dialog').showModal();
 el('set-password-form').onsubmit=setAccountPassword;
 el('password-close').onclick=()=>el('password-dialog').close();
 el('auth-password-tab').onclick=()=>authMethod('password');
 el('auth-email-tab').onclick=()=>authMethod('email');
 el('new-trip').onclick=()=>editor('trip');
 el('manage-base').onclick=()=>openBasePacking();
 el('base-back').onclick=closeBasePacking;
 el('base-add-entry').onclick=()=>packingEditor('base');
 el('back-to-trips').onclick=()=>{S.trip=null;hidden('trip-screen',true);hidden('list-screen',false)};
 el('add-entry').onclick=()=>S.tab==='packing'?packingEditor('trip'):editor(S.tab==='stops'?'stop':S.tab==='reservations'?'reservation':'document');
 el('close-dialog').onclick=()=>el('editor').close();
 el('editor-form').onsubmit=save;
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.tab;tab()});
 el('trip-list').onclick=e=>{let a=e.target.closest('[data-trip]');if(a)openTrip(a.dataset.trip)};
 el('tab-content').onclick=e=>{
   const max=e.target.closest('[data-guide-max]');if(max){toggleGuideMax();return}
   let a=e.target.closest('[data-open]');if(a){openDocument(a.dataset.open);return}
   let d=e.target.closest('[data-remove]');if(d){removeDocument(d.dataset.remove);return}
 };
 document.addEventListener('click',event=>{let btn=event.target.closest('[data-packing-action]');if(btn)handlePackingAction(btn)});
 document.addEventListener('change',event=>{let check=event.target.closest('[data-pack-check]');if(check)togglePackingCheck(check)});
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

function authMethod(method){
 const password=method==='password';
 hidden('password-login-form',!password);
 hidden('magic-login-panel',password);
 el('auth-password-tab').classList.toggle('active',password);
 el('auth-email-tab').classList.toggle('active',!password);
 note('');
}
async function loginPassword(e){
 e.preventDefault();
 const form=e.currentTarget,button=form.querySelector('[type=submit]'),values=new FormData(form);
 const email=String(values.get('email')||'').trim().toLowerCase();
 const password=String(values.get('password')||'');
 if(!email||!password){note('Enter your email and password.','error');return}
 button.disabled=true;
 try{
  const {error}=await S.api.auth.signInWithPassword({email,password});
  if(error)throw error;
  form.reset();
  note('');
 }catch(err){
  note(err.message||'Password sign-in failed. If you have not created a password yet, set it from your signed-in desktop or use an email link when the rate limit resets.','error');
 }finally{button.disabled=false}
}
async function setAccountPassword(e){
 e.preventDefault();
 if(!S.session||!S.member){toast('Sign in to the family wallet first.',true);return}
 const form=e.currentTarget,button=form.querySelector('[type=submit]'),values=new FormData(form);
 const password=String(values.get('password')||''),confirmPassword=String(values.get('confirm')||'');
 if(password.length<12){toast('Use at least 12 characters.',true);return}
 if(password!==confirmPassword){toast('The passwords do not match.',true);return}
 button.disabled=true;
 try{
  const {error}=await S.api.auth.updateUser({password});
  if(error)throw error;
  form.reset();
  el('password-dialog').close();
  toast('Password saved. You can now sign in on your phone using your email and password.');
 }catch(err){
  toast('Password not updated: '+(err.message||'Please try again'),true);
 }finally{button.disabled=false}
}

async function login(e){
 e.preventDefault();
 const form=e.currentTarget,button=form.querySelector('[type=submit]');
 const email=String(new FormData(form).get('email')||'').trim().toLowerCase();
 const last=Number(sessionStorage.getItem('wallet-last-magic-link')||'0');
 if(Date.now()-last<60000){note('Please wait at least 60 seconds between email-link requests.','notice');return}
 button.disabled=true;
 try{
  const r=await S.api.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname,shouldCreateUser:false}});
  if(r.error)throw r.error;
  sessionStorage.setItem('wallet-last-magic-link',String(Date.now()));
  note('Sign-in link sent. Open the email link on your phone in Safari.','success');
 }catch(err){
  const code=String(err?.code||'').toLowerCase(),message=String(err?.message||'');
  if(code.includes('over_email_send_rate_limit')||message.toLowerCase().includes('rate limit'))
   note('Supabase has reached its email quota (2 emails per hour for the entire project). Stop requesting links for now. If you are signed in on your desktop, use Set up password there, then choose Password on this phone. Otherwise try again after the sending allowance resets.','error');
  else note(message||'Unable to request a sign-in link.','error');
 }finally{button.disabled=false}
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
 hidden('base-screen',true);hidden('list-screen',true);hidden('trip-screen',false);S.packingFilter='all';
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
  S.api.from('trip_guides').select('html,filename').eq('trip_id',id).maybeSingle(),
   S.api.from('packing_trip_items').select('*').eq('trip_id',id).order('position').order('name'),
   S.api.from('packing_base_items').select('*').order('position').order('name')
 ]);
 for(let r of results){if(r.error){toast(r.error.message,true);return}}
 S.stops=results[0].data||[];S.reservations=results[1].data||[];S.documents=results[2].data||[];S.guide=results[3].data||null;S.packingItems=results[4].data||[];S.baseItems=results[5].data||[];
}
function tab(){
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===S.tab));
 let desc={guide:['Interactive travel guide',''],stops:['Timeline','＋ Add stop'],reservations:['Bookings','＋ Add booking'],documents:['Private documents','＋ Upload file'],packing:['Packing checklist','＋ Add item']};
 el('tab-title').textContent=desc[S.tab][0];el('add-entry').textContent=desc[S.tab][1];hidden('add-entry',S.tab==='guide');
 if(S.tab==='guide'){renderGuide();return}
  if(S.tab==='packing'){renderPacking('trip');return}
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

const guideKey=k=>/^japan-check-[0-9]{1,4}$/.test(k)||/^hkc_2026_task_[a-zA-Z0-9_-]{1,120}$/.test(k)||/^hk27_check_[0-9]{1,2}$/.test(k);
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
 const shim='<'+'script>(function(){var cache='+preload+';var api={getItem:function(k){return Object.prototype.hasOwnProperty.call(cache,k)?cache[k]:null},setItem:function(k,v){cache[k]=String(v);try{parent.postMessage({type:"wallet-guide-check",key:k,value:String(v)},"*")}catch(e){}},removeItem:function(k){delete cache[k]},clear:function(){cache={}},key:function(i){return Object.keys(cache)[i]||null},get length(){return Object.keys(cache).length}};try{Object.defineProperty(window,"localStorage",{configurable:true,value:api})}catch(e){}document.addEventListener("click",function(ev){var a=ev.target&&ev.target.closest?ev.target.closest("a"):null;if(!a)return;var href=a.getAttribute("href");if(!href||href.charAt(0)!="#")return;var target=document.getElementById(href.slice(1));if(!target)return;ev.preventDefault();var y=window.scrollY+target.getBoundingClientRect().top-14;window.scrollTo({top:Math.max(0,y),behavior:"smooth"})},true);})();<'+'/script>';
 let html=S.guide.html;
 if(/<head\b[^>]*>/i.test(html)){
   html=html.replace(/<head\b[^>]*>/i,match=>match+'<base target="_self">'+shim);
 }else{
   html='<!doctype html><html><head><base target="_self">'+shim+'</head><body>'+html+'</body></html>';
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
 e.preventDefault();let f=e.target,kind=f.dataset.kind,button=f.querySelector('[type=submit]'),d=Object.fromEntries(new FormData(f));button.disabled=true;let packWarning='';
 try{
  if(kind==='packing_item'){
   await savePackingItem(f,d);
   el('editor').close();toast('Packing item saved');return;
  }
  if(kind==='trip'){
   if(d.end_date<d.start_date)throw Error('End date must not be earlier than start date.');
   let r=await S.api.from('trips').insert({title:d.title,destinations:d.destinations,start_date:d.start_date,end_date:d.end_date,status:d.status,description:d.description,emoji:d.emoji||'✈️'}).select('id').single();
   if(r.error)throw r.error;
   try{
    let base=await S.api.from('packing_base_items').select('category,name,quantity,notes,position');
    if(base.error)throw base.error;
    if(base.data?.length){
     let clone=await S.api.from('packing_trip_items').insert(base.data.map(x=>({trip_id:r.data.id,category:x.category,name:x.name,quantity:x.quantity,notes:x.notes,position:x.position,packed:false})));
     if(clone.error)throw clone.error;
    }
   }catch(err){packWarning='Trip created, but the base packing list could not be copied: '+(err.message||'Please use Copy base list in Packing.')}
   await loadTrips();
  }else if(kind==='stop'){
   if(d.map_url&&!safe(d.map_url))throw Error('Only HTTPS map links are permitted.');
   let r=await S.api.from('trip_stops').insert({trip_id:S.trip.id,stop_date:d.stop_date,stop_time:d.stop_time||null,title:d.title,place:d.place,details:d.details,map_url:d.map_url});
   if(r.error)throw r.error;
  }else if(kind==='reservation'){
   let r=await S.api.from('reservations').insert({trip_id:S.trip.id,category:d.category,title:d.title,provider:d.provider,reference:d.reference,reservation_at:d.reservation_at?new Date(d.reservation_at).toISOString():null,status:d.status,notes:d.notes});
   if(r.error)throw r.error;
  }else if(kind==='document'){await uploadDocument(d)}
  el('editor').close();toast(packWarning||'Saved securely',Boolean(packWarning));
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

/* PACKING LISTS v2: private family base, independent editable per-trip copies. */
const PACK_CATEGORIES=['Documents','Clothing','Toiletries','Electronics','Health','Travel essentials','Family & kids','Other'];
const PACK_EMOJIS={'Documents':'🪪','Clothing':'👕','Toiletries':'🧴','Electronics':'🔌','Health':'🩹','Travel essentials':'🧳','Family & kids':'🧸','Other':'📦'};
const packKey=item=>(item.category+'|'+item.name).trim().toLocaleLowerCase();
function packGroups(items){
 const categories=[...new Set([...PACK_CATEGORIES,...items.map(x=>x.category)])];
 return categories.filter(cat=>items.some(x=>x.category===cat)).map(cat=>({
  category:cat,items:items.filter(x=>x.category===cat).slice().sort((a,b)=>(a.position||0)-(b.position||0)||a.name.localeCompare(b.name))
 }));
}
async function refreshPacking(scope){
 const table=scope==='base'?'packing_base_items':'packing_trip_items';
 let q=S.api.from(table).select('*').order('position').order('name');
 if(scope!=='base'){if(!S.trip)return false;q=q.eq('trip_id',S.trip.id)}
 const r=await q;
 if(r.error){toast('Unable to load packing list: '+r.error.message,true);return false}
 if(scope==='base')S.baseItems=r.data||[];else S.packingItems=r.data||[];
 return true;
}
function renderPacking(scope){
 const isBase=scope==='base', all=isBase?S.baseItems:S.packingItems;
 const target=el(isBase?'base-content':'tab-content');
 if(!target)return;
 const count=all.length, packed=isBase?0:all.filter(x=>x.packed).length;
 const percent=count?Math.round(packed/count*100):0;
 const shown=!isBase&&S.packingFilter==='unpacked'?all.filter(x=>!x.packed):all;
 const actionBtn=(action,label,extra='')=>'<button type="button" class="btn sm '+extra+'" data-packing-action="'+action+'">'+label+'</button>';
 let toolbar='<div class="pack-head"><div><span class="pack-eyebrow">'+(isBase?'REUSABLE HOUSEHOLD TEMPLATE':'PERSONAL TRIP CHECKLIST')+'</span><h3>'+(isBase?'Your base packing list':'Ready to pack?')+'</h3><p>'+(isBase?'Edit this list once, then copy it into any trip. Changes to the base never overwrite existing trips.':'Tick items as you pack. Your progress saves privately and syncs when you sign in on another device.')+'</p></div><span class="pack-counter">'+(isBase?count+' base items':packed+' / '+count+' packed')+'</span></div>';
 if(!isBase){
  toolbar+='<div class="pack-progress" role="progressbar" aria-label="Packing progress" aria-valuenow="'+percent+'" aria-valuemin="0" aria-valuemax="100"><div style="width:'+percent+'%"></div></div>';
  toolbar+='<div class="pack-progress-text">'+percent+'% complete'+(percent===100&&count?' · All packed!':'')+'</div>';
  toolbar+='<div class="pack-toolbar">'+actionBtn('copy-base','↙ Copy base into trip','primary')+actionBtn('open-base','⚙ Edit base list')+actionBtn('save-to-base','↗ Add trip items to base')+actionBtn('filter',S.packingFilter==='all'?'◯ Show unpacked only':'☑ Show all')+(packed?actionBtn('reset','↺ Reset packed ticks'):'')+'</div>';
 }else{
  toolbar+='<div class="notice pack-note">This is a shared family base list. Editing it will affect future copies, not checklists already saved to individual trips.</div><div class="pack-toolbar">'+actionBtn('add-base','＋ Add base item','primary')+'</div>';
 }
 let groups=packGroups(shown).map(g=>{
  const selected=g.items.length, completed=isBase?0:g.items.filter(x=>x.packed).length;
  return '<section class="pack-group"><div class="pack-group-heading"><h4><span aria-hidden="true">'+(PACK_EMOJIS[g.category]||'📦')+'</span> '+esc(g.category)+'</h4><span>'+(isBase?selected+' items':completed+' / '+selected+' packed')+'</span></div><div class="pack-rows">'+g.items.map(item=>{
   const checked=Boolean(item.packed);
   const marker=isBase?'<span class="pack-bullet" aria-hidden="true">•</span>':'<input type="checkbox" data-pack-check="'+esc(item.id)+'" aria-label="Pack '+esc(item.name)+'" '+(checked?'checked':'')+'>';
   return '<div class="pack-row '+(checked&&!isBase?'is-packed':'')+'"><label class="pack-item">'+marker+'<span class="pack-copy"><strong>'+esc(item.name)+'</strong>'+(item.notes?'<small>'+esc(item.notes)+'</small>':'')+'</span><span class="pack-quantity">×'+item.quantity+'</span></label><div class="pack-row-actions"><button type="button" data-packing-action="edit" data-pack-scope="'+scope+'" data-pack-id="'+esc(item.id)+'" aria-label="Edit '+esc(item.name)+'">Edit</button><button type="button" class="pack-delete" data-packing-action="delete" data-pack-scope="'+scope+'" data-pack-id="'+esc(item.id)+'" aria-label="Delete '+esc(item.name)+'">×</button></div></div>';
  }).join('')+'</div></section>';
 }).join('');
 const empty=shown.length?'':(count&&!isBase&&S.packingFilter==='unpacked'?blank('🎉','Everything is packed','Switch to Show all to review the complete list.'):blank('🧳',isBase?'Start your base list':'No packing items yet',isBase?'Add the essentials you use on every journey.':'Copy your base checklist here or add items individually.'));
 target.innerHTML='<div class="packing-ui">'+toolbar+(groups||empty)+'</div>';
}
async function openBasePacking(){
 if(!S.session||!S.member)return;
 S.packingBaseReturn=S.trip&&!el('trip-screen').classList.contains('hidden')?'trip':'list';
 hidden('list-screen',true);hidden('trip-screen',true);hidden('base-screen',false);
 el('base-content').innerHTML=blank('🧳','Loading base list','');
 if(await refreshPacking('base'))renderPacking('base');
 window.scrollTo({top:0});
}
function closeBasePacking(){
 hidden('base-screen',true);
 if(S.packingBaseReturn==='trip'&&S.trip){
  hidden('trip-screen',false);S.tab='packing';tab();
 }else{
  hidden('list-screen',false);
 }
 window.scrollTo({top:0});
}
function packingEditor(scope,id=''){
 const items=scope==='base'?S.baseItems:S.packingItems;
 const item=id?items.find(x=>x.id===id):null;
 if(id&&!item){toast('Packing item no longer exists.',true);return}
 if(scope==='trip'&&!S.trip)return;
 el('dialog-title').textContent=item?'Edit packing item':scope==='base'?'Add to base list':'Add packing item';
 const form=el('editor-form');
 form.dataset.kind='packing_item';form.dataset.scope=scope;form.dataset.itemId=id;
 const name=item?.name||'',category=item?.category||'Travel essentials',notes=item?.notes||'';
 const cats=[...new Set([...PACK_CATEGORIES,...items.map(x=>x.category)])];
 form.innerHTML='<label>Item name<input name="name" maxlength="150" placeholder="e.g. Packable rain jacket" value="'+esc(name)+'" required autofocus></label>'+
 '<label>Category<input name="category" list="pack-category-list" maxlength="60" value="'+esc(category)+'" required><datalist id="pack-category-list">'+cats.map(c=>'<option value="'+esc(c)+'"></option>').join('')+'</datalist></label>'+
 '<label>Quantity<input name="quantity" type="number" min="1" max="99" step="1" value="'+(item?.quantity||1)+'" required></label>'+
 '<label>Notes (optional)<textarea name="notes" maxlength="1000" placeholder="Size, who it belongs to, special reminders…">'+esc(notes)+'</textarea></label>'+
 '<div class="pack-editor-tip">'+(scope==='base'?'This changes your reusable template; it does not reset the checklist for past trips.':'Edits are saved only to this trip.')+'</div>'+
 '<button class="btn primary" type="submit">Save item</button>';
 el('editor').showModal();
}
async function savePackingItem(form,data){
 const scope=form.dataset.scope,table=scope==='base'?'packing_base_items':'packing_trip_items';
 if(scope!=='base'&&!S.trip)throw Error('Open a trip first.');
 const name=String(data.name||'').trim(),category=String(data.category||'').trim()||'Other';
 const quantity=Number(data.quantity),notes=String(data.notes||'').trim();
 if(!name||name.length>150)throw Error('Enter a packing item name (up to 150 characters).');
 if(!category||category.length>60)throw Error('Enter a valid category.');
 if(!Number.isInteger(quantity)||quantity<1||quantity>99)throw Error('Quantity must be 1–99.');
 if(notes.length>1000)throw Error('Notes must be 1000 characters or fewer.');
 const itemId=form.dataset.itemId;
 const current=scope==='base'?S.baseItems:S.packingItems;
 const payload={name,category,quantity,notes};
 let query;
 if(itemId){
  query=S.api.from(table).update(payload).eq('id',itemId);
  if(scope==='trip')query=query.eq('trip_id',S.trip.id);
 }else{
  const nextPosition=current.length?Math.max(...current.map(x=>x.position||0))+10:10;
  query=S.api.from(table).insert({...payload,position:nextPosition,...(scope==='trip'?{trip_id:S.trip.id}:{})});
 }
 const r=await query.select('id');
 if(r.error)throw r.error;
 if(itemId&&!r.data?.length)throw Error('Item was not updated; reload and try again.');
 if(!await refreshPacking(scope))throw Error('Saved, but could not refresh packing list.');
 renderPacking(scope);
}
async function togglePackingCheck(input){
 if(!S.trip||S.packingBusy)return;
 const item=S.packingItems.find(x=>x.id===input.dataset.packCheck);
 if(!item)return;
 const changed=input.checked;
 input.disabled=true;
 const r=await S.api.from('packing_trip_items').update({packed:changed}).eq('id',item.id).eq('trip_id',S.trip.id).select('id');
 if(r.error||!r.data?.length){
  input.checked=!changed;input.disabled=false;toast('Could not save packing progress: '+(r.error?.message||'Please retry'),true);
  return;
 }
 item.packed=changed;renderPacking('trip');
}
async function handlePackingAction(button){
 const action=button.dataset.packingAction;
 if(action==='open-base'){await openBasePacking();return}
 if(action==='add-base'){packingEditor('base');return}
 if(action==='filter'){S.packingFilter=S.packingFilter==='all'?'unpacked':'all';renderPacking('trip');return}
 if(action==='edit'){packingEditor(button.dataset.packScope,button.dataset.packId);return}
 if(S.packingBusy)return;
 const scope=button.dataset.packScope||'trip';
 S.packingBusy=true;button.disabled=true;
 try{
  if(action==='delete'){
   const source=scope==='base'?S.baseItems:S.packingItems;
   const item=source.find(x=>x.id===button.dataset.packId);
   if(!item)return;
   if(!confirm('Delete "'+item.name+'" from '+(scope==='base'?'the reusable base list?':'this trip?')))return;
   let q=S.api.from(scope==='base'?'packing_base_items':'packing_trip_items').delete().eq('id',item.id);
   if(scope==='trip')q=q.eq('trip_id',S.trip.id);
   const r=await q.select('id');
   if(r.error||!r.data?.length)throw r.error||Error('Delete did not complete.');
   if(await refreshPacking(scope))renderPacking(scope);
   toast('Packing item deleted.');
  }else if(action==='copy-base'){
   if(!S.trip)throw Error('Open a trip first.');
   if(!await refreshPacking('base'))return;
   const existing=new Set(S.packingItems.map(packKey));
   const missing=S.baseItems.filter(x=>!existing.has(packKey(x)));
   if(!missing.length){toast('This trip already has every base item.');return}
   const rows=missing.map(x=>({trip_id:S.trip.id,category:x.category,name:x.name,quantity:x.quantity,notes:x.notes,position:x.position,packed:false}));
   const r=await S.api.from('packing_trip_items').insert(rows);
   if(r.error)throw r.error;
   if(await refreshPacking('trip'))renderPacking('trip');
   toast('Added '+missing.length+' base items. Existing ticks and quantities were kept.');
  }else if(action==='save-to-base'){
   if(!S.trip)throw Error('Open a trip first.');
   if(!await refreshPacking('base'))return;
   const existing=new Set(S.baseItems.map(packKey));
   const missing=S.packingItems.filter(x=>!existing.has(packKey(x)));
   if(!missing.length){toast('All this trip’s items are already in the base.');return}
   const rows=missing.map(x=>({category:x.category,name:x.name,quantity:x.quantity,notes:x.notes,position:x.position}));
   const r=await S.api.from('packing_base_items').insert(rows);
   if(r.error)throw r.error;
   await refreshPacking('base');
   toast('Saved '+missing.length+' new items to the reusable base.');
  }else if(action==='reset'){
   if(!S.trip||!confirm('Mark every item on this trip as unpacked? This cannot be undone.'))return;
   const r=await S.api.from('packing_trip_items').update({packed:false}).eq('trip_id',S.trip.id);
   if(r.error)throw r.error;
   if(await refreshPacking('trip'))renderPacking('trip');
   toast('Packing ticks reset for this trip only.');
  }
 }catch(err){toast(err.message||'Packing update failed',true)}
 finally{S.packingBusy=false;if(button.isConnected)button.disabled=false}
}

bootstrap();
