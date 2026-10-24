// Reporte de tiempos a partir de registro/*.jsonl que escribe hooks/cerebro.mjs.
// Uso: node reporte.mjs [--dias 7] [--proyecto <nombre>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOTOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REGISTRO = path.join(MOTOR, 'registro');
const DIAS_POR_DEFECTO = 7;
const ULTIMAS_TAREAS = 15;
const ZONA = 'America/Costa_Rica';
const MS_POR_DIA = 86_400_000;

const argumentos = process.argv.slice(2);
const valorDe = (bandera) => {
  const indice = argumentos.indexOf(bandera);
  return indice >= 0 ? argumentos[indice + 1] : undefined;
};
const dias = Number(valorDe('--dias')) || DIAS_POR_DEFECTO;
const filtroProyecto = valorDe('--proyecto')?.toLowerCase();
const desde = Date.now() - dias * MS_POR_DIA;

const eventos = fs.existsSync(REGISTRO)
  ? fs
      .readdirSync(REGISTRO)
      .filter((nombre) => nombre.endsWith('.jsonl'))
      .flatMap((nombre) => fs.readFileSync(path.join(REGISTRO, nombre), 'utf8').split('\n'))
      .filter(Boolean)
      .map((linea) => {
        try {
          return JSON.parse(linea);
        } catch {
          return null;
        }
      })
      .filter((evento) => evento && Date.parse(evento.ts) >= desde)
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
  : [];

const dia = (ts) => new Date(ts).toLocaleDateString('es-CR', { timeZone: ZONA });
const hora = (ts) =>
  new Date(ts).toLocaleTimeString('es-CR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
const duracion = (ms) => {
  const minutos = Math.round(ms / 60_000);
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
};

// Turno = desde que el usuario manda un mensaje hasta que Claude termina de responder.
// El pedido de cada agente es el último mensaje del usuario antes de que arrancara.
const turnos = [];
const agentes = [];
const turnosAbiertos = new Map();
const agentesAbiertos = new Map();
const ultimoPrompt = new Map();
const cerrar = (abiertos, clave, fin, destino) => {
  const inicio = abiertos.get(clave);
  destino.push({
    ...inicio,
    proyecto: fin.proyectoResumen ?? inicio.proyecto,
    ms: Date.parse(fin.ts) - Date.parse(inicio.ts),
  });
  abiertos.delete(clave);
};
for (const evento of eventos) {
  if (evento.ev === 'UserPromptSubmit') {
    turnosAbiertos.set(evento.sid, evento);
    ultimoPrompt.set(evento.sid, evento.prompt);
  } else if (evento.ev === 'Stop' && turnosAbiertos.has(evento.sid)) {
    cerrar(turnosAbiertos, evento.sid, evento, turnos);
  } else if (evento.ev === 'SubagentStart') {
    agentesAbiertos.set(evento.agentId, { ...evento, prompt: ultimoPrompt.get(evento.sid) });
  } else if (evento.ev === 'SubagentStop' && agentesAbiertos.has(evento.agentId)) {
    cerrar(agentesAbiertos, evento.agentId, evento, agentes);
  }
}

const delProyecto = (item) => !filtroProyecto || item.proyecto?.toLowerCase() === filtroProyecto;
turnos.splice(0, turnos.length, ...turnos.filter(delProyecto));
agentes.splice(0, agentes.length, ...agentes.filter(delProyecto));

const agrupar = (lista, clave) =>
  lista.reduce((mapa, item) => {
    const llave = clave(item);
    const actual = mapa.get(llave) ?? { cantidad: 0, ms: 0 };
    mapa.set(llave, { cantidad: actual.cantidad + 1, ms: actual.ms + item.ms });
    return mapa;
  }, new Map());

const salida = [`# Tiempos — últimos ${dias} días${filtroProyecto ? `, ${filtroProyecto}` : ''}`, ''];

if (!turnos.length && !agentes.length) {
  salida.push('Sin registros todavía en este período.');
} else {
  salida.push('## Por día y proyecto (tiempo de Claude trabajando)', '');
  salida.push('| Día | Proyecto | Mensajes | Tiempo |', '|---|---|---|---|');
  for (const [llave, total] of agrupar(turnos, (t) => `${dia(t.ts)}|${t.proyecto}`)) {
    const [fecha, proyecto] = llave.split('|');
    salida.push(`| ${fecha} | ${proyecto} | ${total.cantidad} | ${duracion(total.ms)} |`);
  }

  salida.push('', '## Por agente', '', '| Agente | Veces | Total | Promedio |', '|---|---|---|---|');
  for (const [agente, total] of agrupar(agentes, (a) => a.agente ?? '?')) {
    salida.push(
      `| ${agente} | ${total.cantidad} | ${duracion(total.ms)} | ${duracion(total.ms / total.cantidad)} |`,
    );
  }

  const tareas = agentes.filter((a) => a.agente === 'director').slice(-ULTIMAS_TAREAS).reverse();
  if (tareas.length) {
    salida.push('', '## Últimas tareas del director', '', '| Inicio | Proyecto | Duración | Pedido |');
    salida.push('|---|---|---|---|');
    for (const tarea of tareas) {
      const pedido = (tarea.prompt ?? '').replace(/\|/g, '/');
      salida.push(`| ${dia(tarea.ts)} ${hora(tarea.ts)} | ${tarea.proyecto} | ${duracion(tarea.ms)} | ${pedido} |`);
    }
  }
}

process.stdout.write(`${salida.join('\n')}\n`);
