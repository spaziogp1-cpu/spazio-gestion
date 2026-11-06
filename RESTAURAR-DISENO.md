# Cómo volver al diseño anterior

Respaldo hecho el 6/11/2026, antes del rediseño visual.

## Dónde está

- **Rama en GitHub:** `respaldo-diseno-2026-11-06`. Apunta al commit `51d598b`, que es el último de `main` antes del rediseño.
- **Copia completa en .zip:** `spazio-gestion-respaldo-diseno-2026-11-06.zip` (código, estilos, logo e íconos de ese commit). Se entregó por el chat.
- El rediseño está en la rama `rediseno-visual`. `main` (producción) no se tocó.

## Los datos de gestión no se pierden

El rediseño cambia solo archivos de pantalla: estilos, componentes, logo e íconos. **No agrega migraciones ni cambia nada en Supabase**. Por eso, volver al diseño anterior no borra ni pisa los pedidos, tareas, pagos ni otros datos que se carguen después: la base de datos es la misma para los dos diseños.

## Opción A: todavía no se publicó (lo normal)

No hay que hacer nada. Producción sigue con el diseño anterior hasta que se fusione `rediseno-visual` en `main`. Para descartarlo, alcanza con borrar la rama `rediseno-visual`.

## Opción B: ya se publicó y hay que volver atrás

**Rápido, desde Vercel (sin tocar código):**

1. Entrá a Vercel → proyecto `spazio-gestion` → **Deployments**.
2. Buscá el último deployment de producción anterior al rediseño (commit `51d598b`).
3. Abrí el menú `⋯` → **Promote to Production** (o **Instant Rollback**).

**Definitivo, desde Git (deja el historial limpio):**

```bash
git checkout main
git pull
git revert -m 1 <commit-del-merge-del-rediseño>   # deshace el rediseño con un commit nuevo
git push origin main
```

Si el rediseño entró sin commit de merge (por ejemplo, con squash), usá `git revert <commit>` sin el `-m 1`.

Para recuperar un archivo puntual del diseño anterior:

```bash
git checkout respaldo-diseno-2026-11-06 -- app/globals.css
```

## Etiqueta fechada

Desde la sesión de trabajo, el servidor de GitHub no permitió subir etiquetas, así que el respaldo quedó como rama. Para tener además la etiqueta, corré esto una vez desde tu computadora:

```bash
git fetch origin respaldo-diseno-2026-11-06
git tag -a respaldo-diseno-2026-11-06 51d598b -m "Diseño anterior al rediseño visual"
git push origin respaldo-diseno-2026-11-06
```

Después conviene proteger la rama en GitHub (Settings → Branches) para que nadie la modifique por error.
