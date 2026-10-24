---
name: docker
description: Cómo arrancar, usar y apagar Docker Desktop en Windows sin dejarlo trabado. Usar antes de cualquier comando que necesite el daemon de Docker (docker, docker compose, entornos locales en contenedores) y siempre que Docker no responda.
---

# Docker Desktop en Windows

Nunca abras `Docker Desktop.exe` directo, ni mates sus procesos, ni corras `wsl --shutdown` con
Docker abierto. Un cierre brusco deja trabado el socket
`%LOCALAPPDATA%\docker-secrets-engine\engine.sock`; desde ahí cada arranque muestra al usuario
"initializing Secrets Engine … The file cannot be accessed by the system" y Docker se cierra.

## Arrancar

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.claude\skills\docker\arrancar-docker.ps1"
```

| Salida | Qué hacer |
|---|---|
| 0 | El daemon responde: seguir. |
| 2 | Socket trabado que no se pudo borrar ni desde Windows ni desde WSL (el script lo intenta solo). No reintentar ni abrir Docker: decirle al usuario que reinicie Windows y seguir con lo que no necesita Docker. Después del reinicio, correr el script otra vez. |
| 3 | Docker no está instalado o no se encontró: avisar. |
| 4 | Arrancó pero no responde: no cerrarlo a la fuerza; avisar al usuario y mirar la ventana de Docker. |

Con `-SoloLimpiar` solo destraba el socket y no abre Docker (sirve si el usuario quiere abrirlo él).

Un solo intento por tarea. Si falla, no se reintenta en bucle: cada intento le abre una ventana
de error al usuario.

## Apagar

Solo si el encargo lo pide: `docker desktop stop` (cierre ordenado). Nunca `Stop-Process`,
`taskkill` ni `wsl --shutdown` sobre Docker.
