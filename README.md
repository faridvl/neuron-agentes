# claude-brain (motor)

Forma de trabajar con Claude Code, portable a cualquier PC y cuenta: reglas globales, agentes,
hooks y skills genéricas. **No contiene nada de ningún proyecto**: los datos van en uno o más
**cerebros** (repos aparte) que se instalan junto al motor.

## Cómo funciona

```
Tú ── sesión (conversa, decide, no programa)
          │  prueba de reanudación: ¿≤3 archivos, sin riesgo, revisable con el diff?
          │      sí → lo hace la sesión        no ↓
          └── director (Opus) ── planifica, decide lo técnico, reparte
                 ├── ejecutor (Sonnet)      implementa
                 ├── qa (Sonnet)            verifica con evidencia
                 ├── revisor-ux (Opus)      design QA en el navegador (obligatorio si hay pantalla nueva)
                 └── cuestionador (Opus)    intenta romperlo (obligatorio si toca un riesgo)
```

- Cada agente arranca con contexto limpio: recibe su encargo y devuelve un resumen.
- Al abrir una sesión, un hook inyecta **en titulares**: el proyecto de la carpeta actual, su
  ficha, el extracto del `HANDOFF.md` y la lista de proyectos conocidos (de los cerebros instalados).
- Los hooks también anotan los tiempos (`registro/`, por máquina, fuera de git) para la skill `tiempos`.
- Push, merge, `--force`, deploy y migraciones piden permiso siempre (`settings.json` → `ask`).

## Motor y cerebros

| | Motor (este repo) | Cerebro (repo aparte, uno por ámbito) |
|---|---|---|
| Qué guarda | Agentes, hooks, reglas de trabajo, skills genéricas | Fichas de proyectos, aprendizajes, memoria de agentes, `estandares-*` del stack, `reglas.md` |
| Se comparte | Sí: es igual en todas las PCs | No: personal y empresa nunca se mezclan |

Un cerebro tiene esta forma:

```
mi-cerebro/
├── reglas.md          reglas propias de sus proyectos (se importan en cada sesión)
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

## Instalar

```powershell
git clone <remoto del motor> claude-brain
.\claude-brain\install.ps1 -RaizProyectos "<raíz de proyectos>" [-Cerebros "<cerebro>", "<otro>"]
```

- Sin `-Cerebros` funciona igual (agentes, reglas, permisos, tiempos); solo que no hay fichas.
- Varias cuentas en la misma PC comparten `~/.claude`. Si una usa otra carpeta, pasar `-ConfigDir`.
- **Suma, no reemplaza**, y reinstalar da el mismo resultado:
  - `CLAUDE.md`: tu contenido queda intacto; el motor mantiene al final un bloque entre
    `<!-- claude-brain:inicio -->` y `<!-- claude-brain:fin -->` con los `@import` (reglas del motor y `reglas.md`
    de cada cerebro).
  - `agents/`: es tu carpeta. El motor copia ahí los agentes del motor y de los cerebros (el cerebro gana si
    repiten nombre) y los anota en `~/.claude/cerebro-agentes.json`. Solo toca lo anotado; un agente tuyo con el
    mismo nombre no se pisa (avisa).
  - `skills/`: un junction por skill del motor y de cada cerebro; una skill tuya con el mismo nombre no se pisa.
  - `settings.json`: se agregan hooks y permisos del motor; lo tuyo se queda.
- Migración desde la versión vieja (CLAUDE.md de solo `@import`, `agents` como junction): se quita el junction,
  se restauran tus agentes desde `~/.claude/backups/pre-cerebro-*` y se avisa dónde quedó tu CLAUDE.md original
  (no se restaura solo).
- Lo que se cambia se respalda en `~/.claude/backups/pre-cerebro-<fecha>/`.

```powershell
.\claude-brain\install.ps1 -Desinstalar   # quita bloque, agentes del manifiesto, enlaces de skills y hooks del motor
```
