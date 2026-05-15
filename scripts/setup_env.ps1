param(
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

function Get-EnvValue {
  param([string]$Name)

  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if (-not $value) {
    $value = [Environment]::GetEnvironmentVariable($Name, "User")
  }
  if (-not $value) {
    $value = [Environment]::GetEnvironmentVariable($Name, "Machine")
  }

  if ($value) {
    return $value.Trim()
  }

  ""
}

function Write-SetupHeader {
  Write-Host ""
  Write-Host "OffensiveToolMapper .env setup"
  Write-Host "This script creates a local .env file for Docker, Shiny, MCP and the data pipeline."
  Write-Host ""
  Write-Host "How to answer:"
  Write-Host "  - For LLM_PROVIDER enter only: openai or deepseek."
  Write-Host "  - API keys are requested later; hidden input is normal."
  Write-Host "  - Press Enter to accept the value in [brackets]."
  Write-Host "  - Optional fields can stay empty."
  Write-Host "  - Existing system environment variables are offered as defaults."
  Write-Host ""
}

function Write-SetupStep {
  param(
    [string]$Title,
    [string]$Text = ""
  )

  Write-Host ""
  Write-Host "== $Title =="
  if ($Text) {
    Write-Host $Text
  }
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
  param(
    [string]$Prompt,
    [string]$ExistingValue = ""
  )

  $effectivePrompt = if ($ExistingValue) {
    "$Prompt [already set, press Enter to keep]"
  } else {
    $Prompt
  }

  $secure = Read-Host $effectivePrompt -AsSecureString
  if ($secure.Length -eq 0) {
    return $ExistingValue
  }

  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Test-LooksLikeApiKey {
  param([string]$Value)

  if (-not $Value) {
    return $false
  }

  $trimmed = $Value.Trim().Trim('"').Trim("'")
  return $trimmed -match '^(sk-|sk_|github_pat_|ghp_)'
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

if (-not $NonInteractive) {
  Write-SetupHeader
}

if (-not $Provider) {
  $Provider = Get-EnvValue "LLM_PROVIDER"
}

if (-not $Provider) {
  if ($NonInteractive) {
    $Provider = "openai"
  } else {
    Write-SetupStep "1. LLM provider" "Choose the LLM API target. Use openai for OpenAI API, deepseek for DeepSeek API."
    $Provider = Read-PlainValue "LLM_PROVIDER (openai/deepseek, not an API key)" "openai"
  }
}

$Provider = $Provider.Trim().Trim('"').Trim("'").ToLowerInvariant()
if (Test-LooksLikeApiKey $Provider) {
  throw "You pasted an API key into LLM_PROVIDER. Enter only 'openai' or 'deepseek' here. API keys are requested later: OPENAI_API_KEY or DEEPSEEK_API_KEY."
}

if ($Provider -notin @("openai", "deepseek")) {
  throw "LLM_PROVIDER must be 'openai' or 'deepseek'."
}

if (-not $Model) {
  $Model = Get-EnvValue "LLM_MODEL"
}

if (-not $Model) {
  $Model = Get-DefaultModel $Provider
}

if (-not $NonInteractive) {
  Write-SetupStep "2. LLM model" "For a first run, keeping the default is fine. OpenAI: gpt-4.1-mini. DeepSeek: deepseek-chat."
  $Model = Read-PlainValue "LLM_MODEL" $Model
}

if (-not $OpenAiApiKey) {
  $OpenAiApiKey = Get-EnvValue "OPENAI_API_KEY"
}

if (-not $DeepSeekApiKey) {
  $DeepSeekApiKey = Get-EnvValue "DEEPSEEK_API_KEY"
}

if (-not $GithubPat) {
  $GithubPat = Get-EnvValue "GITHUB_PAT"
}

if (-not $OpenAiOrgId) {
  $OpenAiOrgId = Get-EnvValue "OPENAI_ORG_ID"
}

if (-not $OpenAiProjectId) {
  $OpenAiProjectId = Get-EnvValue "OPENAI_PROJECT_ID"
}

if (-not $LlmBaseUrl) {
  $LlmBaseUrl = Get-EnvValue "LLM_BASE_URL"
}

if (-not $LlmMaxRecords) {
  $LlmMaxRecords = Get-EnvValue "LLM_MAX_RECORDS"
}

if (-not $GithubMaxSearchRequests) {
  $GithubMaxSearchRequests = Get-EnvValue "OTM_GITHUB_MAX_SEARCH_REQUESTS"
}

if (-not $NonInteractive) {
  Write-SetupStep "3. LLM API keys" "Paste the key for the selected provider. Hidden input means the terminal will not show characters."
  if ($Provider -eq "openai") {
    $OpenAiApiKey = Read-SecretValue "OPENAI_API_KEY (required for OpenAI)" $OpenAiApiKey
    $DeepSeekApiKey = Read-SecretValue "DEEPSEEK_API_KEY (optional)" $DeepSeekApiKey
  } else {
    $DeepSeekApiKey = Read-SecretValue "DEEPSEEK_API_KEY (required for DeepSeek)" $DeepSeekApiKey
    $OpenAiApiKey = Read-SecretValue "OPENAI_API_KEY (optional)" $OpenAiApiKey
  }

  Write-SetupStep "4. GitHub token" "GITHUB_PAT is recommended for repository collection. Without it GitHub limits are much stricter."
  $GithubPat = Read-SecretValue "GITHUB_PAT (recommended)" $GithubPat

  Write-SetupStep "5. Optional OpenAI/account settings" "Usually keep these empty. Fill them only if your OpenAI account or custom OpenAI-compatible endpoint requires them."
  $OpenAiOrgId = Read-PlainValue "OPENAI_ORG_ID (optional)" $OpenAiOrgId
  $OpenAiProjectId = Read-PlainValue "OPENAI_PROJECT_ID (optional)" $OpenAiProjectId
  $LlmBaseUrl = Read-PlainValue "LLM_BASE_URL (optional OpenAI-compatible endpoint)" $LlmBaseUrl

  Write-SetupStep "6. Run limits" "LLM_MAX_RECORDS limits paid LLM calls for a test run. OTM_GITHUB_MAX_SEARCH_REQUESTS limits GitHub search requests per pipeline run."
  $LlmMaxRecords = Read-PlainValue "LLM_MAX_RECORDS (optional, example: 20)" $LlmMaxRecords
  $githubRequestDefault = if ($GithubMaxSearchRequests) { $GithubMaxSearchRequests } else { "60" }
  $GithubMaxSearchRequests = Read-PlainValue "OTM_GITHUB_MAX_SEARCH_REQUESTS" $githubRequestDefault
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
$lines.Add("# Shiny/MCP")
Add-EnvLine $lines "OTM_MCP_TRANSPORT" "http"
Add-EnvLine $lines "OTM_MCP_PORT" "3000"
Add-EnvLine $lines "OFFENSIVETOOLMAPPER_DATA_DIR" ""

Set-Content -LiteralPath $OutputPath -Value $lines -Encoding UTF8

Write-Host "Done: created $OutputPath"
Write-Host "Next command:"
Write-Host "  docker compose up --build"
Write-Host ""
Write-Host "After startup:"
Write-Host "  Shiny app:  http://localhost:8788"
Write-Host "  MCP server: http://localhost:3000"
