param(
  [string]$Provider = "",
  [string]$Model = "",
  [string]$OpenAiApiKey = "",
  [string]$AnthropicApiKey = "",
  [string]$DeepSeekApiKey = "",
  [string]$XaiApiKey = "",
  [string]$GroqApiKey = "",
  [string]$MistralApiKey = "",
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

$SupportedProviders = @("openai", "anthropic", "deepseek", "xai", "groq", "mistral", "ollama")

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
  Write-Host "OffensiveToolMapper — настройка окружения (.env)"
  Write-Host "Скрипт создаёт файл .env для Docker, Shiny, MCP и пайплайна данных."
  Write-Host ""
  Write-Host "Как отвечать:"
  Write-Host "  - Для LLM_PROVIDER введи только имя провайдера (см. список ниже)."
  Write-Host "  - API-ключи запрашиваются отдельно; ввод скрытый."
  Write-Host "  - Enter без ввода = оставить значение в [скобках]."
  Write-Host "  - Необязательные поля можно оставить пустыми."
  Write-Host ""
  Write-Host "Поддерживаемые провайдеры: openai, anthropic, deepseek, xai, groq, mistral, ollama"
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
    "$Prompt [уже задан, Enter = оставить]"
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

  switch ($ProviderName) {
    "openai"    { return "gpt-4.1-mini" }
    "anthropic" { return "claude-sonnet-4-6" }
    "deepseek"  { return "deepseek-chat" }
    "xai"       { return "grok-3-mini" }
    "groq"      { return "llama-3.3-70b-versatile" }
    "mistral"   { return "mistral-small-latest" }
    "ollama"    { return "qwen3:8b" }
    default     { return "gpt-4.1-mini" }
  }
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
  $answer = Read-PlainValue "Файл $OutputPath уже существует. Перезаписать? y/N" "N"
  if ($answer.ToLowerInvariant() -notin @("y", "yes")) {
    Write-Host "Существующий .env оставлен без изменений."
    exit 0
  }
}

if ((Test-Path -LiteralPath $OutputPath) -and -not $Force -and $NonInteractive) {
  throw "Файл $OutputPath уже существует. Передай -Force для перезаписи."
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
    Write-SetupStep "1. LLM-провайдер" "Выбери нейросеть. openai=ChatGPT, anthropic=Claude, deepseek=DeepSeek, xai=Grok, groq=Groq, mistral=Mistral, ollama=локальный Ollama."
    $Provider = Read-PlainValue "LLM_PROVIDER (не API-ключ!)" "openai"
  }
}

$Provider = $Provider.Trim().Trim('"').Trim("'").ToLowerInvariant()
if (Test-LooksLikeApiKey $Provider) {
  throw "Ты вставил API-ключ в LLM_PROVIDER. Введи только имя провайдера: openai, anthropic, deepseek, xai, groq, mistral или ollama."
}

if ($Provider -notin $SupportedProviders) {
  throw "LLM_PROVIDER должен быть одним из: $($SupportedProviders -join ', ')."
}

if (-not $Model) {
  $Model = Get-EnvValue "LLM_MODEL"
}

if (-not $Model) {
  $Model = Get-DefaultModel $Provider
}

if (-not $NonInteractive) {
  Write-SetupStep "2. Модель" "Для первого запуска подходит значение по умолчанию."
  $Model = Read-PlainValue "LLM_MODEL" $Model
}

# Загрузить существующие ключи из системного окружения
if (-not $OpenAiApiKey)    { $OpenAiApiKey    = Get-EnvValue "OPENAI_API_KEY"    }
if (-not $AnthropicApiKey) { $AnthropicApiKey = Get-EnvValue "ANTHROPIC_API_KEY" }
if (-not $DeepSeekApiKey)  { $DeepSeekApiKey  = Get-EnvValue "DEEPSEEK_API_KEY"  }
if (-not $XaiApiKey)       { $XaiApiKey       = Get-EnvValue "XAI_API_KEY"       }
if (-not $GroqApiKey)      { $GroqApiKey      = Get-EnvValue "GROQ_API_KEY"      }
if (-not $MistralApiKey)   { $MistralApiKey   = Get-EnvValue "MISTRAL_API_KEY"   }
if (-not $GithubPat)       { $GithubPat       = Get-EnvValue "GITHUB_PAT"        }
if (-not $OpenAiOrgId)     { $OpenAiOrgId     = Get-EnvValue "OPENAI_ORG_ID"     }
if (-not $OpenAiProjectId) { $OpenAiProjectId = Get-EnvValue "OPENAI_PROJECT_ID" }
if (-not $LlmBaseUrl)      { $LlmBaseUrl      = Get-EnvValue "LLM_BASE_URL"      }
if (-not $LlmMaxRecords)   { $LlmMaxRecords   = Get-EnvValue "LLM_MAX_RECORDS"   }
if (-not $GithubMaxSearchRequests) { $GithubMaxSearchRequests = Get-EnvValue "OTM_GITHUB_MAX_SEARCH_REQUESTS" }

