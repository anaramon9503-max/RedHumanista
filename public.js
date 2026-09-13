const cfg = window.HUMANISTA_CONFIG || {};
const form = document.getElementById('requestForm');
const message = document.getElementById('message');
const requestCard = document.getElementById('requestCard');
const successCard = document.getElementById('successCard');
const submitBtn = document.getElementById('submitBtn');
const newRequestBtn = document.getElementById('newRequestBtn');

function showMessage(text, type='error') {
  message.textContent = text;
  message.className = `message ${type}`;
}
function hideMessage(){ message.className='message hidden'; message.textContent=''; }
function normalizePhone(v){ return (v || '').replace(/\D/g,''); }
function validConfig(){
  return cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.startsWith('TU_') && !cfg.SUPABASE_ANON_KEY.startsWith('TU_');
}

if (!validConfig()) {
  showMessage('Falta configurar Supabase en config.js.');
  submitBtn.disabled = true;
}

const db = validConfig() ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

form.addEventListener('submit', async (e) => {
  e.preventDefault(); hideMessage();
  const nombre = document.getElementById('nombre').value.trim();
  const telefono = normalizePhone(document.getElementById('telefono').value);
  if (nombre.length < 2) return showMessage('Escribe tu nombre completo.');
  if (telefono.length < 10 || telefono.length > 15) return showMessage('Escribe un teléfono válido.');
  submitBtn.disabled = true; submitBtn.textContent = 'Enviando...';
  try {
    const { error } = await db.rpc('crear_solicitud_atencion', { p_nombre: nombre, p_telefono: telefono });
    if (error) throw error;
    form.reset(); requestCard.classList.add('hidden'); successCard.classList.remove('hidden');
  } catch (err) {
    console.error(err); showMessage('No pudimos enviar tu solicitud. Intenta nuevamente.');
  } finally {
    submitBtn.disabled = false; submitBtn.textContent = 'Solicitar atención';
  }
});

newRequestBtn.addEventListener('click', () => {
  successCard.classList.add('hidden'); requestCard.classList.remove('hidden'); hideMessage();
});
