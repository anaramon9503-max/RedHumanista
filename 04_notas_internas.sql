-- ============================================================
-- RED HUMANISTA - 04 NOTAS INTERNAS DE PACIENTE
-- Ejecutar UNA SOLA VEZ después de 01/02/03.
-- Las notas NO son públicas y NO se guardan en Storage.
-- Admin: puede ver y administrar todas.
-- Profesional: solo puede ver notas de pacientes asignados a él.
-- Profesional: solo puede editar/eliminar las notas que él mismo creó.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.notas_paciente (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null
    references public.solicitudes_atencion(id) on delete cascade,
  created_by uuid default auth.uid()
    references auth.users(id) on delete set null,
  autor_nombre text not null,
  contenido text not null
    check (char_length(trim(contenido)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notas_paciente_solicitud_idx
  on public.notas_paciente(solicitud_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notas_paciente_set_updated_at
on public.notas_paciente;

create trigger notas_paciente_set_updated_at
before update on public.notas_paciente
for each row
execute function public.set_updated_at();

alter table public.notas_paciente enable row level security;

drop policy if exists notas_admin_select on public.notas_paciente;
drop policy if exists notas_admin_insert on public.notas_paciente;
drop policy if exists notas_admin_update on public.notas_paciente;
drop policy if exists notas_admin_delete on public.notas_paciente;
drop policy if exists notas_prof_select on public.notas_paciente;
drop policy if exists notas_prof_insert on public.notas_paciente;
drop policy if exists notas_prof_update on public.notas_paciente;
drop policy if exists notas_prof_delete on public.notas_paciente;

create policy notas_admin_select
on public.notas_paciente
for select to authenticated
using (public.es_admin());

create policy notas_admin_insert
on public.notas_paciente
for insert to authenticated
with check (public.es_admin());

create policy notas_admin_update
on public.notas_paciente
for update to authenticated
using (public.es_admin())
with check (public.es_admin());

create policy notas_admin_delete
on public.notas_paciente
for delete to authenticated
using (public.es_admin());

create policy notas_prof_select
on public.notas_paciente
for select to authenticated
using (
  exists (
    select 1
    from public.solicitudes_atencion s
    where s.id = notas_paciente.solicitud_id
      and s.profesional_id = public.mi_profesional_id()
  )
);

create policy notas_prof_insert
on public.notas_paciente
for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.solicitudes_atencion s
    where s.id = notas_paciente.solicitud_id
      and s.profesional_id = public.mi_profesional_id()
  )
);

create policy notas_prof_update
on public.notas_paciente
for update to authenticated
using (
  created_by = auth.uid()
  and exists (
    select 1
    from public.solicitudes_atencion s
    where s.id = notas_paciente.solicitud_id
      and s.profesional_id = public.mi_profesional_id()
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.solicitudes_atencion s
    where s.id = notas_paciente.solicitud_id
      and s.profesional_id = public.mi_profesional_id()
  )
);

create policy notas_prof_delete
on public.notas_paciente
for delete to authenticated
using (
  created_by = auth.uid()
  and exists (
    select 1
    from public.solicitudes_atencion s
    where s.id = notas_paciente.solicitud_id
      and s.profesional_id = public.mi_profesional_id()
  )
);

grant select, insert, update, delete
on public.notas_paciente
to authenticated;
