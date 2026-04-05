$projectRoot = Split-Path -Parent $PSScriptRoot
$webappRoot = Join-Path $projectRoot 'webapp'

Push-Location $webappRoot
try {
  if (-not (Test-Path (Join-Path $webappRoot 'node_modules'))) {
    npm install
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }

  npm run dev
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
