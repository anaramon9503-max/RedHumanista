const cfg = window.HUMANISTA_CONFIG || {};
const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const state = { user:null, profile:null, professional:null, professionals:[], associations:[], requests:[], appointments:[], schedules:[] };

const loginView=$('#loginView'), appView=$('#appView'), page=$('#page'), sidebar=$('#sidebar'), modal=$('#modal'), modalCard=$('#modalCard');
const globalMessage=$('#globalMessage');

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
  if(profile.rol==='profesional'){
    const {data}=await db.from('profesionales').select('*').eq('usuario_id',user.id).eq('activo',true).single();
    state.professional=data||null;
    if(!state.professional) throw new Error('La cuenta no está vinculada a un profesional.');
  }
  loginView.classList.add('hidden');appView.classList.remove('hidden');
  $('#userEmail').textContent=user.email||'';$('#roleLabel').textContent=profile.rol==='admin'?'Administración':'Profesional';
  renderNav(); await go(profile.rol==='admin'?'solicitudes':'pacientes');
}

function renderNav(){
  const admin=[['solicitudes','Solicitudes'],['agenda','Agenda'],['profesionales','Profesionales'],['asociaciones','Asociaciones']];
  const pro=[['pacientes','Mis pacientes'],['agenda','Mis citas'],['horarios','Mi disponibilidad']];
  const links=state.profile.rol==='admin'?admin:pro;
  sidebar.innerHTML=links.map(([id,label])=>`<button class="nav-btn" data-page="${id}">${label}</button>`).join('');
  $$('.nav-btn',sidebar).forEach(b=>b.onclick=()=>go(b.dataset.page));
}
async function go(name){$$('.nav-btn',sidebar).forEach(b=>b.classList.toggle('active',b.dataset.page===name));page.innerHTML='<div class="empty">Cargando...</div>';
  if(name==='solicitudes')return renderRequests(); if(name==='agenda')return renderAppointments(); if(name==='profesionales')return renderProfessionals(); if(name==='asociaciones')return renderAssociations(); if(name==='pacientes')return renderMyPatients(); if(name==='horarios')return renderSchedules();}

async function loadProfessionals(){const {data,error}=await db.from('profesionales').select('*').eq('activo',true).order('nombre');if(error)throw error;state.professionals=data||[];}
async function loadAssociations(){const {data,error}=await db.from('asociaciones').select('*, formularios(*)').eq('activo',true).order('nombre');if(error)throw error;state.associations=(data||[]).map(a=>({...a,formularios:(a.formularios||[]).filter(f=>f.activo).sort((x,y)=>x.orden-y.orden)}));}

