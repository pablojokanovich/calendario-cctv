# Publicar la Agenda CCTV en GitHub + Vercel + Neon

Esta version esta preparada para Vercel usando Next.js y una base Postgres gratuita de Neon.

## 1. Crear la base en Neon

1. Entrar en https://neon.com y crear una cuenta.
2. Crear un proyecto nuevo, por ejemplo `calendario-cctv`.
3. Copiar el connection string de Postgres. En Vercel se va a usar como `DATABASE_URL`.
4. Abrir el SQL Editor de Neon y ejecutar el contenido de `database/neon-init.sql`.

## 2. Subir el proyecto a GitHub

1. Crear un repositorio nuevo en GitHub, por ejemplo `calendario-cctv`.
2. Subir este proyecto a ese repositorio.
3. No subir archivos `.env` con claves reales.

## 3. Crear el proyecto en Vercel

1. Entrar en https://vercel.com.
2. Importar el repositorio de GitHub.
3. Framework: Next.js.
4. Build command: `pnpm build`.
5. Install command: `pnpm install --frozen-lockfile`.
6. Output directory: dejar vacio.

## 4. Cargar variables de entorno

En Vercel, ir a Project Settings > Environment Variables y agregar:

```text
DATABASE_URL=postgres://...
```

Usar el connection string que entrega Neon.

## 5. Migrar datos existentes

Desde la agenda actual se puede exportar Excel para backup. Para migrar automaticamente los eventos actuales a Neon hace falta un script de importacion usando la API actual o un archivo exportado.

## 6. Dominio propio

Cuando el proyecto este funcionando en Vercel, se puede agregar un dominio propio desde Project Settings > Domains.

Ejemplos:

```text
calendario-cctv.com
calendario-cctv.com.ar
agenda.congressrental.com
```

El dominio se compra aparte. Vercel solo lo conecta al proyecto.

## Agenda individual y respaldo

La vista Agenda individual comparte texto editable o TXT por operador y fechas,
respetando los dias de asignacion y reemplazos. No incluye nombres de terceros.
El icono Respaldo descarga un ZIP versionado con agenda.json, todos los eventos,
equipos locales y PDF vigentes, conservando sus fechas de vencimiento. No incluye
datos del generador externo, credenciales ni PDF ya eliminados. El catalogo queda
como referencia; se restauran tema y contactos locales de citaciones, si existen.
Limite: 200 MB por ZIP y 20 MB de JSON.
La restauracion valida todo el ZIP y los hashes antes de escribir, agrega faltantes
por defecto y solo actualiza coincidencias si se selecciona esa opcion y se confirma.
Antes de actualizar descarga otra copia completa. No elimina otros eventos ni PDF.
Un error parcial muestra cuantos eventos se guardaron y permite revisar y reintentar.

## Ficha del evento y documentos

La ficha abre el generador original en `https://planillascctv.vercel.app/` desde
el enlace Equipos y remitos. Los datos del evento viajan en el fragmento de la
URL, sin enviarlos en la peticion HTTP. El generador recibe orden, nombre, lugar,
fechas, salas y un resumen de operadores en las notas. No se transfieren equipos
ni bultos entre bases. El generador conserva sus propios borradores y pide
confirmacion antes de reemplazar el de otro evento, guardando una copia local.
Los equipos y bultos que se hubieran cargado en la version integrada permanecen
en Neon; retirar la interfaz no borra esos datos.

Se admiten varios PDF por evento, de hasta 10 MiB cada uno. Se cargan en partes
de 1 MiB y se descargan con una respuesta en streaming para respetar el limite
de payload de las funciones de Vercel. Los PDF anteriores se migran a este
almacenamiento conservando su fecha original de carga.

Los archivos completados vencen 30 dias despues de su carga. Los intentos de
carga sin completar vencen al dia. Al vencer dejan de estar disponibles; el
cron diario de `vercel.json` elimina archivos y partes vencidos, sin borrar
eventos ni equipos. El cron solo corre en el despliegue de produccion. Su
horario es 08:00 UTC, con la precision que permita el plan de Vercel.

Opcionalmente, configurar `CRON_SECRET` en Vercel: Vercel envia ese valor como
token Bearer al ejecutar el cron. Sin esta variable, el endpoint de limpieza
solo permite borrar archivos ya vencidos y no expone datos privados. Consultar
documentos y manipular archivos vigentes siempre requiere la clave de la app.
