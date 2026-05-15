import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import {
  ArrowRight,
  ExternalLink,
  Flame,
  Layers3,
  Maximize2,
  Radar,
  Search,
  Shield,
  Sparkles,
  X,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const R_DASHBOARD_URL = import.meta.env.VITE_R_DASHBOARD_URL || 'http://127.0.0.1:8788'
const DATA_REFRESH_INTERVAL_MS = 45000
const SELECTED_TOOL_STORAGE_KEY = 'otm:selected-tool-id'
const CURRENT_TAB_STORAGE_KEY = 'otm:current-tab'
const accentPalette = ['#ff7a3d', '#40b9b4', '#ffd166', '#8ecae6', '#fb8500', '#5dd39e']
const headerTabs = [
  { id: 'overview', label: 'Обзор' },
  { id: 'analytics', label: 'Аналитика' },
  { id: 'explorer', label: 'Инструменты' },
]

const tacticDetails = {
  Reconnaissance: 'Сбор первичной информации о целях, инфраструктуре, пользователях и внешнем периметре до активного доступа.',
  'Resource Development': 'Подготовка ресурсов для операции: домены, инфраструктура, учётки, полезные нагрузки и вспомогательные сервисы.',
  'Initial Access': 'Получение начальной точки входа в среду через уязвимость, публичный сервис, фишинг или внешний доступ.',
  Execution: 'Запуск команд, скриптов или полезной нагрузки на целевой системе.',
  Persistence: 'Закрепление доступа, чтобы вернуться в систему после перезапуска, смены сессии или устранения первичного входа.',
  'Privilege Escalation': 'Повышение прав, переход от обычного пользователя к более привилегированному контексту.',
  'Defense Evasion': 'Снижение заметности: обход защит, маскировка активности, отключение или затруднение детекта.',
  'Credential Access': 'Получение паролей, токенов, хэшей и других материалов для дальнейшего доступа.',
  Discovery: 'Разведка уже внутри среды: пользователи, процессы, хосты, сети, домены, сервисы и права.',
  'Lateral Movement': 'Перемещение между системами внутри сети с использованием доступов, удалённого выполнения или доверенных каналов.',
  Collection: 'Сбор данных внутри среды перед выгрузкой или дальнейшей обработкой.',
  Exfiltration: 'Вывод собранных данных из среды наружу через сетевые, облачные или иные каналы.',
  'Command and Control': 'Поддержание канала управления между оператором и инструментом внутри среды.',
  Impact: 'Действия, которые нарушают доступность, целостность или бизнес-процесс цели.',
}

const techniqueHints = {
  T1003: 'Получение учётных данных из памяти, хранилищ ОС или связанных credential-артефактов.',
  T1018: 'Поиск удалённых систем, узлов и доступных направлений для дальнейшего движения.',
  T1021: 'Использование удалённых сервисов для перехода на другие машины или выполнения действий внутри сети.',
  T1041: 'Передача данных через тот же канал, который используется для управления или связи.',
  T1055: 'Встраивание кода в другой процесс, чтобы скрыть выполнение или получить контекст процесса.',
  T1059: 'Запуск команд и скриптов через shell, PowerShell, Python, JavaScript или другие интерпретаторы.',
  T1105: 'Передача файлов и полезной нагрузки между внешней инфраструктурой и целевой средой.',
  T1133: 'Использование VPN, RDP, SSH, внешних панелей или других exposed remote access сервисов.',
  T1190: 'Эксплуатация уязвимого публичного приложения или сервиса для начального входа.',
  T1548: 'Злоупотребление механизмами повышения прав или обхода контроля привилегий.',
  T1562: 'Отключение, обход или ослабление защитных механизмов и средств мониторинга.',
  T1573: 'Защита C2-канала шифрованием или нестандартным туннелированием связи.',
  T1583: 'Создание или аренда инфраструктуры: доменов, серверов, учёток, сертификатов и связанных ресурсов.',
  T1588: 'Получение готовых возможностей: инструментов, эксплойтов, сертификатов, аккаунтов или инфраструктуры.',
  T1595: 'Активное сканирование внешнего периметра, сервисов или адресов для поиска целей и уязвимостей.',
}

function normaliseRecordList(value) {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === 'object') {
    return Object.values(value)
  }

  return []
}

function normaliseArray(value) {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean)
  }

  return [value].filter(Boolean)
}

function normaliseBoolean(value) {
  if (typeof value === 'boolean') {
    return value
  }

  if (value === null || value === undefined) {
    return false
  }

  if (typeof value === 'string') {
    return value.toLowerCase() === 'true'
  }

  return Boolean(value)
}

function formatScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'н/д'
  }

  return Number(value).toFixed(2)
}

function rankLabel(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'н/д'
  }

  return `#${value}`
}

function deriveSourceSeries(summary) {
  return normaliseRecordList(summary?.source_breakdown).slice(0, 8).map((item, index) => ({
    ...item,
    fill: accentPalette[index % accentPalette.length],
  }))
}

function deriveTacticSeries(summary) {
  return normaliseRecordList(summary?.tactic_breakdown).slice(0, 10).map((item, index) => ({
    ...item,
    fill: accentPalette[index % accentPalette.length],
  }))
}

function deriveConfidenceSeries(tools) {
  const buckets = [
    { label: '0.50-0.59', min: 0.5, max: 0.59, count: 0 },
    { label: '0.60-0.69', min: 0.6, max: 0.69, count: 0 },
    { label: '0.70-0.79', min: 0.7, max: 0.79, count: 0 },
    { label: '0.80-0.89', min: 0.8, max: 0.89, count: 0 },
    { label: '0.90-1.00', min: 0.9, max: 1.0, count: 0 },
  ]

  for (const tool of tools) {
    const score = Number(tool.confidence_score || 0)
    const bucket = buckets.find((item) => score >= item.min && score <= item.max)
    if (bucket) {
      bucket.count += 1
    }
  }

  return buckets
}

