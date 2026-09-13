# Red Humanista — proyecto completo

Sistema para **Red de Atención Psicológica Humanista** con página pública, panel administrativo y acceso para profesionales.

## Incluye

- Página pública: el paciente deja **nombre + teléfono**.
- Solicitudes de atención.
- Asignación de profesional y asociación.
- Panel de citas.
- Servicios y asignación de servicios a profesionales.
- Horarios internos por profesional.
- Asociaciones.
- Google Forms de consentimiento informado.
- Formularios/tamizajes adicionales.
- Carga opcional de PDF, DOC, DOCX, JPG, PNG y WEBP para documentos base.
- Envío por WhatsApp.
- Confirmación de cita descargable como imagen.
- Navegación inferior tipo app en celular.
- **Cerrar sesión permanece arriba**.

---

## Flujo del consentimiento informado

1. En **Panel > Más > Asociaciones** se pega el enlace del **Google Forms del consentimiento informado**.
2. Desde una solicitud, se pulsa **Consentimiento / Formularios > Enviar por WhatsApp**.
3. El paciente recibe un enlace a `consentimiento.html`.
4. En esa pantalla lee una explicación breve y marca la casilla.
5. Al pulsar **Aceptar y continuar**, se abre el Google Forms configurado.
6. La aceptación formal queda dentro de Google Forms.
7. Cuando el equipo verifica la respuesta recibida, en el panel se pulsa **Marcar completado**.
8. Después pueden enviarse los demás formularios/tamizajes.

La app no marca automáticamente un Google Forms como completado porque Google Forms no notifica directamente a esta aplicación. Ese estado se confirma manualmente desde el panel.

Consulta `GUIA_GOOGLE_FORMS.md` para armar el formulario paso a paso.

---

## Si tu Supabase YA está creado

No vuelvas a ejecutar `01_setup_completo.sql` sobre una base en uso.

Ejecuta en **Supabase > SQL Editor**:

1. `supabase/02_mejoras_panel.sql` — agrega Servicios y servicio en Citas.
2. `supabase/03_storage_documentos.sql` — solo si quieres subir archivos desde Formularios/Documentos.

Si ya ejecutaste alguno de ellos correctamente, no necesitas repetirlo.

---

## Si vas a crear un Supabase NUEVO

1. Ejecuta `supabase/01_setup_completo.sql`.
2. Ejecuta `supabase/02_mejoras_panel.sql`.
3. Ejecuta `supabase/03_storage_documentos.sql` si usarás carga de archivos.
4. Crea el primer usuario administrador en **Authentication > Users** y vincúlalo a la tabla `perfiles` como administrador, según tu configuración actual.

---

## Configuración

`config.js` contiene:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- nombre del negocio
- código de país para WhatsApp

La `service_role` nunca debe colocarse en `config.js`; solo debe existir como variable de entorno del servidor para `/api/create-user.js`.

---

## Vercel

Sube **todo el contenido de esta carpeta** al repositorio que ya usa tu proyecto y haz commit.

Rutas principales:

- `/` — solicitud pública.
- `/panel.html` — acceso de administrador/profesionales.
- `/consentimiento.html` — pantalla intermedia; normalmente se abre desde el enlace enviado por WhatsApp.

Variables de entorno necesarias para crear accesos de profesionales:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## Formularios y archivos

En **Más > Asociaciones**:

- El campo **Google Forms del consentimiento informado** debe apuntar al formulario de consentimiento.
- En **Formularios** puedes agregar Google Forms de tamizajes u otros enlaces.
- También puedes subir archivos base de hasta 10 MB si ejecutaste `03_storage_documentos.sql`.

El bucket de Storage está pensado para **documentos base que se comparten con pacientes**, no para expedientes clínicos ni documentos privados del paciente.

---

## Archivos importantes

- `index.html` — página pública.
- `public.js` — envío de solicitud pública.
- `panel.html` — estructura del panel.
- `panel.js` — lógica del panel.
- `asset/styles.css` — estilos completos.
- `consentimiento.html` — paso previo al Google Forms.
- `GUIA_GOOGLE_FORMS.md` — guía para construir el consentimiento.
- `PLANTILLA_MENSAJE_CONSENTIMIENTO.txt` — texto de referencia para WhatsApp.
- `supabase/02_mejoras_panel.sql` — Servicios/Citas.
- `supabase/03_storage_documentos.sql` — carga de documentos.
