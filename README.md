# Red Humanista — versión con panel completo

Esta versión incluye **Solicitudes, Citas, Profesionales, Servicios, Horarios y Asociaciones**, además de la página pública con nombre + teléfono.

## Actualización de una instalación existente

1. Sube todos los archivos de este ZIP a GitHub/Vercel.
2. En Supabase → SQL Editor ejecuta **una sola vez** `supabase/02_mejoras_panel.sql`.
3. Vuelve a abrir `panel.html`.

> La página pública sigue pidiendo únicamente nombre y teléfono. Servicios y horarios son internos para administración/profesionales.

---

# Humanista Agenda

Sistema independiente para **Red de Atención Psicológica Humanista**.

## Flujo incluido

1. El paciente abre la página pública.
2. Solo captura **nombre + teléfono**.
3. La solicitud llega al administrador como `pendiente`.
4. El administrador asigna profesional y, si corresponde, asociación.
5. El administrador pulsa **WhatsApp profesional** y se abre el mensaje con los datos del paciente.
6. El profesional inicia sesión, ve solamente sus pacientes y contacta al paciente.
7. Cuando acuerdan fecha y hora, el profesional registra la cita.
8. El profesional puede mover/editar sus citas y administrar su propia disponibilidad.
9. Por asociación se configura un consentimiento informado y uno o varios Google Forms.
10. Consentimiento y Forms se envían por WhatsApp, con estados de enviado/completado.
11. La agenda permite descargar una imagen de confirmación de cita.

> La página pública NO muestra profesionales, fechas ni horarios.

---

## 1. Crear Supabase nuevo

Crea un proyecto separado en Supabase. No uses el Supabase de Miawgenda.

### Ejecuta el esquema completo

Ve a **SQL Editor > New query** y ejecuta:

`supabase/01_setup_completo.sql`

---

## 2. Crear el primer administrador

En Supabase ve a:

**Authentication > Users > Add user**

Crea el correo y contraseña del administrador.

Después abre:

`supabase/02_crear_primer_admin.sql`

Cambia:

`CAMBIA_AQUI_TU_CORREO_ADMIN`

por el correo que acabas de crear y ejecuta el SQL.

---

## 3. Configurar el frontend

En Supabase ve a **Project Settings > API** y copia:

- Project URL
- Publishable/anon key

Abre `config.js` y reemplaza:

- `TU_SUPABASE_URL`
- `TU_SUPABASE_PUBLISHABLE_KEY`

La `service_role` NUNCA se pone en `config.js`.

---

## 4. Subir a GitHub y Vercel

Sube la carpeta completa a un repositorio nuevo, por ejemplo:

`Humanista-Agenda`

En Vercel importa ese repositorio.

En **Vercel > Settings > Environment Variables** agrega:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Los valores salen de Supabase > Project Settings > API.

La service role es secreta y solo la usa `/api/create-user.js` para que el administrador pueda crear accesos de profesionales.

Después haz un redeploy.

---

## 5. URLs

- `/` → Solicitud pública de pacientes.
- `/panel` → Login de administrador y profesionales.

---

## 6. Primer uso

1. Entra a `/panel` con la cuenta del administrador.
2. Ve a **Profesionales** y crea cada profesional con nombre, WhatsApp, correo y contraseña temporal.
3. Ve a **Asociaciones** y crea cada asociación.
4. En cada asociación agrega el enlace al consentimiento informado.
5. En **Formularios** agrega los Google Forms que correspondan.
6. Haz una solicitud de prueba desde `/`.
7. Asígnala a un profesional y prueba el botón de WhatsApp.
8. Inicia sesión con el profesional y registra una cita.

---

## Seguridad incluida

- RLS activo en todas las tablas.
- El paciente anónimo no puede leer datos.
- Las solicitudes públicas entran por una función controlada (`crear_solicitud_atencion`).
- El administrador puede ver y administrar todo.
- Cada profesional solo puede ver sus pacientes, citas y horarios.
- La service role queda únicamente del lado servidor en Vercel.

---

## Importante sobre Google Forms

Esta versión maneja el estado de los formularios de forma **manual** (`pendiente`, `enviado`, `completado`). Google Forms no notifica automáticamente a esta app cuando una persona termina un formulario. Para automatizarlo después se puede integrar Apps Script/webhooks, pero no es necesario para operar el sistema.
