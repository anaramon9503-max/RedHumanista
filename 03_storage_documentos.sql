-- ============================================================
-- RED HUMANISTA - STORAGE PARA DOCUMENTOS
-- Ejecuta este archivo UNA SOLA VEZ en Supabase > SQL Editor.
--
-- Crea un bucket público para documentos BASE de asociaciones:
-- consentimiento, formularios, PDFs, imágenes, etc.
-- No lo uses para expedientes clínicos ni documentos privados del paciente.
-- ============================================================

-- 10 MB máximo por archivo.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'documentos-humanista',
  'documentos-humanista',
  true,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Limpiar políticas por si vuelves a ejecutar el archivo.
drop policy if exists "humanista_docs_authenticated_read" on storage.objects;
drop policy if exists "humanista_docs_admin_insert" on storage.objects;
drop policy if exists "humanista_docs_admin_update" on storage.objects;
drop policy if exists "humanista_docs_admin_delete" on storage.objects;

-- Los usuarios autenticados pueden listar/ver metadatos del bucket.
create policy "humanista_docs_authenticated_read"
on storage.objects
for select
to authenticated
using (bucket_id = 'documentos-humanista');

-- Solo la administración puede subir archivos.
create policy "humanista_docs_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documentos-humanista'
  and public.es_admin()
);

-- Solo la administración puede reemplazar/mover archivos.
create policy "humanista_docs_admin_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'documentos-humanista'
  and public.es_admin()
)
with check (
  bucket_id = 'documentos-humanista'
  and public.es_admin()
);

-- Solo la administración puede borrar archivos desde Storage.
create policy "humanista_docs_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documentos-humanista'
  and public.es_admin()
);
