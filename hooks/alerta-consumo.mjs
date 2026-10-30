// Avisa una sola vez por umbral cuando un chat o un agente gasta o acumula demasiado contexto.
import fs from 'node:fs';
import path from 'node:path';

const MILLON = 1_000_000;
const MIL = 1000;
const PESO_LECTURA = 0.1;
const PESO_ESCRITURA = 2;
const PESO_RESPUESTA = 5;
const UMBRALES = {
  chat: [
    { gasto: 2 * MILLON, contexto: 200 * MIL },
    { gasto: 7 * MILLON, contexto: 350 * MIL },
  ],
  agente: [
    { gasto: 1.5 * MILLON, contexto: 150 * MIL },
    { gasto: 3 * MILLON, contexto: 250 * MIL },
  ],
};
const NOMBRES_AGENTE = {
  director: 'El director',
  ejecutor: 'Un programador',
  qa: 'Pruebas',
  cuestionador: 'Busca fallas',
  'revisor-ux': 'Revisión de diseño',
  Explore: 'Exploración',
};

const pesar = (uso) =>
  (uso.input_tokens ?? 0) +
  PESO_LECTURA * (uso.cache_read_input_tokens ?? 0) +
  PESO_ESCRITURA * (uso.cache_creation_input_tokens ?? 0) +
  PESO_RESPUESTA * (uso.output_tokens ?? 0);

const contextoDe = (uso) =>
  (uso.input_tokens ?? 0) + (uso.cache_read_input_tokens ?? 0) + (uso.cache_creation_input_tokens ?? 0);

// Lee solo lo nuevo: una transcripción puede pesar cientos de MB y esto corre en cada turno.
const actualizar = (archivo, medidas) => {
  const medida = medidas[archivo] ?? { offset: 0, gasto: 0, contexto: 0, ultimoId: null, ultimoPeso: 0 };
  medidas[archivo] = medida;
  const tamano = fs.statSync(archivo).size;
  if (tamano <= medida.offset) return medida;
  const fd = fs.openSync(archivo, 'r');
  const bloque = Buffer.alloc(tamano - medida.offset);
  fs.readSync(fd, bloque, 0, bloque.length, medida.offset);
  fs.closeSync(fd);
  const fin = bloque.lastIndexOf(10);
  if (fin < 0) return medida;
  for (const linea of bloque.subarray(0, fin).toString('utf8').split('\n')) {
    if (!linea.includes('"usage"')) continue;
    try {
      const { message: mensaje, uuid } = JSON.parse(linea);
      if (!mensaje?.usage || mensaje.model === '<synthetic>') continue;
      const id = mensaje.id ?? uuid;
      const peso = pesar(mensaje.usage);
      // Un mensaje se escribe en varias líneas seguidas con el mismo id.
      if (id === medida.ultimoId) medida.gasto -= medida.ultimoPeso;
      medida.gasto += peso;
      medida.ultimoId = id;
      medida.ultimoPeso = peso;
      medida.contexto = contextoDe(mensaje.usage);
    } catch {
      // Una línea dañada no invalida el resto.
    }
  }
  medida.offset += fin + 1;
  return medida;
};

const agentesDe = (transcripcion) => {
  const carpeta = transcripcion.replace(/\.jsonl$/, '');
  if (!fs.existsSync(carpeta)) return [];
  return fs
    .readdirSync(carpeta, { recursive: true })
    .map(String)
    .filter((nombre) => nombre.endsWith('.jsonl'))
    .map((nombre) => path.join(carpeta, nombre));
};

const nivelDe = (tipo, gasto, contexto) => {
  const [amarillo, rojo] = UMBRALES[tipo];
  if (gasto >= rojo.gasto || contexto >= rojo.contexto) return 2;
  return gasto >= amarillo.gasto || contexto >= amarillo.contexto ? 1 : 0;
};

const millones = (n) => `${(n / MILLON).toFixed(1)} M`;
const miles = (n) => `${Math.round(n / MIL)} mil`;

const avisoChat = (nivel, gasto, contexto) => {
  const datos = `${millones(gasto)} y ${miles(contexto)} de contexto`;
  return nivel === 2
    ? `🔴 Este chat ya va en ${datos}. Actualiza el HANDOFF y abre uno nuevo.`
    : `🟡 Este chat ya va en ${datos}. Ve pensando en pasar a uno nuevo.`;
};

const avisoAgente = (nivel, tipo, gasto, contexto) => {
  const quien = NOMBRES_AGENTE[tipo] ?? `El agente ${tipo ?? ''}`.trim();
  const datos = `${millones(gasto)} y ${miles(contexto)} de contexto`;
  return nivel === 2
    ? `🔴 ${quien} llegó a ${datos}. Divide lo que falta en una etapa nueva.`
    : `🟡 ${quien} llegó a ${datos}. Conviene que las próximas etapas sean más pequeñas.`;
};

export const alertaDe = (entrada, dirEstado) => {
  const { session_id: sesion, hook_event_name: evento } = entrada;
  const principal = entrada.transcript_path;
  if (!sesion || !principal || !fs.existsSync(principal)) return null;
  fs.mkdirSync(dirEstado, { recursive: true });
  const rutaEstado = path.join(dirEstado, `${sesion}.json`);
  let estado = { medidas: {}, niveles: {} };
  try {
    estado = JSON.parse(fs.readFileSync(rutaEstado, 'utf8'));
  } catch {
    // Primera vez en esta sesión.
  }

  let aviso = null;
  if (evento === 'SubagentStop') {
    const archivo = entrada.agent_transcript_path;
    if (archivo && fs.existsSync(archivo)) {
      const { gasto, contexto } = actualizar(archivo, estado.medidas);
      const clave = entrada.agent_id ?? archivo;
      const nivel = nivelDe('agente', gasto, contexto);
      if (nivel > (estado.niveles[clave] ?? 0)) {
        aviso = avisoAgente(nivel, entrada.agent_type, gasto, contexto);
        estado.niveles[clave] = nivel;
      }
    }
  } else {
    const { contexto } = actualizar(principal, estado.medidas);
    for (const archivo of agentesDe(principal)) actualizar(archivo, estado.medidas);
    const gasto = Object.values(estado.medidas).reduce((suma, medida) => suma + medida.gasto, 0);
    const nivel = nivelDe('chat', gasto, contexto);
    if (nivel > (estado.niveles.chat ?? 0)) {
      aviso = avisoChat(nivel, gasto, contexto);
      estado.niveles.chat = nivel;
    }
  }
  fs.writeFileSync(rutaEstado, JSON.stringify(estado));
  return aviso;
};