if (-not $NonInteractive) {
  Write-SetupStep "3. API-ключи нейросетей" "Заполни ключ выбранного провайдера. Остальные можно пропустить (Enter)."

  switch ($Provider) {
    "openai"    { $OpenAiApiKey    = Read-SecretValue "OPENAI_API_KEY (обязателен для openai)"       $OpenAiApiKey    }
    "anthropic" { $AnthropicApiKey = Read-SecretValue "ANTHROPIC_API_KEY (обязателен для anthropic)" $AnthropicApiKey }
    "deepseek"  { $DeepSeekApiKey  = Read-SecretValue "DEEPSEEK_API_KEY (обязателен для deepseek)"   $DeepSeekApiKey  }
    "xai"       { $XaiApiKey       = Read-SecretValue "XAI_API_KEY (обязателен для xai/Grok)"        $XaiApiKey       }
    "groq"      { $GroqApiKey      = Read-SecretValue "GROQ_API_KEY (обязателен для groq)"           $GroqApiKey      }
    "mistral"   { $MistralApiKey   = Read-SecretValue "MISTRAL_API_KEY (обязателен для mistral)"     $MistralApiKey   }
    "ollama"    { Write-Host "Ollama работает локально, API-ключ не нужен." }
  }

  Write-Host ""
  Write-Host "Дополнительные ключи (необязательно, можно пропустить Enter):"
  if ($Provider -ne "openai")    { $OpenAiApiKey    = Read-SecretValue "OPENAI_API_KEY (необязателен)"    $OpenAiApiKey    }
  if ($Provider -ne "anthropic") { $AnthropicApiKey = Read-SecretValue "ANTHROPIC_API_KEY (необязателен)" $AnthropicApiKey }
  if ($Provider -ne "deepseek")  { $DeepSeekApiKey  = Read-SecretValue "DEEPSEEK_API_KEY (необязателен)"  $DeepSeekApiKey  }
  if ($Provider -ne "xai")       { $XaiApiKey       = Read-SecretValue "XAI_API_KEY (необязателен)"       $XaiApiKey       }
  if ($Provider -ne "groq")      { $GroqApiKey      = Read-SecretValue "GROQ_API_KEY (необязателен)"      $GroqApiKey      }
  if ($Provider -ne "mistral")   { $MistralApiKey   = Read-SecretValue "MISTRAL_API_KEY (необязателен)"   $MistralApiKey   }

  Write-SetupStep "4. GitHub-токен" "GITHUB_PAT рекомендуется для сбора данных. Без него GitHub ограничивает количество запросов."
  $GithubPat = Read-SecretValue "GITHUB_PAT (рекомендуется)" $GithubPat

  Write-SetupStep "5. Необязательные настройки OpenAI" "Обычно оставить пустыми. Нужны только при кастомном endpoint или мультиаккаунтной организации."
  $OpenAiOrgId     = Read-PlainValue "OPENAI_ORG_ID (необязательно)"                    $OpenAiOrgId
  $OpenAiProjectId = Read-PlainValue "OPENAI_PROJECT_ID (необязательно)"                $OpenAiProjectId
  $LlmBaseUrl      = Read-PlainValue "LLM_BASE_URL (необязательно, кастомный endpoint)" $LlmBaseUrl

  Write-SetupStep "6. Лимиты запуска" "LLM_MAX_RECORDS ограничивает платные вызовы нейросети для тестового запуска."
  $LlmMaxRecords = Read-PlainValue "LLM_MAX_RECORDS (необязательно, пример: 20)" $LlmMaxRecords
  $githubRequestDefault = if ($GithubMaxSearchRequests) { $GithubMaxSearchRequests } else { "60" }
  $GithubMaxSearchRequests = Read-PlainValue "OTM_GITHUB_MAX_SEARCH_REQUESTS" $githubRequestDefault
}

