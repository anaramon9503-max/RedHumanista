-- RED HUMANISTA - MIGRACION 05
-- Asignacion robusta + bloqueos de horario + estado de pago
-- Es incremental: no borra datos ni recrea tablas existentes.

-- 1) Asignacion atomica para administradores.
create or replace function public.asignar_solicitud_atencion(
  p_solicitud_id uuid,
  p_profesional_id uuid,
  p_asociacion_id uuid default null
)
returns public.solicitudes_atencion
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.solicitudes_atencion;
begin
  if auth.uid() is null or not public.es_admin() then
    raise exception 'No autorizado';
  end if;

  if p_solicitud_id is null or p_profesional_id is null then
    raise exception 'Solicitud y profesional son obligatorios';
  end if;

  if not exists (
    select 1 from public.profesionales
    where id = p_profesional_id and activo = true
  ) then
    raise exception 'El profesional seleccionado no existe o está inactivo';
  end if;

  if p_asociacion_id is not null and not exists (
    select 1 from public.asociaciones
    where id = p_asociacion_id and activo = true
  ) then
    raise exception 'La colaboración seleccionada no existe o está inactiva';
  end if;

  update public.solicitudes_atencion
  set profesional_id = p_profesional_id,
      asociacion_id = p_asociacion_id,
      estado = case when estado = 'cerrada' then estado else 'asignada' end,
      fecha_asignacion = now(),
      updated_at = now()
  where id = p_solicitud_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'No se encontró la solicitud';
  end if;

  return v_row;
end;
$$;

revoke all on function public.asignar_solicitud_atencion(uuid,uuid,uuid) from public;
grant execute on function public.asignar_solicitud_atencion(uuid,uuid,uuid) to authenticated;

-- 2) Bloqueos de disponibilidad esperados por panel.js.
create table if not exists public.bloqueos_horario (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  fecha date not null,
  todo_el_dia boolean not null default true,
  hora_inicio time,
  hora_fin time,
  motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bloqueo_horas_validas check (
    (todo_el_dia = true and hora_inicio is null and hora_fin is null)
    or
    (todo_el_dia = false and hora_inicio is not null and hora_fin is not null and hora_fin > hora_inicio)
  )
);

create index if not exists bloqueos_profesional_fecha_idx
  on public.bloqueos_horario(profesional_id, fecha);

alter table public.bloqueos_horario enable row level security;

drop policy if exists bloqueos_admin_all on public.bloqueos_horario;
drop policy if exists bloqueos_prof_select on public.bloqueos_horario;
drop policy if exists bloqueos_prof_insert on public.bloqueos_horario;
drop policy if exists bloqueos_prof_update on public.bloqueos_horario;
drop policy if exists bloqueos_prof_delete on public.bloqueos_horario;

create policy bloqueos_admin_all on public.bloqueos_horario
for all to authenticated
using (public.es_admin())
with check (public.es_admin());

create policy bloqueos_prof_select on public.bloqueos_horario
for select to authenticated
using (profesional_id = public.mi_profesional_id());

create policy bloqueos_prof_insert on public.bloqueos_horario
for insert to authenticated
with check (profesional_id = public.mi_profesional_id());

create policy bloqueos_prof_update on public.bloqueos_horario
for update to authenticated
using (profesional_id = public.mi_profesional_id())
with check (profesional_id = public.mi_profesional_id());

create policy bloqueos_prof_delete on public.bloqueos_horario
for delete to authenticated
using (profesional_id = public.mi_profesional_id());

-- 3) Estado de pago independiente del estado de la cita.
alter table public.citas
  add column if not exists estado_pago text not null default 'pendiente';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'citas_estado_pago_check'
  ) then
    alter table public.citas
      add constraint citas_estado_pago_check
      check (estado_pago in ('pendiente','pagado'));
  end if;
end $$;
