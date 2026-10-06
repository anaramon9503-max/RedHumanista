-- RED HUMANISTA - MIGRACION 06
-- Validacion central de citas + mejoras de servicios/colaboraciones.
-- Ejecutar DESPUES de 05_asignacion_bloqueos_pago.sql.

alter table public.servicios add column if not exists precio numeric(10,2);
alter table public.servicios add column if not exists modalidad text;
alter table public.asociaciones add column if not exists descripcion text;
alter table public.asociaciones add column if not exists contacto text;

create or replace function public.guardar_cita_validada(
  p_id uuid default null,
  p_solicitud_id uuid default null,
  p_profesional_id uuid default null,
  p_servicio_id uuid default null,
  p_paciente_nombre text default null,
  p_paciente_telefono text default null,
  p_fecha date default null,
  p_hora_inicio time default null,
  p_duracion_min integer default 60,
  p_estado text default 'programada',
  p_notas text default null
)
returns public.citas
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.citas;
  v_fin time;
  v_dow integer;
  v_admin boolean;
  v_mi_pro uuid;
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  v_admin := public.es_admin();
  v_mi_pro := public.mi_profesional_id();
  if not v_admin and (v_mi_pro is null or v_mi_pro <> p_profesional_id) then raise exception 'No autorizado'; end if;
  if p_profesional_id is null or p_fecha is null or p_hora_inicio is null then raise exception 'Profesional, fecha y hora son obligatorios'; end if;
  if coalesce(p_duracion_min,0) < 15 or p_duracion_min > 240 then raise exception 'Duración inválida'; end if;
  if p_estado not in ('programada','confirmada','atendida','cancelada','no_asistio') then raise exception 'Estado inválido'; end if;

  v_fin := (p_hora_inicio + make_interval(mins => p_duracion_min))::time;
  v_dow := extract(dow from p_fecha)::integer;

  if not exists (
    select 1 from public.horarios h
    where h.profesional_id=p_profesional_id and h.activo=true and h.dia_semana=v_dow
      and p_hora_inicio >= h.hora_inicio and v_fin <= h.hora_fin
  ) then raise exception 'La cita está fuera del horario disponible del profesional'; end if;

  if exists (
    select 1 from public.bloqueos_horario b
    where b.profesional_id=p_profesional_id and b.fecha=p_fecha
      and (b.todo_el_dia or (p_hora_inicio < b.hora_fin and v_fin > b.hora_inicio))
  ) then raise exception 'El profesional tiene un bloqueo en ese horario'; end if;

  if exists (
    select 1 from public.citas c
    where c.profesional_id=p_profesional_id and c.fecha=p_fecha and c.estado <> 'cancelada'
      and (p_id is null or c.id <> p_id)
      and p_hora_inicio < (c.hora_inicio + make_interval(mins => c.duracion_min))::time
      and v_fin > c.hora_inicio
  ) then raise exception 'Ya existe otra cita que se traslapa con ese horario'; end if;

  if p_id is null then
    insert into public.citas(solicitud_id,profesional_id,servicio_id,paciente_nombre,paciente_telefono,fecha,hora_inicio,duracion_min,estado,notas)
    values(p_solicitud_id,p_profesional_id,p_servicio_id,trim(p_paciente_nombre),p_paciente_telefono,p_fecha,p_hora_inicio,p_duracion_min,p_estado,p_notas)
    returning * into v_row;
  else
    update public.citas set solicitud_id=p_solicitud_id,profesional_id=p_profesional_id,servicio_id=p_servicio_id,
      paciente_nombre=trim(p_paciente_nombre),paciente_telefono=p_paciente_telefono,fecha=p_fecha,hora_inicio=p_hora_inicio,
      duracion_min=p_duracion_min,estado=p_estado,notas=p_notas,updated_at=now()
    where id=p_id returning * into v_row;
    if v_row.id is null then raise exception 'No se encontró la cita'; end if;
  end if;

  if p_solicitud_id is not null then
    update public.solicitudes_atencion set estado='cita_agendada',updated_at=now() where id=p_solicitud_id and estado<>'cerrada';
  end if;
  return v_row;
end;
$$;
revoke all on function public.guardar_cita_validada(uuid,uuid,uuid,uuid,text,text,date,time,integer,text,text) from public;
grant execute on function public.guardar_cita_validada(uuid,uuid,uuid,uuid,text,text,date,time,integer,text,text) to authenticated;

-- Modalidad visible también en la cita; si hay servicio se hereda automáticamente.
alter table public.citas add column if not exists modalidad text;
create or replace function public.cita_heredar_modalidad()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.servicio_id is not null then
    select modalidad into new.modalidad from public.servicios where id=new.servicio_id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_cita_modalidad on public.citas;
create trigger trg_cita_modalidad before insert or update of servicio_id on public.citas
for each row execute function public.cita_heredar_modalidad();
