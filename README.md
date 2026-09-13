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


## Flujo actualizado: Solicitudes vs. Pacientes

El panel separa ahora dos tareas distintas:

- **Solicitudes (solo administración):** muestra nombre, teléfono, profesional asignado y únicamente las acciones **Asignar/Cambiar profesional** y **WhatsApp paciente**.
- **Pacientes (administración y profesionales):** aquí vive el seguimiento: WhatsApp, consentimiento, formularios/documentos, cita y cierre de proceso.
- **Administrador que también atiende:** en **Profesionales** aparece el botón **“También atiendo pacientes”**. Al activarlo, la misma cuenta de administrador se vincula a un registro de profesional y puede recibir pacientes sin perder permisos administrativos.
- **Administrador en Pacientes:** puede ver todos los pacientes y filtrar por profesional o por **Mis pacientes** cuando tenga perfil profesional.
- **Profesional:** solo ve sus pacientes, sus citas y su disponibilidad.

En celular la barra inferior queda: **Solicitudes · Pacientes · Citas · Profesionales · Más**. Dentro de **Más** están **Servicios · Horarios · Asociaciones**. El botón **Salir** permanece arriba.

## Flujo del consentimiento informado

1. En **Panel > Más > Asociaciones** se pega el enlace del **Google Forms del consentimiento informado**.
2. En **Pacientes**, se abre **Seguimiento** y se pulsa **Enviar** en Consentimiento informado.
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


## Corrección de navegación móvil
La barra inferior fue fijada a 66 px de alto, con cinco accesos iguales, iconos SVG de 20 px y etiquetas de 9.5 px. El CSS correctivo está al final de `asset/styles.css`.


## Actualización 04 · notas internas y citas del profesional

Después de las migraciones anteriores, ejecuta una sola vez `supabase/04_notas_internas.sql`.

Cambios de esta versión:
- El profesional puede crear una nueva cita desde **Mis citas** seleccionando únicamente uno de sus pacientes.
- También puede agendar desde **Pacientes > Ver paciente**.
- El profesional nunca puede elegir otro profesional para su cita.
- Los servicios de la cita se filtran según el profesional asignado.
- **Pacientes** queda más limpio: WhatsApp + Ver paciente.
- Dentro de **Ver paciente** están consentimiento/formularios, cita, notas internas y cierre del proceso.
- Las **Notas internas** solo pueden leerlas administración y el profesional asignado.
- Cada nota guarda autor, fecha y hora.
- El profesional solo puede editar/eliminar sus propias notas; administración puede administrar todas.