async function renderRequests(){
  try{await Promise.all([loadProfessionals(),loadAssociations()]);
    const {data,error}=await db.from('solicitudes_atencion').select('*, profesionales(nombre,whatsapp), asociaciones(nombre,consentimiento_url)').order('created_at',{ascending:false});if(error)throw error; state.requests=data||[];
    const pending=state.requests.filter(r=>r.estado==='pendiente').length, assigned=state.requests.filter(r=>r.estado==='asignada').length, scheduled=state.requests.filter(r=>r.estado==='cita_agendada').length;
    page.innerHTML=`<div class="section-head"><div><h2>Solicitudes de atención</h2><p>El paciente solo deja nombre y teléfono. Aquí se asigna al profesional.</p></div></div>
      <div class="stats"><div class="stat"><strong>${state.requests.length}</strong><span>Total</span></div><div class="stat"><strong>${pending}</strong><span>Pendientes</span></div><div class="stat"><strong>${assigned}</strong><span>Asignadas</span></div><div class="stat"><strong>${scheduled}</strong><span>Con cita</span></div></div>
      <div class="toolbar"><select id="reqFilter"><option value="all">Todos los estados</option><option value="pendiente">Pendientes</option><option value="asignada">Asignadas</option><option value="contactada">Contactadas</option><option value="cita_agendada">Con cita</option></select><input id="reqSearch" placeholder="Buscar paciente o teléfono"></div>
      <div class="list" id="requestList"></div>`;
    $('#reqFilter').onchange=paintRequests;$('#reqSearch').oninput=paintRequests;paintRequests();
  }catch(e){console.error(e);page.innerHTML='<div class="message error">No se pudieron cargar las solicitudes.</div>';}
}
function paintRequests(){
  const filter=$('#reqFilter')?.value||'all', q=($('#reqSearch')?.value||'').toLowerCase().trim();
  const rows=state.requests.filter(r=>(filter==='all'||r.estado===filter)&&(!q||r.nombre.toLowerCase().includes(q)||r.telefono.includes(q)));
  const box=$('#requestList'); if(!rows.length){box.innerHTML='<div class="empty">No hay solicitudes con este filtro.</div>';return;}
  box.innerHTML=rows.map(r=>requestCard(r)).join('');
  $$('[data-assign]').forEach(b=>b.onclick=()=>openAssign(b.dataset.assign));
  $$('[data-wa-pro]').forEach(b=>b.onclick=()=>waProfessional(b.dataset.waPro));
  $$('[data-wa-patient]').forEach(b=>b.onclick=()=>waPatient(b.dataset.waPatient));
  $$('[data-docs]').forEach(b=>b.onclick=()=>openDocuments(b.dataset.docs));
  $$('[data-close-request]').forEach(b=>b.onclick=()=>setRequestStatus(b.dataset.closeRequest,'cerrada'));
}
function requestCard(r){
  const pro=r.profesionales?.nombre||'Sin asignar', assoc=r.asociaciones?.nombre||'Sin asociación';
  return `<article class="item"><div class="item-top"><div><h3>${esc(r.nombre)}</h3><div class="meta">📱 ${esc(r.telefono)}<br>Profesional: <strong>${esc(pro)}</strong><br>Asociación: ${esc(assoc)}<br>Recibida: ${new Date(r.created_at).toLocaleString('es-MX')}</div></div>${statusBadge(r.estado)}</div>
    <div class="progress"><span class="progress-step ${r.profesional_id?'done':''}">Profesional</span><span class="progress-step ${r.consentimiento_estado==='completado'?'done':''}">Consentimiento</span><span class="progress-step ${r.formularios_estado==='completado'?'done':''}">Forms</span><span class="progress-step ${r.estado==='cita_agendada'?'done':''}">Cita</span></div>
    <div class="actions"><button class="btn btn-soft" data-assign="${r.id}">${r.profesional_id?'Reasignar':'Asignar profesional'}</button>${r.profesional_id?`<button class="btn btn-whatsapp" data-wa-pro="${r.id}">WhatsApp profesional</button>`:''}<button class="btn btn-whatsapp" data-wa-patient="${r.id}">WhatsApp paciente</button><button class="btn btn-light" data-docs="${r.id}">Consentimiento / Forms</button>${r.estado!=='cerrada'?`<button class="btn btn-danger" data-close-request="${r.id}">Cerrar</button>`:''}</div></article>`;
}
function openAssign(id){
  const r=state.requests.find(x=>x.id===id); if(!r)return;
  showModal(`<div class="modal-head"><div><h3>Asignar profesional</h3><div class="help">${esc(r.nombre)} · ${esc(r.telefono)}</div></div><button class="icon-btn" id="x">✕</button></div>
    <div class="field"><label>Profesional</label><select id="assignPro"><option value="">Seleccionar...</option>${state.professionals.map(p=>`<option value="${p.id}" ${r.profesional_id===p.id?'selected':''}>${esc(p.nombre)}</option>`).join('')}</select></div>
    <div class="field"><label>Asociación (opcional por ahora)</label><select id="assignAssoc"><option value="">Sin asociación</option>${state.associations.map(a=>`<option value="${a.id}" ${r.asociacion_id===a.id?'selected':''}>${esc(a.nombre)}</option>`).join('')}</select></div>
    <button class="btn btn-primary btn-block" id="saveAssign">Guardar asignación</button>`);
  $('#x').onclick=closeModal; $('#saveAssign').onclick=async()=>{
    const professional_id=$('#assignPro').value||null, asociacion_id=$('#assignAssoc').value||null; if(!professional_id)return alert('Selecciona un profesional.');
    const {error}=await db.from('solicitudes_atencion').update({profesional_id,asociacion_id,estado:'asignada',fecha_asignacion:new Date().toISOString()}).eq('id',id);if(error)return alert(error.message);closeModal();notify('Paciente asignado.');renderRequests();
  };
}
function waProfessional(id){const r=state.requests.find(x=>x.id===id);const p=state.professionals.find(x=>x.id===r?.profesional_id);if(!r||!p?.whatsapp)return alert('El profesional no tiene WhatsApp registrado.');const text=`Hola ${p.nombre} 😊\n\nTe asigné un nuevo paciente de Red de Atención Psicológica Humanista.\n\n👤 Nombre: ${r.nombre}\n📱 Teléfono: ${r.telefono}\n\nPor favor, ponte en contacto con la persona para acordar su cita.`;window.open(`https://wa.me/${waPhone(p.whatsapp)}?text=${encodeURIComponent(text)}`,'_blank');}
function waPatient(id){const r=state.requests.find(x=>x.id===id);if(!r)return;const p=state.professionals.find(x=>x.id===r.profesional_id);const text=p?`Hola ${r.nombre} 😊 Somos de Red de Atención Psicológica Humanista. Tu solicitud fue asignada a ${p.nombre}. Nos pondremos en contacto contigo para acordar tu cita.`:`Hola ${r.nombre} 😊 Recibimos tu solicitud en Red de Atención Psicológica Humanista. Un profesional se pondrá en contacto contigo para agendar tu cita.`;window.open(`https://wa.me/${waPhone(r.telefono)}?text=${encodeURIComponent(text)}`,'_blank');}
async function setRequestStatus(id,estado){const {error}=await db.from('solicitudes_atencion').update({estado}).eq('id',id);if(error)return notify(error.message,'error');notify('Estado actualizado.');renderRequests();}

