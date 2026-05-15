# OffensiveToolMapper

Инструкция по настройке и запуску проекта после клонирования репозитория.

## Что запускается

`docker compose up --build` поднимает два сервиса:

| Сервис | URL | Назначение |
| --- | --- | --- |
| Shiny-приложение | `http://localhost:8788` | основной интерфейс: обзор, аналитика, инструменты, MITRE-связи и pipeline |
| MCP-сервер | `http://localhost:3000` | HTTP MCP-сервер поверх готовых данных проекта |

Первый запуск возможен без собранных данных: интерфейсы откроются, но список инструментов может быть пустым. Реальные записи появляются после запуска pipeline.

## Требования

Для запуска через Docker:

- Docker Desktop;
- включённый Docker daemon;
- доступ к интернету для установки Docker/R-зависимостей при первой сборке.

Проверка Docker:

```powershell
docker info
docker compose version
```

Если `docker info` не подключается к Docker API, сначала запусти Docker Desktop.

Для локальных проверок без Docker дополнительно нужен R.

## Быстрый старт

```powershell
git clone https://github.com/w8ofdope/OffensiveToolMapper.git
cd OffensiveToolMapper
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

- `LLM provider`: только `openai` или `deepseek`, не API-ключ;
- `LLM model`: можно оставить значение по умолчанию;
- ключ выбранного LLM-провайдера: ввод скрытый, символы не отображаются;
- `GITHUB_PAT`: желательно указать, чтобы не упираться в низкие GitHub-лимиты;
- необязательные OpenAI/project/base URL настройки: обычно можно оставить пустыми;
- лимиты запусков: для теста можно поставить `LLM_MAX_RECORDS=20`, а `OTM_GITHUB_MAX_SEARCH_REQUESTS` оставить `60`.

Если нужные переменные уже установлены в системе, скрипт подхватит их и предложит оставить текущие значения через Enter.

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
| `OTM_MCP_TRANSPORT` | транспорт MCP, в Docker используется `http` |
| `OTM_MCP_PORT` | порт MCP HTTP-сервера |
| `OFFENSIVETOOLMAPPER_DATA_DIR` | директория артефактов; в Docker задаётся автоматически |

## Запуск сервисов

```powershell
docker compose up --build
```

Открыть:

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

После pipeline в Shiny-приложении должны появиться карточки инструментов, тактики и техники MITRE.

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
- загрузку Shiny-приложения.

Проверки по отдельности:

```powershell
docker compose config --quiet
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" data-raw\run_tests.R
```

## Проверка URL

После `docker compose up --build`:

```powershell
Invoke-WebRequest http://127.0.0.1:8788 -UseBasicParsing
```

Корневой путь MCP-сервера может возвращать `404`, потому что MCP обслуживает протокольные HTTP endpoints, а не обычную страницу.

## Частые проблемы

| Проблема | Решение |
| --- | --- |
| `failed to connect to docker API` | запустить Docker Desktop |
| Shiny-приложение пустое | заполнить `.env` и запустить pipeline |
| LLM-этапы не работают | проверить `LLM_PROVIDER` и ключ выбранного провайдера |
| GitHub быстро упирается в лимиты | проверить `GITHUB_PAT`, уменьшить `OTM_GITHUB_MAX_SEARCH_REQUESTS` для теста |
| `setup_env.ps1` не запускается | использовать `powershell -ExecutionPolicy Bypass -File .\scripts\setup_env.ps1` |

## Чистый перезапуск Docker

```powershell
docker compose down
docker compose up --build
```

Если нужно полностью пересоздать контейнеры и volumes:

```powershell
docker compose down -v
docker compose up --build
```
