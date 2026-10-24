// PreToolUse para agentes que no editan código (qa, cuestionador):
// pueden escribir solo en su memoria, y con --solo-lectura tampoco corren comandos que cambian el repo.
import os from 'node:os';

const COMANDOS_QUE_ESCRIBEN =
  /\bgit\s+(-C\s+\S+\s+)?(checkout|switch|stash|reset|clean|commit|add|pull|merge|rebase|push|rm|mv|restore|cherry-pick|revert|tag|branch\s+-[dDmM])\b|\b(rm|mv|del|Remove-Item|Move-Item|Set-Content|Out-File)\b|(^|[^>])>[^>&]|\b(db:migrate|db:seed|db:push|migrate deploy|deploy)\b/i;

const NOMBRES_LOCALES = new Set([
  'localhost', '127.0.0.1', '(local)', '.', '::1', '[::1]', '%computername%', '$env:computername',
  os.hostname().toLowerCase(),
]);

// Lista los servidores SQL que nombra un comando (sqlcmd/bcp -S, -ServerInstance, Server=/Data Source=).
const servidoresDelComando = (comando) => {
  const encontrados = [];
  const recoger = (patron) => {
    for (const coincidencia of comando.matchAll(patron)) encontrados.push(coincidencia[1]);
  };
  if (/\b(sqlcmd|bcp)(\.exe)?\b/i.test(comando)) recoger(/\s-S\s*["']?([^\s"']+)/g);
  recoger(/-ServerInstance\s+["']?([^\s"']+)/gi);
  recoger(/\b(?:Server|Data Source|Address|Addr|Network Address)\s*=\s*["']?([^;"'\s]+)/gi);
  return encontrados;
};

const esServidorLocal = (servidor) => {
  let nombre = servidor.trim().toLowerCase().replace(/^tcp:/, '').replace(/,\d+$/, '');
  if ((nombre.match(/:/g) ?? []).length === 1) nombre = nombre.replace(/:\d+$/, '');
  const maquina = nombre.split('\\')[0];
  return NOMBRES_LOCALES.has(maquina);
};

const leer = async () => {
  let texto = '';
  for await (const trozo of process.stdin) texto += trozo;
  return JSON.parse(texto || '{}');
};

const negar = (motivo) =>
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: motivo,
      },
    }),
  );

try {
  const entrada = await leer();
  const soloLectura = process.argv.includes('--solo-lectura');
  const soloDocker = process.argv.includes('--solo-docker');
  const herramienta = entrada.tool_name ?? '';
  const datos = entrada.tool_input ?? {};
  if (/^(Edit|Write|NotebookEdit|MultiEdit)$/.test(herramienta)) {
    const ruta = String(datos.file_path ?? datos.notebook_path ?? '').replace(/\\/g, '/');
    if (!ruta.includes('/agent-memory/')) {
      negar('Este agente no edita código: reporta el hallazgo y lo corrige el ejecutor. Solo puede escribir en su memoria.');
    }
  } else if (soloLectura && /^(Bash|PowerShell)$/.test(herramienta)) {
    if (COMANDOS_QUE_ESCRIBEN.test(String(datos.command ?? ''))) {
      negar('El cuestionador solo lee: este comando cambiaría el repo, la base o un despliegue.');
    }
  } else if (soloDocker && /^(Bash|PowerShell)$/.test(herramienta)) {
    const ajenos = servidoresDelComando(String(datos.command ?? '')).filter((servidor) => !esServidorLocal(servidor));
    if (ajenos.length) {
      negar(`Este agente solo puede conectarse al SQL Server local (localhost,1433); el comando apunta a: ${[...new Set(ajenos)].join(', ')}. Usa el verificador de bases para consultar servidores compartidos.`);
    }
  }
} catch {
  // Si el hook falla, decide el sistema de permisos normal.
}
process.exitCode = 0;
