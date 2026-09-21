const cfg = window.HUMANISTA_CONFIG || {};
const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const state = { user:null, profile:null, professional:null, professionals:[], associations:[], requests:[], appointments:[], schedules:[], services:[] };

const loginView=$('#loginView'), appView=$('#appView'), page=$('#page'), sidebar=$('#sidebar'), modal=$('#modal'), modalCard=$('#modalCard');
const globalMessage=$('#globalMessage'), moreMenu=$('#moreMenu');

function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function digits(v=''){return String(v).replace(/\D/g,'');}
function waPhone(v){let n=digits(v); if(n.length===10) n=(cfg.WHATSAPP_PAIS_DEFAULT||'52')+n; return n;}
function dateMX(v){if(!v)return '—'; const [y,m,d]=String(v).slice(0,10).split('-'); return `${d}/${m}/${y}`;}
function time12(v){if(!v)return '—'; const [h,m]=v.slice(0,5).split(':').map(Number); const hh=((h+11)%12)+1; return `${hh}:${String(m).padStart(2,'0')} ${h>=12?'p. m.':'a. m.'}`;}
function statusBadge(status){
  const map={pendiente:['Pendiente','pending'],asignada:['Asignada','ok'],contactada:['Contactada','neutral'],cita_agendada:['Cita agendada','ok'],cerrada:['Cerrada','neutral'],programada:['Programada','pending'],confirmada:['Confirmada','ok'],atendida:['Atendida','ok'],cancelada:['Cancelada','danger'],no_asistio:['No asistió','danger']};
  const [label,cls]=map[status]||[status,'neutral']; return `<span class="badge ${cls}">${label}</span>`;
}
function notify(text,type='success'){globalMessage.textContent=text;globalMessage.className=`message ${type}`;setTimeout(()=>globalMessage.classList.add('hidden'),4500);}
function showModal(html){modalCard.innerHTML=html;modal.classList.remove('hidden');}
function closeModal(){modal.classList.add('hidden');modalCard.innerHTML='';}
modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
modalCard.addEventListener('click',e=>{
  const btn=e.target.closest?.('#saveAssign');
  if(!btn)return;
  e.preventDefault();
  saveAssignmentFromModal(btn.dataset.requestId||'',btn);
});

// ============================================================
// DOCUMENTOS DE ASOCIACIONES (SUPABASE STORAGE)
// ============================================================
const DOCUMENT_BUCKET='documentos-humanista';

function safeFileName(name='archivo'){
  return String(name)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9._-]+/g,'-')
    .replace(/-+/g,'-')
    .replace(/^-|-$/g,'') || 'archivo';
}

async function uploadAssociationDocument(file,folder='documentos'){
  if(!file) throw new Error('Selecciona un archivo.');
  const max=10*1024*1024;
  if(file.size>max) throw new Error('El archivo supera el límite de 10 MB.');
  const allowed=['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp'];
  if(file.type && !allowed.includes(file.type)) throw new Error('Formato no permitido. Usa PDF, DOC, DOCX, JPG, PNG o WEBP.');
  const token=(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2));
  const path=`${folder}/${Date.now()}-${token}-${safeFileName(file.name)}`;
  const {error}=await db.storage.from(DOCUMENT_BUCKET).upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type||undefined});
  if(error) throw error;
  const {data}=db.storage.from(DOCUMENT_BUCKET).getPublicUrl(path);
  if(!data?.publicUrl) throw new Error('No fue posible obtener el enlace del archivo.');
  return data.publicUrl;
}

function setUploadStatus(id,text,type='ok'){
  const el=$(id);
  if(!el)return;
  el.textContent=text;
  el.className=`upload-status ${type}`;
}

