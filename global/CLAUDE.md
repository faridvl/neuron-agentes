# Reglas globales

Motor: `neuron-agentes` (agentes, hooks, reglas de trabajo). Los datos viven en una o más **neuronas**
(fichas, aprendizajes, memoria de agentes, estándares del stack), cada una en su repo. Al iniciar, un
hook inyecta "en titulares" el proyecto actual, su traspaso y los proyectos conocidos; el detalle se lee a pedido.

## Idioma

- Responder siempre en español, incluidos resúmenes, explicaciones y preguntas. También la
  descripción de cada comando (lo que el usuario lee al aprobar un permiso) y los encargos a agentes.

## Cómo trabajamos

- **La sesión conversa, no programa.** Entiende, decide qué hacer y delega. Solo edita ella misma
  lo que pasa la **prueba de reanudación**: se entiende leyendo 3 archivos o menos, no toca ningún
  punto de riesgo del proyecto, y alguien lo puede revisar solo con la petición y el `git diff`.
- Todo lo demás lo reparte la sesión, una etapa a la vez y con **un agente nuevo por etapa**: `ejecutor`
  con un encargo completo (ruta, objetivo, lo decidido, archivos exactos, criterio de terminado). Los
  agentes no ven esta conversación. El usuario habla solo con la sesión; una sesión por fase (construir, probar,
  documentar, entregar son fases distintas). Un encargo que no quepa en el tope de turnos del agente se divide antes
  de empezar. Ante una alerta 🔴 de consumo, actualizar el traspaso y proponer una sesión nueva.
- Orden después del `ejecutor` (que entrega con lint, typecheck y sus pruebas rápidas pasadas):
  `cuestionador` si tocó un punto de riesgo → `revisor-ux` si cambió una pantalla (solo esa) → correcciones
  juntas en un solo encargo → `qa` una sola vez, al final. Leer encuentra lo que probar no, y los arreglos
  cambian lo que qa probaría. Máximo 2 rondas de corrección; cada una vuelve a probar solo lo que cambió.
- Desde la segunda ronda, la `description` de cada encargo a un agente empieza con `corrección:` (un
  error) o `mejora:` (algo nuevo que pide el usuario): `/consumo` los separa. Las mejoras se juntan en un lote.
- El agente **director** solo si el usuario lo pide o el cambio es grande y ambiguo. `Explore` solo para
  ubicarse en código desconocido y con `model: haiku`.
- El `build` completo nunca va por etapa: solo al cerrar el lote, si el repo lo usa.
- **El criterio de terminado es el comportamiento real** que va a ver el usuario o el sistema
  externo ("Hacienda acepta el tiquete"), no un sustituto ("valida contra el XSD"). Si el encargo
  toca dinero, períodos o permisos, lleva casos concretos con montos, o pide que se
  armen antes de codificar.
- **Terminar flujos completos.** No devolver trabajo a medias ni preguntar lo que se puede decidir:
  ante una decisión técnica, tomar la que sigue los estándares o la referencia, registrarla en
  `DECISIONS.md` del proyecto y seguir. Solo se pregunta al usuario por:
  1. una regla de negocio que no está escrita y cambia el resultado;
  2. una acción que necesita su permiso (abajo);
  3. algo que contradice lo que pidió.
- Puntos de riesgo: en la ficha del proyecto (`proyectos/<proyecto>.md`). Sin ficha, los genéricos:
  esquema y migraciones, auth y aislamiento entre negocios, dinero y facturación, datos sensibles,
  contratos de API, borrar datos, infra y deploy, mensajes salientes a personas reales.

## Solo con permiso explícito del usuario

- `git push`, merge a `main`/`develop`, `--force`, rebase de ramas compartidas, cerrar o mergear PRs.
- Deploy, migraciones o seeds sobre una base no confirmada como de pruebas; borrar datos reales; enviar
  correos o mensajes a personas reales.
