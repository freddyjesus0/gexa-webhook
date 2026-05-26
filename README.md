# Gexa Webhook

Webhook simple para recibir mensajes de WhatsApp Cloud API en Vercel y guardarlos en Supabase.

## Flujo actual

1. Meta envia un `POST` a `/api/webhook`.
2. Vercel ejecuta `api/webhook.js`.
3. El webhook lee el payload y busca el primer mensaje de WhatsApp.
4. El webhook busca el canal en Supabase usando `whatsapp_phone_number_id`.
5. El webhook crea o reutiliza contacto y conversacion.
6. El webhook inserta una fila en Supabase.
7. El webhook responde `200` despues del guardado correcto.

La misma ruta tambien responde el `GET` que Meta usa para verificar el webhook.

## Archivos

- `api/webhook.js`: verifica Meta y recibe mensajes.
- `api/conversaciones.js`: entrega conversaciones y mensajes al dashboard.
- `lib/supabase.js`: crea el cliente servidor de Supabase.
- `lib/gexa.js`: guarda mensajes entrantes dentro del modelo de Gexa.
- `public/index.html`: dashboard minimo para leer conversaciones.
- `vercel.json`: se mantiene como JSON valido. No necesita reglas extra porque Vercel publica `api/webhook.js` como `/api/webhook`.

## Variables de entorno

Agrega estas variables en `.env.local` para pruebas locales y en Vercel para produccion:

```env
SUPABASE_URL=
SUPABASE_SECRET_KEY=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_DEFAULT_EMPRESA_ID=
WHATSAPP_ACCESS_TOKEN=
DASHBOARD_ACCESS_TOKEN=
```

`WHATSAPP_VERIFY_TOKEN` es un texto inventado por ti. Meta lo compara con tu webhook durante la verificacion.

`SUPABASE_SECRET_KEY` debe usarse solo en el servidor. No la pongas en frontend ni la subas a Git.

`WHATSAPP_ACCESS_TOKEN` todavia no se usa para recibir mensajes. Se necesitara mas adelante para enviar respuestas por la API de Meta.

`DASHBOARD_ACCESS_TOKEN` es un texto inventado por ti para proteger el dashboard mientras no existe login.

## Modelo actual en Supabase

Gexa usa estas tablas principales:

- `empresas`: empresas que se van a monitorear.
- `canales`: cuentas conectadas por empresa, por ejemplo WhatsApp, Instagram o Facebook.
- `contactos`: personas que escriben.
- `conversaciones`: hilos abiertos con contactos.
- `mensajes`: mensajes individuales.

Para la etapa actual se crearon estas empresas:

```text
gexa
neoplas
prime
personal
```

## Registrar canal WhatsApp

Cuando tengas el `whatsapp_phone_number_id` real, registra el canal en Supabase.

Ejemplo para pruebas con la empresa `personal`:

```sql
insert into public.canales (
  empresa_id,
  canal,
  nombre,
  external_account_id
)
values (
  'personal',
  'whatsapp',
  'WhatsApp Personal',
  'AQUI_VA_EL_PHONE_NUMBER_ID_REAL'
)
on conflict (canal, external_account_id) do update
set
  empresa_id = excluded.empresa_id,
  nombre = excluded.nombre,
  activo = true;
```

Mientras no exista un canal registrado para ese `phone_number_id`, el webhook usa `WHATSAPP_DEFAULT_EMPRESA_ID` como respaldo.

## Configuracion en Meta

Usa esta callback URL en Meta:

```text
https://TU-PROYECTO.vercel.app/api/webhook
```

No uses `/webhook`.

En Verify Token escribe exactamente el mismo valor que guardaste en `WHATSAPP_VERIFY_TOKEN`.

## Dashboard

Cuando el proyecto este desplegado en Vercel, abre:

```text
https://TU-PROYECTO.vercel.app/
```

El dashboard lee conversaciones desde:

```text
/api/conversaciones
```

Al abrirlo, el navegador pedira el valor de `DASHBOARD_ACCESS_TOKEN`.

## Logs esperados

Cuando llegue un mensaje, en los logs de Vercel deberias ver:

```text
Webhook recibido
Payload recibido
Insertando Supabase
Guardado OK
```

Si llega un evento de Meta que no contiene `messages`, veras:

```text
Evento sin mensaje. No se inserta en Supabase.
```

Eso puede pasar con estados de entrega y no significa que el webhook este roto.

## Si Supabase queda vacio

Revisa en este orden:

1. Meta debe llamar a `/api/webhook`, no a `/webhook`.
2. En Vercel deben existir `SUPABASE_URL`, `SUPABASE_SECRET_KEY` y `WHATSAPP_DEFAULT_EMPRESA_ID`.
3. La tabla debe llamarse `mensajes` y tener las columnas del SQL anterior.
4. Los logs deben llegar hasta `Insertando Supabase`.
5. Si aparece `Error:`, usa ese mensaje para corregir la causa concreta.
