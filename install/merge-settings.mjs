// Aplica settings.base.json sobre el settings.json del usuario sin perder sus otras preferencias.
// Uso: node merge-settings.mjs <settings.json> <ruta del motor> <raíz de proyectos> [cerebros...] [--limpiar]
// --limpiar reemplaza la lista allow por la base (la anterior queda en el respaldo del instalador).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , destino, cerebro, raizProyectos, ...resto] = process.argv;
const limpiar = resto.includes('--limpiar');
const desinstalar = resto.includes('--desinstalar');
const cerebros = resto.filter((valor) => !valor.startsWith('--'));
const cerebroPosix = cerebro.replace(/\\/g, '/');
const leerJson = (ruta) => JSON.parse(fs.readFileSync(ruta, 'utf8').replace(/^﻿/, ''));

const quitarHooksDelCerebro = (ruta) => {
  const guardado = leerJson(ruta);
  for (const [evento, grupos] of Object.entries(guardado.hooks ?? {})) {
    const propios = grupos.filter((grupo) => !esHookDelCerebro(grupo));
    if (propios.length) guardado.hooks[evento] = propios;
    else delete guardado.hooks[evento];
  }
  if (guardado.hooks && !Object.keys(guardado.hooks).length) delete guardado.hooks;
  fs.writeFileSync(ruta, `${JSON.stringify(guardado, null, 2)}
`);
  console.log('settings.json: hooks del motor quitados.');
};

const base = JSON.parse(
  JSON.stringify(leerJson(path.join(path.dirname(fileURLToPath(import.meta.url)), 'settings.base.json')))
    .replaceAll('__CEREBRO__', cerebroPosix),
);
const actual = fs.existsSync(destino) ? leerJson(destino) : {};

const comandoHook = `node "${cerebroPosix}/hooks/cerebro.mjs"`;
const union = (...listas) => [...new Set(listas.flat().filter(Boolean))];
const esHookDelCerebro = (grupo) =>
  grupo.hooks?.some((hook) => hook.command?.includes('cerebro.mjs')) ?? false;

if (desinstalar) {
  quitarHooksDelCerebro(destino);
  process.exit(0);
}

// Lo que pide permiso por Bash también lo pide por PowerShell.
const espejoPowerShell = (reglas) =>
  reglas.filter((regla) => regla.startsWith('Bash(')).map((regla) => regla.replace(/^Bash\(/, 'PowerShell('));

const permisos = actual.permissions ?? {};
permisos.ask = union(limpiar ? [] : permisos.ask, base.permissions.ask, espejoPowerShell(base.permissions.ask));
permisos.allow = limpiar ? base.permissions.allow : union(permisos.allow, base.permissions.allow);
const pide = new Set(permisos.ask);
permisos.allow = permisos.allow.filter(
  (regla) => !pide.has(regla) && !/git( -C \S+)? push|--force/.test(regla),
);
permisos.additionalDirectories = union(
  limpiar ? [] : permisos.additionalDirectories,
  [raizProyectos, cerebro, ...cerebros],
);
actual.permissions = permisos;

const hooks = actual.hooks ?? {};
for (const [evento, grupos] of Object.entries(base.hooks)) {
  const propios = (hooks[evento] ?? []).filter((grupo) => !esHookDelCerebro(grupo));
  const delCerebro = grupos.map((grupo) => ({
    ...grupo,
    hooks: grupo.hooks.map((hook) => ({ ...hook, command: comandoHook })),
  }));
  hooks[evento] = [...propios, ...delCerebro];
}
actual.hooks = hooks;

fs.writeFileSync(destino, `${JSON.stringify(actual, null, 2)}\n`);
console.log(`settings.json actualizado (${permisos.allow.length} allow, ${permisos.ask.length} ask).`);
