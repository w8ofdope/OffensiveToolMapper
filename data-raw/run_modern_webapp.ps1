$projectRoot = Split-Path -Parent $PSScriptRoot
$rscriptPath = 'C:\Program Files\R\R-4.5.1\bin\Rscript.exe'
$shinyUrl = 'http://127.0.0.1:8788'
$modernUrl = 'http://127.0.0.1:5173'
$shinyScript = Join-Path $projectRoot 'data-raw\run_shiny_dashboard.ps1'
$viteScript = Join-Path $projectRoot 'data-raw\run_vite_webapp.ps1'

function Test-PortListening([int]$Port) {
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

& $rscriptPath (Join-Path $projectRoot 'data-raw\export_webapp_data.R')
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if (-not (Test-PortListening 5173)) {
  Start-Process powershell.exe -WorkingDirectory $projectRoot -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', $viteScript | Out-Null
}

if (-not (Test-PortListening 8788)) {
  Start-Process powershell.exe -WorkingDirectory $projectRoot -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', $shinyScript | Out-Null
}

Start-Process $shinyUrl | Out-Null
Write-Host "R dashboard: $shinyUrl"
Write-Host "Modern UI:   $modernUrl"
