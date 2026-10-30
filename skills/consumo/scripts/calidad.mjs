// Señales de calidad y velocidad: indican si el ahorro está costando trabajo mal hecho. Se leen como tendencia.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIA_MS = 24 * 60 * 60 * 1000;
const PAUSA_MS = 10 * 60 * 1000;
const AGENTE_EN_CURSO_MS = 10 * 60 * 1000;
const PATRON_LIMITE_USO = /You've hit your session limit/i;
const PATRON_INTERRUMPIDO = /\[Request interrupted by user/i;
const TIPOS_REVISION =['qa', 'revisor-ux', 'cuestionador'];
const PATRON_CORRECCION = /^\s*correcci[oó]n:/i;
const PATRON_MEJORA = /^\s*mejora:/i;
const TIPOS_TIEMPO = ['ejecutor', 'qa', 'revisor-ux', 'cuestionador', 'director'];

const argumento = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : porDefecto;
};
const dias = Number(argumento('dias', 7));
const desde = Date.parse(argumento('desde', '')) || Date.now() - dias * DIA_MS;
const hasta = Date.parse(argumento('hasta', '')) || Date.now();
const raiz = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'projects');

const textoDe = (contenido) =>
  typeof contenido === 'string'
    ? contenido
    : Array.isArray(contenido)
      ? contenido.map((bloque) => (typeof bloque?.text === 'string' ? bloque.text : '')).join('\n')
      : '';

const causaDe = (texto) => {
  if (PATRON_LIMITE_USO.test(texto)) return 'limite';
  if (PATRON_INTERRUMPIDO.test(texto)) return 'interrumpido';
  return 'otros';
};

const leer = (archivo) => {
  const datos = { inicio: 0, fin: 0, activo: 0, relecturas: 0, herramientas: 0, entrego: false, avisado: false, cwd: '', ultimoTexto: '' };
  const leidos = new Set();
  let compactado = false;
  let anterior = 0;
  for (const linea of fs.readFileSync(archivo, 'utf8').split('\n')) {
    if (!linea) continue;
    if (linea.includes('SubagentHandback')) datos.avisado = true;
    let j;
    try {
      j = JSON.parse(linea);
    } catch {
      continue;
    }
    datos.cwd ||= j.cwd ?? '';
    if (j.type === 'assistant' || j.type === 'user') datos.ultimoTexto = textoDe(j.message?.content);
    if (j.isCompactSummary || j.subtype === 'compact_boundary') compactado = true;
    const cuando = Date.parse(j.timestamp);
    if (cuando && j.message?.usage) {
      datos.inicio ||= cuando;
      datos.fin = cuando;
      if (anterior && cuando - anterior <= PAUSA_MS) datos.activo += cuando - anterior;
      anterior = cuando;
    }
    if (!Array.isArray(j.message?.content)) continue;
    for (const bloque of j.message.content) {
      if (bloque.type !== 'tool_use') continue;
      datos.herramientas++;
      if (bloque.name === 'SubagentHandback') datos.entrego = true;
      const ruta = bloque.name === 'Read' ? bloque.input?.file_path : null;
      if (!ruta) continue;
      if (compactado && leidos.has(ruta)) datos.relecturas++;
      leidos.add(ruta);
    }
  }
  return datos;
};

