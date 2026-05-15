param(
  [ValidateSet("", "openai", "deepseek")]
  [string]$Provider = "",
  [string]$Model = "",
  [string]$OpenAiApiKey = "",
  [string]$DeepSeekApiKey = "",
  [string]$GithubPat = "",
  [string]$OpenAiOrgId = "",
  [string]$OpenAiProjectId = "",
  [string]$LlmBaseUrl = "",
  [string]$LlmMaxRecords = "",
  [string]$GithubMaxSearchRequests = "",
  [string]$OutputPath = "",
  [switch]$Force,
  [switch]$NonInteractive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
if (-not $OutputPath) {
  $OutputPath = Join-Path $repoRoot ".env"
}

function Read-PlainValue {
  param(
    [string]$Prompt,
    [string]$Default = ""
  )

  if ($Default) {
    $value = Read-Host "$Prompt [$Default]"
    if (-not $value) {
      return $Default
    }
    return $value.Trim()
  }

  return (Read-Host $Prompt).Trim()
}

function Read-SecretValue {
  param([string]$Prompt)

  $secure = Read-Host $Prompt -AsSecureString
  if ($secure.Length -eq 0) {
    return ""
  }

  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Get-DefaultModel {
  param([string]$ProviderName)

  if ($ProviderName -eq "deepseek") {
    return "deepseek-chat"
  }

  "gpt-4.1-mini"
}

function Add-EnvLine {
  param(
    [System.Collections.Generic.List[string]]$Lines,
    [string]$Key,
    [string]$Value = ""
  )

  $safeValue = if ($null -eq $Value) { "" } else { $Value.Trim() }
  $Lines.Add("$Key=$safeValue")
}

if ((Test-Path -LiteralPath $OutputPath) -and -not $Force -and -not $NonInteractive) {
  $answer = Read-PlainValue "File $OutputPath already exists. Overwrite? y/N" "N"
  if ($answer.ToLowerInvariant() -notin @("y", "yes")) {
    Write-Host "Existing .env was left unchanged."
    exit 0
  }
}

if ((Test-Path -LiteralPath $OutputPath) -and -not $Force -and $NonInteractive) {
  throw "File $OutputPath already exists. Pass -Force to overwrite it."
}

if (-not $Provider) {
  if ($NonInteractive) {
    $Provider = "openai"
  } else {
    $Provider = Read-PlainValue "LLM provider: openai or deepseek" "openai"
  }
}

$Provider = $Provider.ToLowerInvariant()
if ($Provider -notin @("openai", "deepseek")) {
  throw "LLM provider must be openai or deepseek."
}

if (-not $Model) {
  $defaultModel = Get-DefaultModel $Provider
  $Model = if ($NonInteractive) { $defaultModel } else { Read-PlainValue "LLM model" $defaultModel }
}

if (-not $NonInteractive) {
  if ($Provider -eq "openai") {
    $OpenAiApiKey = Read-SecretValue "OPENAI_API_KEY (required for OpenAI, hidden input)"
    $DeepSeekApiKey = Read-SecretValue "DEEPSEEK_API_KEY (optional, press Enter to skip)"
  } else {
    $DeepSeekApiKey = Read-SecretValue "DEEPSEEK_API_KEY (required for DeepSeek, hidden input)"
    $OpenAiApiKey = Read-SecretValue "OPENAI_API_KEY (optional, press Enter to skip)"
  }

  $GithubPat = Read-SecretValue "GITHUB_PAT (recommended for GitHub collection, hidden input)"
  $OpenAiOrgId = Read-PlainValue "OPENAI_ORG_ID (optional)" ""
  $OpenAiProjectId = Read-PlainValue "OPENAI_PROJECT_ID (optional)" ""
  $LlmBaseUrl = Read-PlainValue "LLM_BASE_URL (optional)" ""
  $LlmMaxRecords = Read-PlainValue "LLM_MAX_RECORDS (optional, for example 20 for a test run)" ""
  $GithubMaxSearchRequests = Read-PlainValue "OTM_GITHUB_MAX_SEARCH_REQUESTS" "60"
}

if ($Provider -eq "openai" -and -not $OpenAiApiKey) {
  Write-Warning "OPENAI_API_KEY is empty: UI and MCP will start, but LLM assessment/classify_new_tool will not work."
}

if ($Provider -eq "deepseek" -and -not $DeepSeekApiKey) {
  Write-Warning "DEEPSEEK_API_KEY is empty: UI and MCP will start, but LLM assessment/classify_new_tool will not work."
}

if (-not $GithubPat) {
  Write-Warning "GITHUB_PAT is empty: full GitHub collection may hit API limits."
}

if (-not $GithubMaxSearchRequests) {
  $GithubMaxSearchRequests = "60"
}

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# OffensiveToolMapper local environment")
$lines.Add("# Created by scripts/setup_env.ps1. Do not commit this file.")
$lines.Add("")
$lines.Add("# LLM")
Add-EnvLine $lines "LLM_PROVIDER" $Provider
Add-EnvLine $lines "LLM_MODEL" $Model
Add-EnvLine $lines "OPENAI_API_KEY" $OpenAiApiKey
Add-EnvLine $lines "OPENAI_ORG_ID" $OpenAiOrgId
Add-EnvLine $lines "OPENAI_PROJECT_ID" $OpenAiProjectId
Add-EnvLine $lines "DEEPSEEK_API_KEY" $DeepSeekApiKey
Add-EnvLine $lines "LLM_BASE_URL" $LlmBaseUrl
Add-EnvLine $lines "LLM_MAX_RECORDS" $LlmMaxRecords
$lines.Add("")
$lines.Add("# GitHub collection")
Add-EnvLine $lines "GITHUB_PAT" $GithubPat
Add-EnvLine $lines "OTM_COLLECT_MODE" "incremental"
Add-EnvLine $lines "OTM_GITHUB_MIN_STARS" "10"
Add-EnvLine $lines "OTM_GITHUB_MAX_RESULTS" "100"
Add-EnvLine $lines "OTM_GITHUB_MAX_SEARCH_REQUESTS" $GithubMaxSearchRequests
$lines.Add("")
$lines.Add("# UI/MCP")
Add-EnvLine $lines "MODERN_UI_URL" "http://localhost:5173"
Add-EnvLine $lines "OTM_MCP_TRANSPORT" "http"
Add-EnvLine $lines "OTM_MCP_PORT" "3000"
Add-EnvLine $lines "OFFENSIVETOOLMAPPER_DATA_DIR" ""

Set-Content -LiteralPath $OutputPath -Value $lines -Encoding UTF8

Write-Host "Done: created $OutputPath"
Write-Host "Next command:"
Write-Host "  docker compose up --build"
Write-Host ""
Write-Host "After startup:"
Write-Host "  React/Vite UI: http://localhost:5173"
Write-Host "  Shiny:         http://localhost:8788"
Write-Host "  MCP server:    http://localhost:3000"
