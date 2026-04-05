$projectRoot = Split-Path -Parent $PSScriptRoot
$rscriptPath = 'C:\Program Files\R\R-4.5.1\bin\Rscript.exe'

Set-Location $projectRoot
$env:MODERN_UI_URL = 'http://127.0.0.1:5173'
& $rscriptPath -e "shiny::runApp('inst/shiny', launch.browser = FALSE, host = '127.0.0.1', port = 8788)"
exit $LASTEXITCODE
