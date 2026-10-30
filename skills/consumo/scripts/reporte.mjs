// Calcula el uso por sesión y por agente a partir de las transcripciones de Claude Code.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MILLON = 1_000_000;
const LIMITE_AGENTE = 1.5 * MILLON;
const LIMITE_CONTEXTO = 150_000;
const META_ETAPA = 2 * MILLON;
const TOPE_ETAPA = 7 * MILLON;
const MAXIMO_VENTANA = 15 * MILLON;
const VENTANA_MS = 5 * 60 * 60 * 1000;
const PESO_LECTURA = 0.1;
const PESO_ESCRITURA = 2;
const PESO_RESPUESTA = 5;
const ANCHO_BARRA = 30;
const CONVERSACION = 'conversacion';

const GRUPOS = {
  director: { nombre: 'Director', consejo: 'pedirlo solo en cambios grandes y ambiguos.' },
  ejecutor: { nombre: 'Programadores', consejo: 'dar encargos con archivos exactos y una etapa por agente.' },
  qa: { nombre: 'Pruebas', consejo: 'probar solo lo que cambió, sin repetir chequeos.' },
  cuestionador: { nombre: 'Busca fallas', consejo: 'usarlo solo cuando el cambio toca un riesgo.' },
  'revisor-ux': { nombre: 'Revisión de diseño', consejo: 'revisar solo las pantallas que cambiaron.' },
  Explore: { nombre: 'Exploración', consejo: 'pasar los archivos exactos en el encargo.' },
  [CONVERSACION]: { nombre: 'Esta conversación', consejo: 'abrir una sesión nueva por lote.' },
};

const argumento = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : porDefecto;
};
const todas = process.argv.includes('--todas');
const dias = Number(argumento('dias', 1));
const etapas = Math.max(1, Number(argumento('etapas', 1)));
const titulo = argumento('titulo', '');
const prefijoSesion = argumento('sesion', '');
const proyecto = argumento('proyecto', '').toLowerCase().replace(/[^a-z0-9]/g, '-');
const ahora = Date.now();
const desde = ahora - dias * 24 * 60 * 60 * 1000;
const inicioVentana = ahora - VENTANA_MS;
const raiz = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'projects');

const pesar = (uso) =>
  (uso.input_tokens ?? 0) +
  PESO_LECTURA * (uso.cache_read_input_tokens ?? 0) +
  PESO_ESCRITURA * (uso.cache_creation_input_tokens ?? 0) +
  PESO_RESPUESTA * (uso.output_tokens ?? 0);

const contexto = (uso) =>
  (uso.input_tokens ?? 0) + (uso.cache_read_input_tokens ?? 0) + (uso.cache_creation_input_tokens ?? 0);

const medir = (archivo) => {
  const porMensaje = new Map();
  let cwd = '';
  for (const linea of fs.readFileSync(archivo, 'utf8').split('\n')) {
    if (!cwd && linea.includes('"cwd"')) {
      try {
        cwd = JSON.parse(linea).cwd ?? '';
      } catch {
        // Una línea cortada no invalida el resto.
      }
    }
    if (!linea.includes('"usage"')) continue;
    try {
      const { message: mensaje, uuid, timestamp } = JSON.parse(linea);
      if (mensaje?.usage && mensaje.model !== '<synthetic>') {
        porMensaje.set(mensaje.id ?? uuid, { uso: mensaje.usage, cuando: Date.parse(timestamp) });
      }
    } catch {
      // Una línea cortada por una escritura en curso no invalida el resto.
    }
  }
  const mensajes = [...porMensaje.values()];
  return {
    cwd,
    consultas: mensajes.length,
    pico: Math.max(0, ...mensajes.map(({ uso }) => contexto(uso))),
    unidades: mensajes.reduce((total, { uso }) => total + pesar(uso), 0),
    enVentana: mensajes
      .filter(({ cuando }) => cuando >= inicioVentana)
      .reduce((total, { uso }) => total + pesar(uso), 0),
  };
};

