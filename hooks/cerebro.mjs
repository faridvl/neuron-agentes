// Hook único del motor: arranque en titulares, contexto para subagentes y registro de tiempos.
// Nunca debe romper una sesión: cualquier error se traga y sale con código 0.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alertaDe } from './alerta-consumo.mjs';
import { comandoFiltrado } from './filtro-pruebas.mjs';

const MOTOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const CONFIG_PATH = path.join(CONFIG_DIR, 'cerebro.json');
const PROMPT_PREVIEW_CHARS = 140;
const HANDOFF_MAX_LINES = 14;

// readFileSync(0) falla con pipes en Windows (EOF/EAGAIN): se lee el stream.
const leerStdin = async () => {
  try {
    let texto = '';
    for await (const trozo of process.stdin) texto += trozo;
    return JSON.parse(texto || '{}');
  } catch {
    return {};
  }
};

const realPath = (ruta) => {
  try {
    return fs.realpathSync.native(ruta);
  } catch {
    return path.resolve(ruta);
  }
};

const normalizar = (ruta) => realPath(ruta).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();

const leerConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
};

// Una ficha ilegible se salta: no puede dejar sin arranque a todas las sesiones.
const parsearFicha = (archivo) => {
  let texto;
  try {
    texto = fs.readFileSync(archivo, 'utf8');
  } catch {
    return null;
  }
  const bloque = texto.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!bloque) return null;
  const campos = Object.fromEntries(
    bloque[1]
      .split(/\r?\n/)
      .map((linea) => linea.match(/^(\w+):\s*(.*)$/))
      .filter(Boolean)
      .map(([, clave, valor]) => [clave, valor.trim()]),
  );
  return { ...campos, archivo };
};

// Cada neurona (personal, de una empresa) aporta sus fichas sin mezclarse con los otros.
const cerebrosDe = (config) => (config.cerebros ?? []).filter((raiz) => fs.existsSync(raiz));

const cargarFichas = (config) =>
  cerebrosDe(config).flatMap((raiz) => {
    const dir = path.join(raiz, 'proyectos');
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((nombre) => nombre.endsWith('.md') && nombre !== 'README.md')
      .map((nombre) => parsearFicha(path.join(dir, nombre)))
      .filter(Boolean);
  });

const rutaProyecto = (ficha, config) =>
  ficha.carpeta && config.raizProyectos ? path.join(config.raizProyectos, ficha.carpeta) : null;

const detectarProyecto = (cwd, fichas, config) => {
  if (!cwd) return null;
  const actual = normalizar(cwd);
  return (
    fichas
      .map((ficha) => ({ ficha, ruta: rutaProyecto(ficha, config) }))
      .filter(({ ruta }) => ruta && fs.existsSync(ruta))
      .filter(({ ruta }) => {
        const base = normalizar(ruta);
        return actual === base || actual.startsWith(`${base}/`);
      })
      .sort((a, b) => b.ruta.length - a.ruta.length)[0] ?? null
  );
};

// Dentro de .claude/worktrees/<x> el traspaso vigente es el del worktree, no el del checkout principal.
const raizDelRepo = (cwd, rutaProyecto) => {
  const relativo = path.relative(realPath(rutaProyecto), realPath(cwd)).split(path.sep);
  if (relativo[0] === '.claude' && relativo[1] === 'worktrees' && relativo[2]) {
    return path.join(rutaProyecto, '.claude', 'worktrees', relativo[2]);
  }
  return rutaProyecto;
};