function openDocuments(id){
  const r=state.requests.find(x=>x.id===id), a=state.associations.find(x=>x.id===r?.asociacion_id); if(!r)return;
  const forms=a?.formularios||[];
  showModal(`<div class="modal-head"><div><h3>Consentimiento y formularios</h3><div class="help">${esc(r.nombre)}</div></div><button class="icon-btn" id="x">✕</button></div>
    ${!a?'<div class="message error">Primero asigna una asociación al paciente.</div>':`<div class="item"><strong>${esc(a.nombre)}</strong><div class="meta">Consentimiento: ${a.consentimiento_url?'Configurado':'Sin enlace'} · Formularios: ${forms.length}</div></div>
    <div class="divider"></div><h3>1. Consentimiento informado</h3><div class="meta">Estado: <strong>${esc(r.consentimiento_estado)}</strong></div><div class="actions"><button class="btn btn-whatsapp" id="sendConsent" ${!a.consentimiento_url?'disabled':''}>Enviar por WhatsApp</button><button class="btn btn-success" id="doneConsent">Marcar completado</button></div>
    <div class="divider"></div><h3>2. Google Forms</h3><div class="meta">Estado: <strong>${esc(r.formularios_estado)}</strong></div>${forms.map(f=>`<div class="meta">• ${esc(f.nombre)}</div>`).join('')||'<div class="meta">No hay formularios configurados.</div>'}<div class="actions"><button class="btn btn-whatsapp" id="sendForms" ${r.consentimiento_estado!=='completado'||!forms.length?'disabled':''}>Enviar Forms</button><button class="btn btn-success" id="doneForms" ${r.consentimiento_estado!=='completado'?'disabled':''}>Marcar completados</button></div>`}`);
  $('#x').onclick=closeModal;if(!a)return;
  $('#sendConsent').onclick=async()=>{const text=`Hola ${r.nombre} 😊 Antes de continuar con tu proceso, por favor revisa y completa el consentimiento informado de ${a.nombre}:\n\n${a.consentimiento_url}\n\nCuando lo hayas completado, avísanos por este medio.`;window.open(`https://wa.me/${waPhone(r.telefono)}?text=${encodeURIComponent(text)}`,'_blank');await db.from('solicitudes_atencion').update({consentimiento_estado:'enviado',consentimiento_enviado_at:new Date().toISOString()}).eq('id',r.id);};
  $('#doneConsent').onclick=async()=>{await db.from('solicitudes_atencion').update({consentimiento_estado:'completado',consentimiento_completado_at:new Date().toISOString()}).eq('id',r.id);closeModal();notify('Consentimiento marcado como completado.');renderRequests();};
  $('#sendForms').onclick=async()=>{const links=forms.map((f,i)=>`${i+1}. ${f.nombre}: ${f.url}`).join('\n');const text=`Hola ${r.nombre} 😊 Ya podemos continuar con tus formularios de ${a.nombre}:\n\n${links}\n\nPor favor complétalos antes de tu atención.`;window.open(`https://wa.me/${waPhone(r.telefono)}?text=${encodeURIComponent(text)}`,'_blank');await db.from('solicitudes_atencion').update({formularios_estado:'enviado',formularios_enviados_at:new Date().toISOString()}).eq('id',r.id);};
  $('#doneForms').onclick=async()=>{await db.from('solicitudes_atencion').update({formularios_estado:'completado',formularios_completados_at:new Date().toISOString()}).eq('id',r.id);closeModal();notify('Formularios marcados como completados.');renderRequests();};
}

