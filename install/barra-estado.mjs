// Barra de estado opcional: contexto y límites reales de la cuenta. No se instala sola; ver README.
let texto = '';
for await (const trozo of process.stdin) texto += trozo;
const datos = JSON.parse(texto || '{}');
const entero = (valor) => (typeof valor === 'number' ? `${Math.round(valor)}%` : '—');
const partes = [
  `Contexto ${entero(datos.context_window?.used_percentage)}`,
  `5 h ${entero(datos.rate_limits?.five_hour?.used_percentage)}`,
  `Semana ${entero(datos.rate_limits?.seven_day?.used_percentage)}`,
];
process.stdout.write(partes.join(' · '));