# Предупреждения о пустых ключах
$providerKeyMap = @{
  "openai"    = @{ Key = $OpenAiApiKey;    Name = "OPENAI_API_KEY"    }
  "anthropic" = @{ Key = $AnthropicApiKey; Name = "ANTHROPIC_API_KEY" }
  "deepseek"  = @{ Key = $DeepSeekApiKey;  Name = "DEEPSEEK_API_KEY"  }
  "xai"       = @{ Key = $XaiApiKey;       Name = "XAI_API_KEY"       }
  "groq"      = @{ Key = $GroqApiKey;      Name = "GROQ_API_KEY"      }
  "mistral"   = @{ Key = $MistralApiKey;   Name = "MISTRAL_API_KEY"   }
}

if ($Provider -ne "ollama") {
  $entry = $providerKeyMap[$Provider]
  if ($entry -and -not $entry.Key) {
    Write-Warning "$($entry.Name) не задан: интерфейс запустится, но LLM-оценка работать не будет."
  }
}

if (-not $GithubPat) {
  Write-Warning "GITHUB_PAT не задан: сбор данных с GitHub может упереться в лимиты."
}

if (-not $GithubMaxSearchRequests) {
  $GithubMaxSearchRequests = "60"
}

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# OffensiveToolMapper local environment")
$lines.Add("# Created by scripts/setup_env.ps1. Do not commit this file.")
$lines.Add("")
$lines.Add("# LLM")
Add-EnvLine $lines "LLM_PROVIDER"  $Provider
Add-EnvLine $lines "LLM_MODEL"     $Model
Add-EnvLine $lines "LLM_BASE_URL"  $LlmBaseUrl
Add-EnvLine $lines "LLM_MAX_RECORDS" $LlmMaxRecords
$lines.Add("")
$lines.Add("# API-ключи нейросетей (заполни нужный)")
Add-EnvLine $lines "OPENAI_API_KEY"     $OpenAiApiKey
Add-EnvLine $lines "OPENAI_ORG_ID"      $OpenAiOrgId
Add-EnvLine $lines "OPENAI_PROJECT_ID"  $OpenAiProjectId
Add-EnvLine $lines "ANTHROPIC_API_KEY"  $AnthropicApiKey
Add-EnvLine $lines "DEEPSEEK_API_KEY"   $DeepSeekApiKey
Add-EnvLine $lines "XAI_API_KEY"        $XaiApiKey
Add-EnvLine $lines "GROQ_API_KEY"       $GroqApiKey
Add-EnvLine $lines "MISTRAL_API_KEY"    $MistralApiKey
$lines.Add("")
$lines.Add("# GitHub")
Add-EnvLine $lines "GITHUB_PAT"                      $GithubPat
Add-EnvLine $lines "OTM_COLLECT_MODE"                "incremental"
Add-EnvLine $lines "OTM_GITHUB_MIN_STARS"            "10"
Add-EnvLine $lines "OTM_GITHUB_MAX_RESULTS"          "100"
Add-EnvLine $lines "OTM_GITHUB_MAX_SEARCH_REQUESTS"  $GithubMaxSearchRequests
$lines.Add("")
$lines.Add("# Shiny/MCP")
Add-EnvLine $lines "OTM_MCP_TRANSPORT"            "http"
Add-EnvLine $lines "OTM_MCP_PORT"                 "3000"
Add-EnvLine $lines "OFFENSIVETOOLMAPPER_DATA_DIR" ""

Set-Content -LiteralPath $OutputPath -Value $lines -Encoding UTF8

Write-Host ""
Write-Host "Готово: создан $OutputPath"
Write-Host "Следующая команда:"
Write-Host "  docker compose up --build"
Write-Host ""
Write-Host "После запуска:"
Write-Host "  Shiny-приложение: http://localhost:8788"
Write-Host "  MCP-сервер:       http://localhost:3000"