$('#loginBtn').addEventListener('click',login);
$('#loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
$('#logoutBtn').addEventListener('click',async()=>{await db.auth.signOut();location.reload();});

async function login(){
  const email=$('#loginEmail').value.trim(), password=$('#loginPassword').value;
  const msg=$('#loginMessage'); msg.classList.add('hidden');
  const btn=$('#loginBtn'); btn.disabled=true; btn.textContent='Entrando...';
  try{const {data,error}=await db.auth.signInWithPassword({email,password}); if(error)throw error; await boot(data.user);}catch(e){console.error(e);msg.textContent='Correo o contraseña incorrectos.';msg.className='message error';}finally{btn.disabled=false;btn.textContent='Entrar';}
}

async function boot(user){
  state.user=user;
  const {data:profile,error}=await db.from('perfiles').select('*').eq('id',user.id).single();
  if(error||!profile||!profile.activo){await db.auth.signOut();throw new Error('Usuario sin perfil activo');}
  state.profile=profile;
  // Un administrador también puede atender pacientes. Si su cuenta está
  // vinculada a un registro de profesionales, lo cargamos como perfil clínico.
  const {data:professional}=await db.from('profesionales').select('*').eq('usuario_id',user.id).eq('activo',true).maybeSingle();
  state.professional=professional||null;
  if(profile.rol==='profesional'&&!state.professional) throw new Error('La cuenta no está vinculada a un profesional.');
  loginView.classList.add('hidden');appView.classList.remove('hidden');
  $('#userEmail').textContent=user.email||'';$('#roleLabel').textContent=profile.rol==='admin'?'Administración':'Profesional';
  renderNav(); await go(profile.rol==='admin'?'solicitudes':'pacientes');
}

function navIcon(id){
  const icons={
    solicitudes:'📩',
    pacientes:'👥',
    agenda:'📅',
    profesionales:'👩‍⚕️',
    servicios:'🛍️',
    horarios:'🕐',
    asociaciones:'🤝'
  };
  return icons[id]||'•';
}
function renderNav(){
  // En móvil quedan cinco accesos: Solicitudes, Pacientes, Citas,
  // Profesionales y Más. Servicios/Horarios/Asociaciones viven dentro de Más.
  const admin=[['solicitudes','Solicitudes'],['pacientes','Pacientes'],['agenda','Citas'],['profesionales','Profes.'],['servicios','Servicios'],['horarios','Horarios'],['asociaciones','Asociaciones']];
  const pro=[['pacientes','Mis pacientes'],['agenda','Mis citas'],['horarios','Mi disponibilidad']];
  const links=state.profile.rol==='admin'?admin:pro;
  sidebar.innerHTML=links.map(([id,label],i)=>`<button class="nav-btn ${state.profile.rol==='admin'&&i>3?'nav-extra':''}" data-page="${id}"><span class="nav-icon">${navIcon(id)}</span><span class="nav-label">${label}</span></button>`).join('') + (state.profile.rol==='admin'?`<button class="nav-btn nav-more" id="navMore" type="button"><span class="nav-icon">•••</span><span class="nav-label">Más</span></button>`:'');
  $$('.nav-btn[data-page]',sidebar).forEach(b=>b.onclick=()=>go(b.dataset.page));
  if($('#navMore')) $('#navMore').onclick=toggleMoreMenu;
  renderMoreMenu();
}
function renderMoreMenu(){
  if(!moreMenu)return;
  if(state.profile?.rol!=='admin'){moreMenu.classList.add('hidden');moreMenu.innerHTML='';return;}
  moreMenu.innerHTML=`<button data-more-page="servicios"><span>🛍️</span> Servicios</button><button data-more-page="horarios"><span>🕐</span> Horarios</button><button data-more-page="asociaciones"><span>🤝</span> Asociaciones</button>`;
  $$('[data-more-page]',moreMenu).forEach(b=>b.onclick=()=>{moreMenu.classList.add('hidden');go(b.dataset.morePage);});
}
function toggleMoreMenu(){
  if(!moreMenu)return;
  moreMenu.classList.toggle('hidden');
  moreMenu.setAttribute('aria-hidden',moreMenu.classList.contains('hidden')?'true':'false');
}
document.addEventListener('click',e=>{if(!moreMenu||moreMenu.classList.contains('hidden'))return;if(e.target.closest('#moreMenu')||e.target.closest('#navMore'))return;moreMenu.classList.add('hidden');});
async function go(name){
  $$('.nav-btn[data-page]',sidebar).forEach(b=>b.classList.toggle('active',b.dataset.page===name));
  if($('#navMore')) $('#navMore').classList.toggle('active',['servicios','horarios','asociaciones'].includes(name));
  if(moreMenu)moreMenu.classList.add('hidden');
  page.innerHTML='<div class="empty">Cargando...</div>';
  if(name==='solicitudes')return renderRequests();
  if(name==='pacientes')return renderPatients();
  if(name==='agenda')return renderAppointments();
  if(name==='profesionales')return renderProfessionals();
  if(name==='servicios')return renderServices();
  if(name==='asociaciones')return renderAssociations();
  if(name==='horarios')return state.profile.rol==='admin'?renderAdminSchedules():renderSchedules();
}

async function loadProfessionals(){const {data,error}=await db.from('profesionales').select('*').eq('activo',true).order('nombre');if(error)throw error;state.professionals=data||[];}
async function loadAssociations(){const {data,error}=await db.from('asociaciones').select('*, formularios(*)').eq('activo',true).order('nombre');if(error)throw error;state.associations=(data||[]).map(a=>({...a,formularios:(a.formularios||[]).filter(f=>f.activo).sort((x,y)=>x.orden-y.orden)}));}
async function loadServices(includeInactive=true){let q=db.from('servicios').select('*, profesional_servicios(profesional_id,activo)').order('nombre');if(!includeInactive)q=q.eq('activo',true);const {data,error}=await q;if(error)throw error;state.services=data||[];}

async function renderRequests(){
  try{
    await Promise.all([loadProfessionals(),loadAssociations()]);
    const {data,error}=await db.from('solicitudes_atencion').select('*, profesionales(nombre,whatsapp), asociaciones(nombre,consentimiento_url)').neq('estado','cerrada').order('created_at',{ascending:false});
    if(error)throw error;
    state.requests=data||[];
    const pending=state.requests.filter(r=>r.estado==='pendiente').length;
    const assigned=state.requests.filter(r=>r.profesional_id).length;
    const withAppt=state.requests.filter(r=>r.estado==='cita_agendada').length;
    page.innerHTML=`<div class="section-head"><div><h2>Solicitudes</h2><p>Aquí administración recibe la solicitud, asigna al profesional y puede contactar al paciente.</p></div></div>
      <div class="stats request-stats"><div class="stat"><strong>${state.requests.length}</strong><span>Total</span></div><div class="stat"><strong>${pending}</strong><span>Sin asignar</span></div><div class="stat"><strong>${assigned}</strong><span>Asignadas</span></div><div class="stat"><strong>${withAppt}</strong><span>Con cita</span></div></div>
      <div class="toolbar"><select id="reqFilter"><option value="all">Todas</option><option value="pendiente">Sin asignar</option><option value="assigned">Asignadas</option></select><input id="reqSearch" placeholder="Buscar paciente o teléfono"></div>
      <div class="list" id="requestList"></div>`;
    $('#reqFilter').onchange=paintRequests;
    $('#reqSearch').oninput=paintRequests;
    paintRequests();
  }catch(e){console.error(e);page.innerHTML='<div class="message error">No se pudieron cargar las solicitudes.</div>';}
}
function paintRequests(){
  const filter=$('#reqFilter')?.value||'all', q=($('#reqSearch')?.value||'').toLowerCase().trim();
  const rows=state.requests.filter(r=>{
    const stateOk=filter==='all'||(filter==='pendiente'&&!r.profesional_id)||(filter==='assigned'&&!!r.profesional_id);
    return stateOk&&(!q||r.nombre.toLowerCase().includes(q)||r.telefono.includes(q));
  });
  const box=$('#requestList');
  if(!rows.length){box.innerHTML='<div class="empty">No hay solicitudes con este filtro.</div>';return;}
  box.innerHTML=rows.map(r=>requestCard(r)).join('');
  $$('[data-assign]').forEach(b=>b.onclick=()=>openAssign(b.dataset.assign));
  $$('[data-wa-patient]').forEach(b=>b.onclick=()=>waPatient(b.dataset.waPatient));
  $$('[data-wa-professional]').forEach(b=>b.onclick=()=>waProfessional(b.dataset.waProfessional));
  $$('[data-edit-request]').forEach(b=>b.onclick=()=>openRequestEdit(b.dataset.editRequest));
  $$('[data-del-request]').forEach(b=>b.onclick=()=>deleteRequest(b.dataset.delRequest));
}
function requestCard(r){
  const pro=r.profesionales?.nombre||'Sin asignar';
  return `<article class="item request-card"><div class="item-top"><div><h3>${esc(r.nombre)}</h3><div class="meta">📱 ${esc(r.telefono)}<br>Profesional: <strong>${esc(pro)}</strong><br>Recibida: ${new Date(r.created_at).toLocaleString('es-MX')}</div></div>${r.profesional_id?'<span class="badge ok">Asignada</span>':'<span class="badge pending">Pendiente</span>'}</div>
    <div class="request-actions"><button type="button" class="btn btn-soft" data-assign="${r.id}">${r.profesional_id?'Cambiar profesional':'Asignar profesional'}</button>${r.profesional_id?`<button type="button" class="btn btn-whatsapp" data-wa-professional="${r.id}">WhatsApp profesional</button>`:''}<button type="button" class="btn btn-whatsapp" data-wa-patient="${r.id}">WhatsApp paciente</button><button type="button" class="btn btn-soft" data-edit-request="${r.id}">Editar</button><button type="button" class="btn btn-danger" data-del-request="${r.id}">Eliminar</button></div></article>`;
}
function openRequestEdit(id){
  const r=state.requests.find(x=>x.id===id);if(!r)return;
  showModal(`<div class="modal-head"><div><h3>Editar solicitud</h3><div class="help">Actualiza los datos del paciente y su asignación.</div></div><button class="icon-btn" id="x">✕</button></div>
    <div class="field"><label>Nombre</label><input id="reqEditName" value="${esc(r.nombre||'')}"></div>
    <div class="field"><label>Teléfono</label><input id="reqEditPhone" inputmode="tel" value="${esc(r.telefono||'')}"></div>
    <div class="field"><label>Profesional</label><select id="reqEditPro"><option value="">Sin asignar</option>${state.professionals.map(p=>`<option value="${p.id}" ${r.profesional_id===p.id?'selected':''}>${esc(p.nombre)}</option>`).join('')}</select></div>
    <div class="field"><label>Asociación</label><select id="reqEditAssoc"><option value="">Sin asociación</option>${state.associations.map(a=>`<option value="${a.id}" ${r.asociacion_id===a.id?'selected':''}>${esc(a.nombre)}</option>`).join('')}</select></div>
    <button class="btn btn-primary btn-block" id="saveRequestEdit">Guardar cambios</button>`);
  $('#x').onclick=closeModal;
  $('#saveRequestEdit').onclick=async()=>{
    const nombre=$('#reqEditName').value.trim(),telefono=digits($('#reqEditPhone').value),profesional_id=$('#reqEditPro').value||null,asociacion_id=$('#reqEditAssoc').value||null;
    if(nombre.length<2)return alert('Escribe un nombre válido.');
    if(telefono.length<10||telefono.length>15)return alert('Escribe un teléfono de 10 a 15 dígitos.');
    const payload={nombre,telefono,profesional_id,asociacion_id};
    if(!profesional_id){payload.estado='pendiente';payload.fecha_asignacion=null;}
    else if(!r.profesional_id||r.estado==='pendiente'){payload.estado='asignada';payload.fecha_asignacion=new Date().toISOString();}
    const {error}=await db.from('solicitudes_atencion').update(payload).eq('id',id);
    if(error)return alert(error.message);
    closeModal();notify('Solicitud actualizada.');renderRequests();
  };
}
async function deleteRequest(id){
  const r=state.requests.find(x=>x.id===id);
  if(!r||!confirm(`¿Eliminar definitivamente la solicitud de ${r.nombre}? Esta acción no se puede deshacer.`))return;
  const {error}=await db.from('solicitudes_atencion').delete().eq('id',id);
  if(error)return alert(error.message);
  notify('Solicitud eliminada.');renderRequests();
}
function openAssign(id){
  const r=state.requests.find(x=>x.id===id); if(!r)return;
  showModal(`<div class="modal-head"><div><h3>${r.profesional_id?'Cambiar asignación':'Asignar profesional'}</h3><div class="help">${esc(r.nombre)} · ${esc(r.telefono)}</div></div><button type="button" class="icon-btn" id="x">✕</button></div>
    <div class="field"><label>Profesional</label><select id="assignPro"><option value="">Seleccionar...</option>${state.professionals.map(p=>`<option value="${p.id}" ${r.profesional_id===p.id?'selected':''}>${esc(p.nombre)}</option>`).join('')}</select></div>
    <div class="field"><label>Asociación</label><select id="assignAssoc"><option value="">Sin asociación</option>${state.associations.map(a=>`<option value="${a.id}" ${r.asociacion_id===a.id?'selected':''}>${esc(a.nombre)}</option>`).join('')}</select><div class="help">La asociación define el consentimiento y formularios que aparecerán después en Pacientes.</div></div>
    <div id="assignMessage" class="message hidden"></div>
    <button type="button" class="btn btn-primary btn-block" id="saveAssign" data-request-id="${r.id}">Guardar asignación</button>`);
  $('#x').onclick=closeModal;
}

async function saveAssignmentFromModal(id,btn){
  const msg=$('#assignMessage');
  const profesional_id=$('#assignPro')?.value||null;
  const asociacion_id=$('#assignAssoc')?.value||null;
  if(!msg||!btn)return;
  if(!id){msg.textContent='No pude identificar la solicitud. Cierra esta ventana y vuelve a abrirla.';msg.className='message error';return;}
  if(!profesional_id){msg.textContent='Selecciona un profesional.';msg.className='message error';return;}

  btn.disabled=true;
  btn.textContent='Guardando…';
  msg.textContent='Guardando asignación…';
  msg.className='message';

  try{
    const updatePromise=db.from('solicitudes_atencion')
      .update({profesional_id,asociacion_id,estado:'asignada',fecha_asignacion:new Date().toISOString()})
      .eq('id',id)
      .select('id,profesional_id,asociacion_id,estado')
      .maybeSingle();
    const timeoutPromise=new Promise((_,reject)=>setTimeout(()=>reject(new Error('La conexión tardó demasiado. Intenta nuevamente.')),15000));
    const {data,error}=await Promise.race([updatePromise,timeoutPromise]);
    if(error)throw error;
    if(!data)throw new Error('La solicitud no se actualizó. Revisa los permisos de administración en Supabase.');

    closeModal();
    notify('Paciente asignado. Ya puedes avisarle desde “WhatsApp profesional”.');
    await renderRequests();
  }catch(e){
    console.error('Error guardando asignación:',e);
    msg.textContent='No se pudo guardar: '+(e?.message||'Error desconocido');
    msg.className='message error';
    btn.disabled=false;
    btn.textContent='Guardar asignación';
  }
}

function waPatient(id){
  const r=state.requests.find(x=>x.id===id);if(!r)return;
  const p=state.professionals.find(x=>x.id===r.profesional_id);
  const text=p?`Hola ${r.nombre} 😊 Somos de Red de Atención Psicológica Humanista. Tu solicitud fue asignada a ${p.nombre}. Nos pondremos en contacto contigo para continuar tu proceso.`:`Hola ${r.nombre} 😊 Recibimos tu solicitud en Red de Atención Psicológica Humanista. En breve te asignaremos a un profesional.`;
  window.open(`https://wa.me/${waPhone(r.telefono)}?text=${encodeURIComponent(text)}`,'_blank');
}

function waProfessional(id){
  const r=state.requests.find(x=>x.id===id);if(!r)return;
  const p=state.professionals.find(x=>x.id===r.profesional_id)||r.profesionales;
  if(!p?.whatsapp)return alert('El profesional asignado no tiene un WhatsApp registrado.');
  const assoc=state.associations.find(x=>x.id===r.asociacion_id)?.nombre||'Sin asociación asignada';
  const text=`Hola ${p.nombre||''} 😊 Te fue asignado un nuevo paciente en Red de Atención Psicológica Humanista.

Paciente: ${r.nombre}
Teléfono: ${r.telefono}
Asociación: ${assoc}

Por favor, ponte en contacto para continuar con su proceso de atención.`;
  window.open(`https://wa.me/${waPhone(p.whatsapp)}?text=${encodeURIComponent(text)}`,'_blank');
}

function consentLandingUrl(formUrl,request,association){
  if(!formUrl)return '';
  const u=new URL('./consentimiento.html',window.location.href);
  u.searchParams.set('form',formUrl);
  if(request?.nombre)u.searchParams.set('nombre',request.nombre);
  if(association?.nombre)u.searchParams.set('asociacion',association.nombre);
  return u.toString();
}

async function renderPatients(){
  try{
    if(state.profile.rol==='admin')await loadProfessionals();
    let q=db.from('solicitudes_atencion').select('*, profesionales(nombre,whatsapp), asociaciones(nombre,consentimiento_url, formularios(*))').not('profesional_id','is',null).neq('estado','cerrada').order('created_at',{ascending:false});
    if(state.profile.rol==='profesional')q=q.eq('profesional_id',state.professional.id);
    const {data,error}=await q;
    if(error)throw error;
    state.requests=(data||[]).map(r=>({...r,asociaciones:r.asociaciones?{...r.asociaciones,formularios:(r.asociaciones.formularios||[]).filter(f=>f.activo).sort((a,b)=>a.orden-b.orden)}:null}));
    const admin=state.profile.rol==='admin';
    page.innerHTML=`<div class="section-head"><div><h2>${admin?'Pacientes':'Mis pacientes'}</h2><p>${admin?'Seguimiento clínico y administrativo de los pacientes ya asignados.':'Aquí das seguimiento a tus pacientes asignados.'}</p></div></div>
      ${admin?`<div class="toolbar patient-toolbar"><select id="patientPro"><option value="all">Todos los profesionales</option>${state.professional?`<option value="mine">Mis pacientes</option>`:''}${state.professionals.map(p=>`<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select><input id="patientSearch" placeholder="Buscar paciente o teléfono"></div>`:`<div class="toolbar patient-toolbar"><input id="patientSearch" placeholder="Buscar paciente o teléfono"></div>`}
      <div class="list" id="patientList"></div>`;
    const paint=()=>paintPatients();
    if($('#patientPro'))$('#patientPro').onchange=paint;
    $('#patientSearch').oninput=paint;
    paint();
  }catch(e){console.error(e);page.innerHTML='<div class="message error">No se pudieron cargar los pacientes.</div>';}
}
function paintPatients(){
  const qtxt=($('#patientSearch')?.value||'').toLowerCase().trim();
  const filter=$('#patientPro')?.value||'all';
  const rows=state.requests.filter(r=>{
    let proOk=true;
    if(filter==='mine')proOk=!!state.professional&&r.profesional_id===state.professional.id;
    else if(filter!=='all')proOk=r.profesional_id===filter;
    return proOk&&(!qtxt||r.nombre.toLowerCase().includes(qtxt)||r.telefono.includes(qtxt));
  });
  const box=$('#patientList');
  if(!rows.length){box.innerHTML='<div class="empty">No hay pacientes con este filtro.</div>';return;}
  box.innerHTML=rows.map(r=>patientCard(r)).join('');
  $$('[data-patient-wa]').forEach(b=>b.onclick=()=>contactPatient(b.dataset.patientWa));
  $$('[data-patient-detail]').forEach(b=>b.onclick=()=>openPatientDetail(b.dataset.patientDetail));
}
function patientCard(r){
  const admin=state.profile.rol==='admin';
  const pro=r.profesionales?.nombre||'Profesional';
  const assoc=r.asociaciones?.nombre||'Sin asociación';
  return `<article class="item patient-card"><div class="item-top"><div><h3>${esc(r.nombre)}</h3><div class="meta">📱 ${esc(r.telefono)}${admin?`<br>Profesional: <strong>${esc(pro)}</strong>`:''}<br>Asociación: ${esc(assoc)}</div></div>${statusBadge(r.estado)}</div>
    <div class="progress patient-progress"><span class="progress-step ${r.consentimiento_estado==='completado'?'done':''}">Consentimiento</span><span class="progress-step ${r.formularios_estado==='completado'?'done':''}">Formularios</span><span class="progress-step ${r.estado==='cita_agendada'?'done':''}">Cita</span></div>
    <div class="patient-actions"><button class="btn btn-whatsapp" data-patient-wa="${r.id}">WhatsApp</button><button class="btn btn-soft" data-patient-detail="${r.id}">Ver paciente</button></div></article>`;
}

function openPatientDetail(id){
  const r=state.requests.find(x=>x.id===id);if(!r)return;
  const admin=state.profile.rol==='admin';
  const pro=r.profesionales?.nombre||state.professional?.nombre||'Profesional';
  const assoc=r.asociaciones?.nombre||'Sin asociación';
  showModal(`<div class="modal-head"><div><h3>${esc(r.nombre)}</h3><div class="help">Ficha de seguimiento · solo equipo interno</div></div><button class="icon-btn" id="x">✕</button></div>
    <div class="patient-summary"><div><strong>${esc(pro)}</strong><small>${admin?'Profesional asignado':'Tu paciente'}</small></div><span>${esc(r.telefono)}</span></div>
    <div class="patient-detail-meta"><span>Asociación: <strong>${esc(assoc)}</strong></span>${statusBadge(r.estado)}</div>
    <div class="progress patient-progress patient-progress-detail"><span class="progress-step ${r.consentimiento_estado==='completado'?'done':''}">Consentimiento</span><span class="progress-step ${r.formularios_estado==='completado'?'done':''}">Formularios</span><span class="progress-step ${r.estado==='cita_agendada'?'done':''}">Cita</span></div>
    <div class="detail-action-grid">
      <button class="btn btn-soft" id="detailFollow">Consentimiento / formularios</button>
      <button class="btn btn-primary" id="detailAppt">+ Agendar cita</button>
      <button class="btn btn-note" id="detailNotes">🔒 Notas internas</button>
      <button class="btn btn-whatsapp" id="detailWa">WhatsApp</button>
    </div>
    <div class="internal-note-hint">Las notas internas solo pueden verlas administración y el profesional asignado.</div>
    <div class="divider"></div>
    <button class="btn btn-danger btn-compact" id="detailClose">Cerrar proceso</button>`);
  $('#x').onclick=closeModal;
  $('#detailFollow').onclick=()=>openPatientDocuments(id);
  $('#detailAppt').onclick=()=>openAppointmentForm(id);
  $('#detailNotes').onclick=()=>openPatientNotes(id);
  $('#detailWa').onclick=()=>contactPatient(id);
  $('#detailClose').onclick=async()=>{closeModal();await closePatientProcess(id);};
}

async function openPatientNotes(id){
  const r=state.requests.find(x=>x.id===id);if(!r)return;
  const {data,error}=await db.from('notas_paciente').select('*').eq('solicitud_id',id).order('created_at',{ascending:false});
  if(error){
    console.error(error);
    return alert('No se pudieron cargar las notas. Ejecuta primero 04_notas_internas.sql.');
  }
  const notes=data||[];
  const authorName=state.profile.rol==='admin'?(state.profile.nombre||'Administración'):(state.professional?.nombre||state.profile.nombre||'Profesional');
  const canManage=n=>state.profile.rol==='admin'||n.created_by===state.user.id;
  showModal(`<div class="modal-head"><div><h3>🔒 Notas internas</h3><div class="help">${esc(r.nombre)} · visibles solo para el equipo autorizado</div></div><button class="icon-btn" id="x">✕</button></div>
    <div class="note-editor"><textarea id="newPatientNote" maxlength="5000" placeholder="Escribe una nota interna sobre seguimiento, acuerdos u observaciones..."></textarea><div class="note-editor-foot"><small>Autor: ${esc(authorName)}</small><button class="btn btn-primary" id="savePatientNote">Agregar nota</button></div></div>
    <div class="divider"></div>
    <div class="note-list">${notes.length?notes.map(n=>`<article class="note-card"><div class="note-head"><div><strong>${esc(n.autor_nombre||'Equipo')}</strong><small>${new Date(n.created_at).toLocaleString('es-MX')}</small></div>${canManage(n)?`<div class="note-actions"><button class="note-link" data-note-edit="${n.id}">Editar</button><button class="note-link danger" data-note-delete="${n.id}">Eliminar</button></div>`:''}</div><div class="note-body">${esc(n.contenido).replace(/\n/g,'<br>')}</div></article>`).join(''):'<div class="empty compact-empty">Todavía no hay notas internas.</div>'}</div>`);
  $('#x').onclick=()=>openPatientDetail(id);
  $('#savePatientNote').onclick=async()=>{
    const contenido=$('#newPatientNote').value.trim();
    if(!contenido)return alert('Escribe una nota.');
    const {error}=await db.from('notas_paciente').insert({solicitud_id:id,autor_nombre:authorName,contenido});
    if(error)return alert(error.message);
    notify('Nota guardada.');openPatientNotes(id);
  };
  $$('[data-note-edit]',modalCard).forEach(b=>b.onclick=async()=>{
    const note=notes.find(n=>n.id===b.dataset.noteEdit);if(!note)return;
    const contenido=prompt('Editar nota interna:',note.contenido);if(contenido===null)return;
    if(!contenido.trim())return alert('La nota no puede quedar vacía.');
    const {error}=await db.from('notas_paciente').update({contenido:contenido.trim()}).eq('id',note.id);
    if(error)return alert(error.message);notify('Nota actualizada.');openPatientNotes(id);
  });
  $$('[data-note-delete]',modalCard).forEach(b=>b.onclick=async()=>{
    if(!confirm('¿Eliminar esta nota interna?'))return;
    const {error}=await db.from('notas_paciente').delete().eq('id',b.dataset.noteDelete);
    if(error)return alert(error.message);notify('Nota eliminada.');openPatientNotes(id);
  });
}

function contactPatient(id){
  const r=state.requests.find(x=>x.id===id);if(!r)return;
  const pro=r.profesionales?.nombre||state.professional?.nombre||'Red Humanista';
  const text=`Hola ${r.nombre} 😊 Soy ${pro}, de Red de Atención Psicológica Humanista. Me pongo en contacto contigo para dar seguimiento a tu proceso de atención.`;
  window.open(`https://wa.me/${waPhone(r.telefono)}?text=${encodeURIComponent(text)}`,'_blank');
  if(r.estado==='asignada')db.from('solicitudes_atencion').update({estado:'contactada'}).eq('id',r.id);
}
async function closePatientProcess(id){
  const r=state.requests.find(x=>x.id===id);if(!r)return;
  if(!confirm(`¿Cerrar el proceso de ${r.nombre}?`))return;
  const {error}=await db.from('solicitudes_atencion').update({estado:'cerrada'}).eq('id',id);
  if(error)return notify(error.message,'error');
  notify('Proceso cerrado.');renderPatients();
}
function openPatientDocuments(id){
  const r=state.requests.find(x=>x.id===id),a=r?.asociaciones,forms=(a?.formularios||[]).filter(f=>f.activo).sort((x,y)=>x.orden-y.orden);if(!r)return;
  showModal(`<div class="modal-head"><div><h3>Seguimiento del paciente</h3><div class="help">${esc(r.nombre)}</div></div><button class="icon-btn" id="x">✕</button></div>${!a?'<div class="message error">Administración debe asignar primero una asociación para habilitar consentimiento y formularios.</div>':`<div class="patient-summary"><strong>${esc(a.nombre)}</strong><span>${esc(r.profesionales?.nombre||state.professional?.nombre||'')}</span></div><div class="divider"></div><div class="follow-block"><div><span class="follow-number">1</span><strong>Consentimiento informado</strong><small>Estado: ${esc(r.consentimiento_estado)}</small></div><div class="follow-actions"><button id="pc" class="btn btn-whatsapp" ${!a.consentimiento_url?'disabled':''}>Enviar</button><button id="pcDone" class="btn btn-success">Marcar completado</button></div></div><div class="divider"></div><div class="follow-block"><div><span class="follow-number">2</span><strong>Formularios / documentos</strong><small>Estado: ${esc(r.formularios_estado)}</small>${forms.length?`<div class="form-mini-list">${forms.map(f=>`<span>• ${esc(f.nombre)}</span>`).join('')}</div>`:'<div class="help">No hay formularios configurados.</div>'}</div><div class="follow-actions"><button id="pf" class="btn btn-whatsapp" ${r.consentimiento_estado!=='completado'||!forms.length?'disabled':''}>Enviar</button><button id="pfDone" class="btn btn-success" ${r.consentimiento_estado!=='completado'?'disabled':''}>Marcar completados</button></div></div>`}`);
  $('#x').onclick=closeModal;if(!a)return;
  $('#pc').onclick=async()=>{const link=consentLandingUrl(a.consentimiento_url,r,a);const text=`Hola ${r.nombre} 😊 Antes de continuar, revisa el consentimiento informado. Al presionar “Aceptar y continuar” se abrirá el Google Forms para registrar tu consentimiento:\n\n${link}`;window.open(`https://wa.me/${waPhone(r.telefono)}?text=${encodeURIComponent(text)}`,'_blank');await db.from('solicitudes_atencion').update({consentimiento_estado:'enviado',consentimiento_enviado_at:new Date().toISOString()}).eq('id',r.id);};
  $('#pcDone').onclick=async()=>{await db.from('solicitudes_atencion').update({consentimiento_estado:'completado',consentimiento_completado_at:new Date().toISOString()}).eq('id',r.id);closeModal();notify('Consentimiento marcado como completado.');renderPatients();};
  $('#pf').onclick=async()=>{const links=forms.map((f,i)=>`${i+1}. ${f.nombre}: ${f.url}`).join('\n');window.open(`https://wa.me/${waPhone(r.telefono)}?text=${encodeURIComponent(`Hola ${r.nombre} 😊 Ahora revisa o completa los siguientes formularios/documentos:\n\n${links}`)}`,'_blank');await db.from('solicitudes_atencion').update({formularios_estado:'enviado',formularios_enviados_at:new Date().toISOString()}).eq('id',r.id);};
  $('#pfDone').onclick=async()=>{await db.from('solicitudes_atencion').update({formularios_estado:'completado',formularios_completados_at:new Date().toISOString()}).eq('id',r.id);closeModal();notify('Formularios marcados como completados.');renderPatients();};
}

async function openAppointmentForm(requestId, appointment=null){
  let r=state.requests.find(x=>x.id===requestId);
  if(!r&&requestId){
    const {data,error}=await db.from('solicitudes_atencion').select('*').eq('id',requestId).maybeSingle();
    if(error)return alert(error.message);
    r=data||null;
    if(r)state.requests=[...state.requests.filter(x=>x.id!==r.id),r];
  }
  if(!r&&!appointment)return;
  if(state.profile.rol==='profesional'&&r&&r.profesional_id!==state.professional?.id)return alert('Solo puedes agendar citas para tus pacientes asignados.');
  const req=r||{id:appointment.solicitud_id,nombre:appointment.paciente_nombre,telefono:appointment.paciente_telefono,profesional_id:appointment.profesional_id};
  const targetProfessional=state.profile.rol==='profesional'?state.professional?.id:(appointment?.profesional_id||r?.profesional_id||null);
  try{await loadServices(false);}catch(e){console.error(e);state.services=[];}
  const allowedServices=state.services.filter(s=>{const rels=(s.profesional_servicios||[]).filter(x=>x.activo);return !rels.length||!targetProfessional||rels.some(x=>x.profesional_id===targetProfessional);});
  const serviceOptions=allowedServices.map(s=>`<option value="${s.id}" data-duration="${s.duracion_min}" ${appointment?.servicio_id===s.id?'selected':''}>${esc(s.nombre)} · ${s.duracion_min} min</option>`).join('');
  showModal(`<div class="modal-head"><div><h3>${appointment?'Mover / editar cita':'Registrar cita'}</h3><div class="help">${esc(req.nombre)}</div></div><button class="icon-btn" id="x">✕</button></div>
    <div class="field"><label>Servicio</label><select id="apptService"><option value="">Sin servicio específico</option>${serviceOptions}</select></div>
    <div class="grid-2"><div class="field"><label>Fecha</label><input id="apptDate" type="date" value="${appointment?.fecha||''}"></div><div class="field"><label>Hora</label><input id="apptTime" type="time" value="${appointment?.hora_inicio?.slice(0,5)||''}"></div></div>
    <div class="field"><label>Duración (minutos)</label><input id="apptDuration" type="number" min="15" max="240" step="15" value="${appointment?.duracion_min||60}"></div>
    <div class="field"><label>Notas (opcional)</label><textarea id="apptNotes">${esc(appointment?.notas||'')}</textarea></div>
    <button class="btn btn-primary" id="saveAppt">Guardar cita</button>`);
  $('#x').onclick=closeModal;
  $('#apptService').onchange=()=>{const op=$('#apptService').selectedOptions[0];if(op?.dataset.duration)$('#apptDuration').value=op.dataset.duration;};
  $('#saveAppt').onclick=async()=>{const fecha=$('#apptDate').value,hora=$('#apptTime').value,duracion=Number($('#apptDuration').value||60),notas=$('#apptNotes').value.trim(),servicio_id=$('#apptService').value||null;if(!fecha||!hora)return alert('Selecciona fecha y hora.');
    const profesional_id=state.profile.rol==='profesional'?state.professional?.id:(appointment?.profesional_id||r?.profesional_id||state.professional?.id);if(!profesional_id)return alert('No hay profesional asignado.');
    const payload={solicitud_id:req.id||null,profesional_id,servicio_id,paciente_nombre:req.nombre,paciente_telefono:req.telefono,fecha,hora_inicio:hora,duracion_min:duracion,notas};let result;
    if(appointment)result=await db.from('citas').update(payload).eq('id',appointment.id);else result=await db.from('citas').insert(payload);if(result.error)return alert(result.error.message);
    if(req.id)await db.from('solicitudes_atencion').update({estado:'cita_agendada'}).eq('id',req.id);closeModal();notify('Cita guardada.');appointment?renderAppointments():renderPatients();};
}


async function openProfessionalAppointmentPicker(){
  if(!state.professional)return alert('Tu cuenta no está vinculada a un profesional.');
  const {data,error}=await db.from('solicitudes_atencion').select('id,nombre,telefono,profesional_id,estado').eq('profesional_id',state.professional.id).neq('estado','cerrada').order('nombre');
  if(error)return alert(error.message);
  const patients=data||[];
  if(!patients.length)return alert('Todavía no tienes pacientes asignados para agendar.');
  showModal(`<div class="modal-head"><div><h3>Nueva cita</h3><div class="help">Selecciona uno de tus pacientes.</div></div><button class="icon-btn" id="x">✕</button></div><div class="field"><label>Paciente</label><select id="proNewPatient"><option value="">Selecciona...</option>${patients.map(p=>`<option value="${p.id}">${esc(p.nombre)} · ${esc(p.telefono)}</option>`).join('')}</select></div><button id="continueProAppt" class="btn btn-primary btn-block">Continuar</button>`);
  $('#x').onclick=closeModal;
  $('#continueProAppt').onclick=()=>{const id=$('#proNewPatient').value;if(!id)return alert('Selecciona un paciente.');closeModal();openAppointmentForm(id);};
}

async function renderAppointments(){
  try{
    if(state.profile.rol==='admin')await loadProfessionals();
    let q=db.from('citas').select('*, profesionales(nombre), servicios(nombre,duracion_min), solicitudes_atencion(asociacion_id)').order('fecha',{ascending:true}).order('hora_inicio',{ascending:true});
    if(state.profile.rol==='profesional')q=q.eq('profesional_id',state.professional.id);
    const {data,error}=await q;if(error)throw error;state.appointments=data||[];
    const today=new Date().toISOString().slice(0,10),todayCount=state.appointments.filter(a=>a.fecha===today&&a.estado!=='cancelada').length,upcoming=state.appointments.filter(a=>a.fecha>=today&&!['cancelada','atendida'].includes(a.estado)).length,confirmed=state.appointments.filter(a=>a.estado==='confirmada').length;
    page.innerHTML=`<div class="section-head"><div><h2>${state.profile.rol==='admin'?'Citas':'Mis citas'}</h2><p>Consulta, edita y da seguimiento a las citas registradas.</p></div>${state.profile.rol==='admin'?'<button id="newAdminAppt" class="btn btn-primary">+ Nueva cita</button>':'<button id="newProAppt" class="btn btn-primary">+ Nueva cita</button>'}</div>
      <div class="stats"><div class="stat"><strong>${state.appointments.length}</strong><span>Total</span></div><div class="stat"><strong>${todayCount}</strong><span>Hoy</span></div><div class="stat"><strong>${upcoming}</strong><span>Próximas</span></div><div class="stat"><strong>${confirmed}</strong><span>Confirmadas</span></div></div>
      <div class="toolbar"><select id="apptStatus"><option value="all">Todos los estados</option><option value="programada">Programadas</option><option value="confirmada">Confirmadas</option><option value="atendida">Atendidas</option><option value="cancelada">Canceladas</option><option value="no_asistio">No asistió</option></select>${state.profile.rol==='admin'?`<select id="apptPro"><option value="all">Todos los profesionales</option>${state.professionals.map(p=>`<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select>`:''}<input class="grow" id="apptSearch" placeholder="Buscar paciente o teléfono"></div>
      <div class="list" id="appointmentList"></div>`;
    const paint=()=>{const st=$('#apptStatus')?.value||'all',pr=$('#apptPro')?.value||'all',qtxt=($('#apptSearch')?.value||'').toLowerCase().trim();const rows=state.appointments.filter(a=>(st==='all'||a.estado===st)&&(pr==='all'||a.profesional_id===pr)&&(!qtxt||a.paciente_nombre.toLowerCase().includes(qtxt)||String(a.paciente_telefono||'').includes(qtxt)));const box=$('#appointmentList');box.innerHTML=rows.length?rows.map(a=>`<article class="item"><div class="item-top"><div><h3>${esc(a.paciente_nombre)}</h3><div class="meta">📅 ${dateMX(a.fecha)} · ${time12(a.hora_inicio)} · ${a.duracion_min} min<br>${a.servicios?.nombre?`Servicio: <strong>${esc(a.servicios.nombre)}</strong><br>`:''}${state.profile.rol==='admin'?`Profesional: <strong>${esc(a.profesionales?.nombre||'—')}</strong><br>`:''}📱 ${esc(a.paciente_telefono)}</div></div>${statusBadge(a.estado)}</div><div class="actions"><button class="btn btn-soft" data-edit-appt="${a.id}">Editar</button><button class="btn btn-whatsapp" data-confirm-appt="${a.id}">WhatsApp</button><button class="btn btn-light" data-img-appt="${a.id}">Confirmación</button>${a.estado!=='atendida'?`<button class="btn btn-success" data-attended="${a.id}">Atendida</button>`:''}${a.estado!=='cancelada'?`<button class="btn btn-danger" data-cancel="${a.id}">Cancelar</button>`:''}<button class="btn btn-danger" data-delete-appt="${a.id}">Eliminar</button></div></article>`).join(''):'<div class="empty">No hay citas con este filtro.</div>';
      $$('[data-edit-appt]').forEach(b=>b.onclick=()=>{const a=state.appointments.find(x=>x.id===b.dataset.editAppt);state.profile.rol==='admin'?openAdminAppointmentForm(a):openAppointmentForm(a.solicitud_id,a);});$$('[data-confirm-appt]').forEach(b=>b.onclick=()=>confirmAppointment(b.dataset.confirmAppt));$$('[data-img-appt]').forEach(b=>b.onclick=()=>appointmentImage(b.dataset.imgAppt));$$('[data-attended]').forEach(b=>b.onclick=()=>updateAppointmentStatus(b.dataset.attended,'atendida'));$$('[data-cancel]').forEach(b=>b.onclick=()=>updateAppointmentStatus(b.dataset.cancel,'cancelada'));$$('[data-delete-appt]').forEach(b=>b.onclick=()=>deleteAppointment(b.dataset.deleteAppt));
    };
    $('#apptStatus').onchange=paint;if($('#apptPro'))$('#apptPro').onchange=paint;$('#apptSearch').oninput=paint;if($('#newAdminAppt'))$('#newAdminAppt').onclick=()=>openAdminAppointmentForm();if($('#newProAppt'))$('#newProAppt').onclick=openProfessionalAppointmentPicker;paint();
  }catch(e){console.error(e);page.innerHTML='<div class="message error">No se pudo cargar el panel de citas. Si acabas de actualizar el proyecto, ejecuta el archivo SQL de mejoras en Supabase.</div>';}
}
async function updateAppointmentStatus(id,estado){const {error}=await db.from('citas').update({estado}).eq('id',id);if(error)return notify(error.message,'error');notify('Cita actualizada.');renderAppointments();}

async function deleteAppointment(id){
  const a=state.appointments.find(x=>x.id===id);
  if(!a)return;
  if(!confirm(`¿Eliminar definitivamente la cita de ${a.paciente_nombre} del ${dateMX(a.fecha)} a las ${time12(a.hora_inicio)}? Esta acción no se puede deshacer.`))return;

  const btn=document.querySelector(`[data-delete-appt="${id}"]`);
  if(btn){btn.disabled=true;btn.textContent='Eliminando…';}

  try{
    const {error}=await db.from('citas').delete().eq('id',id);
    if(error)throw error;

    // Si la cita estaba ligada a una solicitud y ya no quedan más citas para ese paciente,
    // regresa el seguimiento a "Asignada" para que pueda volver a agendarse.
    if(a.solicitud_id){
      const {count,error:countError}=await db.from('citas').select('id',{count:'exact',head:true}).eq('solicitud_id',a.solicitud_id);
      if(countError)console.warn('No se pudo comprobar si quedan otras citas:',countError);
      else if((count||0)===0){
        const {error:reqError}=await db.from('solicitudes_atencion').update({estado:'asignada'}).eq('id',a.solicitud_id).eq('estado','cita_agendada');
        if(reqError)console.warn('La cita se eliminó, pero no se pudo actualizar el estado de la solicitud:',reqError);
      }
    }

    notify('Cita eliminada.');
    await renderAppointments();
  }catch(e){
    console.error('Error eliminando cita:',e);
    alert('No se pudo eliminar la cita: '+(e?.message||'Error desconocido'));
    if(btn){btn.disabled=false;btn.textContent='Eliminar';}
  }
}
function confirmAppointment(id){const a=state.appointments.find(x=>x.id===id);if(!a)return;const pro=a.profesionales?.nombre||state.professional?.nombre||'tu profesional';const text=`Hola ${a.paciente_nombre} 😊 Tu cita con Red de Atención Psicológica Humanista está programada.\n\n👤 Profesional: ${pro}\n📅 Fecha: ${dateMX(a.fecha)}\n🕐 Hora: ${time12(a.hora_inicio)}\n\nSi necesitas hacer un cambio, comunícate con nosotros.`;window.open(`https://wa.me/${waPhone(a.paciente_telefono)}?text=${encodeURIComponent(text)}`,'_blank');}
function appointmentImage(id){const a=state.appointments.find(x=>x.id===id);if(!a)return;const pro=a.profesionales?.nombre||state.professional?.nombre||'Profesional';showModal(`<div class="modal-head"><h3>Confirmación de cita</h3><button class="icon-btn" id="x">✕</button></div><div class="confirmation-preview" id="confirmation"><div class="confirm-mark"><img src="./logo-humanista.png" alt="Red Humanista"></div><h3>Red de Atención Psicológica Humanista</h3><p>Confirmación de cita</p><div class="big-date">${dateMX(a.fecha)} · ${time12(a.hora_inicio)}</div><p><strong>${esc(a.paciente_nombre)}</strong></p><p>Profesional: ${esc(pro)}</p>${a.servicios?.nombre?`<p>Servicio: ${esc(a.servicios.nombre)}</p>`:''}</div><button class="btn btn-primary" id="downloadConfirm" style="margin-top:12px">Descargar imagen</button>`);$('#x').onclick=closeModal;$('#downloadConfirm').onclick=async()=>{const canvas=await html2canvas($('#confirmation'),{scale:2,backgroundColor:'#ffffff'});const link=document.createElement('a');link.download=`confirmacion-${a.paciente_nombre.replace(/\s+/g,'-').toLowerCase()}.png`;link.href=canvas.toDataURL('image/png');link.click();};}


async function openAdminAppointmentForm(a=null){
  try{await Promise.all([loadProfessionals(),loadServices(false)]);}catch(e){console.error(e);return alert('No se pudieron cargar profesionales o servicios.');}
  const serviceOptions=state.services.map(s=>`<option value="${s.id}" data-duration="${s.duracion_min}" ${a?.servicio_id===s.id?'selected':''}>${esc(s.nombre)} · ${s.duracion_min} min</option>`).join('');
  showModal(`<div class="modal-head"><div><h3>${a?'Editar cita':'Nueva cita'}</h3><div class="help">Registro administrativo</div></div><button class="icon-btn" id="x">✕</button></div>
    <div class="grid-2"><div class="field"><label>Paciente</label><input id="admPatient" value="${esc(a?.paciente_nombre||'')}"></div><div class="field"><label>Teléfono</label><input id="admPhone" inputmode="tel" value="${esc(a?.paciente_telefono||'')}"></div></div>
    <div class="field"><label>Profesional</label><select id="admPro"><option value="">Selecciona...</option>${state.professionals.map(p=>`<option value="${p.id}" ${a?.profesional_id===p.id?'selected':''}>${esc(p.nombre)}</option>`).join('')}</select></div>
    <div class="field"><label>Servicio</label><select id="admService"><option value="">Sin servicio específico</option>${serviceOptions}</select></div>
    <div class="grid-2"><div class="field"><label>Fecha</label><input id="admDate" type="date" value="${a?.fecha||''}"></div><div class="field"><label>Hora</label><input id="admTime" type="time" value="${a?.hora_inicio?.slice(0,5)||''}"></div></div>
    <div class="grid-2"><div class="field"><label>Duración</label><input id="admDuration" type="number" min="15" max="240" step="15" value="${a?.duracion_min||60}"></div><div class="field"><label>Estado</label><select id="admStatus"><option value="programada" ${a?.estado==='programada'?'selected':''}>Programada</option><option value="confirmada" ${a?.estado==='confirmada'?'selected':''}>Confirmada</option><option value="atendida" ${a?.estado==='atendida'?'selected':''}>Atendida</option><option value="cancelada" ${a?.estado==='cancelada'?'selected':''}>Cancelada</option><option value="no_asistio" ${a?.estado==='no_asistio'?'selected':''}>No asistió</option></select></div></div>
    <div class="field"><label>Notas</label><textarea id="admNotes">${esc(a?.notas||'')}</textarea></div><button class="btn btn-primary" id="saveAdminAppt">Guardar cita</button>`);
  $('#x').onclick=closeModal;$('#admService').onchange=()=>{const op=$('#admService').selectedOptions[0];if(op?.dataset.duration)$('#admDuration').value=op.dataset.duration;};
  $('#saveAdminAppt').onclick=async()=>{const paciente_nombre=$('#admPatient').value.trim(),paciente_telefono=digits($('#admPhone').value),profesional_id=$('#admPro').value,servicio_id=$('#admService').value||null,fecha=$('#admDate').value,hora_inicio=$('#admTime').value,duracion_min=Number($('#admDuration').value||60),estado=$('#admStatus').value,notas=$('#admNotes').value.trim();if(!paciente_nombre||paciente_telefono.length<10||!profesional_id||!fecha||!hora_inicio)return alert('Completa paciente, teléfono, profesional, fecha y hora.');const payload={solicitud_id:a?.solicitud_id||null,paciente_nombre,paciente_telefono,profesional_id,servicio_id,fecha,hora_inicio,duracion_min,estado,notas};const result=a?await db.from('citas').update(payload).eq('id',a.id):await db.from('citas').insert(payload);if(result.error)return alert(result.error.message);if(a?.solicitud_id)await db.from('solicitudes_atencion').update({estado:'cita_agendada'}).eq('id',a.solicitud_id);closeModal();notify('Cita guardada.');renderAppointments();};
}

async function renderServices(){
  try{await Promise.all([loadServices(true),loadProfessionals()]);const active=state.services.filter(s=>s.activo).length;page.innerHTML=`<div class="section-head"><div><h2>Servicios</h2><p>Administra los tipos de atención y su duración. También puedes asignarlos a profesionales.</p></div><button id="newService" class="btn btn-primary">+ Nuevo servicio</button></div><div class="stats"><div class="stat"><strong>${state.services.length}</strong><span>Total</span></div><div class="stat"><strong>${active}</strong><span>Activos</span></div><div class="stat"><strong>${state.professionals.length}</strong><span>Profesionales</span></div><div class="stat"><strong>${state.services.reduce((n,s)=>n+(s.profesional_servicios||[]).filter(x=>x.activo).length,0)}</strong><span>Asignaciones</span></div></div><div class="list">${state.services.length?state.services.map(s=>{const ids=(s.profesional_servicios||[]).filter(x=>x.activo).map(x=>x.profesional_id),names=state.professionals.filter(p=>ids.includes(p.id)).map(p=>p.nombre);return `<article class="item"><div class="item-top"><div><h3>${esc(s.nombre)}</h3><div class="meta">Duración: ${s.duracion_min} min${s.descripcion?`<br>${esc(s.descripcion)}`:''}</div>${names.length?`<div class="service-tags">${names.map(n=>`<span class="service-tag">${esc(n)}</span>`).join('')}</div>`:'<div class="meta">Sin profesionales asignados</div>'}</div><span class="badge ${s.activo?'ok':'neutral'}">${s.activo?'Activo':'Inactivo'}</span></div><div class="actions"><button class="btn btn-soft" data-edit-service="${s.id}">Editar</button><button class="btn btn-danger" data-del-service="${s.id}">Eliminar</button></div></article>`}).join(''):'<div class="empty">No hay servicios. Crea el primero.</div>'}</div>`;$('#newService').onclick=()=>openServiceForm();$$('[data-edit-service]').forEach(b=>b.onclick=()=>openServiceForm(state.services.find(x=>x.id===b.dataset.editService)));$$('[data-del-service]').forEach(b=>b.onclick=()=>deleteService(b.dataset.delService));}catch(e){console.error(e);page.innerHTML='<div class="message error">No se pudieron cargar los servicios. Ejecuta 02_mejoras_panel.sql una vez en Supabase.</div>';}
}
async function deleteService(id){
  const s=state.services.find(x=>x.id===id);if(!s)return;
  if(!confirm(`¿Eliminar el servicio “${s.nombre}”? Las citas anteriores conservarán sus datos, pero el servicio dejará de estar disponible.`))return;
  const {error}=await db.from('servicios').delete().eq('id',id);
  if(error)return alert(error.message);
  notify('Servicio eliminado.');renderServices();
}

function openServiceForm(s=null){const assigned=new Set((s?.profesional_servicios||[]).filter(x=>x.activo).map(x=>x.profesional_id));showModal(`<div class="modal-head"><div><h3>${s?'Editar servicio':'Nuevo servicio'}</h3><div class="help">Configura el servicio y a quiénes se puede asignar.</div></div><button class="icon-btn" id="x">✕</button></div><div class="field"><label>Nombre</label><input id="serviceName" value="${esc(s?.nombre||'')}"></div><div class="field"><label>Descripción (opcional)</label><textarea id="serviceDesc">${esc(s?.descripcion||'')}</textarea></div><div class="field"><label>Duración (minutos)</label><input id="serviceDuration" type="number" min="15" max="240" step="15" value="${s?.duracion_min||60}"></div><label class="field-check"><input id="serviceActive" type="checkbox" ${s?.activo===false?'':'checked'}> Servicio activo</label><div class="divider"></div><div class="help"><strong>Profesionales</strong> · deja todos sin marcar si el servicio es general.</div><div class="check-list">${state.professionals.map(p=>`<label class="check-option"><input type="checkbox" name="servicePro" value="${p.id}" ${assigned.has(p.id)?'checked':''}>${esc(p.nombre)}</label>`).join('')||'<div class="help">Primero crea profesionales.</div>'}</div><div class="divider"></div><button class="btn btn-primary" id="saveService">Guardar servicio</button>`);$('#x').onclick=closeModal;$('#saveService').onclick=async()=>{const nombre=$('#serviceName').value.trim(),descripcion=$('#serviceDesc').value.trim()||null,duracion_min=Number($('#serviceDuration').value||60),activo=$('#serviceActive').checked,pros=$$('input[name="servicePro"]:checked').map(x=>x.value);if(!nombre)return alert('Escribe el nombre del servicio.');let id=s?.id;if(s){const {error}=await db.from('servicios').update({nombre,descripcion,duracion_min,activo}).eq('id',id);if(error)return alert(error.message);}else{const {data,error}=await db.from('servicios').insert({nombre,descripcion,duracion_min,activo}).select('id').single();if(error)return alert(error.message);id=data.id;}const del=await db.from('profesional_servicios').delete().eq('servicio_id',id);if(del.error)return alert(del.error.message);if(pros.length){const {error}=await db.from('profesional_servicios').insert(pros.map(profesional_id=>({profesional_id,servicio_id:id,activo:true})));if(error)return alert(error.message);}closeModal();notify('Servicio guardado.');renderServices();};}

async function renderAdminSchedules(){
  try{await loadProfessionals();const {data,error}=await db.from('horarios').select('*, profesionales(nombre)').order('dia_semana').order('hora_inicio');if(error)throw error;state.schedules=data||[];const days=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];page.innerHTML=`<div class="section-head"><div><h2>Horarios</h2><p>Disponibilidad interna de cada profesional. Estos horarios no se muestran al paciente.</p></div><button id="newAdminSchedule" class="btn btn-primary">+ Agregar horario</button></div><div class="toolbar"><select id="scheduleProFilter"><option value="all">Todos los profesionales</option>${state.professionals.map(p=>`<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></div><div id="scheduleList" class="schedule-grid"></div>`;const paint=()=>{const f=$('#scheduleProFilter').value,rows=state.schedules.filter(h=>f==='all'||h.profesional_id===f);$('#scheduleList').innerHTML=rows.length?rows.map(h=>`<article class="item schedule-card"><div class="item-top"><div><h3>${days[h.dia_semana]}</h3><div class="meta"><strong>${esc(h.profesionales?.nombre||'Profesional')}</strong><br>${time12(h.hora_inicio)} a ${time12(h.hora_fin)}</div></div><span class="badge ${h.activo?'ok':'neutral'}">${h.activo?'Activo':'Inactivo'}</span></div><div class="actions"><button class="btn btn-soft" data-admin-edit-schedule="${h.id}">Editar</button><button class="btn btn-danger" data-admin-del-schedule="${h.id}">Eliminar</button></div></article>`).join(''):'<div class="empty">No hay horarios con este filtro.</div>';$$('[data-admin-edit-schedule]').forEach(b=>b.onclick=()=>openAdminSchedule(state.schedules.find(x=>x.id===b.dataset.adminEditSchedule)));$$('[data-admin-del-schedule]').forEach(b=>b.onclick=async()=>{if(!confirm('¿Eliminar este horario?'))return;const {error}=await db.from('horarios').delete().eq('id',b.dataset.adminDelSchedule);if(error)return alert(error.message);renderAdminSchedules();});};$('#scheduleProFilter').onchange=paint;$('#newAdminSchedule').onclick=()=>openAdminSchedule();paint();}catch(e){console.error(e);page.innerHTML='<div class="message error">No se pudieron cargar los horarios.</div>';}
}

function openAdminSchedule(h=null){const days=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];showModal(`<div class="modal-head"><h3>${h?'Editar':'Agregar'} horario</h3><button class="icon-btn" id="x">✕</button></div><div class="field"><label>Profesional</label><select id="adminSchPro"><option value="">Selecciona...</option>${state.professionals.map(p=>`<option value="${p.id}" ${h?.profesional_id===p.id?'selected':''}>${esc(p.nombre)}</option>`).join('')}</select></div><div class="field"><label>Día</label><select id="adminSchDay">${days.map((d,i)=>`<option value="${i}" ${h?.dia_semana===i?'selected':''}>${d}</option>`).join('')}</select></div><div class="grid-2"><div class="field"><label>Desde</label><input id="adminSchStart" type="time" value="${h?.hora_inicio?.slice(0,5)||'09:00'}"></div><div class="field"><label>Hasta</label><input id="adminSchEnd" type="time" value="${h?.hora_fin?.slice(0,5)||'17:00'}"></div></div><label class="field-check"><input id="adminSchActive" type="checkbox" ${h?.activo===false?'':'checked'}> Horario activo</label><button id="saveAdminSchedule" class="btn btn-primary">Guardar</button>`);$('#x').onclick=closeModal;$('#saveAdminSchedule').onclick=async()=>{const payload={profesional_id:$('#adminSchPro').value,dia_semana:Number($('#adminSchDay').value),hora_inicio:$('#adminSchStart').value,hora_fin:$('#adminSchEnd').value,activo:$('#adminSchActive').checked};if(!payload.profesional_id)return alert('Selecciona un profesional.');if(payload.hora_inicio>=payload.hora_fin)return alert('La hora final debe ser posterior.');const result=h?await db.from('horarios').update(payload).eq('id',h.id):await db.from('horarios').insert(payload);if(result.error)return alert(result.error.message);closeModal();notify('Horario guardado.');renderAdminSchedules();};}

async function renderProfessionals(){
  await loadProfessionals();
  // Refresca el vínculo del administrador por si se acaba de crear.
  if(state.profile.rol==='admin'){
    const mine=state.professionals.find(p=>p.usuario_id===state.user.id)||null;
    state.professional=mine;
  }
  page.innerHTML=`<div class="section-head"><div><h2>Profesionales</h2><p>Crea accesos, registra WhatsApp y asigna pacientes.</p></div><div class="head-actions">${!state.professional?'<button id="selfPro" class="btn btn-soft">También atiendo pacientes</button>':''}<button id="newPro" class="btn btn-primary">+ Nuevo profesional</button></div></div>
    ${state.professional?`<div class="self-pro-note"><span>✓</span><div><strong>Tu cuenta también está vinculada como profesional</strong><small>Puedes asignarte pacientes desde Solicitudes y verlos en Pacientes → Mis pacientes.</small></div></div>`:''}
    <div class="list">${state.professionals.length?state.professionals.map(p=>`<article class="item"><div class="item-top"><div><h3>${esc(p.nombre)} ${p.usuario_id===state.user.id?'<span class="mini-you">Tú</span>':''}</h3><div class="meta">WhatsApp: ${esc(p.whatsapp||'Sin registrar')}<br>Acceso: ${p.usuario_id?'Activo':'Sin acceso'}</div></div><span class="badge ${p.usuario_id?'ok':'pending'}">${p.usuario_id?'Con acceso':'Pendiente'}</span></div><div class="actions"><button class="btn btn-soft" data-edit-pro="${p.id}">Editar</button><button class="btn btn-danger" data-del-pro="${p.id}">Eliminar</button></div></article>`).join(''):'<div class="empty">No hay profesionales.</div>'}</div>`;
  $('#newPro').onclick=()=>openProfessionalForm();
  if($('#selfPro'))$('#selfPro').onclick=openAdminProfessionalForm;
  $$('[data-edit-pro]').forEach(b=>b.onclick=()=>openProfessionalForm(state.professionals.find(x=>x.id===b.dataset.editPro)));
  $$('[data-del-pro]').forEach(b=>b.onclick=()=>deleteProfessional(b.dataset.delPro));
}
async function deleteProfessional(id){
  const p=state.professionals.find(x=>x.id===id);if(!p)return;
  if(!confirm(`¿Eliminar a ${p.nombre}? Sus horarios y asignaciones se eliminarán. Si tiene citas registradas, el sistema no permitirá borrarlo.`))return;
  const {count,error:countError}=await db.from('citas').select('id',{count:'exact',head:true}).eq('profesional_id',id);
  if(countError)return alert(countError.message);
  if((count||0)>0)return alert('No se puede eliminar este profesional porque tiene citas registradas. Reasigna o elimina esas citas primero.');
  if(p.usuario_id&&p.usuario_id!==state.user.id){
    const session=(await db.auth.getSession()).data.session;
    if(!session)return alert('Tu sesión expiró. Vuelve a iniciar sesión.');
    const res=await fetch('/api/delete-professional',{method:'DELETE',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({professional_id:id})});
    const out=await res.json();
    if(!res.ok)return alert(out.error||'No se pudo eliminar el profesional.');
  }else{
    const {error}=await db.from('profesionales').delete().eq('id',id);
    if(error)return alert(error.message);
    if(p.usuario_id===state.user.id)state.professional=null;
  }
  notify('Profesional eliminado.');renderProfessionals();
}
function openAdminProfessionalForm(){
  showModal(`<div class="modal-head"><div><h3>También atiendo pacientes</h3><div class="help">Vincula tu cuenta de administrador a un perfil profesional. Seguirás conservando todos los permisos de administración.</div></div><button class="icon-btn" id="x">✕</button></div><div class="field"><label>Nombre profesional</label><input id="selfProName" value="${esc(state.profile?.nombre||'')}"></div><div class="field"><label>WhatsApp</label><input id="selfProWa" inputmode="tel" placeholder="6561234567"></div><button id="saveSelfPro" class="btn btn-primary btn-block">Activar mi perfil profesional</button>`);
  $('#x').onclick=closeModal;
  $('#saveSelfPro').onclick=async()=>{
    const nombre=$('#selfProName').value.trim(),whatsapp=digits($('#selfProWa').value);
    if(!nombre||whatsapp.length<10)return alert('Completa nombre y WhatsApp.');
    const {data,error}=await db.from('profesionales').insert({usuario_id:state.user.id,nombre,whatsapp,activo:true}).select('*').single();
    if(error)return alert(error.message);
    state.professional=data;
    closeModal();notify('Tu cuenta ya puede recibir pacientes.');renderProfessionals();
  };
}
function openProfessionalForm(p=null){showModal(`<div class="modal-head"><div><h3>${p?'Editar profesional':'Nuevo profesional'}</h3><div class="help">${p?'Puedes actualizar sus datos.':'Se creará su cuenta de acceso y su perfil profesional.'}</div></div><button class="icon-btn" id="x">✕</button></div><div class="field"><label>Nombre</label><input id="proName" value="${esc(p?.nombre||'')}"></div><div class="field"><label>WhatsApp</label><input id="proWa" inputmode="tel" value="${esc(p?.whatsapp||'')}"></div>${p?'':`<div class="field"><label>Correo de acceso</label><input id="proEmail" type="email"></div><div class="field"><label>Contraseña temporal</label><input id="proPass" type="password" minlength="8"></div>`}<button id="savePro" class="btn btn-primary btn-block">Guardar</button>`);$('#x').onclick=closeModal;$('#savePro').onclick=async()=>{const nombre=$('#proName').value.trim(),whatsapp=digits($('#proWa').value);if(!nombre||whatsapp.length<10)return alert('Completa nombre y WhatsApp.');if(p){const {error}=await db.from('profesionales').update({nombre,whatsapp}).eq('id',p.id);if(error)return alert(error.message);if(p.usuario_id===state.user.id)state.professional={...p,nombre,whatsapp};closeModal();renderProfessionals();return;}
    const email=$('#proEmail').value.trim(),password=$('#proPass').value;if(!email||password.length<8)return alert('Escribe correo y una contraseña de al menos 8 caracteres.');const session=(await db.auth.getSession()).data.session;const res=await fetch('/api/create-user',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session?.access_token||''}`},body:JSON.stringify({nombre,whatsapp,email,password,rol:'profesional'})});const out=await res.json();if(!res.ok)return alert(out.error||'No se pudo crear el usuario.');closeModal();notify('Profesional y acceso creados.');renderProfessionals();};}

async function renderAssociations(){
  await loadAssociations();page.innerHTML=`<div class="section-head"><div><h2>Asociaciones</h2><p>Configura el Google Forms de consentimiento y los formularios adicionales de cada asociación.</p></div><button id="newAssoc" class="btn btn-primary">+ Nueva asociación</button></div><div class="list">${state.associations.length?state.associations.map(a=>`<article class="item"><div class="item-top"><div><h3>${esc(a.nombre)}</h3><div class="meta">Consentimiento: ${a.consentimiento_url?'Sí':'No'} · Formularios/Docs: ${a.formularios.length}</div></div><span class="badge ok">Activa</span></div><div class="actions"><button class="btn btn-soft" data-edit-assoc="${a.id}">Editar</button><button class="btn btn-light" data-forms="${a.id}">Formularios</button><button class="btn btn-danger" data-del-assoc="${a.id}">Eliminar</button></div></article>`).join(''):'<div class="empty">Todavía no hay asociaciones.</div>'}</div>`;$('#newAssoc').onclick=()=>openAssociationForm();$$('[data-edit-assoc]').forEach(b=>b.onclick=()=>openAssociationForm(state.associations.find(x=>x.id===b.dataset.editAssoc)));$$('[data-forms]').forEach(b=>b.onclick=()=>openForms(state.associations.find(x=>x.id===b.dataset.forms)));$$('[data-del-assoc]').forEach(b=>b.onclick=()=>deleteAssociation(b.dataset.delAssoc));
}
async function deleteAssociation(id){
  const a=state.associations.find(x=>x.id===id);if(!a)return;
  if(!confirm(`¿Eliminar la asociación “${a.nombre}”? También se eliminarán sus formularios y documentos registrados en la agenda.`))return;
  const {error}=await db.from('asociaciones').delete().eq('id',id);
  if(error)return alert(error.message);
  notify('Asociación eliminada.');renderAssociations();
}
function openAssociationForm(a=null){showModal(`<div class="modal-head"><h3>${a?'Editar':'Nueva'} asociación</h3><button class="icon-btn" id="x">✕</button></div><div class="field"><label>Nombre</label><input id="assocName" value="${esc(a?.nombre||'')}"></div><div class="field"><label>Google Forms del consentimiento informado</label><input id="assocConsent" type="url" placeholder="https://forms.gle/..." value="${esc(a?.consentimiento_url||'')}"><div class="help">El paciente primero verá una pantalla de lectura y, al aceptar, será enviado a este formulario.</div></div><button id="saveAssoc" class="btn btn-primary btn-block">Guardar</button>`);$('#x').onclick=closeModal;$('#saveAssoc').onclick=async()=>{const nombre=$('#assocName').value.trim(),consentimiento_url=$('#assocConsent').value.trim()||null;if(!nombre)return alert('Escribe el nombre.');const result=a?await db.from('asociaciones').update({nombre,consentimiento_url}).eq('id',a.id):await db.from('asociaciones').insert({nombre,consentimiento_url});if(result.error)return alert(result.error.message);closeModal();renderAssociations();};}
function openForms(a){
  showModal(`<div class="modal-head"><div><h3>Formularios y documentos</h3><div class="help">${esc(a.nombre)} · Puedes usar Google Forms o subir un archivo.</div></div><button class="icon-btn" id="x">✕</button></div>
    <div id="formsList">${a.formularios.map(f=>`<div class="item"><strong>${esc(f.nombre)}</strong><div class="meta url-line">${esc(f.url)}</div><div class="actions"><a class="btn btn-light" href="${esc(f.url)}" target="_blank" rel="noopener">Abrir</a><button class="btn btn-danger" data-del-form="${f.id}">Eliminar</button></div></div>`).join('')||'<div class="empty">Sin formularios ni documentos.</div>'}</div>
    <div class="divider"></div>
    <div class="field"><label>Nombre</label><input id="formName" placeholder="Ej. PHQ-9, GAD-7, documento informativo..."></div>
    <div class="field"><label>Enlace de Google Forms o archivo</label><input id="formUrl" type="url" placeholder="https://forms.gle/... o sube un archivo abajo"></div>
    <div class="upload-box"><div class="upload-title">Subir formulario / documento</div><div class="help">PDF, DOC, DOCX, JPG, PNG o WEBP · máximo 10 MB.</div><div class="file-row"><input id="formFile" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"><button id="uploadFormFile" type="button" class="btn btn-soft">Subir archivo</button></div><div id="formUploadState" class="upload-status"></div></div>
    <div class="divider"></div><button class="btn btn-primary" id="addForm">Agregar</button>`);
  $('#x').onclick=closeModal;
  $('#uploadFormFile').onclick=async()=>{
    const file=$('#formFile').files?.[0],btn=$('#uploadFormFile');
    if(!file)return alert('Selecciona un archivo.');
    btn.disabled=true;btn.textContent='Subiendo...';setUploadStatus('#formUploadState','Subiendo archivo...','loading');
    try{
      const url=await uploadAssociationDocument(file,'formularios');
      $('#formUrl').value=url;
      if(!$('#formName').value.trim())$('#formName').value=file.name.replace(/\.[^.]+$/,'');
      setUploadStatus('#formUploadState','✓ Archivo subido. Ahora presiona “Agregar”.','ok');
    }catch(e){console.error(e);setUploadStatus('#formUploadState',e.message||'No se pudo subir el archivo.','error');alert(`${e.message||'No se pudo subir el archivo.'}\n\nSi es la primera vez, ejecuta 03_storage_documentos.sql en Supabase.`);}
    finally{btn.disabled=false;btn.textContent='Subir archivo';}
  };
  $('#addForm').onclick=async()=>{
    const nombre=$('#formName').value.trim(),url=$('#formUrl').value.trim();
    if(!nombre||!url)return alert('Completa el nombre y agrega un enlace o sube un archivo.');
    const {error}=await db.from('formularios').insert({asociacion_id:a.id,nombre,url,orden:a.formularios.length+1});
    if(error)return alert(error.message);
    closeModal();await renderAssociations();openForms(state.associations.find(x=>x.id===a.id));
  };
  $$('[data-del-form]').forEach(b=>b.onclick=async()=>{
    if(!confirm('¿Eliminar este formulario o documento de la asociación? El archivo físico, si fue subido, se conserva en Storage.'))return;
    const {error}=await db.from('formularios').delete().eq('id',b.dataset.delForm);
    if(error)return alert(error.message);
    closeModal();await renderAssociations();openForms(state.associations.find(x=>x.id===a.id));
  });
}

async function renderSchedules(){
  const {data,error}=await db.from('horarios').select('*').eq('profesional_id',state.professional.id).order('dia_semana').order('hora_inicio');if(error){page.innerHTML='<div class="message error">No se pudo cargar tu disponibilidad.</div>';return;}state.schedules=data||[];const days=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  page.innerHTML=`<div class="section-head"><div><h2>Mi disponibilidad</h2><p>Estos horarios son internos. El paciente no los ve ni puede reservarlos.</p></div><button id="newSchedule" class="btn btn-primary">+ Agregar horario</button></div><div class="list">${state.schedules.length?state.schedules.map(h=>`<article class="item"><div class="item-top"><div><h3>${days[h.dia_semana]}</h3><div class="meta">${time12(h.hora_inicio)} a ${time12(h.hora_fin)}</div></div><span class="badge ${h.activo?'ok':'neutral'}">${h.activo?'Activo':'Inactivo'}</span></div><div class="actions"><button class="btn btn-soft" data-edit-schedule="${h.id}">Editar</button><button class="btn btn-danger" data-del-schedule="${h.id}">Eliminar</button></div></article>`).join(''):'<div class="empty">Aún no has registrado disponibilidad.</div>'}</div>`;$('#newSchedule').onclick=()=>openSchedule();$$('[data-edit-schedule]').forEach(b=>b.onclick=()=>openSchedule(state.schedules.find(x=>x.id===b.dataset.editSchedule)));$$('[data-del-schedule]').forEach(b=>b.onclick=async()=>{if(!confirm('¿Eliminar este horario?'))return;const {error}=await db.from('horarios').delete().eq('id',b.dataset.delSchedule);if(error)return alert(error.message);renderSchedules();});
}
function openSchedule(h=null){const days=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];showModal(`<div class="modal-head"><h3>${h?'Editar':'Agregar'} disponibilidad</h3><button class="icon-btn" id="x">✕</button></div><div class="field"><label>Día</label><select id="schDay">${days.map((d,i)=>`<option value="${i}" ${h?.dia_semana===i?'selected':''}>${d}</option>`).join('')}</select></div><div class="grid-2"><div class="field"><label>Desde</label><input id="schStart" type="time" value="${h?.hora_inicio?.slice(0,5)||'09:00'}"></div><div class="field"><label>Hasta</label><input id="schEnd" type="time" value="${h?.hora_fin?.slice(0,5)||'17:00'}"></div></div><button id="saveSchedule" class="btn btn-primary btn-block">Guardar</button>`);$('#x').onclick=closeModal;$('#saveSchedule').onclick=async()=>{const payload={profesional_id:state.professional.id,dia_semana:Number($('#schDay').value),hora_inicio:$('#schStart').value,hora_fin:$('#schEnd').value};if(payload.hora_inicio>=payload.hora_fin)return alert('La hora final debe ser posterior.');const result=h?await db.from('horarios').update(payload).eq('id',h.id):await db.from('horarios').insert(payload);if(result.error)return alert(result.error.message);closeModal();renderSchedules();};}

(async()=>{const {data}=await db.auth.getSession();if(data.session?.user){try{await boot(data.session.user);}catch(e){console.error(e);}}})();