function splitTactics(value) {
  return normaliseArray(value)
    .flatMap((item) => String(item).split(','))
    .map((item) => item.replace(/^c\(/, '').replace(/\)$/, '').replace(/^['"`]+|['"`]+$/g, '').trim())
    .filter(Boolean)
}

function splitKeywords(value) {
  return normaliseArray(value)
    .flatMap((item) => String(item).split(','))
    .map((item) => item.replace(/^c\(/, '').replace(/\)$/, '').replace(/^['"`]+|['"`]+$/g, '').trim())
    .filter(Boolean)
}

function shortenLabel(value, maxLength = 22) {
  if (!value) {
    return 'н/д'
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

function deriveCoverageSummary(tools, matrix) {
  const mappedTools = tools.filter((tool) => Number(tool.mitre_technique_count || 0) > 0)
  const uniqueTechniques = new Set(matrix.map((row) => row.technique_id).filter(Boolean)).size
  const uniqueTactics = new Set(matrix.flatMap((row) => splitTactics(row.tactic))).size
  const avgTechniques = mappedTools.length
    ? mappedTools.reduce((sum, tool) => sum + Number(tool.mitre_technique_count || 0), 0) / mappedTools.length
    : 0

  return [
    {
      label: 'Инструменты со связями',
      value: mappedTools.length,
      meta: 'Утилиты с хотя бы одной MITRE-связью',
    },
    {
      label: 'Уникальные тактики',
      value: uniqueTactics,
      meta: 'Разные тактики, покрытые текущим набором',
    },
    {
      label: 'Уникальные техники',
      value: uniqueTechniques,
      meta: 'Уникальные идентификаторы техник в текущем слое матрицы',
    },
    {
      label: 'Среднее техник',
      value: formatScore(avgTechniques),
      meta: 'Среднее число техник на связанный инструмент',
    },
  ]
}

function deriveSourceCoverageSeries(tools, matrix) {
  const coverageBySource = new Map()

  for (const tool of tools) {
    const source = tool.source || 'unknown'
    if (!coverageBySource.has(source)) {
      coverageBySource.set(source, {
        source,
        mappedTools: new Set(),
        techniques: new Set(),
        tactics: new Set(),
      })
    }

    const sourceEntry = coverageBySource.get(source)
    if (Number(tool.mitre_technique_count || 0) > 0) {
      sourceEntry.mappedTools.add(tool.record_id)
    }
  }

  for (const row of matrix) {
    const source = row.source || 'unknown'
    if (!coverageBySource.has(source)) {
      coverageBySource.set(source, {
        source,
        mappedTools: new Set(),
        techniques: new Set(),
        tactics: new Set(),
      })
    }

    const sourceEntry = coverageBySource.get(source)
    if (row.record_id) {
      sourceEntry.mappedTools.add(row.record_id)
    }
    if (row.technique_id) {
      sourceEntry.techniques.add(row.technique_id)
    }
    for (const tactic of splitTactics(row.tactic)) {
      sourceEntry.tactics.add(tactic)
    }
  }

  return Array.from(coverageBySource.values())
    .map((entry, index) => ({
      source: entry.source,
      mapped_tools: entry.mappedTools.size,
      unique_techniques: entry.techniques.size,
      unique_tactics: entry.tactics.size,
      fill: accentPalette[index % accentPalette.length],
    }))
    .sort((left, right) => right.unique_techniques - left.unique_techniques)
}

function deriveTechniqueCoverageSeries(matrix) {
  const techniqueCoverage = new Map()

  for (const row of matrix) {
    const techniqueId = row.technique_id || 'unknown'
    const techniqueName = row.technique_name || 'Unknown technique'
    const key = `${techniqueId}||${techniqueName}`

    if (!techniqueCoverage.has(key)) {
      techniqueCoverage.set(key, {
        technique_id: techniqueId,
        technique_name: techniqueName,
        utilities: new Set(),
      })
    }

    if (row.record_id) {
      techniqueCoverage.get(key).utilities.add(row.record_id)
    }
  }

  return Array.from(techniqueCoverage.values())
    .map((entry, index) => ({
      name: shortenLabel(`${entry.technique_id} ${entry.technique_name}`, 26),
      full_name: `${entry.technique_id} ${entry.technique_name}`,
      utility_count: entry.utilities.size,
      fill: accentPalette[index % accentPalette.length],
    }))
    .sort((left, right) => right.utility_count - left.utility_count)
    .slice(0, 8)
}

function deriveTopCoverageTools(tools) {
  return tools
    .filter((tool) => Number(tool.mitre_technique_count || 0) > 0)
    .sort((left, right) => {
      if (Number(right.mitre_technique_count || 0) !== Number(left.mitre_technique_count || 0)) {
        return Number(right.mitre_technique_count || 0) - Number(left.mitre_technique_count || 0)
      }

      return Number(left.visualization_rank || 999) - Number(right.visualization_rank || 999)
    })
    .slice(0, 8)
    .map((tool, index) => ({
      name: shortenLabel(tool.assessed_name, 20),
      full_name: tool.assessed_name,
      techniques: Number(tool.mitre_technique_count || 0),
      tactics: Number(tool.mitre_tactic_count || 0),
      fill: accentPalette[index % accentPalette.length],
    }))
}

function deriveToolTacticMatrix(tools, matrix) {
  const topTactics = Array.from(
    matrix.reduce((accumulator, row) => {
      for (const tactic of splitTactics(row.tactic)) {
        accumulator.set(tactic, (accumulator.get(tactic) || 0) + 1)
      }
      return accumulator
    }, new Map()),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([tactic]) => tactic)

  const topTools = tools
    .filter((tool) => Number(tool.mitre_technique_count || 0) > 0)
    .sort((left, right) => Number(left.visualization_rank || 999) - Number(right.visualization_rank || 999))
    .slice(0, 8)
    .map((tool) => {
      const tacticSet = new Set(splitTactics(tool.mitre_tactics))
      return {
        name: shortenLabel(tool.assessed_name, 18),
        full_name: tool.assessed_name,
        rank: rankLabel(tool.visualization_rank),
        cells: topTactics.map((tactic) => ({
          tactic,
          active: tacticSet.has(tactic),
        })),
      }
    })

  return {
    tactics: topTactics,
    tools: topTools,
  }
}

function deriveMitreHeatmap(matrix) {
  const tacticCounter = new Map()
  const techniqueCounter = new Map()
  const pairCounter = new Map()

  for (const row of matrix) {
    const tactics = splitTactics(row.tactic)
    const techniqueId = row.technique_id || 'unknown'
    const techniqueName = row.technique_name || 'Unknown technique'
    const techniqueKey = `${techniqueId}||${techniqueName}`

    if (!techniqueCounter.has(techniqueKey)) {
      techniqueCounter.set(techniqueKey, {
        technique_id: techniqueId,
        technique_name: techniqueName,
        utilities: new Set(),
      })
    }

    if (row.record_id) {
      techniqueCounter.get(techniqueKey).utilities.add(row.record_id)
    }

    for (const tactic of tactics) {
      if (!tacticCounter.has(tactic)) {
        tacticCounter.set(tactic, new Set())
      }
      if (row.record_id) {
        tacticCounter.get(tactic).add(row.record_id)
      }

      const pairKey = `${tactic}||${techniqueKey}`
      if (!pairCounter.has(pairKey)) {
        pairCounter.set(pairKey, new Set())
      }
      if (row.record_id) {
        pairCounter.get(pairKey).add(row.record_id)
      }
    }
  }

  const tactics = Array.from(tacticCounter.entries())
    .sort((left, right) => right[1].size - left[1].size)
    .map(([tactic]) => tactic)

  const rows = Array.from(techniqueCounter.values())
    .map((entry) => ({
      ...entry,
      total_utilities: entry.utilities.size,
      label: `${entry.technique_id} · ${entry.technique_name}`,
    }))
    .sort((left, right) => {
      if (right.total_utilities !== left.total_utilities) {
        return right.total_utilities - left.total_utilities
      }

      return left.technique_id.localeCompare(right.technique_id)
    })
    .map((entry) => ({
      ...entry,
      cells: tactics.map((tactic) => {
        const pairKey = `${tactic}||${entry.technique_id}||${entry.technique_name}`
        const count = pairCounter.get(pairKey)?.size || 0
        return {
          tactic,
          count,
        }
      }),
    }))

  const maxCount = rows.reduce(
    (maximum, row) => Math.max(maximum, ...row.cells.map((cell) => cell.count)),
    0,
  )

  return {
    tactics,
    rows,
    maxCount,
  }
}

function tacticDescription(tactic) {
  return tacticDetails[tactic] || 'Тактика описывает крупную цель поведения: зачем инструмент использует связанные техники в этой части цепочки.'
}

function describeTechnique(row) {
  const normalizedId = String(row?.technique_id || '').split('.')[0]

  if (techniqueHints[row?.technique_id]) {
    return techniqueHints[row.technique_id]
  }

  if (techniqueHints[normalizedId]) {
    return techniqueHints[normalizedId]
  }

  return `Техника описывает действие или возможность из MITRE ATT&CK: ${row?.technique_name || 'название пока не указано'}.`
}

function cleanDisplayTags(tags) {
  return normaliseArray(tags)
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .filter((tag) => !/^mitre:/i.test(tag))
    .filter((tag) => !/^source:/i.test(tag))
    .filter((tag) => !/^entity:/i.test(tag))
    .filter((tag) => !/^category:/i.test(tag))
}

function formatMetaValue(value) {
  if (value === null || value === undefined || !String(value).trim()) {
    return 'н/д'
  }

  return String(value)
}

function formatUpdatedAt(value) {
  if (!value) {
    return 'ещё не обновлялось'
  }

  return new Date(value).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function deriveSelectedTtpGroups(selectedMatrix) {
  const groups = new Map()

  for (const row of selectedMatrix) {
    const tactics = splitTactics(row.tactic)
    const visibleTactics = tactics.length ? tactics : ['Тактика не указана']

    for (const tactic of visibleTactics) {
      if (!groups.has(tactic)) {
        groups.set(tactic, {
          tactic,
          description: tacticDescription(tactic),
          techniques: [],
        })
      }

      groups.get(tactic).techniques.push({
        ...row,
        technique_description: describeTechnique(row),
      })
    }
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    avgConfidence: group.techniques.length
      ? group.techniques.reduce((sum, row) => sum + Number(row.confidence || 0), 0) / group.techniques.length
      : 0,
  })).sort((left, right) => {
    if (right.techniques.length !== left.techniques.length) {
      return right.techniques.length - left.techniques.length
    }

    return left.tactic.localeCompare(right.tactic)
  })
}

function sortRefinementRows(left, right) {
  const leftMapped = left.already_mapped ? 1 : 0
  const rightMapped = right.already_mapped ? 1 : 0

  if (leftMapped !== rightMapped) {
    return leftMapped - rightMapped
  }

  if (Number(right.retrieval_score || 0) !== Number(left.retrieval_score || 0)) {
    return Number(right.retrieval_score || 0) - Number(left.retrieval_score || 0)
  }

  return Number(left.retrieval_rank || 999) - Number(right.retrieval_rank || 999)
}

function deriveRefinementSummary(refinement) {
  const gaps = refinement.filter((row) => !row.already_mapped)
  const mapped = refinement.filter((row) => row.already_mapped)

  return [
    {
      label: 'Кандидаты',
      value: refinement.length,
      meta: 'Все дополнительные кандидаты из слоя уточнения',
    },
    {
      label: 'На проверку',
      value: gaps.length,
      meta: 'Новые связи, которых ещё нет в основной матрице',
    },
    {
      label: 'Инструменты с зазорами',
      value: new Set(gaps.map((row) => row.record_id).filter(Boolean)).size,
      meta: 'Сколько профилей получили новые MITRE-кандидаты',
    },
    {
      label: 'Уже подтверждено',
      value: mapped.length,
      meta: 'Кандидаты, которые совпали с текущей матрицей',
    },
    {
      label: 'Новые техники',
      value: new Set(gaps.map((row) => row.technique_id).filter(Boolean)).size,
      meta: 'Уникальные техники среди новых кандидатов',
    },
  ]
}

function deriveRefinementTechniqueSeries(refinement) {
  const techniqueMap = new Map()

  for (const row of refinement) {
    if (row.already_mapped) {
      continue
    }

    const key = `${row.technique_id || 'unknown'}||${row.technique_name || 'Unknown technique'}`
    if (!techniqueMap.has(key)) {
      techniqueMap.set(key, {
        technique_id: row.technique_id || 'unknown',
        technique_name: row.technique_name || 'Unknown technique',
        tools: new Set(),
        max_score: 0,
      })
    }

    const entry = techniqueMap.get(key)
    if (row.record_id) {
      entry.tools.add(row.record_id)
    }
    entry.max_score = Math.max(entry.max_score, Number(row.retrieval_score || 0))
  }

  return Array.from(techniqueMap.values())
    .map((entry, index) => ({
      name: shortenLabel(`${entry.technique_id} ${entry.technique_name}`, 28),
      full_name: `${entry.technique_id} ${entry.technique_name}`,
      tool_count: entry.tools.size,
      max_score: entry.max_score,
      fill: accentPalette[index % accentPalette.length],
    }))
    .sort((left, right) => {
      if (right.tool_count !== left.tool_count) {
        return right.tool_count - left.tool_count
      }

      return right.max_score - left.max_score
    })
    .slice(0, 8)
}

function deriveRefinementToolSeries(refinement, tools) {
  const toolMap = new Map(tools.map((tool) => [tool.record_id, tool]))
  const reviewQueue = new Map()

  for (const row of refinement) {
    if (row.already_mapped) {
      continue
    }

    if (!reviewQueue.has(row.record_id)) {
      const tool = toolMap.get(row.record_id)
      reviewQueue.set(row.record_id, {
        assessed_name: tool?.assessed_name || row.assessed_name || 'Unknown tool',
        techniques: new Set(),
        max_score: 0,
      })
    }

    const entry = reviewQueue.get(row.record_id)
    if (row.technique_id) {
      entry.techniques.add(row.technique_id)
    }
    entry.max_score = Math.max(entry.max_score, Number(row.retrieval_score || 0))
  }

  return Array.from(reviewQueue.values())
    .map((entry, index) => ({
      name: shortenLabel(entry.assessed_name, 22),
      full_name: entry.assessed_name,
      gap_count: entry.techniques.size,
      max_score: entry.max_score,
      fill: accentPalette[index % accentPalette.length],
    }))
    .sort((left, right) => {
      if (right.gap_count !== left.gap_count) {
        return right.gap_count - left.gap_count
      }

      return right.max_score - left.max_score
    })
    .slice(0, 8)
}

function deriveRefinementHighlights(refinement, tools) {
  const toolMap = new Map(tools.map((tool) => [tool.record_id, tool]))

  return refinement
    .filter((row) => !row.already_mapped)
    .sort(sortRefinementRows)
    .slice(0, 10)
    .map((row) => {
      const tool = toolMap.get(row.record_id)
      return {
        ...row,
        tool_name: tool?.assessed_name || row.assessed_name || 'Unknown tool',
        source: tool?.source || 'unknown',
        tactics: splitTactics(row.tactic_names),
        matched_terms: splitKeywords(row.matched_terms),
      }
    })
}

function matchesFilter(tool, search, sourceFilter, tacticFilter) {
  const haystack = [
    tool.assessed_name,
    tool.short_description_ru,
    tool.long_description_ru,
    tool.category_ru,
    tool.entity_type,
    ...(tool.filter_tags || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const searchOk = !search || haystack.includes(search)
  const sourceOk = sourceFilter === 'All' || tool.source === sourceFilter
  const tacticOk = tacticFilter === 'All' || splitTactics(tool.mitre_tactics).includes(tacticFilter)

  return searchOk && sourceOk && tacticOk
}

function MetricCard({ icon: Icon, label, value, meta }) {
  return (
    <article className="metric-card-modern">
      <div className="metric-icon-shell">
        <Icon size={18} />
      </div>
      <div>
        <div className="metric-label-modern">{label}</div>
        <div className="metric-value-modern">{value}</div>
        <div className="metric-meta-modern">{meta}</div>
      </div>
    </article>
  )
}

function HeatmapLegend() {
  return (
    <div className="heatmap-legend">
      <span>Меньше связей</span>
      <div className="heatmap-legend-scale">
        {[0.12, 0.22, 0.38, 0.58, 0.78].map((alpha) => (
          <span key={alpha} style={{ backgroundColor: `rgba(180, 35, 24, ${alpha})` }} />
        ))}
      </div>
      <span>Больше связей</span>
    </div>
  )
}

function MitreHeatmapMatrix({ heatmap, tacticLimit, rowLimit }) {
  const visibleTactics = tacticLimit ? heatmap.tactics.slice(0, tacticLimit) : heatmap.tactics
  const visibleRows = rowLimit ? heatmap.rows.slice(0, rowLimit) : heatmap.rows
  const gridTemplateColumns = `minmax(18rem, 22rem) repeat(${visibleTactics.length}, minmax(5.5rem, 1fr))`

  return (
    <div className="mitre-heatmap-scroll">
      <div className="mitre-heatmap-table">
        <div className="mitre-heatmap-row mitre-heatmap-header-row" style={{ gridTemplateColumns }}>
          <div className="mitre-heatmap-technique-header">Техника</div>
          {visibleTactics.map((tactic) => (
            <div key={tactic} className="mitre-heatmap-tactic-header">
              {tactic}
            </div>
          ))}
        </div>

        {visibleRows.map((row) => (
          <div key={row.label} className="mitre-heatmap-row" style={{ gridTemplateColumns }}>
            <div className="mitre-heatmap-technique-cell">
              <strong>{row.technique_id}</strong>
              <span>{row.technique_name}</span>
            </div>
            {row.cells.slice(0, visibleTactics.length).map((cell) => {
              const intensity = heatmap.maxCount > 0 ? cell.count / heatmap.maxCount : 0
              const backgroundColor = cell.count > 0
                ? `rgba(180, 35, 24, ${0.1 + intensity * 0.72})`
                : 'rgba(180, 35, 24, 0.03)'

              return (
                <div
                  key={`${row.technique_id}-${cell.tactic}`}
                  className={`mitre-heatmap-cell ${cell.count > 0 ? 'is-active' : ''}`}
                  style={{ backgroundColor }}
                  title={`${row.technique_id} / ${cell.tactic}: ${cell.count} утилит`}
                >
                  {cell.count > 0 ? cell.count : '·'}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function App() {
  const [summary, setSummary] = useState(null)
  const [tools, setTools] = useState([])
  const [matrix, setMatrix] = useState([])
  const [refinement, setRefinement] = useState([])
  const [selectedId, setSelectedId] = useState(() => window.localStorage.getItem(SELECTED_TOOL_STORAGE_KEY))
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('All')
  const [tacticFilter, setTacticFilter] = useState('All')
  const [currentTab, setCurrentTab] = useState(() => window.localStorage.getItem(CURRENT_TAB_STORAGE_KEY) || 'overview')
  const [isHeatmapOpen, setIsHeatmapOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState('')

  const deferredSearch = useDeferredValue(search.trim().toLowerCase())

  useEffect(() => {
    let cancelled = false

    async function loadData({ background = false } = {}) {
      try {
        if (background) {
          setRefreshing(true)
        } else {
          setLoading(true)
          setError('')
        }

        const cacheKey = `v=${Date.now()}`

        const [summaryResponse, toolsResponse, matrixResponse, refinementResponse] = await Promise.all([
          fetch(`/data/summary.json?${cacheKey}`, { cache: 'no-store' }),
          fetch(`/data/tools.json?${cacheKey}`, { cache: 'no-store' }),
          fetch(`/data/matrix.json?${cacheKey}`, { cache: 'no-store' }),
          fetch(`/data/refinement.json?${cacheKey}`, { cache: 'no-store' }),
        ])

        if (!summaryResponse.ok || !toolsResponse.ok || !matrixResponse.ok) {
          throw new Error('Не удалось загрузить экспортированные JSON-данные для веб-интерфейса.')
        }

        const [summaryPayload, toolsPayload, matrixPayload, refinementPayload] = await Promise.all([
          summaryResponse.json(),
          toolsResponse.json(),
          matrixResponse.json(),
          refinementResponse.ok ? refinementResponse.json() : Promise.resolve([]),
        ])

        if (cancelled) {
          return
        }

        setSummary(summaryPayload)
        const nextTools = (toolsPayload || []).map((tool) => ({
          ...tool,
          filter_tags: normaliseArray(tool.filter_tags),
          mitre_tactics: normaliseArray(tool.mitre_tactics),
          mitre_technique_ids: normaliseArray(tool.mitre_technique_ids),
          mitre_technique_names: normaliseArray(tool.mitre_technique_names),
        }))

        setTools(nextTools)
        setMatrix(matrixPayload || [])
        setRefinement((refinementPayload || []).map((row) => ({
          ...row,
          already_mapped: normaliseBoolean(row.already_mapped),
          tactic_names: normaliseArray(row.tactic_names),
          matched_terms: splitKeywords(row.matched_terms),
        })))
        setSelectedId((currentSelectedId) => {
          if (currentSelectedId && nextTools.some((tool) => tool.record_id === currentSelectedId)) {
            return currentSelectedId
          }

          const storedSelectedId = window.localStorage.getItem(SELECTED_TOOL_STORAGE_KEY)
          if (storedSelectedId && nextTools.some((tool) => tool.record_id === storedSelectedId)) {
            return storedSelectedId
          }

          return nextTools[0]?.record_id || null
        })
        setLastUpdated(new Date().toISOString())
      } catch (loadError) {
        if (!cancelled && !background) {
          setError(loadError.message)
        }
      } finally {
        if (!cancelled) {
          if (background) {
            setRefreshing(false)
          } else {
            setLoading(false)
          }
        }
      }
    }

    loadData()
    const refreshTimer = window.setInterval(() => {
      loadData({ background: true })
    }, DATA_REFRESH_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(refreshTimer)
    }
  }, [])

  const sourceOptions = ['All', ...new Set(tools.map((tool) => tool.source).filter(Boolean))]
  const tacticOptions = ['All', ...new Set(matrix.flatMap((row) => splitTactics(row.tactic)).filter(Boolean))]
  const filteredTools = tools.filter((tool) => matchesFilter(tool, deferredSearch, sourceFilter, tacticFilter))
  const selectedTool =
    filteredTools.find((tool) => tool.record_id === selectedId) ||
    tools.find((tool) => tool.record_id === selectedId) ||
    filteredTools[0] ||
    tools[0] ||
    null
  const selectedMatrix = selectedTool
    ? matrix.filter((row) => row.record_id === selectedTool.record_id)
    : []
  const selectedTtpGroups = deriveSelectedTtpGroups(selectedMatrix)
  const selectedRefinement = selectedTool
    ? refinement.filter((row) => row.record_id === selectedTool.record_id).sort(sortRefinementRows)
    : []
  const selectedDisplayTags = selectedTool ? cleanDisplayTags(selectedTool.filter_tags) : []

  useEffect(() => {
    if (!tools.length) {
      return
    }

    if (!selectedTool) {
      startTransition(() => {
        setSelectedId(filteredTools[0]?.record_id || tools[0].record_id)
      })
    }
  }, [filteredTools, selectedTool, tools])

  useEffect(() => {
    if (selectedId) {
      window.localStorage.setItem(SELECTED_TOOL_STORAGE_KEY, selectedId)
    }
  }, [selectedId])

  useEffect(() => {
    window.localStorage.setItem(CURRENT_TAB_STORAGE_KEY, currentTab)
  }, [currentTab])

  useEffect(() => {
    if (!isHeatmapOpen) {
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsHeatmapOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isHeatmapOpen])

  const featuredTool = tools[0] || null
  const visibleTopTools = normaliseRecordList(summary?.top_tools)
  const sourceSeries = deriveSourceSeries(summary)
  const tacticSeries = deriveTacticSeries(summary)
  const confidenceSeries = deriveConfidenceSeries(tools)
  const coverageSummary = deriveCoverageSummary(tools, matrix)
  const sourceCoverageSeries = deriveSourceCoverageSeries(tools, matrix)
  const techniqueCoverageSeries = deriveTechniqueCoverageSeries(matrix)
  const topCoverageTools = deriveTopCoverageTools(tools)
  const toolTacticMatrix = deriveToolTacticMatrix(tools, matrix)
  const mitreHeatmap = deriveMitreHeatmap(matrix)
  const refinementSummary = deriveRefinementSummary(refinement)
  const refinementTechniqueSeries = deriveRefinementTechniqueSeries(refinement)
  const refinementToolSeries = deriveRefinementToolSeries(refinement, tools)
  const refinementHighlights = deriveRefinementHighlights(refinement, tools)

  if (loading) {
    return (
      <main className="app-root loading-state">
        <div className="loading-orb" />
        <p>Загрузка интерфейса и аналитических данных...</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="app-root loading-state">
        <div className="error-panel">
          <h1>Интерфейс не смог загрузить данные</h1>
          <p>{error}</p>
          <p>Сначала выполни экспорт JSON через `data-raw/export_webapp_data.R`, затем перезапусти веб-интерфейс.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="app-root">
      <header className="site-header glass-panel">
        <div className="site-brand-block">
          <div className="site-brand-mark">OTM</div>
          <div>
            <div className="site-brand-title">OffensiveToolMapper</div>
            <div className="site-brand-subtitle">ранжированная разведка по инструментам</div>
          </div>
        </div>

        <nav className="site-nav-tabs" aria-label="Разделы страницы">
          {headerTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`site-nav-tab ${currentTab === tab.id ? 'is-active' : ''}`}
              onClick={() => setCurrentTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="site-header-actions">
          <div className={`refresh-status ${refreshing ? 'is-refreshing' : ''}`}>
            <span />
            <strong>{refreshing ? 'Обновление данных' : 'Фоновые данные'}</strong>
            <em>{formatUpdatedAt(lastUpdated)}</em>
          </div>
          <a className="primary-action header-dashboard-link" href={R_DASHBOARD_URL} target="_blank" rel="noreferrer">
            R-панель <ExternalLink size={15} />
          </a>
        </div>
      </header>

      {currentTab === 'overview' && (
      <>
      <section className="hero-shell" id="overview">
        <div className="hero-copy-modern glass-panel">
          <div className="eyebrow-modern">Разведка по наступательным инструментам</div>
          <h1>Каталог утилит, сигналов и MITRE-связей в продуктовой оболочке</h1>
          <p>
            Здесь собраны уже отфильтрованные и оценённые инструменты: удобнее смотреть,
            какие утилиты реально выходят наверх, из каких источников они приходят, как покрывают
            MITRE ATT&CK и какие записи сейчас выглядят наиболее содержательными и полезными.
          </p>
          <div className="hero-actions">
            <button type="button" className="primary-action action-button" onClick={() => setCurrentTab('explorer')}>
              Перейти к инструментам <ArrowRight size={16} />
            </button>
            <button type="button" className="secondary-action action-button" onClick={() => setCurrentTab('analytics')}>
              Смотреть аналитику <Radar size={16} />
            </button>
          </div>
          <div className="hero-strip">
            <MetricCard
              icon={Sparkles}
              label="Готовые карточки"
              value={summary?.tool_count || tools.length}
              meta="LLM-оценка, описание, MITRE-связи"
            />
            <MetricCard
              icon={Layers3}
              label="MITRE-связи"
              value={summary?.matrix_count || matrix.length}
              meta="Инструмент -> тактика -> техника"
            />
            <MetricCard
              icon={Shield}
              label="Первое место"
              value={featuredTool ? rankLabel(featuredTool.visualization_rank) : 'н/д'}
              meta={featuredTool ? featuredTool.assessed_name : 'Нет данных'}
            />
          </div>
        </div>

        <aside className="hero-spotlight-modern glass-panel">
          <div className="spotlight-topline">
            <span className="eyebrow-modern">Главный сигнал</span>
            <span className="spotlight-rank">{featuredTool ? rankLabel(featuredTool.visualization_rank) : 'н/д'}</span>
          </div>
          <h2>{featuredTool?.assessed_name || 'Нет данных'}</h2>
          <p>{featuredTool?.short_description_ru || 'Описание недоступно.'}</p>
          <div className="spotlight-stats-grid">
            <div>
              <span>Источник</span>
              <strong>{featuredTool?.source || 'н/д'}</strong>
            </div>
            <div>
              <span>Уверенность</span>
              <strong>{formatScore(featuredTool?.confidence_score)}</strong>
            </div>
            <div>
              <span>Тип</span>
              <strong>{featuredTool?.entity_type || 'н/д'}</strong>
            </div>
            <div>
              <span>MITRE</span>
              <strong>{featuredTool?.mitre_technique_count || 0} техник</strong>
            </div>
          </div>
          {cleanDisplayTags(featuredTool?.filter_tags).length > 0 && (
            <div className="tag-ribbon">
              {cleanDisplayTags(featuredTool?.filter_tags).slice(0, 7).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          )}
        </aside>
      </section>

      <section className="featured-ribbon-shell" id="featured-tools">
        <div className="section-heading heading-light">
          <div>
            <div className="section-kicker-modern">Лучшие утилиты</div>
            <h3>Короткий срез лучших записей из текущего визуализационного слоя</h3>
          </div>
        </div>
        <div className="featured-ribbon-grid">
          {visibleTopTools.map((tool) => (
            <article key={tool.assessed_name} className="featured-ribbon-card glass-panel">
              <div className="featured-ribbon-meta">
                <span>{rankLabel(tool.visualization_rank)}</span>
                <span>{tool.source}</span>
              </div>
              <h4>{tool.assessed_name}</h4>
              <p>{tool.short_description_ru}</p>
              <div className="featured-ribbon-footer">
                <span>{tool.entity_type}</span>
                <span>{tool.mitre_technique_count} MITRE</span>
              </div>
            </article>
          ))}
        </div>
      </section>
      </>
      )}

      {currentTab === 'analytics' && (
      <section className="analytics-shell" id="analytics">
        <div className="section-heading heading-light analytics-shell-heading">
          <div>
            <div className="section-kicker-modern">Покрытие MITRE</div>
            <h3>Как текущий набор инструментов покрывает тактики и техники</h3>
          </div>
          <p>
            Ниже уже не просто общая аналитика, а отдельный слой покрытия: сколько утилит реально связаны с MITRE,
            какие источники несут больше уникальных техник и какие инструменты покрывают больше всего MITRE-связей.
          </p>
        </div>

        <div className="coverage-summary-grid">
          {coverageSummary.map((item) => (
            <article key={item.label} className="glass-panel coverage-summary-card">
              <div className="detail-section-kicker">{item.label}</div>
              <div className="coverage-summary-value">{item.value}</div>
              <p>{item.meta}</p>
            </article>
          ))}
        </div>

        <article className="glass-panel refinement-summary-panel">
          <div className="section-heading">
            <div>
              <div className="section-kicker-modern">Очередь уточнения</div>
              <h3>Где слой уточнения нашёл дополнительные MITRE-возможности</h3>
            </div>
            <p>
              Этот слой показывает не подтверждённые связи, а самые правдоподобные кандидаты,
              которые стоит досмотреть вручную или вынести в следующий проход проверки.
            </p>
          </div>
          <div className="refinement-summary-grid">
            {refinementSummary.map((item) => (
              <article key={item.label} className="refinement-summary-card">
                <div className="detail-section-kicker">{item.label}</div>
                <div className="coverage-summary-value">{item.value}</div>
                <p>{item.meta}</p>
              </article>
            ))}
          </div>
        </article>

        <div className="analytics-grid">
        <article className="glass-panel chart-card">
          <div className="section-heading">
            <div>
              <div className="section-kicker-modern">Покрытие</div>
              <h3>Нагрузка по тактикам MITRE</h3>
            </div>
            <Radar size={18} />
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={tacticSeries} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(180, 35, 24, 0.08)" horizontal={false} />
              <XAxis type="number" stroke="rgba(23, 23, 23, 0.55)" />
              <YAxis dataKey="tactic" type="category" width={120} stroke="rgba(23, 23, 23, 0.75)" tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: 'rgba(180, 35, 24, 0.04)' }} contentStyle={{ background: '#ffffff', border: '1px solid rgba(180, 35, 24, 0.10)', borderRadius: 16, color: '#171717' }} />
              <Bar dataKey="count" radius={[0, 14, 14, 0]}>
                {tacticSeries.map((entry) => (
                  <Cell key={entry.tactic} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="glass-panel chart-card">
          <div className="section-heading">
            <div>
              <div className="section-kicker-modern">Покрытие по источникам</div>
              <h3>Уникальные техники по источникам</h3>
            </div>
            <Layers3 size={18} />
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={sourceCoverageSeries} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(180, 35, 24, 0.08)" vertical={false} />
              <XAxis dataKey="source" stroke="rgba(23, 23, 23, 0.6)" tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(23, 23, 23, 0.55)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid rgba(180, 35, 24, 0.10)', borderRadius: 16, color: '#171717' }} />
              <Bar dataKey="unique_techniques" radius={[14, 14, 4, 4]}>
                {sourceCoverageSeries.map((entry) => (
                  <Cell key={entry.source} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="glass-panel chart-card">
          <div className="section-heading">
            <div>
              <div className="section-kicker-modern">Источники</div>
              <h3>Где чаще всего находятся инструменты</h3>
            </div>
            <Flame size={18} />
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={sourceSeries} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="sourceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#b42318" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#b42318" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(180, 35, 24, 0.08)" vertical={false} />
              <XAxis dataKey="source" stroke="rgba(23, 23, 23, 0.6)" tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(23, 23, 23, 0.55)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid rgba(180, 35, 24, 0.10)', borderRadius: 16, color: '#171717' }} />
              <Area type="monotone" dataKey="count" stroke="#b42318" fill="url(#sourceFill)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </article>

        <article className="glass-panel chart-card">
          <div className="section-heading">
            <div>
              <div className="section-kicker-modern">Техники с высокой плотностью</div>
              <h3>Какие техники MITRE собирают больше всего утилит</h3>
            </div>
            <Shield size={18} />
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={techniqueCoverageSeries} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(180, 35, 24, 0.08)" horizontal={false} />
              <XAxis type="number" stroke="rgba(23, 23, 23, 0.55)" />
              <YAxis dataKey="name" type="category" width={150} stroke="rgba(23, 23, 23, 0.75)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid rgba(180, 35, 24, 0.10)', borderRadius: 16, color: '#171717' }} formatter={(value) => [value, 'связанных утилит']} />
              <Bar dataKey="utility_count" radius={[0, 14, 14, 0]}>
                {techniqueCoverageSeries.map((entry) => (
                  <Cell key={entry.full_name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="glass-panel chart-card chart-card-wide">
          <div className="section-heading">
            <div>
              <div className="section-kicker-modern">Качество сигнала</div>
              <h3>Распределение уверенности</h3>
            </div>
            <Shield size={18} />
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={confidenceSeries} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(180, 35, 24, 0.08)" vertical={false} />
              <XAxis dataKey="label" stroke="rgba(23, 23, 23, 0.6)" tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(23, 23, 23, 0.55)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid rgba(180, 35, 24, 0.10)', borderRadius: 16, color: '#171717' }} />
              <Bar dataKey="count" radius={[14, 14, 4, 4]} fill="#b42318" />
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="glass-panel chart-card chart-card-wide">
          <div className="section-heading">
            <div>
              <div className="section-kicker-modern">Лидеры покрытия</div>
              <h3>Утилиты с наибольшим MITRE-покрытием</h3>
            </div>
            <Sparkles size={18} />
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={topCoverageTools} layout="vertical" margin={{ top: 10, right: 12, left: 20, bottom: 0 }}>
              <CartesianGrid stroke="rgba(180, 35, 24, 0.08)" horizontal={false} />
              <XAxis type="number" stroke="rgba(23, 23, 23, 0.55)" />
              <YAxis dataKey="name" type="category" width={140} stroke="rgba(23, 23, 23, 0.75)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid rgba(180, 35, 24, 0.10)', borderRadius: 16, color: '#171717' }} formatter={(value, name) => [value, name === 'techniques' ? 'техник MITRE' : name]} />
              <Bar dataKey="techniques" radius={[0, 14, 14, 0]}>
                {topCoverageTools.map((entry) => (
                  <Cell key={entry.full_name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="glass-panel chart-card">
          <div className="section-heading">
            <div>
              <div className="section-kicker-modern">Кандидаты уточнения</div>
              <h3>Какие техники чаще всплывают как новые кандидаты</h3>
            </div>
            <Sparkles size={18} />
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={refinementTechniqueSeries} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(180, 35, 24, 0.08)" horizontal={false} />
              <XAxis type="number" stroke="rgba(23, 23, 23, 0.55)" />
              <YAxis dataKey="name" type="category" width={180} stroke="rgba(23, 23, 23, 0.75)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid rgba(180, 35, 24, 0.10)', borderRadius: 16, color: '#171717' }} formatter={(value) => [value, 'инструментов на проверку']} />
              <Bar dataKey="tool_count" radius={[0, 14, 14, 0]}>
                {refinementTechniqueSeries.map((entry) => (
                  <Cell key={entry.full_name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="glass-panel chart-card">
          <div className="section-heading">
            <div>
              <div className="section-kicker-modern">Очередь проверки</div>
              <h3>Инструменты с самым большим числом новых кандидатов</h3>
            </div>
            <Layers3 size={18} />
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={refinementToolSeries} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(180, 35, 24, 0.08)" horizontal={false} />
              <XAxis type="number" stroke="rgba(23, 23, 23, 0.55)" />
              <YAxis dataKey="name" type="category" width={160} stroke="rgba(23, 23, 23, 0.75)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid rgba(180, 35, 24, 0.10)', borderRadius: 16, color: '#171717' }} formatter={(value) => [value, 'новых кандидатов техник']} />
              <Bar dataKey="gap_count" radius={[0, 14, 14, 0]}>
                {refinementToolSeries.map((entry) => (
                  <Cell key={entry.full_name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </article>
        </div>

        <article className="glass-panel refinement-panel">
          <div className="section-heading coverage-matrix-heading">
            <div>
              <div className="section-kicker-modern">Сильные кандидаты</div>
              <h3>Приоритетный список новых MITRE-связей</h3>
            </div>
            <p>
              Здесь собраны верхние неподтверждённые связи по оценке поиска. Это короткий список для ручной проверки
              перед расширением финальной MITRE-матрицы.
            </p>
          </div>
          <div className="refinement-highlight-grid">
            {refinementHighlights.map((row) => (
              <article key={`${row.record_id}-${row.technique_id}-${row.retrieval_rank}`} className="refinement-highlight-card">
                <div className="refinement-card-topline">
                  <span className="refinement-status-pill">На проверку</span>
                  <span>{formatScore(row.retrieval_score)} оценка</span>
                </div>
                <h4>{row.technique_id} · {row.technique_name}</h4>
                <p>{row.tool_name}</p>
                <div className="refinement-meta-row">
                  <span>{row.source}</span>
                  <span>очередь #{row.retrieval_rank}</span>
                </div>
                <div className="tag-ribbon compact-tags refinement-tag-ribbon">
                  {row.tactics.slice(0, 4).map((tactic) => (
                    <span key={`${row.record_id}-${row.technique_id}-${tactic}`}>{tactic}</span>
                  ))}
                </div>
                <div className="refinement-token-row">
                  {row.matched_terms.slice(0, 6).map((term) => (
                    <span key={`${row.record_id}-${row.technique_id}-${term}`} className="refinement-token">{term}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="glass-panel coverage-matrix-panel">
          <div className="section-heading coverage-matrix-heading">
            <div>
              <div className="section-kicker-modern">Снимок матрицы</div>
              <h3>Лучшие инструменты и главные тактики</h3>
            </div>
            <p>
              Компактный вид того, какие из верхних утилит реально закрывают основные зоны тактик в текущем наборе данных.
            </p>
          </div>
          <div className="coverage-matrix-grid">
            <div className="coverage-matrix-row coverage-matrix-header">
              <div className="coverage-matrix-tool-cell">Инструмент</div>
              {toolTacticMatrix.tactics.map((tactic) => (
                <div key={tactic} className="coverage-matrix-tactic-cell">{tactic}</div>
              ))}
            </div>
            {toolTacticMatrix.tools.map((tool) => (
              <div key={tool.full_name} className="coverage-matrix-row">
                <div className="coverage-matrix-tool-cell">
                  <strong>{tool.name}</strong>
                  <span>{tool.rank}</span>
                </div>
                {tool.cells.map((cell) => (
                  <div key={`${tool.full_name}-${cell.tactic}`} className={`coverage-matrix-cell ${cell.active ? 'is-active' : ''}`}>
                    {cell.active ? '●' : '·'}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </article>

        <article className="glass-panel mitre-heatmap-panel">
          <div className="section-heading mitre-heatmap-heading">
            <div>
              <div className="section-kicker-modern">Тепловая карта MITRE</div>
              <h3>Компактный вид полной матрицы тактик и техник</h3>
            </div>
            <p>
              На странице оставлен сокращённый вид, чтобы аналитика не расползалась по высоте и ширине.
              Полную матрицу можно открыть отдельной кнопкой в полноэкранном режиме.
            </p>
          </div>

          <div className="heatmap-toolbar">
            <HeatmapLegend />
            <button type="button" className="secondary-action action-button heatmap-expand-button" onClick={() => setIsHeatmapOpen(true)}>
              Открыть полную матрицу <Maximize2 size={16} />
            </button>
          </div>

          <div className="heatmap-preview-meta">
            <span>Показано тактик: {Math.min(8, mitreHeatmap.tactics.length)}</span>
            <span>Показано техник: {Math.min(10, mitreHeatmap.rows.length)}</span>
            <span>Вся матрица: {mitreHeatmap.rows.length} x {mitreHeatmap.tactics.length}</span>
          </div>

          <MitreHeatmapMatrix heatmap={mitreHeatmap} tacticLimit={8} rowLimit={10} />
        </article>
      </section>
      )}

      {isHeatmapOpen && (
        <div className="heatmap-modal-backdrop" role="presentation" onClick={() => setIsHeatmapOpen(false)}>
          <section className="heatmap-modal glass-panel" role="dialog" aria-modal="true" aria-label="Полная тепловая карта MITRE" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading mitre-heatmap-heading heatmap-modal-heading">
              <div>
                <div className="section-kicker-modern">Полная тепловая карта MITRE</div>
                <h3>Все тактики и техники с интенсивностью по числу связанных утилит</h3>
              </div>
              <button type="button" className="heatmap-close-button" onClick={() => setIsHeatmapOpen(false)}>
                Закрыть <X size={16} />
              </button>
            </div>

            <p className="heatmap-modal-copy">
              Чем краснее ячейка, тем больше уникальных утилит относятся к конкретной паре тактики и техники.
              Это полный вид покрытия без сокращений.
            </p>

            <HeatmapLegend />
            <MitreHeatmapMatrix heatmap={mitreHeatmap} />
          </section>
        </div>
      )}

      {currentTab === 'explorer' && (
      <section className="explorer-shell" id="tool-explorer">
        <div className="section-heading heading-light explorer-heading">
          <div>
            <div className="section-kicker-modern">Инструменты</div>
            <h3>Полноценный браузер по слою разведданных</h3>
          </div>
          <p>
            Здесь уже можно работать как в отдельном продукте: быстро фильтровать, искать и читать полный профиль
            инструмента без ограничений старой раскладки.
          </p>
        </div>

        <div className="explorer-controls glass-panel">
          <label className="control-block search-block">
            <span><Search size={14} /> Поиск</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="название, теги, описание..." />
          </label>
          <label className="control-block">
            <span>Источник</span>
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
              {sourceOptions.map((option) => (
                <option key={option} value={option}>{option === 'All' ? 'Все' : option}</option>
              ))}
            </select>
          </label>
          <label className="control-block">
            <span>Тактика MITRE</span>
            <select value={tacticFilter} onChange={(event) => setTacticFilter(event.target.value)}>
              {tacticOptions.map((option) => (
                <option key={option} value={option}>{option === 'All' ? 'Все' : option}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="explorer-grid">
          <section className="utility-list-panel glass-panel">
            <div className="panel-heading-row">
              <div>
                <div className="section-kicker-modern">Список утилит</div>
                <h3>Показано: {filteredTools.length}</h3>
              </div>
              <span className="panel-chip">По рангу</span>
            </div>
            <div className="utility-list-scroll">
              {filteredTools.map((tool) => {
                const active = selectedTool?.record_id === tool.record_id
                return (
                  <button
                    key={tool.record_id}
                    type="button"
                    className={`utility-list-item ${active ? 'is-active' : ''}`}
                    onClick={() => setSelectedId(tool.record_id)}
                  >
                    <div className="utility-list-topline">
                      <span>{rankLabel(tool.visualization_rank)}</span>
                      <span>{tool.source}</span>
                    </div>
                    <h4>{tool.assessed_name}</h4>
                    <p>{tool.short_description_ru}</p>
                    <div className="utility-list-footer">
                      <span>{tool.entity_type}</span>
                      <span>{tool.mitre_technique_count || 0} MITRE</span>
                      <span>{formatScore(tool.confidence_score)} уверенность</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="detail-panel glass-panel">
            {selectedTool ? (
              <>
                <div className="panel-heading-row">
                  <div>
                    <div className="section-kicker-modern">Профиль инструмента</div>
                    <h3>{selectedTool.assessed_name}</h3>
                  </div>
                  <a className="detail-link" href={selectedTool.url} target="_blank" rel="noreferrer">
                    Открыть источник <ExternalLink size={14} />
                  </a>
                </div>

                <div className="detail-stat-grid-modern">
                  <div>
                    <span>Ранг</span>
                    <strong>{rankLabel(selectedTool.visualization_rank)}</strong>
                  </div>
                  <div>
                    <span>Уверенность</span>
                    <strong>{formatScore(selectedTool.confidence_score)}</strong>
                  </div>
                  <div>
                    <span>Источник</span>
                    <strong>{selectedTool.source}</strong>
                  </div>
                  <div>
                    <span>Тип</span>
                    <strong>{selectedTool.entity_type}</strong>
                  </div>
                </div>

                <div className="detail-copy-grid">
                  <article>
                    <div className="detail-section-kicker">Краткое описание</div>
                    <p>{selectedTool.short_description_ru}</p>
                  </article>
                  <article>
                    <div className="detail-section-kicker">Контекст записи</div>
                    <div className="tool-context-grid">
                      <span><strong>source</strong>{formatMetaValue(selectedTool.source)}</span>
                      <span><strong>type</strong>{formatMetaValue(selectedTool.entity_type)}</span>
                      <span><strong>category</strong>{formatMetaValue(selectedTool.category_ru)}</span>
                      <span><strong>MITRE</strong>{selectedMatrix.length} связей</span>
                    </div>
                    {selectedDisplayTags.length > 0 && (
                      <div className="tag-ribbon compact-tags readable-tags">
                        {selectedDisplayTags.slice(0, 10).map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </article>
                </div>

                <article className="detail-longform">
                  <div className="detail-section-kicker">Полное описание</div>
                  <p>{selectedTool.long_description_ru}</p>
                </article>

                <section className="matrix-section-modern ttp-map-section">
                  <div className="panel-heading-row minor-heading">
                    <div>
                      <div className="detail-section-kicker">MITRE-связи инструмента</div>
                      <h4>Карта связей: инструмент {'->'} тактики {'->'} техники</h4>
                    </div>
                    <span className="panel-chip">{selectedTtpGroups.length} тактик · {selectedMatrix.length} техник</span>
                  </div>
                  {selectedTtpGroups.length ? (
                    <div className="ttp-map-layout">
                      <div className="ttp-overview-band">
                        <div className="ttp-tool-node">
                          <span>Инструмент</span>
                          <strong>{selectedTool.assessed_name}</strong>
                          <em>{formatMetaValue(selectedTool.category_ru)}</em>
                        </div>
                        <ArrowRight size={24} />
                        <div className="ttp-overview-stat">
                          <strong>{selectedTtpGroups.length}</strong>
                          <span>тактик</span>
                        </div>
                        <ArrowRight size={24} />
                        <div className="ttp-overview-stat">
                          <strong>{selectedMatrix.length}</strong>
                          <span>техник</span>
                        </div>
                      </div>

                      <div className="ttp-tactic-stack">
                        {selectedTtpGroups.map((group, groupIndex) => (
                          <article key={group.tactic} className="ttp-tactic-block">
                            <div className="ttp-tactic-node" style={{ '--tactic-accent': accentPalette[groupIndex % accentPalette.length] }}>
                              <div className="ttp-tactic-number">{String(groupIndex + 1).padStart(2, '0')}</div>
                              <div>
                                <span>Тактика MITRE</span>
                                <h5>{group.tactic}</h5>
                                <p>{group.description}</p>
                              </div>
                              <div className="ttp-tactic-metrics">
                                <strong>{group.techniques.length}</strong>
                                <span>техник</span>
                                <em>средняя уверенность {formatScore(group.avgConfidence)}</em>
                              </div>
                            </div>

                            <div className="ttp-flow-divider">
                              <span>Техники внутри тактики</span>
                            </div>

                            <div className="ttp-technique-grid">
                              {group.techniques.map((row, index) => (
                                <div key={`${row.technique_id}-${group.tactic}-${index}`} className="ttp-technique-card">
                                  <div className="ttp-technique-topline">
                                    <div className="ttp-technique-id">{row.technique_id}</div>
                                    <span>Уверенность {formatScore(row.confidence)}</span>
                                  </div>
                                  <h5>{row.technique_name}</h5>
                                  <div className="ttp-technique-explain">
                                    <strong>Что делает</strong>
                                    <p>{row.technique_description}</p>
                                  </div>
                                  {row.reasoning_ru && (
                                    <div className="ttp-technique-explain is-reason">
                                      <strong>Почему связали</strong>
                                      <p>{row.reasoning_ru}</p>
                                    </div>
                                  )}
                                  <div className="ttp-technique-meta">
                                    <span>source:{formatMetaValue(row.source)}</span>
                                    <span>{formatMetaValue(row.category_ru)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="empty-detail mitre-empty">Для этого инструмента MITRE-связи пока не рассчитаны.</div>
                  )}
                </section>

                <section className="matrix-section-modern refinement-section-modern compact-review-section">
                  <div className="panel-heading-row minor-heading">
                    <div>
                      <div className="detail-section-kicker">Уточнение MITRE</div>
                      <h4>{selectedRefinement.length} кандидатов на проверку</h4>
                    </div>
                  </div>
                  {selectedRefinement.length ? (
                    <div className="refinement-highlight-grid refinement-highlight-grid-detail">
                      {selectedRefinement.slice(0, 8).map((row) => (
                        <article key={`${row.record_id}-${row.technique_id}-${row.retrieval_rank}`} className="refinement-highlight-card refinement-highlight-card-detail">
                          <div className="refinement-card-topline">
                            <span className={`refinement-status-pill ${row.already_mapped ? 'is-mapped' : ''}`}>
                              {row.already_mapped ? 'Уже в матрице' : 'На проверку'}
                            </span>
                            <span>{formatScore(row.retrieval_score)} оценка</span>
                          </div>
                          <h4>{row.technique_id} · {row.technique_name}</h4>
                          <div className="refinement-meta-row">
                            <span>очередь #{row.retrieval_rank}</span>
                            <span>{row.mapped_confidence ? `${formatScore(row.mapped_confidence)} в матрице` : 'новый кандидат'}</span>
                          </div>
                          <div className="tag-ribbon compact-tags refinement-tag-ribbon">
                            {splitTactics(row.tactic_names).slice(0, 4).map((tactic) => (
                              <span key={`${row.record_id}-${row.technique_id}-${tactic}`}>{tactic}</span>
                            ))}
                          </div>
                          <div className="refinement-token-row">
                            {splitKeywords(row.matched_terms).slice(0, 6).map((term) => (
                              <span key={`${row.record_id}-${row.technique_id}-${term}`} className="refinement-token">{term}</span>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-detail refinement-empty">Для этой утилиты слой уточнения пока не нашёл дополнительных кандидатов.</div>
                  )}
                </section>

                <section className="matrix-section-modern">
                  <div className="panel-heading-row minor-heading">
                    <div>
                      <div className="detail-section-kicker">Техническая таблица MITRE</div>
                      <h4>{selectedMatrix.length} подтверждённых связей</h4>
                    </div>
                  </div>
                  <div className="matrix-table-modern">
                    <div className="matrix-table-head">
                      <span>Техника</span>
                      <span>Название</span>
                      <span>Тактика</span>
                      <span>Уверенность</span>
                    </div>
                    <div className="matrix-table-body">
                      {selectedMatrix.map((row, index) => (
                        <div className="matrix-table-row" key={`${row.technique_id}-${index}`}>
                          <span>{row.technique_id}</span>
                          <span>{row.technique_name}</span>
                          <span>{row.tactic}</span>
                          <span>{formatScore(row.confidence)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <div className="empty-detail">Нет данных для текущих фильтров.</div>
            )}
          </section>
        </div>
      </section>
      )}
    </main>
  )
}

export default App