const leerMeta = (archivo) => {
  try {
    return JSON.parse(fs.readFileSync(archivo.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
  } catch {
    return {};
  }
};

const agentesDe = (carpeta) => {
  if (!fs.existsSync(carpeta)) return [];
  return fs
    .readdirSync(carpeta, { recursive: true })
    .map(String)
    .filter((nombre) => nombre.endsWith('.jsonl'))
    .map((nombre) => path.join(carpeta, nombre));
};

const millones = (n) => `${(n / MILLON).toFixed(2)} M`;

const veredicto = (gastoPorEtapa) => {
  if (gastoPorEtapa < META_ETAPA) return 'BIEN';
  return gastoPorEtapa <= TOPE_ETAPA ? 'CARO' : 'MAL';
};

const nombreGrupo = (clave) => GRUPOS[clave]?.nombre ?? clave;

const leerSesiones = () => {
  const sesiones = [];
  for (const carpeta of fs.existsSync(raiz) ? fs.readdirSync(raiz) : []) {
    if (proyecto && !carpeta.toLowerCase().includes(proyecto)) continue;
    const dirProyecto = path.join(raiz, carpeta);
    if (!fs.statSync(dirProyecto).isDirectory()) continue;
    for (const nombre of fs.readdirSync(dirProyecto).filter((n) => n.endsWith('.jsonl'))) {
      const archivo = path.join(dirProyecto, nombre);
      const agentes = agentesDe(archivo.replace(/\.jsonl$/, ''));
      const ultimo = Math.max(...[archivo, ...agentes].map((a) => fs.statSync(a).mtimeMs));
      if (ultimo < Math.min(desde, inicioVentana)) continue;
      const principal = medir(archivo);
      const filas = agentes
        .map((a) => ({ ...medir(a), ...leerMeta(a) }))
        .filter((f) => f.consultas)
        .map((f) => ({ ...f, clave: f.agentType ?? 'agente' }));
      filas.push({ ...principal, clave: CONVERSACION });
      const total = filas.reduce((suma, f) => suma + f.unidades, 0);
      if (!total) continue;
      sesiones.push({
        id: nombre.slice(0, 8),
        carpeta,
        ultimo,
        total,
        enVentana: filas.reduce((suma, f) => suma + f.enVentana, 0),
        filas,
        nombre: path.basename(principal.cwd || carpeta),
      });
    }
  }
  return sesiones;
};

const agrupar = (filas) => {
  const grupos = new Map();
  for (const fila of filas) {
    const grupo = grupos.get(fila.clave) ?? { clave: fila.clave, unidades: 0, cantidad: 0 };
    grupo.unidades += fila.unidades;
    grupo.cantidad += fila.clave === CONVERSACION ? 0 : 1;
    grupos.set(fila.clave, grupo);
  }
  return [...grupos.values()].sort((a, b) => b.unidades - a.unidades);
};

const grafica = (grupos, total) => {
  const mayor = grupos[0]?.unidades ?? 1;
  const etiquetas = grupos.map((g) => `${nombreGrupo(g.clave)}${g.cantidad ? ` (${g.cantidad})` : ''}`);
  const ancho = Math.max(...etiquetas.map((e) => e.length));
  return grupos.map((g, i) => {
    const barra = '█'.repeat(Math.max(1, Math.round((g.unidades / mayor) * ANCHO_BARRA)));
    const parte = `${Math.round((g.unidades / total) * 100)}%`;
    return `${etiquetas[i].padEnd(ancho)}  ${barra.padEnd(ANCHO_BARRA)}  ${parte.padStart(4)}`;
  });
};

const vigilar = (filas) =>
  filas
    .filter((f) => f.clave !== CONVERSACION)
    .filter((f) => f.unidades > LIMITE_AGENTE || f.pico > LIMITE_CONTEXTO)
    .sort((a, b) => b.unidades - a.unidades)
    .slice(0, 3)
    .map((f) => {
      const motivo = f.unidades > LIMITE_AGENTE ? `gastó ${millones(f.unidades)}` : `llenó mucho su memoria`;
      return `${nombreGrupo(f.clave)}${f.description ? ` «${f.description}»` : ''}: ${motivo}`;
    });

const lineaVentana = (sesiones) => {
  const gastado = sesiones.reduce((suma, s) => suma + s.enVentana, 0);
  const parte = Math.round((gastado / MAXIMO_VENTANA) * 100);
  const activas = sesiones.filter((s) => s.enVentana > 0).length;
  return `Últimas 5 horas, ${activas} ${activas === 1 ? 'sesión' : 'sesiones'}: ${millones(gastado)} de unos ${millones(MAXIMO_VENTANA)} (${parte}%)`;
};

const reporteSesion = (sesion, sesiones) => {
  const grupos = agrupar(sesion.filas);
  const porEtapa = sesion.total / etapas;
  const resultado = veredicto(porEtapa);
  const notaEtapas = etapas > 1 ? ` en ${etapas} etapas, ${millones(porEtapa)} por etapa` : '';
  console.log(`${titulo || sesion.nombre} · sesión ${sesion.id}`);
  console.log(`Gasto: ${millones(sesion.total)}${notaEtapas} — ${resultado} (meta: ${millones(META_ETAPA)} por etapa)`);
  console.log(lineaVentana(sesiones));
  console.log(`Lo que más gastó: ${nombreGrupo(grupos[0].clave)}, ${millones(grupos[0].unidades)}`);
  const alertas = vigilar(sesion.filas);
  console.log(`Para vigilar: ${alertas.length ? alertas.join(' · ') : 'nada'}`);
  if (resultado !== 'BIEN') {
    console.log(`Qué hacer: ${GRUPOS[grupos[0].clave]?.consejo ?? 'revisar ese agente.'}`);
  }
  console.log('');
  for (const linea of grafica(grupos, sesion.total)) console.log(linea);
};

const reporteTodas = (sesiones) => {
  const delPeriodo = sesiones.filter((s) => s.ultimo >= desde).sort((a, b) => b.total - a.total);
  const total = delPeriodo.reduce((suma, s) => suma + s.total, 0);
  console.log(`Todas las sesiones · últimos ${dias} ${dias === 1 ? 'día' : 'días'}`);
  console.log(`Gasto: ${millones(total)} en ${delPeriodo.length} ${delPeriodo.length === 1 ? 'sesión' : 'sesiones'}`);
  console.log(lineaVentana(sesiones));
  console.log('');
  for (const s of delPeriodo) {
    console.log(`${s.nombre} · ${s.id} · ${millones(s.total)} — ${veredicto(s.total)}`);
  }
  console.log('');
  for (const linea of grafica(agrupar(delPeriodo.flatMap((s) => s.filas)), total)) console.log(linea);
};

const sesiones = leerSesiones();
const carpetaActual = process.cwd().replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
const recientes = [...sesiones].sort((a, b) => b.ultimo - a.ultimo);
const elegida = prefijoSesion
  ? recientes.find((s) => s.id.startsWith(prefijoSesion))
  : (recientes.find((s) => s.carpeta.toLowerCase() === carpetaActual) ?? recientes[0]);

if (!sesiones.length) {
  console.log('Sin sesiones en ese período. Si debería haberlas, el formato pudo cambiar: usar /usage.');
} else if (todas) {
  reporteTodas(sesiones);
} else if (!elegida) {
  console.log(`No hay ninguna sesión que empiece por ${prefijoSesion} en ese período.`);
} else {
  reporteSesion(elegida, sesiones);
}