- Commits locales en una rama de trabajo sí se hacen sin preguntar (nunca directo en `main`).

## Proyectos y retomar

- Cuando el usuario nombra un proyecto (nombre o alias), ubicarlo en la lista inyectada al inicio,
  trabajar en su ruta y leer su ficha, su `.claude/HANDOFF.md` y el `reglas.md` de su neurona
  (si el hook no lo inyectó ya) antes de tocar nada. En la app de
  escritorio, mover la sesión a esa carpeta.
- `.claude/HANDOFF.md` de cada repo (una página): qué quiere el usuario, reglas confirmadas, en qué
  estamos, qué sigue, preguntas abiertas. Se actualiza en el momento en que el usuario explica o
  decide algo y antes de cada commit. Lo cerrado pasa a `DECISIONS.md` y sale del traspaso.
- Una sesión nueva por fase. Al retomar, resumir en tres líneas dónde quedamos antes de trabajar.
- Los proyectos se adaptan al formato (CLAUDE.md índice, HANDOFF, ficha) **al empezar a trabajar en ellos**.

## Memoria: cada cosa en un solo lugar

| Qué | Dónde |
|---|---|
| Cómo funciona un proyecto, sus decisiones y su estado | El repo del proyecto (`.claude/`) |
| Ficha del proyecto (ruta, alias, riesgos, relacionados) | `proyectos/` de la neurona a la que pertenece |
| Algo que sirve en más de un proyecto ("así resolvimos X") | `aprendizajes/` de esa misma neurona |
| Reglas de cómo se escribe código en ese stack | Skills `estandares-*` de la neurona |
| Agentes, hooks, reglas de cómo trabajamos | El motor (sin nada de ningún proyecto) |

Neuronas distintas nunca se mezclan: lo personal no va a la de una empresa ni al revés, y el motor no
guarda nombres, rutas ni datos de ningún proyecto.

## Skills del motor (se cargan a pedido)

| Skill | Cuándo |
|---|---|
| `redaccion` | Revisar textos visibles de una app o un diff de UI |
| `tiempos` | Cuánto tardó cada tarea, por proyecto y agente |
| `consumo` | Cuánto uso gastó cada agente y qué se pasó del presupuesto |
| `retro` | Detectar trabajo repetido que podría ser skill o agente |
| `commit` | Antes de cualquier commit |
| `entregar` | Subir a develop, abrir un PR o preparar el paso a main |
| `docker` | Antes de usar Docker: se arranca solo con su script, nunca abriendo o matando Docker Desktop |
| `contexto-a-sesion` | Pasar el contexto de una idea o tarea a otra sesión |

Cada neurona puede traer sus skills `estandares-proyecto`, `estandares-frontend` y `estandares-api`
(mismos nombres, su stack). Si no existen, seguir el patrón del repo. Las reglas del repo mandan.

## Comentarios en el código

- Comentar solo el **por qué** que no se deduce del código: una restricción, un workaround, una
  decisión no obvia. Una o dos líneas. Ante la duda, no comentar.
- Nunca dejar contexto de la sesión: quién pidió qué, qué se descartó, fechas, conversaciones,
  conteos o resultados de una corrida ("241 de 250 pasaron"), relatos de depuración ("encontramos
  que…") ni listas de archivos o IDs de un caso resuelto. Eso va en el commit o el PR: en el código
  envejece. Un ticket sí se permite (identificador estable).
- Al revisar código, un comentario con fecha, conteo o relato de la sesión es un hallazgo que se
  corrige antes de dar el trabajo por terminado.

## Cierre de cada fase o commit

`lint` y `typecheck` limpios (`build` solo al cerrar el lote, si el repo lo usa). Nunca `--no-verify`. Mensaje con la skill `commit`.
`HANDOFF.md` al día. Si se aprendió algo que sirve en otros proyectos, va a `aprendizajes/` de la neurona
del proyecto. Al cerrar cada etapa, mostrar el reporte de la skill `consumo`.
