# Red Humanista — instalación de la versión completa

Esta versión conserva el proyecto existente y agrega las mejoras de forma incremental.

## Supabase
Si la base ya existe, NO vuelvas a ejecutar `01_setup_completo.sql`.

Ejecuta en SQL Editor, en este orden:

1. `02_mejoras_panel.sql` (solo si nunca se aplicó)
2. `03_storage_documentos.sql` (solo si nunca se aplicó)
3. `04_notas_internas.sql` (solo si nunca se aplicó)
4. `05_asignacion_bloqueos_pago.sql`
5. `06_agenda_completa.sql`

Los archivos 05 y 06 son incrementales y no borran pacientes/citas existentes.

## Vercel
Mantén configuradas estas variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

La `SERVICE_ROLE_KEY` solo se usa en las funciones server-side de Vercel para administrar accesos. No debe ponerse en `config.js`.

## Cambios principales incluidos

- Asignación robusta de solicitudes.
- Roles Administrador/Profesional y RLS existentes conservados.
- Pacientes y notas privadas.
- Consentimiento y formularios por colaboración.
- Citas con confirmar, atendida, no asistió, cancelar y eliminar.
- Estado de pago independiente: pendiente/pagado.
- Reagendado sobre la misma cita.
- Validación server-side de horario, bloqueos y traslapes.
- Bloqueos de día completo o por horas para admin/profesional.
- Resumen diario en administración.
- Precio/modalidad de servicios.
- Descripción/contacto de colaboraciones.
- WhatsApp para seguimiento.
- Panel responsive existente conservado y ampliado.

## Nota sobre horarios

Para crear o reagendar una cita, el profesional debe tener un horario activo que cubra completamente la cita. Si no existe, Supabase devolverá: `La cita está fuera del horario disponible del profesional`.
