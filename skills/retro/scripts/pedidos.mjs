// Junta lo que el usuario pidió en las sesiones recientes, para buscar trabajo repetido.
// Uso: node pedidos.mjs [--dias 14]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIAS_POR_DEFECTO = 14;
const MAX_CARACTERES = 220;
const MAX_PEDIDOS = 400;
const MS_POR_DIA = 86_400_000;
const PROYECTOS = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');

const indice = process.argv.indexOf('--dias');
const dias = Number(indice >= 0 ? process.argv[indice + 1] : undefined) || DIAS_POR_DEFECTO;
const desde = Date.now() - dias * MS_POR_DIA;

const textoDe = (contenido) => {
  if (typeof contenido === 'string') return contenido;
  if (!Array.isArray(contenido)) return '';
  return contenido
    .filter((bloque) => bloque.type === 'text')
    .map((bloque) => bloque.text)
    .join(' ');
};

const limpiar = (texto) =>
  texto
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<pasted_content[\s\S]*?<\/pasted_content[^>]*>/g, '[pegado]')
    .replace(/\s+/g, ' ')
    .trim();

const pedidos = [];
const vistos = new Set();
for (const carpeta of fs.existsSync(PROYECTOS) ? fs.readdirSync(PROYECTOS) : []) {
  const dir = path.join(PROYECTOS, carpeta);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const archivo of fs.readdirSync(dir).filter((nombre) => nombre.endsWith('.jsonl'))) {
    const ruta = path.join(dir, archivo);
    if (fs.statSync(ruta).mtimeMs < desde) continue;
    for (const linea of fs.readFileSync(ruta, 'utf8').split('\n')) {
      if (!linea.includes('"type":"user"') || !linea.includes('"human"')) continue;
      let registro;
      try {
        registro = JSON.parse(linea);
      } catch {
        continue;
      }
      if (registro.origin?.kind !== 'human' || Date.parse(registro.timestamp) < desde) continue;
      const texto = limpiar(textoDe(registro.message?.content));
      if (!texto || vistos.has(texto)) continue;
      vistos.add(texto);
      pedidos.push({
        fecha: registro.timestamp.slice(0, 10),
        proyecto: path.basename(registro.cwd ?? carpeta),
        texto: texto.slice(0, MAX_CARACTERES),
      });
    }
  }
}

pedidos.sort((a, b) => a.fecha.localeCompare(b.fecha));
const recorte = pedidos.slice(-MAX_PEDIDOS);
process.stdout.write(`# ${recorte.length} pedidos de los últimos ${dias} días\n\n`);
for (const pedido of recorte) {
  process.stdout.write(`- ${pedido.fecha} [${pedido.proyecto}] ${pedido.texto}\n`);
}
