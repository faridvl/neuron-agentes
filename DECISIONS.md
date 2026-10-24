# Decisiones del cerebro

## 2026-10-24 — Docker Desktop se arranca solo con un script
Un cierre brusco deja trabado `docker-secrets-engine\engine.sock` y cada arranque le muestra un error
al usuario. La skill `docker` lo revisa antes de abrir: si no se puede borrar, no abre y pide reiniciar.

## 2026-10-24 — Design QA con su propio agente
qa prueba que funcione; nadie revisaba si la pantalla es fácil para quien la usa. `revisor-ux` (Opus,
no edita) la usa en el navegador por dispositivo y es obligatorio cuando se crea o rediseña una pantalla.

## 2026-10-24 — El director es un subagente, no un equipo de agentes
Los subagentes pueden lanzar subagentes (hasta 3 niveles), así que la sesión → director → ejecutor
cabe. Los "agent teams" son experimentales, no sobreviven a `/resume` y gastan más: descartados.

## 2026-10-24 — Cuatro agentes, no siete
Para proyectos de una persona: director (absorbe architect), ejecutor (front y back), qa,
cuestionador. Sin devops (deploy = push a main, siempre con permiso) ni database (las migraciones
las hace el ejecutor con el riesgo marcado y el cuestionador obligatorio). Lecturas amplias con el
`Explore` integrado.

## 2026-10-24 — Opus juzga, Sonnet ejecuta
Director y cuestionador en Opus; ejecutor y qa en Sonnet.

## 2026-10-24 — Trabajo en secuencia, sin worktree por agente
Cada worktree pide `.env`, `npm install` y otro puerto. Paralelo solo cuando el director lo justifica.

## 2026-10-24 — ESTANDARES.md partido en skills
El CLAUDE.md global quedó en reglas de cada mensaje; stack, estructura, UI y API se cargan a pedido.
El ejecutor los recibe precargados (`skills:` en su frontmatter), que es quien escribe el código.

## 2026-10-24 — Fichas con ruta relativa a la raíz de proyectos
`carpeta: React/<proyecto>` + `raizProyectos` en `~/.claude/cerebro.json` (por máquina), para que el
mismo repo funcione en otra PC. Sin índice aparte: el hook arma la lista desde el frontmatter.

## 2026-10-24 — Memoria de agentes en el cerebro
`~/.claude/agent-memory` es un junction a `agent-memory/` del primer cerebro instalado: lo que
aprenden los agentes se versiona con ese cerebro y nunca en el motor.

## 2026-10-24 — Registro de tiempos fuera de git
`registro/<equipo>.jsonl` crece en cada mensaje; se ignora en git para no ensuciar el historial.

## 2026-10-24 — Junctions en vez de symlinks
En Windows los junctions no piden administrador y funcionan entre discos (`~/.claude` en C:, el
cerebro en E:). El CLAUDE.md global es un `@import` de una línea porque un archivo no admite junction.

## 2026-10-24 — Motor y cerebros separados
El motor (agentes, hooks, reglas de trabajo, skills genéricas) se comparte entre PCs y cuentas; los
datos (fichas, aprendizajes, memoria, estándares del stack, `reglas.md`) van en cerebros aparte, uno
por ámbito (personal, empresa). Así el motor se puede clonar en la PC del trabajo sin llevar nada
personal, y cada cerebro aporta su `estandares-*` con los mismos nombres para su stack.
