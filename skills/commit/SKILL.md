---
name: commit
description: Redacta el mensaje de commit a partir de lo ya hecho y probado en la sesión actual — qué cambió, qué se verificó, en lenguaje sin detalle técnico. Usar antes de cualquier `git commit`, en cualquier proyecto.
---

# Commit

Este skill no vuelve a implementar nada: toma lo que ya pasó **en esta misma
sesión** — los archivos tocados, las pruebas corridas, los endpoints
verificados — y lo convierte en un mensaje de commit legible para alguien que
no programa (el cliente, un PO, el propio usuario revisando meses después).

Si un cambio toca varios repos (por ejemplo un front y su API), cada repo hace su
propio commit, cada uno con este mismo criterio de redacción.

## De dónde sale el contenido

**Nunca preguntar** "¿qué hiciste?" o "¿qué probaste?" — esa información ya
está en la conversación. Repasar:

1. Los archivos editados/creados en la sesión (herramientas Edit/Write usadas).
2. Las verificaciones reales que se corrieron: comandos de lint/typecheck,
   llamadas curl contra el API, servidor dev levantado, lo que haya arrojado
   resultado observable. Si algo no se verificó, no se afirma que se probó.
3. El motivo original de la tarea (lo que pidió el usuario), para el resumen.

Si la sesión no tiene suficiente información para alguna sección (por ejemplo,
no se corrió ninguna prueba), esa sección se omite — no se inventa.

## Estructura del mensaje

```
<tipo>(<alcance>): <resumen de una línea, sin jerga>

Qué se hizo:
- <bullet en español llano, orientado a impacto para el usuario final>
- <bullet>

Qué se probó:
- <verificación concreta y real, ej. "se subió y renombró un archivo de prueba
  contra el API de desarrollo">
```

- **Resumen**: una oración, lenguaje de negocio. "Permite ver quién subió cada
  archivo y renombrarlo" en vez de "agrega campo uploadedByUuid y endpoint
  PATCH".
- **Qué se hizo**: 2-5 bullets como máximo, sin nombrar funciones, archivos,
  variables ni frameworks. Describe el comportamiento nuevo, no la
  implementación.
- **Qué se probó**: solo pruebas que de verdad ocurrieron en la sesión
  (comandos ejecutados, respuestas de API observadas, servidor corrido). Si
  solo hubo lint/typecheck limpios, decirlo así — no simular que se probó en
  navegador si no se hizo.
- Tipo y alcance (`feat(pacientes)`, `fix(documentos)`, etc.) siguen la
  convención ya usada en el historial de git del repo — revisar `git log`
  reciente si hay duda.

## Antes de commitear

1. `git status` y `git diff` para confirmar qué entra al commit — nunca asumir
   que todo lo modificado en el working tree pertenece a esta tarea.
2. Los chequeos del proyecto limpios (lint, typecheck y los que pida su `CLAUDE.md`);
   en un monorepo, los del paquete tocado.
3. Nada de credenciales ni datos reales en el diff.
4. Nunca incluir artefactos de build (`dist/`, `tsbuildinfo`) que no formen
   parte del cambio real, aunque el repo los tenga trackeados.
5. Seguir la política de atribución vigente en la sesión (memoria del
   usuario / recordatorio del sistema) — no asumir un formato por defecto.
6. Si el repo tiene `.claude/HANDOFF.md`, actualizarlo e incluirlo en el commit:
   en qué estamos, qué sigue, y toda decisión, preferencia o pregunta nueva del
   usuario en esta sesión. Máximo una página; lo cerrado pasa a `DECISIONS.md`.
   Una sesión paralela en su worktree no lo toca: se lo informa al coordinador.

## Ejemplo

Sesión: se agregó a los documentos de paciente el autor de la subida y la
posibilidad de renombrarlos; se verificó con `yarn lint`, `yarn typecheck`, y
subiendo/renombrando/borrando un archivo real contra el API de desarrollo.

```
feat(documentos): muestra quién subió cada archivo y permite renombrarlo

Qué se hizo:
- Cada archivo del expediente ahora muestra quién lo subió, igual que las notas
- Se puede cambiar el nombre de un archivo ya subido sin volver a subirlo

Qué se probó:
- yarn lint y yarn typecheck sin errores
- Se subió, renombró y eliminó un archivo de prueba contra el API de desarrollo
```