async function renderMyPatients(){
  const {data,error}=await db.from('solicitudes_atencion').select('*, asociaciones(nombre,consentimiento_url, formularios(*))').eq('profesional_id',state.professional.id).neq('estado','cerrada').order('created_at',{ascending:false});if(error){page.innerHTML='<div class="message error">No se pudieron cargar tus pacientes.</div>';return;}state.requests=data||[];
  page.innerHTML=`<div class="section-head"><div><h2>Mis pacientes</h2><p>Contacta al paciente y registra la cita cuando acuerden día y hora.</p></div></div><div class="list">${state.requests.length?state.requests.map(r=>`<article class="item"><div class="item-top"><div><h3>${esc(r.nombre)}</h3><div class="meta">📱 ${esc(r.telefono)}<br>Asociación: ${esc(r.asociaciones?.nombre||'Pendiente')}</div></div>${statusBadge(r.estado)}</div><div class="actions"><button class="btn btn-whatsapp" data-pro-contact="${r.id}">Contactar paciente</button><button class="btn btn-primary" data-create-appt="${r.id}">${r.estado==='cita_agendada'?'Nueva cita':'Registrar cita'}</button><button class="btn btn-light" data-pro-docs="${r.id}">Documentos</button></div></article>`).join(''):'<div class="empty">Aún no tienes pacientes asignados.</div>'}</div>`;
  $$('[data-pro-contact]').forEach(b=>b.onclick=()=>{const r=state.requests.find(x=>x.id===b.dataset.proContact);const text=`Hola ${r.nombre} 😊 Soy ${state.professional.nombre}, profesional de Red de Atención Psicológica Humanista. Me asignaron tu solicitud de atención. Me gustaría acordar contigo el día y horario de tu cita.`;window.open(`https://wa.me/${waPhone(r.telefono)}?text=${encodeURIComponent(text)}`,'_blank');db.from('solicitudes_atencion').update({estado:'contactada'}).eq('id',r.id);});
  $$('[data-create-appt]').forEach(b=>b.onclick=()=>openAppointmentForm(b.dataset.createAppt));
  $$('[data-pro-docs]').forEach(b=>b.onclick=()=>openProDocuments(b.dataset.proDocs));
}

function openProDocuments(id){
  const r=state.requests.find(x=>x.id===id),a=r?.asociaciones,forms=(a?.formularios||[]).filter(f=>f.activo).sort((x,y)=>x.orden-y.orden);if(!r)return;
  showModal(`<div class="modal-head"><div><h3>Documentación</h3><div class="help">${esc(r.nombre)}</div></div><button class="icon-btn" id="x">✕</button></div>${!a?'<div class="message error">El administrador todavía no asigna una asociación.</div>':`<div class="meta"><strong>${esc(a.nombre)}</strong></div><div class="divider"></div><div class="meta">Consentimiento: <strong>${esc(r.consentimiento_estado)}</strong></div><div class="actions"><button id="pc" class="btn btn-whatsapp" ${!a.consentimiento_url?'disabled':''}>Enviar consentimiento</button><button id="pcDone" class="btn btn-success">Marcar completado</button></div><div class="divider"></div><div class="meta">Formularios: <strong>${esc(r.formularios_estado)}</strong></div>${forms.map(f=>`<div class="meta">• ${esc(f.nombre)}</div>`).join('')}<div class="actions"><button id="pf" class="btn btn-whatsapp" ${r.consentimiento_estado!=='completado'||!forms.length?'disabled':''}>Enviar Forms</button><button id="pfDone" class="btn btn-success" ${r.consentimiento_estado!=='completado'?'disabled':''}>Marcar completados</button></div>`}`);
  $('#x').onclick=closeModal;if(!a)return;
  $('#pc').onclick=async()=>{window.open(`https://wa.me/${waPhone(r.telefono)}?text=${encodeURIComponent(`Hola ${r.nombre} 😊 Por favor completa el consentimiento informado de ${a.nombre}:\n\n${a.consentimiento_url}`)}`,'_blank');await db.from('solicitudes_atencion').update({consentimiento_estado:'enviado',consentimiento_enviado_at:new Date().toISOString()}).eq('id',r.id);};
  $('#pcDone').onclick=async()=>{await db.from('solicitudes_atencion').update({consentimiento_estado:'completado',consentimiento_completado_at:new Date().toISOString()}).eq('id',r.id);closeModal();renderMyPatients();};
  $('#pf').onclick=async()=>{const links=forms.map((f,i)=>`${i+1}. ${f.nombre}: ${f.url}`).join('\n');window.open(`https://wa.me/${waPhone(r.telefono)}?text=${encodeURIComponent(`Hola ${r.nombre} 😊 Ahora completa los siguientes formularios:\n\n${links}`)}`,'_blank');await db.from('solicitudes_atencion').update({formularios_estado:'enviado',formularios_enviados_at:new Date().toISOString()}).eq('id',r.id);};
  $('#pfDone').onclick=async()=>{await db.from('solicitudes_atencion').update({formularios_estado:'completado',formularios_completados_at:new Date().toISOString()}).eq('id',r.id);closeModal();renderMyPatients();};
}

