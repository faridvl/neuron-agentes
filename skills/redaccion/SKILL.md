---
name: redaccion
description: Revisa y corrige los textos visibles de una app (es.json, textos de pantallas, correos, mensajes de error, landings) para que suenen naturales, claros y de Costa Rica, no a texto generado por IA. Usar al crear o cambiar textos de UI, antes de cerrar una pantalla, o cuando el usuario pida revisar la redacción.
---

# Redacción de textos de app

## Qué revisar

- Donde el proyecto guarda sus textos (`es.json`, JSON de contenido, recursos, base de datos) y el
  `git diff` de esos archivos. Si el proyecto tiene una regla de migrar strings sueltos (ver sus
  estándares), aplicarla antes de revisar.

## Reglas

1. **Español de Costa Rica, con el trato que ya usa el proyecto** (mirar `es.json` antes de
   escribir). En proyectos nuevos, el que diga el cerebro o el usuario. Nunca mezclar tratos ni usar voseo.
2. **Corto y concreto.** Botones con verbo: "Guardar", "Agregar servicio". Títulos de 2 a 4
   palabras. Una idea por mensaje.
   - Texto de ayuda bajo un título: una sola línea, 12 palabras como máximo. Si el título y el
     botón ya lo explican, no va texto.
   - Nunca dos párrafos en una tarjeta. Lo que explica una regla del negocio va en el lugar donde
     se usa (al elegir, al guardar), no repetido en cada pantalla.
   - Vacío: una frase de 8 palabras como máximo, más el botón que lo resuelve.
   - Mídelo en el ancho real del dispositivo principal: si en la tableta ocupa más de 2 líneas,
     está largo.
3. **Errores que ayudan:** qué pasó y qué hacer. "No se pudo guardar. Revisa tu conexión e intenta
   de nuevo", no "Ha ocurrido un error inesperado".
4. **Vacíos con salida:** "Aún no hay servicios" + acción, no "No hay datos disponibles".
5. Tildes y ñ siempre. Mayúscula solo al inicio (no "Guardar Cambios"). Montos `₡3.800`.
   Fechas en formato local.
6. Consistencia: un concepto, una palabra en toda la app (no "cliente" en una pantalla y "usuario"
   en otra para lo mismo). Buscar en `es.json` antes de inventar.

## Señales de texto "de IA" (eliminar)

- Entusiasmo vacío: "¡Bienvenido a tu nueva experiencia!", "Descubre", "Potencia", "Lleva tu
  negocio al siguiente nivel", "de manera fácil y rápida", "sin complicaciones".
- Tríadas de adjetivos ("rápido, seguro y confiable") y frases que no dicen nada.
- Guiones largos (—) para unir ideas, dos puntos dramáticos, emojis en la UI.
- Traducciones literales del inglés: "Aplicar cambios", "Remover", "Ingresar" donde va "Entrar",
  "Exitosamente".
- Explicar lo obvio ("Haga clic en el botón Guardar para guardar").

## Resultado

Tabla corta: clave · texto actual · propuesto · motivo (una palabra: tono, largo, IA, error,
consistencia). Si el encargo es corregir, aplicar los cambios directamente en `es.json` y dejar
la tabla como resumen. No tocar claves, solo valores.
