# Статус проекта OffensiveToolMapper

Этот файл кратко фиксирует текущее состояние проекта: что уже реализовано, где смотреть результаты и что ещё остаётся сделать.

## Что уже готово

Сейчас в проекте уже реализованы:

- каркас R-пакета;
- helper-слой для логирования, сохранения артефактов и безопасных запросов;
- ETL для MITRE ATT&CK;
- ETL для GitHub;
- ETL для RSS/Atom;
- ETL для PacketStorm с graceful degradation, если upstream не отдаёт нормальный RSS/XML;
- мастер-скрипт первичного raw ETL;
- нормализация raw-источников в единый canonical слой;
- pre-LLM scoring и приоритизация кандидатов;
- deterministic filtering для documentation-like и Markdown-only non-executable GitHub-репозиториев;
- unified one-call LLM assessment на уровне кода и тестов;
- provider-aware LLM слой с DeepSeek как default provider и OpenAI как fallback path;
- DuckDB-first storage layer для current-state и history по raw/normalized/assessment слоям;
- legacy LLM validation/enrichment stage оставлен как fallback path;
- JSON-контракты и парсеры для двух LLM-этапов;
- incremental GitHub rotation state между повторными pipeline-запусками;
- логирование реальных GitHub search requests в отдельный search-log artifact;
- post-run sanity checks с записью в RDS/JSON/DuckDB;
- более стабильный canonical identity/dedup для normalized candidates;
- batch launcher для нескольких последовательных full pipeline запусков с сохранением истории;
- тесты для helper, ETL, normalizer и LLM contracts;
- MCP server на `mcpr` с tool-операциями поверх visualization layer;
- packaging templates: `Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md`;
- workspace-настройки для auto-save и более бесшовной локальной работы;
- `.Rproj` файл для быстрого открытия проекта в RStudio.

## Где смотреть результаты

### MITRE ATT&CK

Файл:

- `data/mitre_attack.rda`

Как посмотреть в R:

```r
load("data/mitre_attack.rda")
View(mitre_attack)
head(mitre_attack)
str(mitre_attack)
```

Что внутри:

- `technique_id`
- `technique_name`
- `tactic_name`
- `tactic_shortname`
- `description`

Где это создаётся:

- `R/etl_mitre.R`
- `data-raw/refresh_mitre_attack.R`

### GitHub raw-слой

Файл:

- `inst/extdata/raw_github.rds`

Как посмотреть в R:

```r
github_raw <- readRDS("inst/extdata/raw_github.rds")
View(github_raw)
head(github_raw[, c("full_name", "stargazers_count", "language", "matched_query_text")])
```

Основные поля:

- `owner`
- `repo`
- `full_name`
- `html_url`
- `api_url`
- `description`
- `language`
- `topics`
- `stargazers_count`
- `forks_count`
- `open_issues_count`
- `archived`
- `readme`
- `matched_queries`
- `matched_query_text`
- `matched_search_modes`
- `matched_search_mode_text`
- `search_score`

Где это создаётся:

- `R/etl_github.R`

### GitHub search log и batch history

Файлы:

- `inst/extdata/github_search_log.rds`
- `inst/extdata/github_search_log.json`
- `inst/extdata/pipeline_batch_summary.rds`
- `inst/extdata/pipeline_batch_summary.json`

Как посмотреть в R:

```r
github_search_log <- readRDS("inst/extdata/github_search_log.rds")
batch_summary <- readRDS("inst/extdata/pipeline_batch_summary.rds")

View(github_search_log)
View(batch_summary)
```

Что внутри `github_search_log`:

- `executed_at`
- `request_index`
- `query_family`
- `query_tier`
- `search_sort`
- `search_page`
- `returned_rows`
- `unique_candidates_after_request`
- `search_query`

Что внутри `pipeline_batch_summary`:

- `run_index`
- `batch_id`
- `batch_iteration`
- `requested_runs`
- `status`
- `duration_seconds`
- `github_new_rows`
- `github_request_offset`
- `github_next_request_offset`
- `github_rotation_progress_percent`
- `github_query_families`

Что важно сейчас:

- `github_search_log` показывает реальные запросы, которые ушли в GitHub во время последнего collect stage;
- `pipeline_batch_summary` накапливает историю batch-прогонов, а не только один последний запуск;
- оба артефакта отображаются в Shiny на вкладке Pipeline;
- на вкладке Pipeline теперь есть отдельный run comparison layer: можно выбрать два `run_id` из DuckDB и посмотреть summary-diff, stage-by-stage diff, изменения в `relevant_tools` и diff по `mitre_mappings` между прогонами;
- batch launcher запускается через `data-raw/run_full_pipeline_batch.R` или `data-raw/run_full_pipeline_batch.ps1`.

### DuckDB primary storage

Файл:

- `inst/extdata/offensive_tool_mapper.duckdb`

Что важно сейчас:

- DuckDB теперь является primary storage для current-state pipeline tables, а `.rds` используются как совместимые snapshots/export/fallback;
- incremental collect сначала читает current raw state из DuckDB-таблиц `raw_github`, `raw_packetstorm`, `raw_rss`, и только потом падает обратно на `.rds`, если база ещё не инициализирована;
- normalize stage пишет `normalized_candidates` и `normalized_candidates_history`;
- assessment stage пишет `llm_assessments`, `relevant_tools`, `mitre_mappings`, `llm_processing_queue` и их history-таблицы;
- pipeline status дополнительно попадает в `pipeline_status`, `pipeline_stage_history` и `pipeline_storage_snapshots`, так что историю запусков и снимков теперь можно смотреть через DuckDB без ручного перебора `.rds`;
- sanity layer дополнительно пишет `pipeline_sanity_checks` и `pipeline_sanity_checks_history`;
- Shiny использует эти `run_id` и history-таблицы как comparison backend для diff между двумя прогонами.

### Post-run sanity layer

Файлы:

- `inst/extdata/pipeline_sanity_checks.rds`
- `inst/extdata/pipeline_sanity_checks.json`

Что важно сейчас:

- после каждого pipeline-run выполняется отдельный `sanity_checks` stage;
- там фиксируются пустой normalized layer, duplicate `record_id`, orphan MITRE rows и отсутствие visualization rows при наличии relevant tools;
- результаты сохраняются и в файловые артефакты, и в DuckDB history;
- эти проверки видны на вкладке Pipeline без ручного открытия артефактов.

### PacketStorm raw-слой

Файл:

- `inst/extdata/raw_packetstorm.rds`

Как посмотреть в R:

```r
packetstorm_raw <- readRDS("inst/extdata/raw_packetstorm.rds")
View(packetstorm_raw)
packetstorm_raw
```

Что важно сейчас:

- collector уже реализован;
- PacketStorm периодически отдаёт HTML/TOS interstitial вместо нормального RSS/XML;
- поэтому live-сбор может сохранять `0` строк;
- пайплайн при этом не падает и продолжает обработку остальных источников;
- если feed доступен, collector теперь может дополнительно тянуть linked page content, чтобы у LLM был не только короткий feed summary.

Где это создаётся:

- `R/etl_packetstorm.R`

### RSS raw-слой

Файл:

- `inst/extdata/raw_rss.rds`

Как посмотреть в R:

```r
rss_raw <- readRDS("inst/extdata/raw_rss.rds")
View(rss_raw)
head(rss_raw[, c("source", "item_title", "item_link")])
```

Что внутри:

- `source`
- `feed_title`
- `feed_url`
- `item_title`
- `item_link`
- `item_description`
- `item_pub_date`
- `item_guid`
- `item_categories`
- `page_content`

Что важно сейчас:

- для RSS-источников теперь можно дополнительно вытягивать linked page content;
- это особенно полезно для источников, где одного title/summary недостаточно, чтобы понять что делает инструмент;
- CISA advisories по-прежнему остаются больше новостным источником и в LLM-очередь не попадают.

Где это создаётся:

- `R/etl_rss.R`

### Normalized слой

Файл:

- `inst/extdata/normalized_tools.rds`

Как посмотреть в R:

```r
normalized_tools <- readRDS("inst/extdata/normalized_tools.rds")
View(normalized_tools)
head(normalized_tools[, c("name", "source", "pre_llm_score", "pre_llm_priority", "url")])
```

Что внутри:

- `record_id`
- `name`
- `source`
- `source_type`
- `url`
- `raw_description`
- `raw_text`
- `date_found`
- `pre_llm_score`
- `pre_llm_priority`
- `pre_llm_candidate_type`
- `pre_llm_should_process`
- `pre_llm_reasons`
- `metadata`

Как работает pre-LLM scoring:

- даёт грубую эвристику, что отправлять в LLM раньше;
- учитывает источник, offensive keywords, seed names популярных tools и часть GitHub metadata;
- учитывает не только популярность, но и freshness сигналы GitHub вроде `updated` search mode и recent update date;
- различает `utility`, `utility_suite`, `script_collection`, `news_or_advisory`, `non_tool`;
- `pre_llm_should_process = TRUE` означает, что запись можно ставить в LLM-очередь;
- обычные новости и vulnerability/advisory контент получают `pre_llm_should_process = FALSE` и не должны уходить в нейросеть;
- utility-first логика даёт приоритет именно утилитам, а наборы скриптов допускаются, но ранжируются ниже полноценных utilities;
- manual-like репозитории (`cheatsheet`, `notes`, `guide`, `playbook`, cert-prep и т.п.) детерминированно исключаются ещё на pre-LLM этапе;
- Markdown-only GitHub-репозитории без сигналов исполняемого инструмента (скрипты, binary, CLI, agent, server и т.д.) не попадают в LLM-очередь;
- raw_text теперь дополнительно чистится от части markdown/html/code noise, чтобы тратить меньше токенов в LLM.

Где это создаётся:

- `R/normalize.R`

### LLM JSON-контракты

Файл:

- `R/llm_contracts.R`
- `R/llm_provider.R`

Что уже есть:

- выбор LLM provider/model/base URL через `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`;
- DeepSeek как дефолтный provider для MVP;
- автоматический выбор API key из `DEEPSEEK_API_KEY` или `OPENAI_API_KEY` в зависимости от provider;
- схема для этапа validation/enrichment;
- схема для unified one-call assessment;
- схема для этапа MITRE classification;
- парсер и валидация JSON-ответа первого LLM-этапа;
- парсер и валидация JSON-ответа unified one-call stage;
- парсер и валидация JSON-ответа второго LLM-этапа.

Какие функции смотреть:

- `get_validation_enrichment_schema()`
- `get_unified_tool_assessment_schema()`
- `parse_validation_enrichment_json()`
- `parse_unified_tool_assessment_json()`
- `get_mitre_classification_schema()`
- `parse_mitre_classification_json()`

### Unified one-call LLM assessment

Основной код:

- `R/llm_assessment.R`
- `R/llm_contracts.R`

Точка запуска:

- `data-raw/run_unified_tool_assessment.R`

Что уже реализовано:

- один LLM-запрос решает релевантность, тип сущности, русские описания для UI и MITRE mapping;
- `summary_ru`, `purpose_ru`, `capabilities_ru`, `category_ru`, `reason_ru` формируются на русском языке для визуализации;
- MITRE техника и tactic могут оставаться на английском;
- в assessment table отдельно сохраняется `llm_input_text`, то есть уже очищенный текст, который реально ушёл в модель;
- в assessment results теперь сохраняются также `llm_provider`, `llm_base_url`, `llm_model` для трассировки runtime-конфигурации;
- результаты сохраняются в `tool_assessment_results.rds`, `relevant_tools.rds` и `tool_mitre_mappings.rds`;
- LLM provider выбирается через env и по умолчанию используется DeepSeek (`deepseek-chat`);
- runner перед live-запуском пишет preflight-log с provider/model/base URL и признаком наличия API key без раскрытия секрета;
- live run через DeepSeek уже выполнен; после последнего quality-hardening и refresh-пайплайна актуальное состояние: `105` assessment rows, `31` relevant tools, `71` MITRE mappings, `211` refinement candidates;
- для небольших прогонов можно ограничивать batch size через `LLM_MAX_RECORDS`;
- при включённом DuckDB те же стадии пишутся в таблицы `normalized_candidates`, `llm_assessments` и `mitre_mappings`.

Что важно сейчас:

- это новый primary-path для MVP;
- он покрыт тестами;
- live запуск уже выполнялся в текущей среде, а экспорт в webapp был успешно пересобран после ужесточения GitHub-фильтрации.

### Test status

Что уже подтверждено:

- package-aware полный test suite проходит через `testthat::test_local(load_package = "source")`;
- для локального воспроизводимого запуска добавлен `data-raw/run_tests.R`, который не требует обязательной установки `devtools`.

Какие артефакты появятся после запуска:

- `inst/extdata/tool_assessment_results.rds`
- `inst/extdata/relevant_tools.rds`
- `inst/extdata/tool_mitre_mappings.rds`
- `inst/extdata/offensive_tool_mapper.duckdb`

### Visualization-ready слой

Основной код:

- `R/visualization_data.R`
- `R/viz_matrix.R`
- `R/viz_tools.R`

Точки запуска:

- `data-raw/build_visualization_data.R`
- `data-raw/preview_results.R`

Что уже реализовано:

- отдельный слой `visualization_tools.rds` для UI-карточек инструментов;
- отдельный слой `visualization_tool_matrix.rds` для tactic/technique фильтров и heatmap;
- для UI сохраняются `assessed_name`, `short_description_ru`, `long_description_ru`, `mitre_tactics`, `mitre_technique_ids`, `filter_tags`, `confidence_score`;
- добавлен `visualization_score`, который учитывает heuristic priority, post-LLM confidence, подробность описания, MITRE coverage и тип сущности;
- в DuckDB пишутся таблицы `visualization_tools` и `visualization_tool_matrix`;
- plotting helpers используются как отдельный аналитический слой и как источник графиков для Shiny UI.

Какие артефакты уже есть:

- `inst/extdata/visualization_tools.rds`
- `inst/extdata/visualization_tool_matrix.rds`

### Shiny dashboard

Основной код:

- `inst/shiny/app.R`

Точка запуска:

- `data-raw/run_shiny_dashboard.R`

Что уже реализовано:

- вкладки `Overview`, `MITRE`, `Tools`, `Pipeline`;
- top-ranked tools, confidence distribution, tools by source;
- MITRE heatmap и tactic distribution;
- таблица инструментов с фильтрами по source, entity type, tactic, technique и confidence;
- detail panel с длинным описанием и tags;
- operational tab `Pipeline` со статусами артефактов, LLM runtime config, assessment status plot, DuckDB summary и quick commands;
- отдельный CSS-слой `inst/shiny/www/app.css` для hero-секции, карточек, метрик и более просторного layout;
- локальный запуск подтверждён: `Rscript.exe` из `C:/Program Files/R/R-4.5.1/bin` поднимает приложение без runtime-ошибок; в текущей сессии обновлённый app успешно слушал `http://127.0.0.1:8790`, а основной launcher настроен на `8788`.

### Legacy validation/enrichment stage

Основной код:

- `R/llm_validation.R`

Точка запуска:

- `data-raw/run_validation_enrichment.R`

Что уже реализовано:

- очередь кандидатов строится только из `pre_llm_should_process = TRUE`;
- кандидаты сортируются по `pre_llm_score` сверху вниз;
- stage поддерживает provider-aware вызовы; по умолчанию используется DeepSeek, OpenAI остаётся fallback path;
- в validation results сохраняются `llm_provider`, `llm_base_url`, `llm_model`;
- полный результат сохраняется в `validation_enrichment_results.rds`;
- отдельно сохраняется filtered датасет `enriched_tools.rds` только для записей, где LLM подтвердил `is_tool = TRUE`.

Что важно сейчас:

- код stage реализован и покрыт тестами;
- этот путь оставлен как fallback, но больше не является primary-path для MVP.

Какие артефакты появятся после запуска:

- `inst/extdata/validation_enrichment_results.rds`
- `inst/extdata/enriched_tools.rds`

## Какие параметры сейчас используются для GitHub API

Основной код находится в `R/etl_github.R`.

### Запросы по умолчанию

Функция `get_default_github_queries()` сейчас собирает запросы из двух слоёв:

- base queries вроде `pentest tool`, `red team tool`, `offensive security tool`, `exploit framework`, `adversary simulation`;
- seed-based queries, построенные из популярных имён offensive tools;
- topic-based queries вроде `topic:red-team`, чтобы находить новые инструменты даже без заранее известного названия.

Список seed names вынесен в отдельную функцию `get_default_github_seed_names()`. Сейчас там, например:

- `metasploit`
- `sliver`
- `ligolo-ng`
- `impacket`
- `bloodhound`
- `responder`
- `crackmapexec`
- `netexec`
- `sqlmap`
- `nuclei`
- `evil-winrm`
- `chisel`

Это сделано специально, чтобы список дефолтных поисковых направлений был виден прямо в коде и легко расширялся.

Дополнительно есть отдельный список GitHub discovery topics и search modes:

- topics используются для поиска новых и ещё не известных по имени инструментов;
- `stars` даёт более стабильные и зрелые репозитории;
- `updated` помогает поднимать свежие и только появляющиеся кандидаты.

### Дополнительные qualifiers

Функция `.github_build_search_query()` умеет добавлять:

- `stars:>=N`
- `archived:false`
- `language:...`

Пример итогового поискового запроса:

```text
red team tool stars:>=50 archived:false language:R language:Python
```

### Используемые GitHub API endpoints

- `/search/repositories`
- `/repos/{owner}/{repo}`
- `/repos/{owner}/{repo}/readme`

### Заголовки

Сейчас выставляются:

- `Accept: application/vnd.github+json`
- `X-GitHub-Api-Version: 2022-11-28`

### Токен

Если задан `GITHUB_PAT`, модуль использует его автоматически.

## Используется ли DuckDB

Да, базовый слой уже реализован.

Сейчас хранение сделано так:

- MITRE: `data/mitre_attack.rda`
- GitHub raw: `inst/extdata/raw_github.rds`
- PacketStorm raw: `inst/extdata/raw_packetstorm.rds`
- RSS raw: `inst/extdata/raw_rss.rds`
- normalized: `inst/extdata/normalized_tools.rds`
- validation enrichment results: `inst/extdata/validation_enrichment_results.rds`
- enriched tools: `inst/extdata/enriched_tools.rds`
- unified tool assessment results: `inst/extdata/tool_assessment_results.rds`
- relevant tools: `inst/extdata/relevant_tools.rds`
- tool MITRE mappings: `inst/extdata/tool_mitre_mappings.rds`
- DuckDB file: `inst/extdata/offensive_tool_mapper.duckdb`

Что уже пишет в DuckDB:

- `normalized_candidates`
- `llm_assessments`
- `mitre_mappings`

Что ещё не закрыто по DuckDB:

- полный перенос raw-слоёв в DuckDB;
- orchestration вокруг DuckDB как primary storage, а не только supplemental persistence.

## Как открыть проект в RStudio

Есть файл:

- `OffensiveToolMapper.Rproj`

Открыть проект можно двумя способами:

- двойной клик по `OffensiveToolMapper.Rproj`;
- или `File -> Open Project...` в RStudio и выбрать этот файл.

## Что настроено для удобства работы

В workspace уже включены:

- auto-approve terminal-команд в VS Code workspace;
- auto-save файлов с задержкой;
- hot exit для сохранения рабочего состояния окна.

Это снижает количество ручных подтверждений и риск потерять промежуточные изменения.

## Что именно считается релевантным для LLM

Сейчас целевая сущность проекта на этапе отбора кандидатов это:

- offensive utility;
- offensive framework;
- utility suite;
- иногда коллекция/набор offensive scripts, если это реально рабочий toolkit вроде `impacket`-подобных наборов.

Что не должно уходить в LLM:

- новости об уязвимостях;
- advisory/bulletin контент;
- CVE-дайджесты;
- просто новостные статьи без самой утилиты.

Практически это теперь отражено прямо в normalized-слое через поля:

- `pre_llm_candidate_type`
- `pre_llm_should_process`

## Как быстро перепроверить текущее состояние

### Пересобрать MITRE

```r
source("R/utils_core.R")
source("R/etl_mitre.R")
source("data-raw/refresh_mitre_attack.R")
```

### Пересобрать GitHub sample

```r
source("R/utils_core.R")
source("R/etl_github.R")
collect_github_tools(max_results = 25, min_stars = 50)
```

### Пересобрать весь raw ETL

```r
source("R/utils_core.R")
source("R/etl_github.R")
source("R/etl_packetstorm.R")
source("R/etl_rss.R")
source("data-raw/collect_sample.R")
```

### Пересобрать normalized слой

```r
source("R/utils_core.R")
source("R/normalize.R")
normalize_raw_data()
```

### Запустить первый LLM-этап

Нужен `DEEPSEEK_API_KEY` в окружении или альтернативно `LLM_PROVIDER=openai` вместе с `OPENAI_API_KEY`.

```r
source("R/utils_core.R")
source("R/normalize.R")
source("R/llm_provider.R")
source("R/llm_contracts.R")
source("R/llm_validation.R")
source("data-raw/run_validation_enrichment.R")
```

### Запустить unified one-call assessment

Нужен `DEEPSEEK_API_KEY` в окружении или альтернативно `LLM_PROVIDER=openai` вместе с `OPENAI_API_KEY`.

Для небольшого batch запуска можно задать `LLM_MAX_RECORDS`, например `5` или `10`.

```r
source("R/utils_core.R")
source("R/text_processing.R")
source("R/normalize.R")
source("R/llm_provider.R")
source("R/llm_contracts.R")
source("R/llm_validation.R")
source("R/storage_duckdb.R")
source("R/llm_assessment.R")
source("data-raw/run_unified_tool_assessment.R")
```

### Собрать visualization-ready слой

```r
source("R/utils_core.R")
source("R/normalize.R")
source("R/llm_contracts.R")
source("R/storage_duckdb.R")
source("R/visualization_data.R")
source("data-raw/build_visualization_data.R")
```

### Запустить Shiny dashboard

```r
source("data-raw/run_shiny_dashboard.R")
```

### Посмотреть размеры артефактов

```r
github_raw <- readRDS("inst/extdata/raw_github.rds")
packetstorm_raw <- readRDS("inst/extdata/raw_packetstorm.rds")
rss_raw <- readRDS("inst/extdata/raw_rss.rds")
normalized_tools <- readRDS("inst/extdata/normalized_tools.rds")

nrow(github_raw)
nrow(packetstorm_raw)
nrow(rss_raw)
nrow(normalized_tools)
```

## Что ещё не реализовано

Следующие крупные этапы ещё впереди:

- Docker packaging;
- первый осмысленный git commit после завершения очередного цельного блока.

## MITRE refinement

Что уже есть:

- `R/rag_refinement.R` с retrieval-first refinement layer;
- `build_mitre_refinement_index()` для локального кешируемого индекса MITRE техник;
- `retrieve_relevant_techniques()` для top-k candidate retrieval по tool text;
- `run_mitre_refinement()` для построения candidate suggestions поверх текущих assessment results;
- `data-raw/run_mitre_refinement.R` для отдельного запуска refinement stage;
- интеграция stage `refine_mitre` в `run_full_pipeline()` и `run_pipeline_from()`.

Что важно сейчас:

- текущая реализация intentionally lightweight и не требует embedding-service или дополнительного LLM-вызова;
- слой уже даёт persisted retrieval candidates и может использоваться как refinement path поверх one-call MITRE mapping;
- scoring стал строже: generic low-signal техники получают штраф, а специфичные matched terms поднимаются выше.

## Pipeline orchestration

Что уже есть:

- `R/pipeline.R` с `run_full_pipeline()` и `run_pipeline_from()`;
- stage status persistence в `pipeline_status.rds` и `pipeline_status.json`;
- post-run `sanity_checks` stage с записью в `pipeline_sanity_checks.rds/.json` и DuckDB history;
- `R/webapp_export.R` как reusable JSON export слой;
- `data-raw/run_full_pipeline.R` как entrypoint полного прогона;
- `data-raw/verify_full_pipeline_run.R` как live verification launcher с коротким diff к предыдущему `run_id`;
- unit tests для resume-path и webapp export.

Что важно сейчас:

- основной end-to-end путь теперь можно запускать одной командой;
- orchestration уже умеет стартовать с нужной стадии и не требует повторного raw-сбора, если нужные артефакты уже сохранены.

## MCP server

Что уже есть:

- `R/mcp_server.R` с tools `search_tools`, `get_tool_ttps`, `get_technique_tools`, `get_statistics`, `classify_new_tool`;
- `inst/mcp/run_server.R` для локального старта MCP entrypoint;
- `stdio` transport проверен локально;
- helper tests для MCP проходят.

Что важно сейчас:

- основной integration-path для VS Code/Cursor/Claude Code это `stdio`, и он уже рабочий;
- для `http` transport у `mcpr` нужна дополнительная зависимость `ambiorix`, она пока не ставилась.

## Packaging and docs

Что уже есть:

- `README.md` с quickstart по локальному запуску, MCP и Docker Compose;
- `.env.example` с основными переменными окружения;
- локальный `.env` без секретов, подготовленный из шаблона;
- `Dockerfile` на базе `rocker/shiny`;
- `docker-compose.yml` для `shiny-app`, `modern-ui` и `mcp-server`.
- `vignettes/introduction.Rmd` и `vignettes/data-pipeline.Rmd`;
- `_pkgdown.yml` для рабочей pkgdown-сборки;
- `data-raw/build_docs.R` для воспроизводимой пересборки `NAMESPACE`, `man/*.Rd` и pkgdown-сайта;
- локально уже сгенерированные `man/*.Rd`, roxygen-managed `NAMESPACE` и готовый `docs/` pkgdown-site.
- локально подтверждённый Docker smoke test для `shiny-app`, `modern-ui` и `mcp-server`.

Что важно сейчас:

- Docker Desktop в текущей Windows-среде установлен и engine доступен; для compose в этой сессии потребовалось явно добавить `C:/Program Files/Docker/Docker/resources/bin` в PATH текущего shell;
- compose smoke test выполнен успешно: `8788` и `5173` отвечают по HTTP, а MCP контейнер слушает `3000` и логирует успешный старт `serve_http`;
- в процессе smoke test были устранены два контейнерных дефекта: отсутствие `roxygen2` при сборке `mcpr` в образе и отсутствие export у `run_mcp_server()`.
- `roxygen2` и `pkgdown` в текущей среде доступны; `data-raw/build_docs.R --pkgdown` автоматически использует локальный Pandoc из RStudio/Quarto и успешно пересобирает сайт документации в `docs/`.