function openAppointmentForm(requestId, appointment=null){
  const r=state.requests.find(x=>x.id===requestId);if(!r&&!appointment)return;
  const req=r||{id:appointment.solicitud_id,nombre:appointment.paciente_nombre,telefono:appointment.paciente_telefono};
  showModal(`<div class="modal-head"><div><h3>${appointment?'Mover / editar cita':'Registrar cita'}</h3><div class="help">${esc(req.nombre)}</div></div><button class="icon-btn" id="x">✕</button></div><div class="grid-2"><div class="field"><label>Fecha</label><input id="apptDate" type="date" value="${appointment?.fecha||''}"></div><div class="field"><label>Hora</label><input id="apptTime" type="time" value="${appointment?.hora_inicio?.slice(0,5)||''}"></div></div><div class="field"><label>Duración (minutos)</label><input id="apptDuration" type="number" min="15" max="240" step="15" value="${appointment?.duracion_min||60}"></div><div class="field"><label>Notas (opcional)</label><textarea id="apptNotes">${esc(appointment?.notas||'')}</textarea></div><button class="btn btn-primary btn-block" id="saveAppt">Guardar cita</button>`);
  $('#x').onclick=closeModal;$('#saveAppt').onclick=async()=>{const fecha=$('#apptDate').value,hora=$('#apptTime').value,duracion=Number($('#apptDuration').value||60),notas=$('#apptNotes').value.trim();if(!fecha||!hora)return alert('Selecciona fecha y hora.');
    const professional_id=appointment?.profesional_id||state.professional?.id||r?.profesional_id;if(!professional_id)return alert('No hay profesional asignado.');
    const payload={solicitud_id:req.id,profesional_id,paciente_nombre:req.nombre,paciente_telefono:req.telefono,fecha,hora_inicio:hora,duracion_min:duracion,notas};let result;
    if(appointment)result=await db.from('citas').update(payload).eq('id',appointment.id);else result=await db.from('citas').insert(payload);if(result.error)return alert(result.error.message);
    await db.from('solicitudes_atencion').update({estado:'cita_agendada'}).eq('id',req.id);closeModal();notify('Cita guardada.');state.profile.rol==='admin'?renderAppointments():renderMyPatients();};
}

