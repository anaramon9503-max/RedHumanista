-- ============================================================
-- RED DE ATENCIÓN PSICOLÓGICA HUMANISTA
-- MIGRACIÓN 02 - SERVICIOS + ASIGNACIONES + SERVICIO EN CITAS
-- Ejecutar UNA SOLA VEZ en una instalación que ya usa 01_setup_completo.sql
-- Es idempotente: puede volver a correrse si una ejecución quedó incompleta.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- SERVICIOS ----------
create table if not exists public.servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  duracion_min integer not null default 60
    check (duracion_min between 15 and 240),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- SERVICIOS ASIGNADOS A PROFESIONALES ----------
create table if not exists public.profesional_servicios (
  profesional_id uuid not null
    references public.profesionales(id) on delete cascade,
  servicio_id uuid not null
    references public.servicios(id) on delete cascade,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (profesional_id, servicio_id)
);

-- ---------- SERVICIO EN CADA CITA ----------
alter table public.citas
  add column if not exists servicio_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'citas_servicio_id_fkey'
  ) then
    alter table public.citas
      add constraint citas_servicio_id_fkey
      foreign key (servicio_id)
      references public.servicios(id)
      on delete set null;
  end if;
end $$;

create index if not exists citas_servicio_idx
  on public.citas(servicio_id);

create index if not exists profesional_servicios_servicio_idx
  on public.profesional_servicios(servicio_id);

-- ---------- RLS ----------
alter table public.servicios enable row level security;
alter table public.profesional_servicios enable row level security;

drop policy if exists servicios_lectura on public.servicios;
drop policy if exists servicios_admin on public.servicios;
drop policy if exists profesional_servicios_lectura on public.profesional_servicios;
drop policy if exists profesional_servicios_admin on public.profesional_servicios;

create policy servicios_lectura
on public.servicios
for select
to authenticated
using (true);

create policy servicios_admin
on public.servicios
for all
to authenticated
using (public.es_admin())
with check (public.es_admin());

create policy profesional_servicios_lectura
on public.profesional_servicios
for select
to authenticated
using (true);

create policy profesional_servicios_admin
on public.profesional_servicios
for all
to authenticated
using (public.es_admin())
with check (public.es_admin());

-- Los privilegios habilitan las operaciones; RLS decide quién puede realizarlas.
grant select, insert, update, delete on public.servicios to authenticated;
grant select, insert, update, delete on public.profesional_servicios to authenticated;

-- Listo. Los servicios se crean desde Panel > Servicios.
