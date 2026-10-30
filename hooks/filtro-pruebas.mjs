// Acorta la salida de comandos de pruebas simples. Con pipes o redirecciones alguien necesita la salida completa.
const PATRON_PRUEBAS = /^(npm (run )?test|yarn test|pnpm (run )?test|pytest|go test|dotnet test)(\s[^;&|<>`$\\\n]*)?$/;
const LINEAS_RELEVANTES = 'fail|error|pass|skip|tests?:|test suites:|summary|total';
const MAXIMO_LINEAS = 120;

export const comandoFiltrado = (comando) => {
  if (typeof comando !== 'string' || !PATRON_PRUEBAS.test(comando.trim())) return null;
  // pipefail conserva el código de salida de las pruebas; sin él, una falla parecería un éxito.
  return (
    `set -o pipefail; echo '[salida filtrada: solo fallas y resumen]'; ${comando.trim()} 2>&1 | ` +
    `{ grep -iE '${LINEAS_RELEVANTES}' || true; } | tail -n ${MAXIMO_LINEAS}`
  );
};
