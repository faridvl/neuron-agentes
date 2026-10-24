<#
Instala el motor (y los cerebros que se indiquen) en la configuración de Claude Code. Suma, no reemplaza:
lo propio del usuario (CLAUDE.md, agentes, skills, settings.json) se queda como está. Idempotente.

  .\install.ps1 -RaizProyectos "D:\Documentos\Proyectos" -Cerebros "E:\Proyectos\claude-brain-personal"
  .\install.ps1 -RaizProyectos "C:\Trabajo"                      # solo el motor, sin fichas
  .\install.ps1 -Desinstalar                                     # quita solo lo que puso el motor

-Cerebros        repos de datos (fichas, aprendizajes, memoria, estándares). El primero guarda la
                 memoria de los agentes salvo que se indique -MemoriaAgentes.
-Adoptar         copia al primer cerebro las skills locales que todavía no estén en ningún repo.
-LimpiarPermisos reemplaza las listas allow y ask de settings.json por las del motor.
-Desinstalar     quita el bloque de CLAUDE.md, los agentes del manifiesto, los junctions de skills del
                 motor/cerebros y los hooks del motor. No toca nada más.
#>
param(
  [string]$RaizProyectos = '',
  [string[]]$Cerebros = @(),
  [string]$ConfigDir = $(if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }),
  [string]$MemoriaAgentes = '',
  [switch]$Adoptar,
  [switch]$LimpiarPermisos,
  [switch]$Desinstalar
)

