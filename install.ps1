<#
Build and install OpenKneeboard Configurator for Stream Deck on Windows.
The plugin keeps its original UUID so existing Stream Deck profiles still resolve its actions.
Run from PowerShell after quitting Stream Deck from the tray.
#>
[CmdletBinding()]
param(
  [string] $SourceDir = $PSScriptRoot,
  [string] $BuildDir = "$env:LOCALAPPDATA\OpenKneeboardConfigurator\build",
  [switch] $Copy
)

$ErrorActionPreference = 'Stop'
$PluginId = 'com.will-voorhees.phoenix-openkneeboard'
$PluginDir = "$PluginId.sdPlugin"
$Plugins = Join-Path $env:APPDATA 'Elgato\StreamDeck\Plugins'

if (-not $IsWindows -and $PSVersionTable.PSEdition -eq 'Core') {
  throw 'Build and installation require Windows PowerShell or PowerShell on Windows.'
}
if (Get-Process -Name 'StreamDeck' -ErrorAction SilentlyContinue) {
  throw 'Quit Stream Deck from the tray before installing; its native koffi file is locked while running.'
}
$SourceDir = (Resolve-Path $SourceDir).Path
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
foreach ($item in @('src', 'tsconfig.json', 'rollup.config.ts', 'package.json', 'package-lock.json', $PluginDir)) {
  $from = Join-Path $SourceDir $item
  if (-not (Test-Path $from)) { throw "Missing from source tree: $item" }
  $to = Join-Path $BuildDir $item
  if (Test-Path $to) { Remove-Item -Recurse -Force $to }
  Copy-Item -Recurse -Force -Path $from -Destination $to
}

Push-Location $BuildDir
try {
  & npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed ($LASTEXITCODE)" }
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw "build failed ($LASTEXITCODE)" }
  & npm run validate
  if ($LASTEXITCODE -ne 0) { throw "Stream Deck validation failed ($LASTEXITCODE)" }
} finally { Pop-Location }

$built = Join-Path $BuildDir "$PluginDir\bin\plugin.js"
if (-not (Test-Path $built)) { throw 'Build produced no plugin.js' }
Push-Location $BuildDir
try {
  & npm run bundle:runtime
  if ($LASTEXITCODE -ne 0) { throw "runtime bundling failed ($LASTEXITCODE)" }
} finally { Pop-Location }

$target = Join-Path $Plugins $PluginDir
if (Test-Path $target) { Remove-Item -Recurse -Force $target }
if ($Copy) {
  Copy-Item -Recurse -Force (Join-Path $BuildDir $PluginDir) $target
  Write-Host "Copied plugin to $target"
} else {
  New-Item -ItemType SymbolicLink -Path $target -Target (Join-Path $BuildDir $PluginDir) | Out-Null
  Write-Host "Linked plugin at $target"
}
Write-Host "Smoke test: node `"$BuildDir\$PluginDir\bin\smoke.js`" AMS2"
