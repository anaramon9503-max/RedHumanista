import { createClient } from '@supabase/supabase-js';

function clients(req) {
  const url=process.env.SUPABASE_URL, anon=process.env.SUPABASE_ANON_KEY, service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anon||!service) throw new Error('Faltan variables de entorno en Vercel.');
  const auth=req.headers.authorization||'', token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!token) { const e=new Error('Sesión requerida.'); e.status=401; throw e; }
  return {token,userClient:createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}}}),admin:createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}})};
}
async function requireAdmin(req){
  const c=clients(req); const {data,error}=await c.userClient.auth.getUser(c.token);
  if(error||!data.user){const e=new Error('Sesión inválida.');e.status=401;throw e;}
  const {data:profile}=await c.admin.from('perfiles').select('rol,activo').eq('id',data.user.id).single();
  if(!profile||profile.rol!=='admin'||!profile.activo){const e=new Error('Solo un administrador puede modificar accesos.');e.status=403;throw e;}
  return c.admin;
}
export default async function handler(req,res){
  try{
    const admin=await requireAdmin(req);
    const professional_id=(req.method==='GET'?req.query?.professional_id:req.body?.professional_id)||null;
    if(!professional_id)return res.status(400).json({error:'Falta el profesional.'});
    const {data:pro,error:pe}=await admin.from('profesionales').select('id,usuario_id,nombre,whatsapp').eq('id',professional_id).single();
    if(pe||!pro)return res.status(404).json({error:'Profesional no encontrado.'});
    if(req.method==='GET'){
      if(!pro.usuario_id)return res.status(200).json({professional:pro,access:null});
      const [{data:profile,error:pre},{data:authData,error:ae}]=await Promise.all([
        admin.from('perfiles').select('id,nombre,rol,activo').eq('id',pro.usuario_id).single(),
        admin.auth.admin.getUserById(pro.usuario_id)
      ]);
      if(pre||ae)return res.status(400).json({error:pre?.message||ae?.message||'No se pudo cargar el acceso.'});
      return res.status(200).json({professional:pro,access:{user_id:pro.usuario_id,nombre:profile.nombre,email:authData.user?.email||'',rol:profile.rol,activo:profile.activo}});
    }
    if(req.method!=='PUT')return res.status(405).json({error:'Método no permitido'});
    if(!pro.usuario_id)return res.status(400).json({error:'Este profesional todavía no tiene un acceso vinculado.'});
    const {nombre,whatsapp,email,rol,target_profesional_id}=req.body||{};
    if(!nombre||!email||!['admin','profesional'].includes(rol))return res.status(400).json({error:'Completa nombre, correo y rol.'});
    const userId=pro.usuario_id;
    const {error:authErr}=await admin.auth.admin.updateUserById(userId,{email,email_confirm:true}); if(authErr)throw authErr;
    const {error:profileErr}=await admin.from('perfiles').update({nombre,rol,activo:true}).eq('id',userId); if(profileErr)throw profileErr;
    if(rol==='admin'){
      const {error}=await admin.from('profesionales').update({usuario_id:null,nombre,whatsapp}).eq('id',professional_id); if(error)throw error;
    } else {
      const target=target_profesional_id||professional_id;
      if(target!==professional_id){
        const {data:t,error:te}=await admin.from('profesionales').select('id,usuario_id').eq('id',target).single(); if(te||!t)throw te||new Error('Profesional destino no encontrado.');
        if(t.usuario_id&&t.usuario_id!==userId)throw new Error('El profesional seleccionado ya tiene otro acceso vinculado.');
        const {error:e1}=await admin.from('profesionales').update({usuario_id:null}).eq('id',professional_id); if(e1)throw e1;
        const {error:e2}=await admin.from('profesionales').update({usuario_id:userId,nombre,whatsapp,activo:true}).eq('id',target); if(e2)throw e2;
      } else {
        const {error}=await admin.from('profesionales').update({nombre,whatsapp,usuario_id:userId,activo:true}).eq('id',professional_id); if(error)throw error;
      }
    }
    return res.status(200).json({ok:true});
  }catch(e){return res.status(e.status||400).json({error:e.message||'No se pudo actualizar el acceso.'});}
}
