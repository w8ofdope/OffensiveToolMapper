# OffensiveToolMapper

Инструкция по настройке и запуску проекта после клонирования репозитория.

## Что запускается

`docker compose up --build` поднимает три сервиса:

| Сервис | URL | Назначение |
| --- | --- | --- |
| Web UI | `http://localhost:5173` | основной интерфейс с инструментами и MITRE-связями |
| Shiny | `http://localhost:8788` | аналитическая панель и диагностика pipeline |
| MCP server | `http://localhost:3000` | HTTP MCP-сервер поверх готовых данных проекта |

Первый запуск возможен без собранных данных: интерфейсы откроются, но список инструментов может быть пустым. Реальные записи появляются после запуска pipeline.

## Требования

Для запуска через Docker:

- Docker Desktop;
- включённый Docker daemon;
- доступ к интернету для установки Docker/R/Node-зависимостей при первой сборке.

Проверка Docker:

```powershell
docker info
docker compose version
```

Если `docker info` не подключается к Docker API, сначала запусти Docker Desktop.

Для локальных проверок без Docker дополнительно нужны:

- R;
- Node.js;
- npm.

## Быстрый старт

```powershell
git clone https://github.com/KNikitaaa/CyberSecML-NetAdmins.git
cd CyberSecML-NetAdmins
.\scripts\setup_env.ps1
docker compose up --build
```

Если PowerShell запрещает запуск `.ps1`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup_env.ps1
docker compose up --build
```

## Настройка `.env`

Проект читает настройки из `.env` в корне репозитория. Этот файл не коммитится.

Самый удобный способ создать `.env` на Windows:

```powershell
.\scripts\setup_env.ps1
```

Скрипт спросит:

- `LLM provider`: `openai` или `deepseek`;
- `LLM model`;
- ключ выбранного LLM-провайдера;
- `GITHUB_PAT`;
- необязательные OpenAI/project/base URL настройки;
- лимит GitHub-запросов.

Ручной способ:

```powershell
Copy-Item .env.example .env
notepad .env
```

Linux/macOS:

```bash
cp .env.example .env
```

## Обязательные ключи

Для полноценного pipeline нужны:

- `GITHUB_PAT` — GitHub Personal Access Token;
- один LLM-ключ: `OPENAI_API_KEY` или `DEEPSEEK_API_KEY`.

OpenAI:

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-4.1-mini
OPENAI_API_KEY=sk-...
GITHUB_PAT=github_pat_...
```

DeepSeek:

```env
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
DEEPSEEK_API_KEY=sk-...
GITHUB_PAT=github_pat_...
```

Обычно можно оставить пустыми:

- `OPENAI_ORG_ID`;
- `OPENAI_PROJECT_ID`;
- `LLM_BASE_URL`;
- `LLM_MAX_RECORDS`.

Обычно не нужно менять:

- `MODERN_UI_URL`;
- `OTM_MCP_TRANSPORT`;
- `OTM_MCP_PORT`;
- `OFFENSIVETOOLMAPPER_DATA_DIR`.

## Все переменные `.env`

| Переменная | Когда нужна |
| --- | --- |
| `LLM_PROVIDER` | всегда: `openai` или `deepseek` |
| `LLM_MODEL` | всегда: модель выбранного провайдера |
| `OPENAI_API_KEY` | если `LLM_PROVIDER=openai` |
| `DEEPSEEK_API_KEY` | если `LLM_PROVIDER=deepseek` |
| `GITHUB_PAT` | для GitHub-сбора |
| `OPENAI_ORG_ID` | только если требуется OpenAI-аккаунтом |
| `OPENAI_PROJECT_ID` | только если требуется OpenAI-аккаунтом |
| `LLM_BASE_URL` | только для кастомного OpenAI-compatible endpoint |
| `LLM_MAX_RECORDS` | для ограничения LLM-запросов в тестовом запуске |
| `OTM_COLLECT_MODE` | `incremental` или `snapshot` |
| `OTM_GITHUB_MIN_STARS` | минимальное число stars для GitHub discovery |
| `OTM_GITHUB_MAX_RESULTS` | лимит результатов GitHub discovery |
| `OTM_GITHUB_MAX_SEARCH_REQUESTS` | лимит GitHub search-запросов за запуск |
| `MODERN_UI_URL` | URL web UI для Shiny |
| `OTM_MCP_TRANSPORT` | транспорт MCP, в Docker используется `http` |
| `OTM_MCP_PORT` | порт MCP HTTP-сервера |
| `OFFENSIVETOOLMAPPER_DATA_DIR` | директория артефактов; в Docker задаётся автоматически |

## Запуск сервисов

```powershell
docker compose up --build
```

Открыть:

- `http://localhost:5173`;
- `http://localhost:8788`;
- `http://localhost:3000`.

Остановить:

```powershell
docker compose down
```

## Сбор данных

Для короткой проверки можно временно указать в `.env`:

```env
LLM_MAX_RECORDS=20
OTM_GITHUB_MAX_SEARCH_REQUESTS=10
```

Запуск pipeline внутри Docker:

```powershell
docker compose run --rm shiny-app Rscript data-raw/run_full_pipeline.R
docker compose up --build
```

После pipeline в web UI должны появиться карточки инструментов, тактики и техники MITRE.

## Проверка проекта

Полная локальная проверка:

```powershell
.\scripts\check_project.ps1
```

Скрипт проверяет:

- создание временного `.env`;
- `docker compose config`;
- доступность Docker daemon;
- R-тесты;
- экспорт данных для web UI;
- `npm audit`;
- сборку web UI.

Проверки по отдельности:

```powershell
docker compose config --quiet
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" data-raw\run_tests.R
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" data-raw\export_webapp_data.R
cd webapp
npm audit
npm run build
cd ..
```

## Проверка URL

После `docker compose up --build`:

```powershell
Invoke-WebRequest http://127.0.0.1:5173 -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:8788 -UseBasicParsing
```

Корневой путь MCP-сервера может возвращать `404`, потому что MCP обслуживает протокольные HTTP endpoints, а не обычную страницу.

## Частые проблемы

| Проблема | Решение |
| --- | --- |
| `failed to connect to docker API` | запустить Docker Desktop |
| Web UI пустой | заполнить `.env` и запустить pipeline |
| LLM-этапы не работают | проверить `LLM_PROVIDER` и ключ выбранного провайдера |
| GitHub быстро упирается в лимиты | проверить `GITHUB_PAT`, уменьшить `OTM_GITHUB_MAX_SEARCH_REQUESTS` для теста |
| `setup_env.ps1` не запускается | использовать `powershell -ExecutionPolicy Bypass -File .\scripts\setup_env.ps1` |
| `modern-ui` падает на Windows `node_modules` | в compose используется отдельный volume `webapp_node_modules`; перезапусти `docker compose up --build` |

## Чистый перезапуск Docker

```powershell
docker compose down
docker compose up --build
```

Если нужно пересоздать volume с Node-зависимостями контейнера:

```powershell
docker compose down -v
docker compose up --build
```