$ErrorActionPreference = 'Stop'
if (-not $Desinstalar -and -not $RaizProyectos) { throw 'Falta -RaizProyectos.' }
$Motor = (Get-Item $PSScriptRoot).FullName
$Cerebros = @($Cerebros | Where-Object { $_ } | ForEach-Object { (Get-Item $_).FullName })
$Respaldo = Join-Path $ConfigDir ("backups\pre-cerebro-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$Excluidas = @('synced')
$Utf8 = New-Object Text.UTF8Encoding $false
$MarcaInicio = '<!-- claude-brain:inicio -->'
$MarcaFin = '<!-- claude-brain:fin -->'
$Avisos = New-Object Collections.Generic.List[string]
$claudeMd = Join-Path $ConfigDir 'CLAUDE.md'
$agentesDir = Join-Path $ConfigDir 'agents'
$manifiestoRuta = Join-Path $ConfigDir 'cerebro-agentes.json'
$skillsConfig = Join-Path $ConfigDir 'skills'
$hooksHome = Join-Path $HOME '.claude'

function Es-Enlace($ruta) {
  (Test-Path $ruta) -and ((Get-Item $ruta -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)
}

function Destino-Enlace($ruta) {
  [string]((Get-Item $ruta -Force).Target | Select-Object -First 1)
}

function Respaldar($ruta) {
  if (-not (Test-Path $ruta) -or (Es-Enlace $ruta)) { return }
  New-Item -ItemType Directory -Force -Path $Respaldo | Out-Null
  Copy-Item $ruta -Destination $Respaldo -Recurse -Force
}

function Quitar-Enlace($ruta) {
  if (-not (Es-Enlace $ruta)) { throw "No es un enlace, no se borra: $ruta" }
  (Get-Item $ruta -Force).Delete()
}

function Enlazar($enlace, $destino) {
  if (Es-Enlace $enlace) {
    if ((Destino-Enlace $enlace) -eq $destino) { return }
    Quitar-Enlace $enlace
  } elseif (Test-Path $enlace) {
    Respaldar $enlace
    Remove-Item $enlace -Recurse -Force
  }
  # Junction: no pide permisos de administrador y funciona entre discos.
  New-Item -ItemType Junction -Path $enlace -Target $destino | Out-Null
}

# Una skill propia (carpeta real) nunca se pisa.
function Enlazar-Skill($enlace, $destino) {
  if ((Test-Path $enlace) -and -not (Es-Enlace $enlace)) {
    $Avisos.Add("Skill propia conservada, no se enlazó la del motor/cerebro con el mismo nombre: $(Split-Path $enlace -Leaf)")
    return
  }
  Enlazar $enlace $destino
}

# La memoria de agentes previa del usuario se pasa al destino antes de enlazar.
function Enlazar-Memoria($enlace, $destino) {
  if ((Test-Path $enlace) -and -not (Es-Enlace $enlace)) {
    Respaldar $enlace
    Get-ChildItem $enlace -Force | ForEach-Object {
      $copia = Join-Path $destino $_.Name
      if (-not (Test-Path $copia)) { Copy-Item $_.FullName -Destination $copia -Recurse }
    }
    Remove-Item $enlace -Recurse -Force
  }
  Enlazar $enlace $destino
}

function Apunta-A-Motor-O-Cerebro($ruta) {
  if (-not (Es-Enlace $ruta)) { return $false }
  $destino = Destino-Enlace $ruta
  foreach ($raiz in @($Motor) + $Cerebros) {
    if ($destino -eq $raiz -or $destino.StartsWith($raiz.TrimEnd('\') + '\')) { return $true }
  }
  return $false
}

function Leer-Texto($ruta) {
  if (-not (Test-Path $ruta)) { return @{ Texto = ''; ConBom = $false } }
  $bytes = [IO.File]::ReadAllBytes($ruta)
  $conBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
  @{ Texto = [IO.File]::ReadAllText($ruta); ConBom = $conBom }
}

# El bloque va precedido de una línea en blanco propia; quitarla junto con él devuelve el archivo byte a byte.
function Quitar-Bloque($texto) {
  $patron = '(?s)(\r?\n)?' + [regex]::Escape($MarcaInicio) + '.*?' + [regex]::Escape($MarcaFin) + '\r?\n?'
  [regex]::Replace($texto, $patron, '')
}

function Agregar-Bloque($texto, $bloque) {
  $finDeLinea = if ($texto.Contains("`r`n")) { "`r`n" } else { "`n" }
  $patronBloque = '(?s)' + [regex]::Escape($MarcaInicio) + '.*?' + [regex]::Escape($MarcaFin)
  if ($texto.Contains($MarcaInicio)) { return [regex]::Replace($texto, $patronBloque, { param($coincidencia) $bloque }) }
  if (-not $texto) { return $bloque + $finDeLinea }
  $separador = if ($texto.EndsWith("`n")) { '' } else { $finDeLinea }
  return $texto + $separador + $finDeLinea + $bloque + $finDeLinea
}

# El respaldo anterior más reciente (sin contar el de esta corrida) que traiga $contenido.
function Ultimo-Respaldo($contenido) {
  $carpeta = Join-Path $ConfigDir 'backups'
  if (-not (Test-Path $carpeta)) { return $null }
  Get-ChildItem $carpeta -Directory -Filter 'pre-cerebro-*' |
    Where-Object { $_.FullName -ne $Respaldo -and (Test-Path (Join-Path $_.FullName $contenido)) } |
    Sort-Object Name -Descending | Select-Object -First 1
}

function Hash-Archivo($ruta) { (Get-FileHash $ruta -Algorithm SHA256).Hash }

function Leer-Manifiesto {
  if (-not (Test-Path $manifiestoRuta)) { return @() }
  $datos = [IO.File]::ReadAllText($manifiestoRuta) | ConvertFrom-Json
  @($datos.agentes)
}

function Escribir-Manifiesto([Collections.Generic.List[object]]$entradas) {
  $contenido = [ordered]@{ agentes = [object[]]$entradas.ToArray() }
  [IO.File]::WriteAllText($manifiestoRuta, ($contenido | ConvertTo-Json -Depth 4), $Utf8)
}

New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null

# ---------------------------------------------------------------- Desinstalar
if ($Desinstalar) {
  $configurado = Join-Path $ConfigDir 'cerebro.json'
  if (Test-Path $configurado) {
    $guardados = @((Get-Content $configurado -Raw | ConvertFrom-Json).cerebros) | Where-Object { $_ }
    $Cerebros = @($Cerebros + $guardados | Select-Object -Unique)
  }

  $actual = Leer-Texto $claudeMd
  if ($actual.Texto.Contains($MarcaInicio)) {
    Respaldar $claudeMd
    [IO.File]::WriteAllText($claudeMd, (Quitar-Bloque $actual.Texto), (New-Object Text.UTF8Encoding $actual.ConBom))
    Write-Host 'CLAUDE.md: bloque del motor quitado.'
  }

  foreach ($entrada in Leer-Manifiesto) {
    $archivo = Join-Path $agentesDir $entrada.nombre
    if (Test-Path $archivo) { Respaldar $archivo; Remove-Item $archivo -Force; Write-Host "Agente quitado: $($entrada.nombre)" }
  }
  if (Test-Path $manifiestoRuta) { Respaldar $manifiestoRuta; Remove-Item $manifiestoRuta -Force }

  foreach ($carpeta in @($skillsConfig, $ConfigDir)) {
    if (-not (Test-Path $carpeta)) { continue }
    Get-ChildItem $carpeta -Directory -Force |
      Where-Object { (Apunta-A-Motor-O-Cerebro $_.FullName) } |
      ForEach-Object { Quitar-Enlace $_.FullName; Write-Host "Enlace quitado: $($_.Name)" }
  }
  # cerebro-hooks es compartido por todas las cuentas: solo se quita si esta es la cuenta principal.
  if ((Es-Enlace (Join-Path $hooksHome 'cerebro-hooks')) -and ($ConfigDir.TrimEnd('\') -eq $hooksHome.TrimEnd('\'))) {
    Quitar-Enlace (Join-Path $hooksHome 'cerebro-hooks')
  }

  $settings = Join-Path $ConfigDir 'settings.json'
  if (Test-Path $settings) {
    Respaldar $settings
    & node (Join-Path $Motor 'install\merge-settings.mjs') $settings $Motor x --desinstalar
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo actualizar settings.json' }
  }
  if (Test-Path $configurado) { Remove-Item $configurado -Force }

  Write-Host ''
  Write-Host "Motor desinstalado de $ConfigDir"
  if (Test-Path $Respaldo) { Write-Host "Respaldo de lo anterior: $Respaldo" }
  return
}

# ------------------------------------------------------------------- Instalar
New-Item -ItemType Directory -Force -Path $skillsConfig, (Join-Path $Motor 'registro') | Out-Null

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
  Where-Object { (Es-Enlace $_.FullName) -and -not (Test-Path (Destino-Enlace $_.FullName)) } |
  ForEach-Object { $_.Delete(); Write-Host "Quitada (ya no existe): $($_.Name)" }
foreach ($raiz in @($Motor) + $Cerebros) {
  $dir = Join-Path $raiz 'skills'
  if (-not (Test-Path $dir)) { continue }
  Get-ChildItem $dir -Directory | ForEach-Object { Enlazar-Skill (Join-Path $skillsConfig $_.Name) $_.FullName }
}

# 3. Agentes: se copian a la carpeta del usuario; el manifiesto dice cuáles son del motor.
$deseados = [ordered]@{}
foreach ($raiz in @($Motor) + $Cerebros) {
  $dir = Join-Path $raiz 'agents'
  if (-not (Test-Path $dir)) { continue }
  Get-ChildItem $dir -Filter '*.md' -File | ForEach-Object { $deseados[$_.Name] = $_.FullName }
}

if (Es-Enlace $agentesDir) {
  Quitar-Enlace $agentesDir
  New-Item -ItemType Directory -Force -Path $agentesDir | Out-Null
  $previo = Ultimo-Respaldo 'agents'
  if ($previo) {
    Get-ChildItem (Join-Path $previo.FullName 'agents') -Filter '*.md' -File | ForEach-Object {
      if ($deseados.Contains($_.Name)) {
        $Avisos.Add("Agente propio del respaldo no restaurado (mismo nombre que uno del motor/cerebro): $($_.Name) en $($previo.FullName)\agents")
      } else {
        Copy-Item $_.FullName -Destination (Join-Path $agentesDir $_.Name)
        Write-Host "Agente propio restaurado: $($_.Name)"
      }
    }
  } else {
    $Avisos.Add('El agents anterior era un enlace al motor y no hay respaldo pre-cerebro con agents: revisa si tenías agentes propios.')
  }
}
New-Item -ItemType Directory -Force -Path $agentesDir | Out-Null

$manifiesto = @{}
foreach ($entrada in Leer-Manifiesto) { $manifiesto[$entrada.nombre] = $entrada }
$nuevoManifiesto = New-Object Collections.Generic.List[object]
foreach ($nombre in $deseados.Keys) {
  $origen = $deseados[$nombre]
  $destino = Join-Path $agentesDir $nombre
  $hashOrigen = Hash-Archivo $origen
  if ((Test-Path $destino) -and -not $manifiesto.ContainsKey($nombre) -and (Hash-Archivo $destino) -ne $hashOrigen) {
    $Avisos.Add("Agente propio conservado, no se pisó (mismo nombre que uno del motor/cerebro): $nombre")
    continue
  }
  if (-not (Test-Path $destino) -or (Hash-Archivo $destino) -ne $hashOrigen) {
    Respaldar $destino
    Copy-Item $origen -Destination $destino -Force
  }
  $nuevoManifiesto.Add([ordered]@{ nombre = $nombre; origen = $origen; hash = $hashOrigen })
}
foreach ($nombre in $manifiesto.Keys) {
  if ($deseados.Contains($nombre)) { continue }
  $obsoleto = Join-Path $agentesDir $nombre
  if (Test-Path $obsoleto) { Respaldar $obsoleto; Remove-Item $obsoleto -Force; Write-Host "Agente quitado (ya no existe en el origen): $nombre" }
}
Escribir-Manifiesto $nuevoManifiesto

# Memoria de agentes en el cerebro (nunca en el motor, que se publica).
if (-not $MemoriaAgentes) {
  $MemoriaAgentes = if ($Cerebros.Count) { Join-Path $Cerebros[0] 'agent-memory' } else { Join-Path $Motor 'agent-memory' }
}
New-Item -ItemType Directory -Force -Path $MemoriaAgentes | Out-Null
Enlazar-Memoria (Join-Path $ConfigDir 'agent-memory') $MemoriaAgentes
# Los agentes llaman a sus hooks por $HOME/.claude aunque la cuenta use otro CLAUDE_CONFIG_DIR.
New-Item -ItemType Directory -Force -Path $hooksHome | Out-Null
Enlazar (Join-Path $hooksHome 'cerebro-hooks') (Join-Path $Motor 'hooks')

# 4. CLAUDE.md: lo del usuario intacto + un bloque entre marcas con los @import del motor y los cerebros.
$imports = @('@' + ((Join-Path $Motor 'global\CLAUDE.md') -replace '\\', '/'))
foreach ($raiz in $Cerebros) {
  $reglas = Join-Path $raiz 'reglas.md'
  if (Test-Path $reglas) { $imports += '@' + ($reglas -replace '\\', '/') }
}
$bloque = $MarcaInicio + "`n" + ($imports -join "`n") + "`n" + $MarcaFin
$actual = Leer-Texto $claudeMd
$lineas = @($actual.Texto -split "\r?\n" | Where-Object { $_.Trim() })
$esVersionVieja = -not $actual.Texto.Contains($MarcaInicio) -and $lineas.Count -gt 0 -and
  -not ($lineas | Where-Object { $_ -notmatch '^@\S+(global/CLAUDE\.md|reglas\.md)\s*$' })
if ($esVersionVieja) {
  $nuevo = $bloque + "`n"
  $previo = Ultimo-Respaldo 'CLAUDE.md'
  $donde = if ($previo) { "$($previo.FullName)\CLAUDE.md" } else { '(no se encontró respaldo pre-cerebro con CLAUDE.md)' }
  $Avisos.Add("CLAUDE.md era el de la versión vieja (solo @import). Tu CLAUDE.md original está en $donde; no se restauró solo, copia ahí lo que quieras conservar.")
} else {
  $nuevo = Agregar-Bloque $actual.Texto $bloque
}
if ($nuevo -ne $actual.Texto) {
  if (-not $esVersionVieja) { Respaldar $claudeMd }
  [IO.File]::WriteAllText($claudeMd, $nuevo, (New-Object Text.UTF8Encoding $actual.ConBom))
}

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
foreach ($aviso in $Avisos) { Write-Host "AVISO: $aviso" -ForegroundColor Yellow }
Write-Host 'Abrir una sesión nueva para que tome los cambios.'
