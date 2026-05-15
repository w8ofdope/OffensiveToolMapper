param(
  [switch]$SkipR,
  [switch]$SkipWeb,
  [switch]$SkipDocker
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
Set-Location -LiteralPath $repoRoot

function Invoke-CheckStep {
  param(
    [string]$Name,
    [scriptblock]$Action,
    [switch]$NonFatal
  )

  Write-Host ""
  Write-Host "== $Name =="

  try {
    & $Action
    Write-Host "OK: $Name"
  } catch {
    if ($NonFatal) {
      Write-Warning "Skipped/failed non-fatal step '$Name': $($_.Exception.Message)"
      return
    }

    throw
  }
}

function Invoke-NativeCommand {
  param(
    [string]$FilePath,
    [string[]]$Arguments = @()
  )

  & $FilePath @Arguments
  $exitCode = $LASTEXITCODE
  if ($null -ne $exitCode -and $exitCode -ne 0) {
    throw "$FilePath exited with code $exitCode"
  }
}

function Get-RscriptPath {
  $fromPath = Get-Command Rscript -ErrorAction SilentlyContinue
  if ($fromPath) {
    return $fromPath.Source
  }

  $knownPaths = @(
    "C:\Program Files\R\R-4.5.1\bin\Rscript.exe",
    "C:\Program Files\R\R-4.5.0\bin\Rscript.exe",
    "C:\Program Files\R\R-4.4.3\bin\Rscript.exe"
  )

  foreach ($candidate in $knownPaths) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw "Rscript was not found. Install R or add Rscript to PATH."
}

Invoke-CheckStep "setup_env.ps1 creates a temporary .env" {
  $tmp = Join-Path $env:TEMP ("otm-env-check-" + [guid]::NewGuid().ToString() + ".env")
  try {
    & (Join-Path $repoRoot "scripts\setup_env.ps1") `
      -NonInteractive `
      -Force `
      -Provider openai `
      -OpenAiApiKey "test-openai-key" `
      -GithubPat "test-github-token" `
      -OutputPath $tmp

    if (-not (Test-Path -LiteralPath $tmp)) {
      throw "Temporary .env was not created."
    }
  } finally {
    if (Test-Path -LiteralPath $tmp) {
      Remove-Item -LiteralPath $tmp -Force
    }
  }
}

if (-not $SkipDocker) {
  Invoke-CheckStep "docker compose config" {
    Invoke-NativeCommand "docker" @("compose", "config", "--quiet")
  }

  Invoke-CheckStep "docker daemon availability" {
    $dockerOutput = & docker info --format "{{.ServerVersion}}" 2>&1
    $exitCode = $LASTEXITCODE
    if ($null -ne $exitCode -and $exitCode -ne 0) {
      throw ($dockerOutput -join "`n")
    }

    $dockerOutput
  } -NonFatal
}

if (-not $SkipR) {
  $rscript = Get-RscriptPath

  Invoke-CheckStep "R test suite" {
    Invoke-NativeCommand $rscript @("data-raw\run_tests.R")
  }

  Invoke-CheckStep "webapp data export" {
    Invoke-NativeCommand $rscript @("data-raw\export_webapp_data.R")
  }

  $testArtifacts = Resolve-Path -LiteralPath "tests\testthat\inst" -ErrorAction SilentlyContinue
  if ($testArtifacts) {
    $targetPath = $testArtifacts.Path
    if ($targetPath.StartsWith($repoRoot.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $targetPath -Recurse -Force
    }
  }
}

if (-not $SkipWeb) {
  Invoke-CheckStep "npm audit" {
    Push-Location -LiteralPath (Join-Path $repoRoot "webapp")
    try {
      Invoke-NativeCommand "npm" @("audit")
    } finally {
      Pop-Location
    }
  }

  Invoke-CheckStep "webapp build" {
    Push-Location -LiteralPath (Join-Path $repoRoot "webapp")
    try {
      Invoke-NativeCommand "npm" @("run", "build")
    } finally {
      Pop-Location
    }
  }
}

Write-Host ""
Write-Host "All requested checks finished."
