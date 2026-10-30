---
name: tiempos
description: Muestra cuánto tiempo real tomó el trabajo — por día, por proyecto, por agente y por tarea del director — a partir del registro que escriben los hooks del motor. Usar cuando el usuario pregunte cuánto tardó algo, cuánto trabajó en un proyecto, o pida un resumen de tiempos.
---

# Tiempos

Los hooks del motor anotan cada mensaje del usuario, cada fin de respuesta y cada inicio y fin
de subagente en `registro/<equipo>.jsonl` (no va a git: es por máquina).

```bash
node "<motor>/skills/tiempos/scripts/reporte.mjs" --dias 7
node "<motor>/skills/tiempos/scripts/reporte.mjs" --dias 30 --proyecto <nombre>
```

`<motor>` es la ruta que aparece al inicio de la sesión ("Motor: …").

Cómo leerlo:
- **Tiempo** por proyecto: lo que Claude estuvo trabajando (desde el mensaje hasta que terminó de
  responder). No cuenta el tiempo que el usuario tarda en leer o contestar.
- **Tareas del director**: cada encargo no trivial, de principio a fin, con el pedido que lo originó.
  Es la mejor medida de "cuánto tardó esta tarea".
- Los agentes corren dentro del tiempo del director, así que no se suman entre sí.

Presentar el resultado tal cual (tablas) y, si se pide, una o dos observaciones: qué proyecto se
llevó más tiempo, qué tipo de tarea tarda más de lo esperado.