async function renderAppointments(){
  let q=db.from('citas').select('*, profesionales(nombre), solicitudes_atencion(asociacion_id)').order('fecha',{ascending:true}).order('hora_inicio',{ascending:true});if(state.profile.rol==='profesional')q=q.eq('profesional_id',state.professional.id);const {data,error}=await q;if(error){page.innerHTML='<div class="message error">No se pudo cargar la agenda.</div>';return;}state.appointments=data||[];
  page.innerHTML=`<div class="section-head"><div><h2>${state.profile.rol==='admin'?'Agenda general':'Mis citas'}</h2><p>Las citas se crean después de que el profesional acuerda día y hora con el paciente.</p></div></div><div class="list">${state.appointments.length?state.appointments.map(a=>`<article class="item"><div class="item-top"><div><h3>${esc(a.paciente_nombre)}</h3><div class="meta">${dateMX(a.fecha)} · ${time12(a.hora_inicio)} · ${a.duracion_min} min<br>${state.profile.rol==='admin'?`Profesional: ${esc(a.profesionales?.nombre||'—')}<br>`:''}📱 ${esc(a.paciente_telefono)}</div></div>${statusBadge(a.estado)}</div><div class="actions">${state.profile.rol==='profesional'?`<button class="btn btn-soft" data-edit-appt="${a.id}">Mover / editar</button>`:''}<button class="btn btn-whatsapp" data-confirm-appt="${a.id}">Confirmar por WhatsApp</button><button class="btn btn-light" data-img-appt="${a.id}">Imagen de confirmación</button>${a.estado!=='atendida'?`<button class="btn btn-success" data-attended="${a.id}">Atendida</button>`:''}${a.estado!=='cancelada'?`<button class="btn btn-danger" data-cancel="${a.id}">Cancelar</button>`:''}</div></article>`).join(''):'<div class="empty">No hay citas registradas.</div>'}</div>`;
  $$('[data-edit-appt]').forEach(b=>{b.onclick=()=>{const a=state.appointments.find(x=>x.id===b.dataset.editAppt);openAppointmentForm(a.solicitud_id,a);}});
  $$('[data-confirm-appt]').forEach(b=>b.onclick=()=>confirmAppointment(b.dataset.confirmAppt));
  $$('[data-img-appt]').forEach(b=>b.onclick=()=>appointmentImage(b.dataset.imgAppt));
  $$('[data-attended]').forEach(b=>b.onclick=()=>updateAppointmentStatus(b.dataset.attended,'atendida'));
  $$('[data-cancel]').forEach(b=>b.onclick=()=>updateAppointmentStatus(b.dataset.cancel,'cancelada'));
}
async function updateAppointmentStatus(id,estado){const {error}=await db.from('citas').update({estado}).eq('id',id);if(error)return notify(error.message,'error');notify('Cita actualizada.');renderAppointments();}
function confirmAppointment(id){const a=state.appointments.find(x=>x.id===id);if(!a)return;const pro=a.profesionales?.nombre||state.professional?.nombre||'tu profesional';const text=`Hola ${a.paciente_nombre} 😊 Tu cita con Red de Atención Psicológica Humanista está programada.\n\n👤 Profesional: ${pro}\n📅 Fecha: ${dateMX(a.fecha)}\n🕐 Hora: ${time12(a.hora_inicio)}\n\nSi necesitas hacer un cambio, comunícate con nosotros.`;window.open(`https://wa.me/${waPhone(a.paciente_telefono)}?text=${encodeURIComponent(text)}`,'_blank');}
function appointmentImage(id){const a=state.appointments.find(x=>x.id===id);if(!a)return;const pro=a.profesionales?.nombre||state.professional?.nombre||'Profesional';showModal(`<div class="modal-head"><h3>Confirmación de cita</h3><button class="icon-btn" id="x">✕</button></div><div class="confirmation-preview" id="confirmation"><div class="confirm-mark">RH</div><h3>Red de Atención Psicológica Humanista</h3><p>Confirmación de cita</p><div class="big-date">${dateMX(a.fecha)} · ${time12(a.hora_inicio)}</div><p><strong>${esc(a.paciente_nombre)}</strong></p><p>Profesional: ${esc(pro)}</p></div><button class="btn btn-primary btn-block" id="downloadConfirm" style="margin-top:14px">Descargar imagen</button>`);$('#x').onclick=closeModal;$('#downloadConfirm').onclick=async()=>{const canvas=await html2canvas($('#confirmation'),{scale:2,backgroundColor:'#ffffff'});const link=document.createElement('a');link.download=`confirmacion-${a.paciente_nombre.replace(/\s+/g,'-').toLowerCase()}.png`;link.href=canvas.toDataURL('image/png');link.click();};}

