---
name: entregar
description: Sube trabajo ya terminado y probado — integrarlo en develop y hacer push, o abrir un PR con su descripción y revisar la CI. Usar cuando el usuario diga "súbelo a develop", "pushea", "crea el PR", "abre el PR", "a producción" o "a main". No implementa ni corrige nada.
---

# Entregar

Toma trabajo **ya commiteado y verificado** y lo lleva a `develop` o a un PR. Si falta probar algo
o hay cambios sin commitear de la tarea, primero se cierra la tarea (skill `commit`).

## 0. Antes de cualquier modo

1. `git fetch origin` y `git status`. Archivos ajenos sin trackear se dejan: nunca `git add -A`.
2. Identificar la rama de trabajo y su base (normalmente `develop`; lo que diga el `CLAUDE.md` del repo).
3. Leer en la ficha del proyecto (neurona) y en su `CLAUDE.md` qué pasa al llegar a cada rama:
   CI, deploy, migraciones automáticas. Si subir dispara algo en producción, decirlo antes.
4. Chequeos del proyecto limpios sobre lo que se va a subir (lint, typecheck, los que pida el repo).
5. Que no viajen secretos: `git diff origin/<base>..HEAD` sin claves, URLs con contraseña ni `.env`.

## Modo "súbelo a develop"

1. `develop` local igual a `origin/develop` (si está atrás: `git merge --ff-only origin/develop`;
   si divergió, parar y explicar).
2. Integrar sin commits de merge: `git switch develop && git merge --ff-only <rama>`. Si no es
   fast-forward, rebasear la rama de trabajo sobre `develop` (es local, no compartida), volver a
   correr los chequeos y reintentar.
3. `git push origin develop`.
4. Borrar la rama local integrada con `git branch -d` (nunca `-D`).
5. `gh run list -b develop -L 3` para ver qué CI arrancó y cómo terminó.

## Modo "crea el PR"

1. `git push -u origin <rama>`.
2. Descripción con el mismo criterio de la skill `commit`, a partir de los commits de la rama:
   ```
   ## Qué se hizo
   - <impacto, sin jerga>
   ## Qué se probó
   - <solo lo que de verdad se verificó>
   ## Para revisar
   - <riesgos tocados, pasos manuales después del merge (migraciones, variables, buckets)>
   ```
3. `gh pr create --base <base> --title "<tipo(alcance): resumen>" --body-file <archivo temporal>`.
4. Devolver el enlace y el estado de la CI (`gh pr checks`). **Nunca** mergear el PR.

## Modo "a producción" / "a main"

- Si el repo tiene su propia skill de versión o release (por ejemplo `nueva-version`), usar esa.
- Si no, el modo "crea el PR" con base `main`, listando en "Para revisar" todo lo que el merge
  dispara (deploy, migraciones). Nunca mergear: eso es del usuario.

## Al terminar

- Actualizar `.claude/HANDOFF.md` si cambió "en qué estamos" (commit aparte, antes de subir).
- Si la ficha del proyecto tiene en "Orden pendiente" algo que esta entrega resolvió, actualizarla.
- Resumen corto: qué se subió (commits), a dónde, enlace del PR si hay, CI, y pasos manuales pendientes.
