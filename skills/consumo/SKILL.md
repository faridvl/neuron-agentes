---
name: consumo
description: Muestra cuánto uso se gastó, con veredicto y gráfica por agente. Usar cuando el usuario diga /consumo, pregunte cuánto se gastó, qué agente consume más o si el límite de uso se acaba rápido, y al cerrar una etapa.
---

# Consumo

Lee las transcripciones locales de Claude Code y calcula el uso de cada sesión y de sus agentes.

```bash
node "<motor>/skills/consumo/scripts/reporte.mjs"                                  # la sesión de esta carpeta
node "<motor>/skills/consumo/scripts/reporte.mjs" --titulo "Proyecto · etapa 5"    # con nombre
node "<motor>/skills/consumo/scripts/reporte.mjs" --etapas 3                       # sesión con varias etapas
node "<motor>/skills/consumo/scripts/reporte.mjs" --todas --dias 1                 # todas las sesiones
node "<motor>/skills/consumo/scripts/reporte.mjs" --activas                        # un resumen por cada sesión activa
node "<motor>/skills/consumo/scripts/reporte.mjs" --sesion <id>                    # una sesión concreta
```

`<motor>` es la ruta que aparece al inicio de la sesión ("Motor: …").

Mostrar la salida tal cual en un bloque de código, con gráfica incluida; no convertirla en tabla. Si hay varias
sesiones en la misma carpeta, toma la última que escribió: para otra, usar `--sesion`.

"Activa" es una sesión que gastó algo en las últimas 5 horas: Claude no registra cuáles siguen abiertas.

Cómo se calcula:
- **Unidades (M = millones):** entrada ×1, lectura de memoria ×0.1, escritura de memoria ×2, respuesta ×5. No
  distingue el precio de cada modelo, así que Opus pesa más de lo que muestra.
- **Veredicto por etapa:** menos de 2 M BIEN, de 2 a 7 M CARO, más de 7 M MAL. Son referencias propias, no oficiales.
- **Últimas 5 horas:** suma todas las sesiones de esta configuración, porque el límite es de la cuenta. Los 15 M
  son un cálculo aproximado; el dato oficial está en `/usage`.

El formato de las transcripciones no es público: si el reporte sale vacío, avisarlo y usar `/usage` en la terminal.
