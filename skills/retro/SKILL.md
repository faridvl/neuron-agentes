---
name: retro
description: Revisa lo que el usuario pidió en las sesiones recientes y detecta trabajo repetido que convendría convertir en una skill, un agente, un script o una regla. Usar cuando el usuario diga "retro", pregunte qué hace seguido, qué podría automatizar, o en la revisión semanal.
---

# Retro: ¿qué haces seguido que podría ser un agente?

1. Junta los pedidos recientes (por defecto 14 días):
   ```bash
   node "<motor>/skills/retro/scripts/pedidos.mjs" --dias 14
   ```
   Si la salida es muy larga, delegar la lectura a un subagente `Explore` y pedirle los grupos.
2. Agrupa pedidos parecidos aunque estén escritos distinto o sean de proyectos distintos
   ("revisa los textos", "pasa esto a es.json", "deja la pantalla en móvil").
3. Para cada grupo que aparece 3 veces o más, propone **una** forma de resolverlo, la más liviana:
   | Forma | Cuándo |
   |---|---|
   | Regla en una skill de estándares | Es algo que se corrige una y otra vez en el código |
   | Skill nueva | Es un procedimiento con pasos fijos (y quizá un script) |
   | Agente nuevo | Necesita contexto propio y juicio, y se repite en varios proyectos |
   | Script o comando | Es mecánico, sin juicio |
   | Aprendizaje en el cerebro | Es una solución que se busca de nuevo en otro proyecto |
4. Revisa también `aprendizajes/` y las memorias de los agentes (`agent-memory/`): si un mismo
   error aparece en varias, es candidato a regla.
5. Resultado: tabla corta (patrón · veces · proyectos · propuesta · esfuerzo) y las 3 mejores
   propuestas primero. Anotar los candidatos en `aprendizajes/candidatos.md` con la fecha.
   **No crear** skills ni agentes sin el OK del usuario.

`<motor>` es la ruta que aparece al inicio de la sesión ("Motor: …").
