# neuron-agentes (motor)

Forma de trabajar con Claude Code, portable a cualquier PC y cuenta: reglas globales, agentes,
hooks y skills genéricas. **No contiene nada de ningún proyecto**: los datos van en uno o más
**neuronas** (repos aparte) que se instalan junto al motor.

## Cómo funciona

```
Tú ── sesión (conversa, decide, no programa)
          │  prueba de reanudación: ¿≤3 archivos, sin riesgo, revisable con el diff?
          │      sí → lo hace la sesión        no ↓
          └── un agente nuevo por etapa; director (Opus) solo a pedido o en cambios grandes y ambiguos
                 ├── ejecutor (Sonnet)      implementa (entrega con lint, typecheck y pruebas rápidas)
                 ├── cuestionador (Opus)    intenta romperlo (obligatorio si toca un riesgo)
                 ├── revisor-ux (Sonnet)    design QA en el navegador (obligatorio si hay pantalla nueva)
                 └── qa (Sonnet)            verifica con evidencia, una sola vez, al final
                 (orden: ejecutor → cuestionador → revisor-ux → correcciones juntas → qa)
```

- Cada agente arranca con contexto limpio: recibe su encargo y devuelve un resumen.
- Al abrir una sesión, un hook inyecta **en titulares**: el proyecto de la carpeta actual, su
  ficha, el extracto del `HANDOFF.md` y la lista de proyectos conocidos (de las neuronas instaladas).
- Los hooks también anotan los tiempos (`registro/`, por máquina, fuera de git) para la skill `tiempos`.
- Push, merge, `--force`, deploy y migraciones piden permiso siempre (`settings.json` → `ask`).

## Motor y neuronas

| | Motor (este repo) | Neurona (repo aparte, una por ámbito) |
|---|---|---|
| Qué guarda | Agentes, hooks, reglas de trabajo, skills genéricas | Fichas de proyectos, aprendizajes, memoria de agentes, `estandares-*` del stack, `reglas.md` |
| Se comparte | Sí: es igual en todas las PCs | No: personal y empresa nunca se mezclan |

Una neurona tiene esta forma:

```
mi-neurona/
├── reglas.md          reglas propias de sus proyectos (el hook las inyecta en sesiones y agentes de sus proyectos)
├── proyectos/<x>.md   ficha: frontmatter nombre, carpeta, alias, resumen, estado + riesgos y comandos
├── aprendizajes/      soluciones que sirven en más de un proyecto
├── agent-memory/      lo que aprenden los agentes
└── skills/            estandares-proyecto, estandares-frontend, estandares-api (su stack) y otras
```

Ficha mínima (`proyectos/<carpeta>.md`):

```markdown
---
nombre: mi-proyecto
carpeta: React/mi-proyecto
alias: mi proyecto, el backoffice
resumen: Una línea: qué es y para quién
estado: activo
---
Stack, comandos, ramas y **riesgos** concretos del proyecto.
```

## Opcionales

- Tope de la conversación principal: `"autoCompactWindow": 200000` en `settings.json` (requiere una versión reciente de
  Claude Code). Compacta enseguida las sesiones abiertas que ya lo superan.
- Barra de estado con contexto y límites reales: `"statusLine": { "type": "command", "command": "node <motor>/install/barra-estado.mjs" }`.

## Instalar

```powershell
git clone <remoto del motor> neuron-agentes
.\neuron-agentes\install.ps1 -RaizProyectos "<raíz de proyectos>" [-Cerebros "<neurona>", "<otro>"]
```

- El parámetro conserva el nombre `-Cerebros` (así no se rompen instalaciones previas). Sin él funciona igual (agentes, reglas, permisos, tiempos); solo que no hay fichas.
- Varias cuentas en la misma PC comparten `~/.claude`. Si una usa otra carpeta, pasar `-ConfigDir`.
- **Suma, no reemplaza**, y reinstalar da el mismo resultado:
  - `CLAUDE.md`: tu contenido queda intacto; el motor mantiene al final un bloque entre
    `<!-- claude-brain:inicio -->` y `<!-- claude-brain:fin -->` con el `@import` de las reglas del motor. El
    `reglas.md` de cada neurona no se importa: `hooks/cerebro.mjs` lo inyecta al arrancar una sesión o un agente
    en un proyecto de esa neurona.
  - `agents/`: es tu carpeta. El motor copia ahí los agentes del motor y de las neuronas (la neurona gana si
    repiten nombre) y los anota en `~/.claude/cerebro-agentes.json`. Solo toca lo anotado; un agente tuyo con el
    mismo nombre no se pisa (avisa).
  - `skills/`: un junction por skill del motor y de cada neurona; una skill tuya con el mismo nombre no se pisa.
  - `settings.json`: se agregan hooks y permisos del motor; lo tuyo se queda.
- Migración desde la versión vieja (CLAUDE.md de solo `@import`, `agents` como junction): se quita el junction,
  se restauran tus agentes desde `~/.claude/backups/pre-cerebro-*` y se avisa dónde quedó tu CLAUDE.md original
  (no se restaura solo).
- Lo que se cambia se respalda en `~/.claude/backups/pre-cerebro-<fecha>/`.

```powershell
.\neuron-agentes\install.ps1 -Desinstalar   # quita bloque, agentes del manifiesto, enlaces de skills y hooks del motor
```