async function renderProfessionals(){
  await loadProfessionals();page.innerHTML=`<div class="section-head"><div><h2>Profesionales</h2><p>Crea el acceso y registra el WhatsApp que recibirá las asignaciones.</p></div><button id="newPro" class="btn btn-primary">+ Nuevo profesional</button></div><div class="list">${state.professionals.length?state.professionals.map(p=>`<article class="item"><div class="item-top"><div><h3>${esc(p.nombre)}</h3><div class="meta">WhatsApp: ${esc(p.whatsapp||'Sin registrar')}<br>Acceso: ${p.usuario_id?'Activo':'Sin acceso'}</div></div><span class="badge ${p.usuario_id?'ok':'pending'}">${p.usuario_id?'Con acceso':'Pendiente'}</span></div><div class="actions"><button class="btn btn-soft" data-edit-pro="${p.id}">Editar</button></div></article>`).join(''):'<div class="empty">No hay profesionales.</div>'}</div>`;$('#newPro').onclick=()=>openProfessionalForm();$$('[data-edit-pro]').forEach(b=>b.onclick=()=>openProfessionalForm(state.professionals.find(x=>x.id===b.dataset.editPro)));
}
function openProfessionalForm(p=null){showModal(`<div class="modal-head"><div><h3>${p?'Editar profesional':'Nuevo profesional'}</h3><div class="help">${p?'Puedes actualizar sus datos.':'Se creará su cuenta de acceso y su perfil profesional.'}</div></div><button class="icon-btn" id="x">✕</button></div><div class="field"><label>Nombre</label><input id="proName" value="${esc(p?.nombre||'')}"></div><div class="field"><label>WhatsApp</label><input id="proWa" inputmode="tel" value="${esc(p?.whatsapp||'')}"></div>${p?'':`<div class="field"><label>Correo de acceso</label><input id="proEmail" type="email"></div><div class="field"><label>Contraseña temporal</label><input id="proPass" type="password" minlength="8"></div>`}<button id="savePro" class="btn btn-primary btn-block">Guardar</button>`);$('#x').onclick=closeModal;$('#savePro').onclick=async()=>{const nombre=$('#proName').value.trim(),whatsapp=digits($('#proWa').value);if(!nombre||whatsapp.length<10)return alert('Completa nombre y WhatsApp.');if(p){const {error}=await db.from('profesionales').update({nombre,whatsapp}).eq('id',p.id);if(error)return alert(error.message);closeModal();renderProfessionals();return;}
    const email=$('#proEmail').value.trim(),password=$('#proPass').value;if(!email||password.length<8)return alert('Escribe correo y una contraseña de al menos 8 caracteres.');const session=(await db.auth.getSession()).data.session;const res=await fetch('/api/create-user',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session?.access_token||''}`},body:JSON.stringify({nombre,whatsapp,email,password,rol:'profesional'})});const out=await res.json();if(!res.ok)return alert(out.error||'No se pudo crear el usuario.');closeModal();notify('Profesional y acceso creados.');renderProfessionals();};}

async function renderAssociations(){
  await loadAssociations();page.innerHTML=`<div class="section-head"><div><h2>Asociaciones</h2><p>Configura el consentimiento y los Google Forms que corresponden a cada asociación.</p></div><button id="newAssoc" class="btn btn-primary">+ Nueva asociación</button></div><div class="list">${state.associations.length?state.associations.map(a=>`<article class="item"><div class="item-top"><div><h3>${esc(a.nombre)}</h3><div class="meta">Consentimiento: ${a.consentimiento_url?'Sí':'No'} · Google Forms: ${a.formularios.length}</div></div><span class="badge ok">Activa</span></div><div class="actions"><button class="btn btn-soft" data-edit-assoc="${a.id}">Editar</button><button class="btn btn-light" data-forms="${a.id}">Formularios</button></div></article>`).join(''):'<div class="empty">Todavía no hay asociaciones.</div>'}</div>`;$('#newAssoc').onclick=()=>openAssociationForm();$$('[data-edit-assoc]').forEach(b=>b.onclick=()=>openAssociationForm(state.associations.find(x=>x.id===b.dataset.editAssoc)));$$('[data-forms]').forEach(b=>b.onclick=()=>openForms(state.associations.find(x=>x.id===b.dataset.forms)));
}
function openAssociationForm(a=null){showModal(`<div class="modal-head"><h3>${a?'Editar':'Nueva'} asociación</h3><button class="icon-btn" id="x">✕</button></div><div class="field"><label>Nombre</label><input id="assocName" value="${esc(a?.nombre||'')}"></div><div class="field"><label>Enlace de consentimiento informado</label><input id="assocConsent" type="url" placeholder="https://..." value="${esc(a?.consentimiento_url||'')}"></div><button id="saveAssoc" class="btn btn-primary btn-block">Guardar</button>`);$('#x').onclick=closeModal;$('#saveAssoc').onclick=async()=>{const nombre=$('#assocName').value.trim(),consentimiento_url=$('#assocConsent').value.trim()||null;if(!nombre)return alert('Escribe el nombre.');const result=a?await db.from('asociaciones').update({nombre,consentimiento_url}).eq('id',a.id):await db.from('asociaciones').insert({nombre,consentimiento_url});if(result.error)return alert(result.error.message);closeModal();renderAssociations();};}
function openForms(a){showModal(`<div class="modal-head"><div><h3>Google Forms</h3><div class="help">${esc(a.nombre)}</div></div><button class="icon-btn" id="x">✕</button></div><div id="formsList">${a.formularios.map(f=>`<div class="item"><strong>${esc(f.nombre)}</strong><div class="meta">${esc(f.url)}</div><div class="actions"><button class="btn btn-danger" data-del-form="${f.id}">Eliminar</button></div></div>`).join('')||'<div class="empty">Sin formularios.</div>'}</div><div class="divider"></div><div class="field"><label>Nombre del formulario</label><input id="formName"></div><div class="field"><label>URL de Google Forms</label><input id="formUrl" type="url" placeholder="https://forms.gle/..."></div><button class="btn btn-primary btn-block" id="addForm">Agregar formulario</button>`);$('#x').onclick=closeModal;$('#addForm').onclick=async()=>{const nombre=$('#formName').value.trim(),url=$('#formUrl').value.trim();if(!nombre||!url)return alert('Completa nombre y URL.');const {error}=await db.from('formularios').insert({asociacion_id:a.id,nombre,url,orden:a.formularios.length+1});if(error)return alert(error.message);closeModal();await renderAssociations();openForms(state.associations.find(x=>x.id===a.id));};$$('[data-del-form]').forEach(b=>b.onclick=async()=>{if(!confirm('¿Eliminar este formulario?'))return;const {error}=await db.from('formularios').delete().eq('id',b.dataset.delForm);if(error)return alert(error.message);closeModal();await renderAssociations();openForms(state.associations.find(x=>x.id===a.id));});}

async function renderSchedules(){
  const {data,error}=await db.from('horarios').select('*').eq('profesional_id',state.professional.id).order('dia_semana').order('hora_inicio');if(error){page.innerHTML='<div class="message error">No se pudo cargar tu disponibilidad.</div>';return;}state.schedules=data||[];const days=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  page.innerHTML=`<div class="section-head"><div><h2>Mi disponibilidad</h2><p>Estos horarios son internos. El paciente no los ve ni puede reservarlos.</p></div><button id="newSchedule" class="btn btn-primary">+ Agregar horario</button></div><div class="list">${state.schedules.length?state.schedules.map(h=>`<article class="item"><div class="item-top"><div><h3>${days[h.dia_semana]}</h3><div class="meta">${time12(h.hora_inicio)} a ${time12(h.hora_fin)}</div></div><span class="badge ${h.activo?'ok':'neutral'}">${h.activo?'Activo':'Inactivo'}</span></div><div class="actions"><button class="btn btn-soft" data-edit-schedule="${h.id}">Editar</button><button class="btn btn-danger" data-del-schedule="${h.id}">Eliminar</button></div></article>`).join(''):'<div class="empty">Aún no has registrado disponibilidad.</div>'}</div>`;$('#newSchedule').onclick=()=>openSchedule();$$('[data-edit-schedule]').forEach(b=>b.onclick=()=>openSchedule(state.schedules.find(x=>x.id===b.dataset.editSchedule)));$$('[data-del-schedule]').forEach(b=>b.onclick=async()=>{if(!confirm('¿Eliminar este horario?'))return;const {error}=await db.from('horarios').delete().eq('id',b.dataset.delSchedule);if(error)return alert(error.message);renderSchedules();});
}
function openSchedule(h=null){const days=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];showModal(`<div class="modal-head"><h3>${h?'Editar':'Agregar'} disponibilidad</h3><button class="icon-btn" id="x">✕</button></div><div class="field"><label>Día</label><select id="schDay">${days.map((d,i)=>`<option value="${i}" ${h?.dia_semana===i?'selected':''}>${d}</option>`).join('')}</select></div><div class="grid-2"><div class="field"><label>Desde</label><input id="schStart" type="time" value="${h?.hora_inicio?.slice(0,5)||'09:00'}"></div><div class="field"><label>Hasta</label><input id="schEnd" type="time" value="${h?.hora_fin?.slice(0,5)||'17:00'}"></div></div><button id="saveSchedule" class="btn btn-primary btn-block">Guardar</button>`);$('#x').onclick=closeModal;$('#saveSchedule').onclick=async()=>{const payload={profesional_id:state.professional.id,dia_semana:Number($('#schDay').value),hora_inicio:$('#schStart').value,hora_fin:$('#schEnd').value};if(payload.hora_inicio>=payload.hora_fin)return alert('La hora final debe ser posterior.');const result=h?await db.from('horarios').update(payload).eq('id',h.id):await db.from('horarios').insert(payload);if(result.error)return alert(result.error.message);closeModal();renderSchedules();};}

(async()=>{const {data}=await db.auth.getSession();if(data.session?.user){try{await boot(data.session.user);}catch(e){console.error(e);}}})();
