-- ============================================================
-- RED DE ATENCIÓN PSICOLÓGICA HUMANISTA
-- BASE COMPLETA - ejecutar una sola vez en SQL Editor de Supabase
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- TABLAS ----------
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol text not null check (rol in ('admin','profesional')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profesionales (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid unique references auth.users(id) on delete set null,
  nombre text not null,
  whatsapp text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.asociaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  consentimiento_url text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.formularios (
  id uuid primary key default gen_random_uuid(),
  asociacion_id uuid not null references public.asociaciones(id) on delete cascade,
  nombre text not null,
  url text not null,
  orden integer not null default 1,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.solicitudes_atencion (
  id uuid primary key default gen_random_uuid(),

  nombre text not null
    check (char_length(trim(nombre)) between 2 and 100),

  telefono text not null
    check (telefono ~ '^[0-9]{10,15}$'),

  profesional_id uuid
    references public.profesionales(id)
    on delete set null,

  asociacion_id uuid
    references public.asociaciones(id)
    on delete set null,

  estado text not null default 'pendiente'
    check (
      estado in (
        'pendiente',
        'asignada',
        'contactada',
        'cita_agendada',
        'cerrada'
      )
    ),

  fecha_asignacion timestamptz,

  consentimiento_estado text not null default 'pendiente'
    check (
      consentimiento_estado in (
        'pendiente',
        'enviado',
        'completado'
      )
    ),

  consentimiento_enviado_at timestamptz,
  consentimiento_completado_at timestamptz,

  formularios_estado text not null default 'pendiente'
    check (
      formularios_estado in (
        'pendiente',
        'enviado',
        'completado'
      )
    ),

  formularios_enviados_at timestamptz,
  formularios_completados_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.citas (
  id uuid primary key default gen_random_uuid(),

  solicitud_id uuid
    references public.solicitudes_atencion(id)
    on delete set null,

  profesional_id uuid not null
    references public.profesionales(id)
    on delete restrict,

  paciente_nombre text not null,
  paciente_telefono text not null,

  fecha date not null,
  hora_inicio time not null,

  duracion_min integer not null default 60
    check (duracion_min between 15 and 240),

  estado text not null default 'programada'
    check (
      estado in (
        'programada',
        'confirmada',
        'atendida',
        'cancelada',
        'no_asistio'
      )
    ),

  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.horarios (
  id uuid primary key default gen_random_uuid(),

  profesional_id uuid not null
    references public.profesionales(id)
    on delete cascade,

  dia_semana integer not null
    check (dia_semana between 0 and 6),

  hora_inicio time not null,
  hora_fin time not null,

  activo boolean not null default true,

  created_at timestamptz not null default now(),

  constraint horario_valido
    check (hora_fin > hora_inicio)
);

-- ---------- ÍNDICES ----------
create index if not exists solicitudes_profesional_idx
  on public.solicitudes_atencion(profesional_id);

create index if not exists solicitudes_estado_idx
  on public.solicitudes_atencion(estado);

create index if not exists citas_profesional_fecha_idx
  on public.citas(profesional_id, fecha);

create index if not exists horarios_profesional_idx
  on public.horarios(profesional_id);

-- ---------- UPDATED_AT ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists solicitudes_set_updated_at
on public.solicitudes_atencion;

create trigger solicitudes_set_updated_at
before update on public.solicitudes_atencion
for each row
execute function public.set_updated_at();

drop trigger if exists citas_set_updated_at
on public.citas;

create trigger citas_set_updated_at
before update on public.citas
for each row
execute function public.set_updated_at();

-- ---------- HELPERS DE SEGURIDAD ----------
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = auth.uid()
      and p.rol = 'admin'
      and p.activo = true
  );
$$;

create or replace function public.mi_profesional_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pr.id
  from public.profesionales pr
  where pr.usuario_id = auth.uid()
    and pr.activo = true
  limit 1;
$$;

-- ---------- SOLICITUD PÚBLICA ----------
-- El paciente solamente manda nombre + teléfono.
-- No puede leer solicitudes.
-- No puede insertar directamente en la tabla.
-- Entra mediante esta función.

create or replace function public.crear_solicitud_atencion(
  p_nombre text,
  p_telefono text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_nombre text := trim(p_nombre);
  v_tel text :=
    regexp_replace(
      coalesce(p_telefono,''),
      '\D',
      '',
      'g'
    );
begin

  if char_length(v_nombre) < 2
     or char_length(v_nombre) > 100 then
    raise exception 'Nombre inválido';
  end if;

  if v_tel !~ '^[0-9]{10,15}$' then
    raise exception 'Teléfono inválido';
  end if;

  insert into public.solicitudes_atencion(
    nombre,
    telefono
  )
  values(
    v_nombre,
    v_tel
  )
  returning id into v_id;

  return v_id;

end;
$$;

grant execute
on function public.crear_solicitud_atencion(text,text)
to anon, authenticated;

-- ---------- ACTIVAR RLS ----------
alter table public.perfiles
enable row level security;

alter table public.profesionales
enable row level security;

alter table public.asociaciones
enable row level security;

alter table public.formularios
enable row level security;

alter table public.solicitudes_atencion
enable row level security;

alter table public.citas
enable row level security;

alter table public.horarios
enable row level security;

-- ---------- LIMPIAR POLÍTICAS ----------
-- Permite volver a ejecutar este archivo sin duplicarlas.

do $$
declare
  r record;
begin

  for r in
    select
      schemaname,
      tablename,
      policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'perfiles',
        'profesionales',
        'asociaciones',
        'formularios',
        'solicitudes_atencion',
        'citas',
        'horarios'
      )
  loop

    execute format(
      'drop policy if exists %I on %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );

  end loop;

end
$$;

-- ============================================================
-- PERFILES
-- ============================================================

create policy perfiles_lectura_propia_o_admin
on public.perfiles
for select
to authenticated
using (
  id = auth.uid()
  or public.es_admin()
);

create policy perfiles_admin_todo
on public.perfiles
for all
to authenticated
using (
  public.es_admin()
)
with check (
  public.es_admin()
);

-- ============================================================
-- PROFESIONALES
-- ============================================================

create policy profesionales_lectura_autenticados
on public.profesionales
for select
to authenticated
using (true);

create policy profesionales_admin_escritura
on public.profesionales
for all
to authenticated
using (
  public.es_admin()
)
with check (
  public.es_admin()
);

create policy profesional_actualiza_su_ficha
on public.profesionales
for update
to authenticated
using (
  usuario_id = auth.uid()
)
with check (
  usuario_id = auth.uid()
);

-- ============================================================
-- ASOCIACIONES
-- ============================================================

create policy asociaciones_lectura
on public.asociaciones
for select
to authenticated
using (true);

create policy asociaciones_admin
on public.asociaciones
for all
to authenticated
using (
  public.es_admin()
)
with check (
  public.es_admin()
);

-- ============================================================
-- FORMULARIOS
-- ============================================================

create policy formularios_lectura
on public.formularios
for select
to authenticated
using (true);

create policy formularios_admin
on public.formularios
for all
to authenticated
using (
  public.es_admin()
)
with check (
  public.es_admin()
);

-- ============================================================
-- SOLICITUDES DE ATENCIÓN
-- Admin: todas
-- Profesional: únicamente las asignadas a él
-- ============================================================

create policy solicitudes_admin_select
on public.solicitudes_atencion
for select
to authenticated
using (
  public.es_admin()
);

create policy solicitudes_admin_insert
on public.solicitudes_atencion
for insert
to authenticated
with check (
  public.es_admin()
);

create policy solicitudes_admin_update
on public.solicitudes_atencion
for update
to authenticated
using (
  public.es_admin()
)
with check (
  public.es_admin()
);

create policy solicitudes_admin_delete
on public.solicitudes_atencion
for delete
to authenticated
using (
  public.es_admin()
);

create policy solicitudes_prof_select
on public.solicitudes_atencion
for select
to authenticated
using (
  profesional_id = public.mi_profesional_id()
);

create policy solicitudes_prof_update
on public.solicitudes_atencion
for update
to authenticated
using (
  profesional_id = public.mi_profesional_id()
)
with check (
  profesional_id = public.mi_profesional_id()
);

-- ============================================================
-- CITAS
-- ============================================================

create policy citas_admin_select
on public.citas
for select
to authenticated
using (
  public.es_admin()
);

create policy citas_admin_insert
on public.citas
for insert
to authenticated
with check (
  public.es_admin()
);

create policy citas_admin_update
on public.citas
for update
to authenticated
using (
  public.es_admin()
)
with check (
  public.es_admin()
);

create policy citas_admin_delete
on public.citas
for delete
to authenticated
using (
  public.es_admin()
);

create policy citas_prof_select
on public.citas
for select
to authenticated
using (
  profesional_id = public.mi_profesional_id()
);

create policy citas_prof_insert
on public.citas
for insert
to authenticated
with check (
  profesional_id = public.mi_profesional_id()
);

create policy citas_prof_update
on public.citas
for update
to authenticated
using (
  profesional_id = public.mi_profesional_id()
)
with check (
  profesional_id = public.mi_profesional_id()
);

create policy citas_prof_delete
on public.citas
for delete
to authenticated
using (
  profesional_id = public.mi_profesional_id()
);

-- ============================================================
-- HORARIOS
-- Admin: todos
-- Profesional: solo sus horarios
-- ============================================================

create policy horarios_admin_select
on public.horarios
for select
to authenticated
using (
  public.es_admin()
);

create policy horarios_admin_all
on public.horarios
for all
to authenticated
using (
  public.es_admin()
)
with check (
  public.es_admin()
);

create policy horarios_prof_select
on public.horarios
for select
to authenticated
using (
  profesional_id = public.mi_profesional_id()
);

create policy horarios_prof_insert
on public.horarios
for insert
to authenticated
with check (
  profesional_id = public.mi_profesional_id()
);

create policy horarios_prof_update
on public.horarios
for update
to authenticated
using (
  profesional_id = public.mi_profesional_id()
)
with check (
  profesional_id = public.mi_profesional_id()
);

create policy horarios_prof_delete
on public.horarios
for delete
to authenticated
using (
  profesional_id = public.mi_profesional_id()
);

-- ============================================================
-- IMPORTANTE
-- No existen políticas ANON sobre las tablas.
-- El formulario público solo entra mediante:
-- crear_solicitud_atencion(nombre, telefono)
-- ============================================================
