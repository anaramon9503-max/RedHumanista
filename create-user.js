import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missingEnv = [
    !url && 'SUPABASE_URL',
    !anon && 'SUPABASE_ANON_KEY',
    !service && 'SUPABASE_SERVICE_ROLE_KEY'
  ].filter(Boolean);

  if (missingEnv.length) {
    return res.status(500).json({
      error: `Falta(n) variable(s) de entorno en Vercel: ${missingEnv.join(', ')}`
    });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : '';

  if (!token) {
    return res.status(401).json({
      error: 'Sesión requerida.'
    });
  }

  const userClient = createClient(url, anon, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  const admin = createClient(url, service, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data: userData, error: userError } =
    await userClient.auth.getUser(token);

  if (userError || !userData.user) {
    return res.status(401).json({
      error: 'Sesión inválida.'
    });
  }

  const { data: profile } = await admin
    .from('perfiles')
    .select('rol,activo')
    .eq('id', userData.user.id)
    .single();

  if (
    !profile ||
    profile.rol !== 'admin' ||
    !profile.activo
  ) {
    return res.status(403).json({
      error: 'Solo un administrador puede crear accesos.'
    });
  }

  const {
    nombre,
    whatsapp,
    email,
    password,
    rol = 'profesional'
  } = req.body || {};

  if (
    !nombre ||
    !email ||
    !password ||
    rol !== 'profesional'
  ) {
    return res.status(400).json({
      error: 'Datos incompletos.'
    });
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

  if (createError) {
    return res.status(400).json({
      error: createError.message
    });
  }

  try {
    const userId = created.user.id;

    const { error: profileError } = await admin
      .from('perfiles')
      .insert({
        id: userId,
        nombre,
        rol: 'profesional',
        activo: true
      });

    if (profileError) {
      throw profileError;
    }

    const { error: proError } = await admin
      .from('profesionales')
      .insert({
        usuario_id: userId,
        nombre,
        whatsapp,
        activo: true
      });

    if (proError) {
      throw proError;
    }

    return res.status(200).json({
      ok: true,
      user_id: userId
    });

  } catch (error) {

    await admin.auth.admin.deleteUser(
      created.user.id
    );

    return res.status(400).json({
      error:
        error.message ||
        'No se pudo completar el registro.'
    });
  }
}
