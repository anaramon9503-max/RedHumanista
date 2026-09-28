import { createClient } from '@supabase/supabase-js';

export default async function handler(req,res){
  const url=process.env.SUPABASE_URL, anon=process.env.SUPABASE_ANON_KEY, service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anon||!service) return res.status(500).json({error:'Faltan variables de entorno en Vercel.'});
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  if(!token) return res.status(401).json({error:'Sesión requerida.'});
  const userClient=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}}});
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser(token);
  if(userError||!userData.user) return res.status(401).json({error:'Sesión inválida.'});
  const {data:me}=await admin.from('perfiles').select('rol,activo').eq('id',userData.user.id).single();
  if(!me||me.rol!=='admin'||!me.activo) return res.status(403).json({error:'Solo un administrador puede editar accesos.'});

  const professional_id=(req.query?.professional_id||req.body?.professional_id||'').trim();
  if(!professional_id) return res.status(400).json({error:'Falta el profesional.'});
  const {data:pro,error:proErr}=await admin.from('profesionales').select('id,usuario_id,nombre,whatsapp').eq('id',professional_id).single();
  if(proErr||!pro) return res.status(404).json({error:'Profesional no encontrado.'});

  if(req.method==='GET'){
    if(!pro.usuario_id) return res.status(200).json({nombre:pro.nombre,whatsapp:pro.whatsapp||'',email:'',rol:'profesional',usuario_id:null});
    const {data:profile}=await admin.from('perfiles').select('nombre,rol').eq('id',pro.usuario_id).single();
    const {data:authData,error:authErr}=await admin.auth.admin.getUserById(pro.usuario_id);
    if(authErr) return res.status(400).json({error:authErr.message});
    return res.status(200).json({nombre:profile?.nombre||pro.nombre,whatsapp:pro.whatsapp||'',email:authData.user?.email||'',rol:profile?.rol||'profesional',usuario_id:pro.usuario_id});
  }
  if(req.method!=='POST') return res.status(405).json({error:'Método no permitido'});

  const {nombre,whatsapp,email,rol='profesional',linked_professional_id=professional_id}=req.body||{};
  if(!nombre||!['admin','profesional'].includes(rol)) return res.status(400).json({error:'Datos incompletos.'});

  // Un perfil sin acceso sigue pudiéndose editar localmente.
  if(!pro.usuario_id){
    const {error}=await admin.from('profesionales').update({nombre,whatsapp}).eq('id',professional_id);
    if(error) return res.status(400).json({error:error.message});
    return res.status(200).json({ok:true,no_access:true});
  }

  const userId=pro.usuario_id;
  if(email){
    const {error}=await admin.auth.admin.updateUserById(userId,{email,email_confirm:true});
    if(error) return res.status(400).json({error:error.message});
  }
  const {error:profileError}=await admin.from('perfiles').update({nombre,rol}).eq('id',userId);
  if(profileError) return res.status(400).json({error:profileError.message});

  if(rol==='profesional'){
    const targetId=linked_professional_id||professional_id;
    if(targetId!==professional_id){
      const {data:target,error:tErr}=await admin.from('profesionales').select('id,usuario_id').eq('id',targetId).single();
      if(tErr||!target) return res.status(400).json({error:'No se encontró el profesional a vincular.'});
      if(target.usuario_id&&target.usuario_id!==userId) return res.status(400).json({error:'Ese profesional ya tiene un acceso vinculado.'});
      const {error:u1}=await admin.from('profesionales').update({usuario_id:null}).eq('id',professional_id).eq('usuario_id',userId);
      if(u1) return res.status(400).json({error:u1.message});
      const {error:u2}=await admin.from('profesionales').update({usuario_id:userId,nombre,whatsapp,activo:true}).eq('id',targetId);
      if(u2) return res.status(400).json({error:u2.message});
    }else{
      const {error}=await admin.from('profesionales').update({nombre,whatsapp,activo:true}).eq('id',professional_id);
      if(error) return res.status(400).json({error:error.message});
    }
  }else{
    // Conserva la ficha profesional y sus citas, pero el acceso pasa a administrador.
    const {error}=await admin.from('profesionales').update({nombre,whatsapp}).eq('id',professional_id);
    if(error) return res.status(400).json({error:error.message});
  }
  return res.status(200).json({ok:true});
}
