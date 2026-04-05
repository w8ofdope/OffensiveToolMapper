# OffensiveToolMapper

OffensiveToolMapper — это R-пакет и набор runtime-скриптов для сбора offensive security tooling из открытых источников, нормализации и дедупликации кандидатов, LLM-оценки, MITRE ATT&CK mapping, run-to-run аналитики и выдачи результата через три интерфейса:

- Shiny dashboard для аналитики и наблюдения за pipeline;
- React/Vite webapp для более продуктового UI-слоя;
- MCP server для AI-агентов и внешних ассистентов.

README ниже заменяет старую краткую памятку и описывает проект как систему: архитектуру, данные, функции, entrypoint-ы, хранение, запуск, тесты, документацию и ограничения.

## Содержание

1. [Назначение проекта](#назначение-проекта)
2. [Архитектура](#архитектура)
3. [Pipeline по стадиям](#pipeline-по-стадиям)
4. [Источники данных](#источники-данных)
5. [Слои хранения и артефакты](#слои-хранения-и-артефакты)
6. [Основные функции и модули](#основные-функции-и-модули)
7. [Сценарии запуска](#сценарии-запуска)
8. [Переменные окружения](#переменные-окружения)
9. [UI-слои](#ui-слои)
10. [MCP server](#mcp-server)
11. [Docker Compose](#docker-compose)
12. [Тесты и документация](#тесты-и-документация)
13. [Структура репозитория](#структура-репозитория)
14. [Текущие ограничения и особенности](#текущие-ограничения-и-особенности)
15. [Быстрые команды](#быстрые-команды)

## Назначение проекта

Проект предназначен для построения воспроизводимого intelligence pipeline по offensive tooling:

- собирать кандидатов из открытых источников;
- фильтровать documentation-like и нерелевантные объекты до LLM;
- оценивать кандидатов через unified LLM assessment;
- маппить инструменты на MITRE ATT&CK;
- накапливать историю прогонов и сравнивать `run_id` между собой;
- экспортировать результат в аналитические и агентные интерфейсы.

Типовой сценарий использования:

1. Запустить полный pipeline.
2. Получить current-state в DuckDB и `inst/extdata/*.rds`.
3. Открыть Shiny или modern UI.
4. При необходимости сравнить новый `run_id` с предыдущим.
5. Использовать MCP tools для поиска и классификации.

## Архитектура

Система состоит из пяти крупных слоёв.

### 1. ETL-слой

Собирает сырой материал из:

- GitHub API;
- Packet Storm;
- RSS/Atom feeds;
- MITRE ATT&CK STIX.

На практике по умолчанию основной источник сейчас — GitHub. RSS и Packet Storm реализованы, но по дефолту отключены конфигурацией.

### 2. Normalize-слой

Преобразует разноформатные raw-источники в единый canonical слой:

- вычисляет stable identity;
- чистит и нормализует поля;
- применяет pre-LLM scoring;
- отсеивает markdown-only и documentation-like репозитории;
- подготавливает кандидатов для assessment stage.

### 3. LLM-слой

Содержит два направления:

- основной `unified one-call assessment`;
- legacy validation/enrichment path как fallback.

Основной assessment возвращает:

- `is_relevant`;
- `entity_type`;
- русскоязычные summary/purpose/capabilities;
- confidence и supporting reasoning;
- MITRE tactics и MITRE techniques.

### 4. Visualization-слой

Формирует UI-ready слой:

- rank и composite scoring;
- MITRE matrix для UI;
- history layer для отображения динамики;
- refinement backlog по retrieval-кандидатам.

### 5. Delivery-слой

Результаты выдаются через:

- Shiny dashboard;
- React/Vite modern UI;
- MCP server.

## Pipeline по стадиям

Главная orchestration-логика находится в `R/pipeline.R`.

Стандартный полный запуск состоит из следующих стадий:

| Стадия | Что делает | Основные выходы |
| --- | --- | --- |
| `collect` | собирает raw data, логирует поисковые запросы, выполняет incremental merge или snapshot replace | `raw_github.rds`, `raw_packetstorm.rds`, `raw_rss.rds`, `github_search_log.rds` |
| `normalize` | нормализует raw-слои в единый candidate layer, вычисляет stable `record_id`, pre-LLM scoring | `normalized_tools.rds` |
| `validation` | legacy enrichment path, сейчас не основной маршрут | `validation_enrichment_results.rds` |
| `assessment` | unified LLM assessment и generation MITRE mappings | `tool_assessment_results.rds`, `relevant_tools.rds`, `tool_mitre_mappings.rds`, `llm_processing_queue.rds` |
| `refine_mitre` | retrieval-first refinement по MITRE ATT&CK | `mitre_refinement_candidates.rds`, `mitre_refinement_index.rds` |
| `visualize` | строит UI-facing слой и history | `visualization_tools.rds`, `visualization_tool_matrix.rds`, `visualization_tool_history.rds` |
| `export_webapp` | экспортирует JSON для React | `webapp/public/data/*.json` |
| `sanity_checks` | проверяет целостность pipeline output | `pipeline_sanity_checks.rds`, `.json` |

### Preflight-поведение

`run_pipeline_from()` умеет сначала добирать backlog уже найденных normalized candidates перед новым collect. Поэтому в status можно увидеть preflight-стадии:

- `preflight_assessment`
- `preflight_refine_mitre`
- `preflight_visualize`
- `preflight_export_webapp`

Это не отдельный pipeline, а часть orchestration-логики для reuse существующего state.

### Collect mode

Есть два режима:

- `incremental` — режим по умолчанию; использует merge с существующим raw-state и продолжает GitHub rotation по `github_search_state.rds`;
- `snapshot` — полный rebuild текущего raw-layer без incremental merge.

### Run history

Каждый запуск получает `run_id`.

История фиксируется в DuckDB через:

- `pipeline_status`
- `pipeline_stage_history`
- `pipeline_storage_snapshots`
- `*_history` таблицы для raw, normalized, assessment, relevant, MITRE, queue, visualization и sanity layers.

Именно на этом строится run comparison в Shiny.

## Источники данных

### GitHub

Главный discovery source. Логика в `R/etl_github.R`.

Что уже реализовано:

- curated query portfolio;
- topic discovery;
- seed-name discovery;
- rolling recency windows;
- language shards;
- topic+language shards;
- star-band discovery;
- pagination и разные `sort_modes`;
- request rotation между incremental runs;
- логирование реальных API search requests.

Основные параметры:

- `GITHUB_PAT`
- `OTM_GITHUB_MIN_STARS`
- `OTM_GITHUB_MAX_RESULTS`
- `OTM_GITHUB_MAX_SEARCH_REQUESTS`

### Packet Storm

Логика в `R/etl_packetstorm.R`.

Возможности:

- scraping feed/manual URL path;
- graceful degradation, если upstream ведёт себя нестабильно;
- optional linked-content enrichment.

Сейчас по умолчанию не даёт runtime traffic, если не задана конфигурация категорий или manual URLs.

### RSS/Atom

Логика в `R/etl_rss.R`.

Возможности:

- сбор feed metadata и items;
- categories и linked page content;
- безопасная деградация, если feed отсутствует.

По умолчанию feed list пустой, поэтому RSS collection отключён.

### MITRE ATT&CK

Логика в `R/etl_mitre.R`.

Выходной датасет:

- `data/mitre_attack.rda`

Используется в:

- LLM mapping validation;
- visualization matrix;
- retrieval refinement index.

## Слои хранения и артефакты

## DuckDB как primary storage

Файл:

- `inst/extdata/offensive_tool_mapper.duckdb`

Это основной storage layer. `.rds` используются как совместимые snapshots, export layer и fallback.

### Current tables

- `raw_github`
- `raw_packetstorm`
- `raw_rss`
- `normalized_candidates`
- `llm_assessments`
- `relevant_tools`
- `mitre_mappings`
- `llm_processing_queue`
- `visualization_tools`
- `visualization_tool_matrix`
- `pipeline_status`
- `pipeline_sanity_checks`
- `github_search_log`

### History tables

- `raw_github_history`
- `raw_packetstorm_history`
- `raw_rss_history`
- `normalized_candidates_history`
- `llm_assessments_history`
- `relevant_tools_history`
- `mitre_mappings_history`
- `llm_processing_queue_history`
- `pipeline_sanity_checks_history`
- `github_search_log_history`
- `pipeline_stage_history`
- `pipeline_storage_snapshots`

### RDS artifacts в `inst/extdata/`

Основные файлы:

- `raw_github.rds`
- `raw_packetstorm.rds`
- `raw_rss.rds`
- `normalized_tools.rds`
- `tool_assessment_results.rds`
- `relevant_tools.rds`
- `tool_mitre_mappings.rds`
- `llm_processing_queue.rds`
- `mitre_refinement_index.rds`
- `mitre_refinement_candidates.rds`
- `visualization_tools.rds`
- `visualization_tool_matrix.rds`
- `visualization_tool_history.rds`
- `pipeline_status.rds`
- `pipeline_sanity_checks.rds`
- `github_search_log.rds`
- `github_search_state.rds`
- `pipeline_batch_summary.rds`

### JSON artifacts

Параллельные JSON snapshots:

- `pipeline_status.json`
- `pipeline_sanity_checks.json`
- `github_search_log.json`
- `pipeline_batch_summary.json`

Webapp export:

- `webapp/public/data/tools.json`
- `webapp/public/data/matrix.json`
- `webapp/public/data/refinement.json`
- `webapp/public/data/summary.json`

## Основные функции и модули

Ниже перечислены ключевые функции проекта. Важно: экспортируемой через `NAMESPACE` сейчас является только `run_mcp_server()`, но reference docs покрывают и ключевые внутренние orchestrating functions.

### Оркестрация и storage

| Файл | Функция | Назначение |
| --- | --- | --- |
| `R/pipeline.R` | `run_full_pipeline()` | полный orchestrated run от collect до export/sanity |
| `R/pipeline.R` | `run_pipeline_from()` | запуск pipeline с произвольной стадии и optional resume |
| `R/storage_duckdb.R` | `init_pipeline_duckdb()` | инициализация DuckDB |
| `R/storage_duckdb.R` | `write_duckdb_table()` | запись current table |
| `R/storage_duckdb.R` | `append_duckdb_table()` | append в history table |
| `R/storage_duckdb.R` | `read_duckdb_table()` | чтение current/history table |
| `R/storage_duckdb.R` | `load_pipeline_table()` | чтение из DuckDB с RDS fallback |
| `R/utils_core.R` | `save_pipeline_rds()` | безопасная запись `.rds` |
| `R/utils_core.R` | `load_pipeline_rds()` | безопасная загрузка `.rds` |
| `R/utils_core.R` | `ensure_dir()` | создание директорий |
| `R/utils_core.R` | `log_message()` | стандартизированное runtime logging |

### ETL и источники

| Файл | Функция | Назначение |
| --- | --- | --- |
| `R/etl_github.R` | `collect_github_tools()` | полный GitHub collect + save raw artifact |
| `R/etl_github.R` | `search_github_tools()` | GitHub search orchestration |
| `R/etl_github.R` | `fetch_repo_details()` | нормализованные metadata по конкретному repo |
| `R/etl_github.R` | `get_default_github_queries()` | базовый GitHub query portfolio |
| `R/etl_github.R` | `get_default_github_topics()` | default topic discovery set |
| `R/etl_github.R` | `get_default_github_seed_names()` | default seed-name discovery set |
| `R/etl_github.R` | `get_default_github_search_modes()` | default search sort modes |
| `R/etl_packetstorm.R` | `scrape_packetstorm()` | Packet Storm ETL |
| `R/etl_packetstorm.R` | `get_default_packetstorm_categories()` | default categories helper |
| `R/etl_rss.R` | `fetch_security_feeds()` | RSS/Atom ETL |
| `R/etl_rss.R` | `get_default_feeds()` | default feeds helper |
| `R/etl_mitre.R` | `fetch_mitre_attack_data()` | download and parse ATT&CK data |
| `R/etl_mitre.R` | `parse_mitre_tactics()` | tactic parsing |
| `R/etl_mitre.R` | `parse_mitre_techniques()` | technique parsing |
| `R/etl_mitre.R` | `save_mitre_attack_dataset()` | сохранение ATT&CK dataset |

### Normalize и pre-LLM screening

| Файл | Функция | Назначение |
| --- | --- | --- |
| `R/normalize.R` | `normalize_raw_data()` | сборка canonical normalized layer |
| `R/normalize.R` | внутренние `.normalize_*` helpers | identity, dedup, priority scoring, noise filtering |

Что важно в normalize-слое:

- canonical URL/name normalization;
- source-aware dedup;
- record identity stability;
- pre-LLM scoring и priority buckets;
- filtering документационных, markdown-only и нерелевантных кандидатов.

### LLM и contracts

| Файл | Функция | Назначение |
| --- | --- | --- |
| `R/llm_provider.R` | `get_default_llm_provider()` | default provider selection |
| `R/llm_provider.R` | `get_llm_runtime_config()` | provider/model/base_url/api_key availability |
| `R/llm_provider.R` | `get_llm_api_key()` | API key resolution |
| `R/llm_provider.R` | `get_default_llm_max_records()` | runtime cap на LLM batch |
| `R/llm_assessment.R` | `run_unified_tool_assessment()` | основной unified one-call assessment |
| `R/llm_contracts.R` | `get_unified_tool_assessment_schema()` | JSON schema для unified assessment |
| `R/llm_contracts.R` | `parse_unified_tool_assessment_json()` | parser результата assessment |
| `R/llm_validation.R` | `run_validation_enrichment()` | legacy validation/enrichment stage |
| `R/llm_validation.R` | `build_validation_enrichment_prompt()` | prompt builder для fallback path |

### MITRE refinement

| Файл | Функция | Назначение |
| --- | --- | --- |
| `R/rag_refinement.R` | `build_mitre_refinement_index()` | индекс ATT&CK для retrieval |
| `R/rag_refinement.R` | `retrieve_relevant_techniques()` | top-k retrieval candidates |
| `R/rag_refinement.R` | `run_mitre_refinement()` | полный refinement stage |

`mitre_refinement_candidates.rds` — это candidate layer, а не подтверждённый mapping-layer. Он используется как review backlog поверх официальных `mitre_mappings`.

### Visualization и export

| Файл | Функция | Назначение |
| --- | --- | --- |
| `R/visualization_data.R` | `build_visualization_dataset()` | строит UI-ready tools и matrix layer |
| `R/webapp_export.R` | `export_webapp_data()` | экспортирует JSON для React |
| `R/viz_tools.R` | `plot_tools_by_source()` | distribution plot по источникам |
| `R/viz_tools.R` | `plot_top_tools()` | top tools visualization |
| `R/viz_tools.R` | `plot_confidence_distribution()` | confidence plot |
| `R/viz_matrix.R` | `get_mitre_matrix()` | matrix data helper |

### MCP

| Файл | Функция | Назначение |
| --- | --- | --- |
| `R/mcp_server.R` | `run_mcp_server()` | старт MCP server |
| `R/mcp_server.R` | `build_mcp_server()` | сборка server object |
| `R/mcp_server.R` | `search_tools()` | поиск по visualization layer |
| `R/mcp_server.R` | `get_tool_ttps()` | получить TTPS для конкретного tool |
| `R/mcp_server.R` | `get_technique_tools()` | reverse lookup: technique -> tools |
| `R/mcp_server.R` | `get_statistics()` | сводная статистика |
| `R/mcp_server.R` | `classify_new_tool()` | ad hoc classification для нового tool description |

## Сценарии запуска

Все команды ниже предполагают рабочую директорию корня репозитория.

### Полный pipeline

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" "data-raw/run_full_pipeline.R"
```

Этот скрипт:

- читает provider/runtime config;
- запускает `run_full_pipeline()`;
- по умолчанию использует `incremental` collect mode;
- включает MITRE refinement;
- экспортирует JSON для webapp.

### Verification run с diff к предыдущему `run_id`

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" "data-raw/verify_full_pipeline_run.R"
```

Используется для operational validation. После прогона печатает:

- текущий `run_id`;
- diff по relevant tools;
- diff по MITRE mappings;
- sanity check summary.

### Batch pipeline

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" "data-raw/run_full_pipeline_batch.R" 5
```

Или:

```powershell
powershell -ExecutionPolicy Bypass -File .\data-raw\run_full_pipeline_batch.ps1 -Runs 5
```

Batch mode нужен для последовательного обхода GitHub query rotation и накопления истории в `pipeline_batch_summary.rds`.

### Только unified assessment

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" "data-raw/run_unified_tool_assessment.R"
```

### Только visualization build

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" "data-raw/build_visualization_data.R"
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" "data-raw/export_webapp_data.R"
```

### Только MITRE refinement

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" "data-raw/run_mitre_refinement.R"
```

### Запуск Shiny и React вместе

```powershell
powershell -ExecutionPolicy Bypass -File .\data-raw\run_modern_webapp.ps1
```

Что делает launcher:

1. пересобирает `webapp/public/data/*.json` через `export_webapp_data.R`;
2. поднимает Vite, если порт `5173` свободен;
3. поднимает Shiny, если порт `8788` свободен;
4. открывает dashboard URL.

Ожидаемые адреса:

- Shiny: `http://127.0.0.1:8788`
- Modern UI: `http://127.0.0.1:5173`

### Запуск только Shiny

```powershell
powershell -ExecutionPolicy Bypass -File .\data-raw\run_shiny_dashboard.ps1
```

### Запуск только Vite webapp

```powershell
powershell -ExecutionPolicy Bypass -File .\data-raw\run_vite_webapp.ps1
```

### Тесты

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" "data-raw/run_tests.R"
```

Используется `testthat::test_local(load_package = "source")`.

### Пересборка docs

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" "data-raw/build_docs.R"
```

Для pkgdown:

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" "data-raw/build_docs.R" --pkgdown
```

Скрипт:

- генерирует `NAMESPACE` и `man/*.Rd` через `roxygen2`;
- при `--pkgdown` ищет локальный Pandoc и строит сайт в `docs/`.

## Переменные окружения

Готовый шаблон лежит в `.env.example`.

### Ключевые runtime variables

| Переменная | Назначение | Значение по умолчанию |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | API key для DeepSeek | пусто |
| `OPENAI_API_KEY` | API key для OpenAI | пусто |
| `GITHUB_PAT` | GitHub Personal Access Token | пусто |
| `LLM_PROVIDER` | provider for assessment | `deepseek` |
| `LLM_MODEL` | override модели | provider default |
| `LLM_BASE_URL` | override endpoint | provider default |
| `LLM_MAX_RECORDS` | cap на число обрабатываемых records | без лимита |
| `OFFENSIVETOOLMAPPER_DATA_DIR` | директория артефактов | `inst/extdata` или `/app/inst/extdata` в Docker |
| `MODERN_UI_URL` | URL modern UI для Shiny и launcher-ов | `http://localhost:5173` |
| `OTM_MCP_TRANSPORT` | transport MCP server | `stdio` локально, `http` в compose |
| `OTM_MCP_PORT` | порт MCP HTTP server | `3000` |
| `OTM_COLLECT_MODE` | режим collect | `incremental` |
| `OTM_GITHUB_MIN_STARS` | global floor для GitHub discovery | `10` |
| `OTM_GITHUB_MAX_RESULTS` | max results per query window | `100` |
| `OTM_GITHUB_MAX_SEARCH_REQUESTS` | max GitHub search requests per run | `60` |

### Пример локальной конфигурации PowerShell

```powershell
$env:DEEPSEEK_API_KEY = [System.Environment]::GetEnvironmentVariable("DEEPSEEK_API_KEY", "User")
$env:GITHUB_PAT = [System.Environment]::GetEnvironmentVariable("GITHUB_PAT", "User")
$env:OTM_COLLECT_MODE = "incremental"
$env:OTM_GITHUB_MAX_SEARCH_REQUESTS = "30"
```

## UI-слои

### Shiny dashboard

Путь:

- `inst/shiny/app.R`

Назначение:

- классический аналитический UI поверх R artifacts и DuckDB history;
- наблюдение за pipeline runtime;
- run comparison;
- backlog и refinement visibility.

Что читает:

- `visualization_tools.rds`
- `visualization_tool_matrix.rds`
- `visualization_tool_history.rds`
- `tool_assessment_results.rds`
- `llm_processing_queue.rds`
- `pipeline_status.rds`
- `pipeline_sanity_checks.rds`
- `github_search_log.rds`
- `pipeline_batch_summary.rds`
- DuckDB history tables для comparison.

Ключевые разделы UI:

- tools browser;
- MITRE coverage;
- plots;
- pipeline and runtime status;
- run comparison;
- LLM queue;
- batch/search observability.

### React/Vite webapp

Путь:

- `webapp/`

Стек:

- React 18;
- Vite;
- Recharts;
- lucide-react.

Что читает:

- `webapp/public/data/tools.json`
- `webapp/public/data/matrix.json`
- `webapp/public/data/refinement.json`
- `webapp/public/data/summary.json`

Основные возможности:

- overview metrics;
- analytics panels;
- refinement backlog display;
- explorer по tools и MITRE mappings.

## MCP server

Entry point:

- `inst/mcp/run_server.R`

Основная функция:

- `run_mcp_server()`

Режимы:

- `stdio`
- `http`

### Локальный запуск в stdio

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" ".\inst\mcp\run_server.R"
```

### Локальный запуск в HTTP

```powershell
$env:OTM_MCP_TRANSPORT = "http"
$env:OTM_MCP_PORT = "3000"
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" ".\inst\mcp\run_server.R"
```

### MCP tools

- `search_tools`
- `get_tool_ttps`
- `get_technique_tools`
- `get_statistics`
- `classify_new_tool`

### Пример VS Code MCP config

```json
{
  "mcp": {
    "servers": {
      "offensive-tool-mapper": {
        "type": "stdio",
        "command": "Rscript",
        "args": [
          "c:/path/to/OffensiveToolMapper/inst/mcp/run_server.R"
        ]
      }
    }
  }
}
```

## Docker Compose

`docker-compose.yml` поднимает три сервиса:

- `shiny-app` на `8788`;
- `modern-ui` на `5173`;
- `mcp-server` на `3000`.

### Быстрый старт

```bash
cp .env.example .env
docker compose up --build
```

### Что делает compose

- поднимает R-образ через `Dockerfile`;
- монтирует репозиторий как volume;
- перед запуском Shiny выполняет `data-raw/export_webapp_data.R`;
- запускает Vite dev server в `webapp/`;
- запускает MCP server в HTTP-режиме.

Переменные из `.env.example`, которые реально используются compose по умолчанию:

- `DEEPSEEK_API_KEY`
- `OPENAI_API_KEY`
- `GITHUB_PAT`
- `LLM_PROVIDER`
- `LLM_MODEL`
- `LLM_BASE_URL`
- `LLM_MAX_RECORDS`
- `OFFENSIVETOOLMAPPER_DATA_DIR=/app/inst/extdata`
- `MODERN_UI_URL=http://localhost:5173`
- `OTM_MCP_TRANSPORT=http`
- `OTM_MCP_PORT=3000`

## Тесты и документация

### Тесты

Тестовый контур находится в:

- `tests/testthat/`
- `tests/testthat.R`

Локальный запуск:

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" "data-raw/run_tests.R"
```

### Reference docs

Reference docs генерируются `roxygen2` в:

- `man/*.Rd`

Сейчас в репозитории уже присутствуют более 50 `.Rd` topics, включая pipeline, ETL, MCP и utility functions.

### Vignettes

- `vignettes/introduction.Rmd`
- `vignettes/data-pipeline.Rmd`

### Pkgdown

Сайт документации собирается в:

- `docs/`

Полезные файлы:

- `_pkgdown.yml`
- `docs/index.html`
- `docs/reference/`
- `docs/articles/`

## Структура репозитория

```text
OffensiveToolMapper/
├─ R/                       package modules: ETL, normalize, LLM, pipeline, storage, MCP
├─ data-raw/                runtime scripts and operational entrypoints
├─ data/                    packaged data, including mitre_attack.rda
├─ inst/
│  ├─ extdata/              runtime artifacts, RDS snapshots, DuckDB, JSON status files
│  ├─ shiny/                Shiny dashboard
│  └─ mcp/                  MCP launcher
├─ webapp/                  React/Vite frontend
├─ tests/                   testthat suite
├─ man/                     generated reference docs
├─ vignettes/               long-form package docs
├─ docs/                    pkgdown site
├─ DESCRIPTION              package metadata
├─ NAMESPACE                generated exports
├─ Dockerfile               container image for Shiny/MCP runtime
├─ docker-compose.yml       multi-service local stack
├─ README.md                this document
├─ STATUS.md                concise current-state snapshot
└─ Technical_Requirements.pdf project requirements and scope notes
```

## Текущие ограничения и особенности

### 1. GitHub — основной рабочий источник

На текущем этапе project defaults фактически ориентированы на GitHub-only discovery. RSS и Packet Storm есть в коде, но дефолтная конфигурация их не активирует.

### 2. Default collect mode — incremental

Повторные запуски продолжают query rotation и накапливают state в DuckDB/history tables. Это удобно для discovery, но важно помнить, что два последовательных запуска смотрят не один и тот же кусок search plan.

### 3. Default GitHub request budget — 60

Если не задан env override, runtime scripts берут `OTM_GITHUB_MAX_SEARCH_REQUESTS=60`. Для ручного контроля rate-limit можно временно задавать меньше, например `30`.

### 4. DeepSeek — default provider

Если `LLM_PROVIDER` не задан, assessment по умолчанию идёт через DeepSeek. OpenAI — fallback path.

### 5. Refinement layer не равен официальному mapping layer

`mitre_refinement_candidates.rds` содержит candidate suggestions. Это review backlog, а не подтверждённые MITRE links.

### 6. DuckDB — primary source of truth

История и current-state должны интерпретироваться прежде всего через DuckDB. `.rds` — это совместимый snapshot/export слой, а не единственное хранилище.

### 7. В package export минималистичный публичный API

Через `NAMESPACE` экспортируется `run_mcp_server()`. Основные orchestration и ETL-функции документированы и используются скриптами напрямую, но не объявлены как классический внешний package API.

## Быстрые команды

### Полный pipeline

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" "data-raw/run_full_pipeline.R"
```

### Verification run

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" "data-raw/verify_full_pipeline_run.R"
```

### Batch run

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" "data-raw/run_full_pipeline_batch.R" 5
```

### Shiny + React

```powershell
powershell -ExecutionPolicy Bypass -File .\data-raw\run_modern_webapp.ps1
```

### Только Shiny

```powershell
powershell -ExecutionPolicy Bypass -File .\data-raw\run_shiny_dashboard.ps1
```

### MCP stdio

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" ".\inst\mcp\run_server.R"
```

### Тесты

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" "data-raw/run_tests.R"
```

### Docs

```powershell
& "C:\Program Files\R\R-4.5.1\bin\Rscript.exe" "data-raw/build_docs.R"
```

## Статус проекта

Актуальная короткая operational сводка лежит в `STATUS.md`.
