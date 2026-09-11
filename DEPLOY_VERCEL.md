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
