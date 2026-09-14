import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return res.status(500).json({ error: 'Faltan variables de entorno en Vercel.' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Sesión requerida.' });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: 'Sesión inválida.' });

  const { data: profile } = await admin
    .from('perfiles')
    .select('rol,activo')
    .eq('id', userData.user.id)
    .single();

  if (!profile || profile.rol !== 'admin' || !profile.activo) {
    return res.status(403).json({ error: 'Solo un administrador puede eliminar profesionales.' });
  }

  const professionalId = req.body?.professional_id;
  if (!professionalId) return res.status(400).json({ error: 'Falta professional_id.' });

  const { data: professional, error: proError } = await admin
    .from('profesionales')
    .select('id,usuario_id,nombre')
    .eq('id', professionalId)
    .maybeSingle();

  if (proError) return res.status(400).json({ error: proError.message });
  if (!professional) return res.status(404).json({ error: 'Profesional no encontrado.' });
  if (professional.usuario_id === userData.user.id) {
    return res.status(400).json({ error: 'Tu propio perfil profesional se elimina desde el panel sin borrar tu cuenta de administrador.' });
  }

  const { count, error: countError } = await admin
    .from('citas')
    .select('id', { count: 'exact', head: true })
    .eq('profesional_id', professionalId);

  if (countError) return res.status(400).json({ error: countError.message });
  if ((count || 0) > 0) {
    return res.status(409).json({ error: 'Este profesional tiene citas registradas. Reasigna o elimina esas citas antes.' });
  }

  const userId = professional.usuario_id;
  const { error: deleteProError } = await admin
    .from('profesionales')
    .delete()
    .eq('id', professionalId);

  if (deleteProError) return res.status(400).json({ error: deleteProError.message });

  if (userId) {
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      await admin.from('perfiles').update({ activo: false }).eq('id', userId);
      return res.status(500).json({ error: 'El perfil profesional se eliminó, pero no se pudo borrar su acceso. El acceso fue desactivado.' });
    }
  }

  return res.status(200).json({ ok: true });
}
