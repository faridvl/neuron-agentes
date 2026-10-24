<#
Instala el motor (y los cerebros que se indiquen) en la configuración de Claude Code (idempotente).

  .\install.ps1 -RaizProyectos "D:\Documentos\Proyectos" -Cerebros "E:\Proyectos\claude-brain-personal"
  .\install.ps1 -RaizProyectos "C:\Trabajo"                      # solo el motor, sin fichas

-Cerebros        repos de datos (fichas, aprendizajes, memoria, estándares). El primero guarda la
                 memoria de los agentes salvo que se indique -MemoriaAgentes.
-Adoptar         copia al primer cerebro las skills locales que todavía no estén en ningún repo.
-LimpiarPermisos reemplaza las listas allow y ask de settings.json por las del motor.
#>
param(
  [Parameter(Mandatory = $true)][string]$RaizProyectos,
  [string[]]$Cerebros = @(),
  [string]$ConfigDir = $(if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }),
  [string]$MemoriaAgentes = '',
  [switch]$Adoptar,
  [switch]$LimpiarPermisos
)

$ErrorActionPreference = 'Stop'
$Motor = (Get-Item $PSScriptRoot).FullName
$Cerebros = @($Cerebros | Where-Object { $_ } | ForEach-Object { (Get-Item $_).FullName })
$Respaldo = Join-Path $ConfigDir ("backups\pre-cerebro-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$Excluidas = @('synced')
$Utf8 = New-Object Text.UTF8Encoding $false

function Es-Enlace($ruta) {
  (Test-Path $ruta) -and ((Get-Item $ruta -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)
}

function Respaldar($ruta) {
  if (-not (Test-Path $ruta) -or (Es-Enlace $ruta)) { return }
  New-Item -ItemType Directory -Force -Path $Respaldo | Out-Null
  Copy-Item $ruta -Destination $Respaldo -Recurse -Force
}

function Enlazar($enlace, $destino) {
  if (Es-Enlace $enlace) {
    if ((Get-Item $enlace -Force).Target -eq $destino) { return }
    (Get-Item $enlace -Force).Delete()
  } elseif (Test-Path $enlace) {
    Respaldar $enlace
    Remove-Item $enlace -Recurse -Force
  }
  # Junction: no pide permisos de administrador y funciona entre discos.
  New-Item -ItemType Junction -Path $enlace -Target $destino | Out-Null
}

$skillsConfig = Join-Path $ConfigDir 'skills'
New-Item -ItemType Directory -Force -Path $ConfigDir, $skillsConfig, (Join-Path $Motor 'registro') | Out-Null

# 1. Skills locales que todavía no viven en ningún repo van al primer cerebro.
if ($Adoptar -and $Cerebros.Count) {
  Get-ChildItem $skillsConfig -Directory |
    Where-Object { $Excluidas -notcontains $_.Name -and -not (Es-Enlace $_.FullName) } |
    ForEach-Object {
      $destino = Join-Path $Cerebros[0] "skills\$($_.Name)"
      if (-not (Test-Path $destino)) {
        New-Item -ItemType Directory -Force -Path (Split-Path $destino) | Out-Null
        Copy-Item $_.FullName -Destination $destino -Recurse
        Write-Host "Adoptada: $($_.Name)"
      }
    }
}

# 2. Skills del motor y de cada cerebro. Si dos traen el mismo nombre, gana el cerebro (va después).
Get-ChildItem $skillsConfig -Directory |
  Where-Object { (Es-Enlace $_.FullName) -and -not (Test-Path ((Get-Item $_.FullName -Force).Target)) } |
  ForEach-Object { $_.Delete(); Write-Host "Quitada (ya no existe): $($_.Name)" }
foreach ($raiz in @($Motor) + $Cerebros) {
  $dir = Join-Path $raiz 'skills'
  if (-not (Test-Path $dir)) { continue }
  Get-ChildItem $dir -Directory | ForEach-Object { Enlazar (Join-Path $skillsConfig $_.Name) $_.FullName }
}

# 3. Agentes y hooks del motor; memoria de agentes en el cerebro (nunca en el motor, que se publica).
Enlazar (Join-Path $ConfigDir 'agents') (Join-Path $Motor 'agents')
if (-not $MemoriaAgentes) {
  $MemoriaAgentes = if ($Cerebros.Count) { Join-Path $Cerebros[0] 'agent-memory' } else { Join-Path $Motor 'agent-memory' }
}
New-Item -ItemType Directory -Force -Path $MemoriaAgentes | Out-Null
Enlazar (Join-Path $ConfigDir 'agent-memory') $MemoriaAgentes
# Los agentes llaman a sus hooks por $HOME/.claude aunque la cuenta use otro CLAUDE_CONFIG_DIR.
$hooksHome = Join-Path $HOME '.claude'
New-Item -ItemType Directory -Force -Path $hooksHome | Out-Null
Enlazar (Join-Path $hooksHome 'cerebro-hooks') (Join-Path $Motor 'hooks')

# 4. CLAUDE.md global: reglas del motor + reglas propias de cada cerebro (reglas.md), por @import.
$claudeMd = Join-Path $ConfigDir 'CLAUDE.md'
Respaldar $claudeMd
$estandares = Join-Path $ConfigDir 'ESTANDARES.md'
if (Test-Path $estandares) { Respaldar $estandares; Remove-Item $estandares -Force }
$imports = @('@' + ((Join-Path $Motor 'global\CLAUDE.md') -replace '\\', '/'))
foreach ($raiz in $Cerebros) {
  $reglas = Join-Path $raiz 'reglas.md'
  if (Test-Path $reglas) { $imports += '@' + ($reglas -replace '\\', '/') }
}
[IO.File]::WriteAllText($claudeMd, (($imports -join "`n") + "`n"), $Utf8)

# 5. Configuración de esta máquina (no va a git).
$config = [ordered]@{ cerebros = $Cerebros; raizProyectos = $RaizProyectos }
[IO.File]::WriteAllText((Join-Path $ConfigDir 'cerebro.json'), ($config | ConvertTo-Json), $Utf8)

# 6. Hooks y permisos en settings.json.
$settings = Join-Path $ConfigDir 'settings.json'
Respaldar $settings
$argumentos = @((Join-Path $Motor 'install\merge-settings.mjs'), $settings, $Motor, $RaizProyectos) + $Cerebros
if ($LimpiarPermisos) { $argumentos += '--limpiar' }
& node @argumentos
if ($LASTEXITCODE -ne 0) { throw 'No se pudo actualizar settings.json' }

Write-Host ''
Write-Host "Motor instalado en $ConfigDir"
if ($Cerebros.Count) { Write-Host "Cerebros: $($Cerebros -join ', ')" } else { Write-Host 'Sin cerebros: no habrá fichas de proyectos.' }
if (Test-Path $Respaldo) { Write-Host "Respaldo de lo anterior: $Respaldo" }
Write-Host 'Abrir una sesión nueva para que tome los cambios.'
