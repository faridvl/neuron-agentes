// PostToolUse de los agentes con maxTurns: cuando faltan pocos turnos para el tope,
// una sola vez le pide que entregue su reporte. Nunca bloquea una herramienta.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TURNOS_DE_MARGEN = 5;
const FRACCION_DE_MARGEN_MAXIMA = 0.2;
const DIR_ESTADO = path.join(os.tmpdir(), 'neuron-aviso-tope');
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CARPETAS_DE_AGENTES = [path.join(AQUI, '..', 'agents'), path.join(os.homedir(), '.claude', 'agents')];

const leer = async () => {
  let texto = '';
  for await (const trozo of process.stdin) texto += trozo;
  return JSON.parse(texto || '{}');
};

const maxTurnosDe = (tipo) => {
  for (const carpeta of CARPETAS_DE_AGENTES) {
    const archivo = path.join(carpeta, `${tipo}.md`);
    if (!fs.existsSync(archivo)) continue;
    const encabezado = fs.readFileSync(archivo, 'utf8').split(/\r?\n---/)[0];
    const encontrado = encabezado.match(/^maxTurns:\s*(\d+)/m);
    if (encontrado) return Number(encontrado[1]);
  }
  return null;
};

const umbralDe = (maximo) => maximo - Math.min(TURNOS_DE_MARGEN, Math.ceil(maximo * FRACCION_DE_MARGEN_MAXIMA));

const transcripcionDe = (entrada) => {
  if (entrada.agent_transcript_path) return entrada.agent_transcript_path;
  const principal = entrada.transcript_path;
  if (!principal || !entrada.agent_id) return null;
  if (path.basename(principal) === `agent-${entrada.agent_id}.jsonl`) return principal;
  return path.join(principal.replace(/\.jsonl$/, ''), 'subagents', `agent-${entrada.agent_id}.jsonl`);
};

// Cuenta mensajes del asistente distintos (un mensaje se escribe en varias líneas con el mismo id)
// leyendo solo lo nuevo desde la última medición.
const contarTurnos = (archivo, estado) => {
  const tamano = fs.statSync(archivo).size;
  if (tamano <= estado.offset) return;
  const fd = fs.openSync(archivo, 'r');
  const bloque = Buffer.alloc(tamano - estado.offset);
  fs.readSync(fd, bloque, 0, bloque.length, estado.offset);
  fs.closeSync(fd);
  const fin = bloque.lastIndexOf(10);
  if (fin < 0) return;
  for (const linea of bloque.subarray(0, fin).toString('utf8').split('\n')) {
    if (!linea.includes('"assistant"')) continue;
    try {
      const registro = JSON.parse(linea);
      if (registro.type !== 'assistant') continue;
      const id = registro.message?.id ?? registro.uuid;
      if (id === estado.ultimoId) continue;
      estado.ultimoId = id;
      estado.turnos += 1;
    } catch {
      // Una línea dañada no invalida el resto.
    }
  }
  estado.offset += fin + 1;
};

try {
  const entrada = await leer();
  const tipo = entrada.agent_type;
  const archivo = transcripcionDe(entrada);
  const maximo = tipo ? maxTurnosDe(tipo) : null;
  if (maximo && archivo && fs.existsSync(archivo)) {
    fs.mkdirSync(DIR_ESTADO, { recursive: true });
    const rutaEstado = path.join(DIR_ESTADO, `${entrada.agent_id ?? path.basename(archivo, '.jsonl')}.json`);
    let estado = { offset: 0, turnos: 0, ultimoId: null, avisado: false };
    try {
      estado = JSON.parse(fs.readFileSync(rutaEstado, 'utf8'));
    } catch {
      // Primera medición de este agente.
    }
    if (!estado.avisado) {
      contarTurnos(archivo, estado);
      if (estado.turnos >= umbralDe(maximo)) {
        estado.avisado = true;
        process.stdout.write(
          JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'PostToolUse',
              additionalContext: `Aviso de turnos: llevas ${estado.turnos} de ${maximo}. Deja de explorar y entrega ya tu reporte final con lo hecho, lo probado y lo que falta. Guarda el avance antes.`,
            },
          }),
        );
      }
      fs.writeFileSync(rutaEstado, JSON.stringify(estado));
    }
  }
} catch {
  // Un fallo del aviso nunca debe frenar al agente.
}
process.exitCode = 0;