const titularesHandoff = (rutaRepo) => {
  const archivo = path.join(rutaRepo, '.claude', 'HANDOFF.md');
  if (!fs.existsSync(archivo)) return `Sin .claude/HANDOFF.md en este repo (crearlo al primer cierre).`;
  const lineas = fs.readFileSync(archivo, 'utf8').split(/\r?\n/);
  const inicio = lineas.findIndex((linea) => /^#+\s*(en qué estamos|estado|dónde quedamos)/i.test(linea));
  const desde = inicio >= 0 ? inicio : 0;
  const extracto = lineas
    .slice(desde, desde + HANDOFF_MAX_LINES)
    .filter((linea) => linea.trim())
    .join('\n');
  return `Traspaso (${archivo}), extracto:\n${extracto}`;
};

const arranque = (entrada, config) => {
  const fichas = cargarFichas(config);
  const encontrado = detectarProyecto(entrada.cwd, fichas, config);
  const cerebros = cerebrosDe(config);
  const partes = [
    `Motor: ${MOTOR}`,
    cerebros.length
      ? `Neuronas (fichas en proyectos/, aprendizajes/): ${cerebros.join(' · ')}`
      : 'Sin neurona instalada: no hay fichas de proyectos en esta máquina.',
  ];
  if (encontrado) {
    const { ficha, ruta } = encontrado;
    partes.push(
      `Proyecto actual: ${ficha.nombre} — ${ficha.resumen}`,
      `Ficha (riesgos y comandos): ${ficha.archivo}`,
      titularesHandoff(raizDelRepo(entrada.cwd, ruta)),
    );
  } else {
    partes.push('Proyecto actual: ninguno reconocido en esta carpeta.');
  }
  if (!fichas.length) return partes.join('\n');
  const lista = fichas
    .filter((ficha) => ficha.estado !== 'archivado')
    .map((ficha) => {
      const ruta = rutaProyecto(ficha, config) ?? ficha.carpeta;
      return `- ${ficha.nombre} [${ficha.estado ?? '?'}] (${ficha.alias}) → ${ruta}`;
    });
  partes.push(`Proyectos conocidos (alias → ruta):\n${lista.join('\n')}`);
  return partes.join('\n');
};

const contextoSubagente = (entrada, config) => {
  const encontrado = detectarProyecto(entrada.cwd, cargarFichas(config), config);
  const proyecto = encontrado
    ? `Proyecto de la carpeta actual: ${encontrado.ficha.nombre}, ficha en ${encontrado.ficha.archivo}.`
    : 'La carpeta actual no es un proyecto con ficha; el encargo dice cuál es.';
  const cerebros = cerebrosDe(config);
  const dondeBuscar = cerebros.length
    ? `Neuronas del usuario (fichas en proyectos/, aprendizajes/): ${cerebros.join(' · ')}.`
    : 'No hay neurona instalada.';
  return `${dondeBuscar} ${proyecto}`;
};

const registrar = (entrada, config) => {
  const dir = path.join(MOTOR, 'registro');
  fs.mkdirSync(dir, { recursive: true });
  const encontrado = detectarProyecto(entrada.cwd, cargarFichas(config), config);
  const prompt =
    typeof entrada.prompt === 'string'
      ? entrada.prompt
          .replace(/<pasted_content[\s\S]*?<\/pasted_content[^>]*>/g, '[pegado]')
          .replace(/\s+/g, ' ')
          .slice(0, PROMPT_PREVIEW_CHARS)
      : undefined;
  // El director empieza su resumen con "## <tarea> — <proyecto>, rama …": eso dice dónde trabajó
  // aunque la sesión esté en otra carpeta.
  const proyectoResumen =
    entrada.hook_event_name === 'SubagentStop'
      ? entrada.last_assistant_message?.match(/^##[^\n]*—\s*([\w.-]+)\s*,/m)?.[1]
      : undefined;
  const linea = {
    ts: new Date().toISOString(),
    ev: entrada.hook_event_name,
    sid: entrada.session_id,
    proyecto: encontrado?.ficha.nombre ?? path.basename(entrada.cwd ?? ''),
    agente: entrada.agent_type,
    agentId: entrada.agent_id,
    prompt,
    proyectoResumen,
  };
  fs.appendFileSync(path.join(dir, `${os.hostname()}.jsonl`), `${JSON.stringify(linea)}\n`);
};

try {
  const entrada = await leerStdin();
  const config = leerConfig();
  const evento = entrada.hook_event_name;
  // Corre en cada comando: no pasa por el registro de tiempos.
  if (evento === 'PreToolUse') {
    const command = comandoFiltrado(entrada.tool_input?.command);
    if (command) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: { ...entrada.tool_input, command } },
        }),
      );
    }
  } else {
    registrar(entrada, config);
    if (evento === 'Stop' || evento === 'SubagentStop') {
      const aviso = alertaDe(entrada, path.join(MOTOR, 'registro', 'alertas'));
      if (aviso) process.stdout.write(JSON.stringify({ systemMessage: aviso }));
    } else if (evento === 'SessionStart') {
      process.stdout.write(arranque(entrada, config));
    } else if (evento === 'SubagentStart') {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'SubagentStart',
            additionalContext: contextoSubagente(entrada, config),
          },
        }),
      );
    }
  }
} catch {
  // Un hook roto no puede bloquear el trabajo.
}
// exitCode y no exit(): en Windows stdout a un pipe es asíncrono y exit() lo corta.
process.exitCode = 0;
