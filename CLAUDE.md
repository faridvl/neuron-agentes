# neuron-agentes

Repo del motor: la configuración global de Claude Code del usuario. Ver `README.md`.

- Lo que se edita aquí afecta a **todas** las sesiones y proyectos: cambios chicos y probados.
- `global/CLAUDE.md` se carga en cada sesión: mantenerlo por debajo de ~100 líneas; lo que no se
  usa en cada mensaje va a una skill.
- Las fichas de `proyectos/` llevan el frontmatter que lee `hooks/cerebro.mjs` (`nombre`, `carpeta`,
  `alias`, `resumen`, `estado`). Si se cambia el formato, cambiar el hook.
- Probar el hook a mano:
  `echo '{"hook_event_name":"SessionStart","cwd":"<ruta de un proyecto>"}' | node hooks/cerebro.mjs`
- Este repo es el **motor**: nunca nombres, rutas ni datos de proyectos, clientes o empresas.
  Eso va en una neurona (repo aparte). Nunca secretos.
- Decisiones de diseño del motor: `DECISIONS.md`.