const metaDe = (archivo) => {
  try {
    const meta = JSON.parse(fs.readFileSync(archivo.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
    return { tipo: meta.agentType ?? 'agente', encargo: meta.description ?? '' };
  } catch {
    return { tipo: 'agente', encargo: '' };
  }
};

const mediana = (lista) => {
  const orden = [...lista].sort((a, b) => a - b);
  return orden.length ? orden[orden.length >> 1] : 0;
};

const rutasDeTrabajo = new Set();
const tiempos = {};
let sesiones = 0;
let rondas = 0;
let sesionesConRevision = 0;
let relecturas = 0;
let agentes = 0;
let cortados = 0;
const encargosPorMotivo = { correcciones: 0, mejoras: 0 };
const causas = { limite: 0, interrumpido: 0, otros: 0 };

for (const carpeta of fs.existsSync(raiz) ? fs.readdirSync(raiz) : []) {
  const dir = path.join(raiz, carpeta);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const nombre of fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl'))) {
    const archivo = path.join(dir, nombre);
    const principal = leer(archivo);
    const carpetaAgentes = archivo.replace(/\.jsonl$/, '');
    const lista = fs.existsSync(carpetaAgentes)
      ? fs.readdirSync(carpetaAgentes, { recursive: true }).map(String).filter((n) => n.endsWith('.jsonl'))
      : [];
    const hijos = lista
      .map((n) => path.join(carpetaAgentes, n))
      .map((ruta) => ({ ...leer(ruta), ...metaDe(ruta), mtime: fs.statSync(ruta).mtimeMs }))
      .filter((a) => a.inicio >= desde && a.inicio <= hasta);
    const enRango = principal.fin >= desde && principal.inicio <= hasta;
    if (!enRango && !hijos.length) continue;
    sesiones++;
    relecturas += principal.relecturas;
    if (principal.cwd) rutasDeTrabajo.add(principal.cwd);
    const revisiones = hijos.filter((a) => TIPOS_REVISION.includes(a.tipo)).map((a) => a.inicio);
    if (revisiones.length) {
      const primera = Math.min(...revisiones);
      sesionesConRevision++;
      rondas += hijos.filter((a) => a.tipo === 'ejecutor' && a.inicio > primera).length;
    }
    for (const a of hijos) {
      agentes++;
      if (PATRON_CORRECCION.test(a.encargo)) encargosPorMotivo.correcciones++;
      else if (PATRON_MEJORA.test(a.encargo)) encargosPorMotivo.mejoras++;
      relecturas += a.relecturas;
      if (a.avisado && a.herramientas && !a.entrego && Date.now() - a.mtime > AGENTE_EN_CURSO_MS) {
        cortados++;
        causas[causaDe(a.ultimoTexto)]++;
      }
      if (TIPOS_TIEMPO.includes(a.tipo)) (tiempos[a.tipo] ??= []).push(a.activo);
    }
  }
}

const correcciones = () => {
  let total = 0;
  for (const ruta of rutasDeTrabajo) {
    if (!fs.existsSync(ruta)) continue;
    try {
      const salida = execFileSync(
        'git',
        ['-C', ruta, 'log', '--all', '--oneline', '-E', '--grep=^fix(\\(|:)', `--since=${new Date(desde).toISOString()}`, `--until=${new Date(hasta).toISOString()}`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
      total += salida.split('\n').filter(Boolean).length;
    } catch {
      // Una carpeta sin git no cuenta.
    }
  }
  return total;
};

const minutos = (ms) => `${Math.round(ms / 60000)} min`;
const fecha = (ms) => new Date(ms).toISOString().slice(0, 10);

console.log(`Calidad y velocidad · ${fecha(desde)} a ${fecha(hasta)} · ${sesiones} sesiones, ${agentes} agentes`);
console.log(`Rondas de corrección por sesión revisada: ${sesionesConRevision ? (rondas / sesionesConRevision).toFixed(1) : 'sin datos'}`);
console.log(`Relecturas tras compactar: ${relecturas}`);
console.log(`Agentes sin entregar resultado: ${cortados} de ${agentes} (límite de uso ${causas.limite} · interrumpidos ${causas.interrumpido} · otros ${causas.otros})`);
if (encargosPorMotivo.correcciones || encargosPorMotivo.mejoras) {
  console.log(`Encargos por motivo: corrección ${encargosPorMotivo.correcciones} · mejora ${encargosPorMotivo.mejoras} (de ${agentes} agentes)`);
}
console.log(`Commits de corrección en esos repos: ${correcciones()}`);
console.log('Tiempo activo mediano por agente:');
for (const tipo of TIPOS_TIEMPO) {
  if (tiempos[tipo]) console.log(`  ${tipo}: ${minutos(mediana(tiempos[tipo]))} (${tiempos[tipo].length})`);
}
