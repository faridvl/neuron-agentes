# Arranca Docker Desktop solo si es seguro. Códigos de salida:
#   0 = el daemon responde
#   2 = hay un socket del Secrets Engine trabado: hace falta reiniciar Windows (no se abre Docker)
#   3 = no se encontró Docker Desktop
#   4 = Docker arrancó pero el daemon no respondió a tiempo
param([int]$EsperaSegundos = 180, [switch]$SoloLimpiar)

function DaemonResponde {
  docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

if (DaemonResponde) { 'Docker ya responde.'; exit 0 }

$enMarcha = Get-Process -Name 'Docker Desktop', 'com.docker.backend' -ErrorAction SilentlyContinue
if (-not $enMarcha) {
  # Si Docker se cerró mal, deja este socket AF_UNIX y al volver a abrir se cae con
  # "rename engine.sock ... The file cannot be accessed by the system".
  $carpeta = Join-Path $env:LOCALAPPDATA 'docker-secrets-engine'
  foreach ($nombre in 'engine.sock', 'engine.sock.stale') {
    $ruta = Join-Path $carpeta $nombre
    if (-not (Test-Path -LiteralPath $ruta)) { continue }
    try { Remove-Item -LiteralPath $ruta -Force -ErrorAction Stop }
    catch {
      # Windows no puede borrar un socket de Unix; la distro de Docker sí (C: es /mnt/host/c ahí).
      $rutaWsl = '/mnt/host/' + $ruta.Substring(0, 1).ToLower() + ($ruta.Substring(2) -replace '\\', '/')
      wsl -d docker-desktop -- rm -f $rutaWsl 2>$null | Out-Null
    }
    if (Test-Path -LiteralPath $ruta) {
      "Socket trabado: $ruta no se puede borrar ni desde Windows ni desde WSL."
      'No abro Docker para no mostrar el error. Reinicia Windows y, antes de abrir Docker, corre este script de nuevo.'
      exit 2
    }
  }
  if ($SoloLimpiar) { 'Socket limpio; Docker no se abrió (-SoloLimpiar).'; exit 0 }

  $exe = $null
  $docker = (Get-Command docker -ErrorAction SilentlyContinue).Source
  if ($docker) { $exe = Join-Path (Split-Path (Split-Path (Split-Path $docker))) 'Docker Desktop.exe' }
  if (-not $exe -or -not (Test-Path -LiteralPath $exe)) { $exe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe' }
  if (-not (Test-Path -LiteralPath $exe)) { 'No encontré Docker Desktop.exe.'; exit 3 }
  Start-Process -FilePath $exe
}

$limite = (Get-Date).AddSeconds($EsperaSegundos)
while ((Get-Date) -lt $limite) {
  if (DaemonResponde) { 'Docker responde.'; exit 0 }
  Start-Sleep -Seconds 3
}
"Docker no respondió en $EsperaSegundos s. Revisa si Docker Desktop muestra un error; no lo cierres a la fuerza."
exit 4
