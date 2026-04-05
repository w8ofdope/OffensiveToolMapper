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
const accentPalette = ['#ff7a3d', '#40b9b4', '#ffd166', '#8ecae6', '#fb8500', '#5dd39e']
const headerTabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'explorer', label: 'Explorer' },
]

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
    return 'n/a'
  }

  return Number(value).toFixed(2)
}

function rankLabel(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'n/a'
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
    return 'n/a'
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
      label: 'Mapped tools',
      value: mappedTools.length,
      meta: 'Утилиты с хотя бы одной MITRE-связью',
    },
    {
      label: 'Unique tactics',
      value: uniqueTactics,
      meta: 'Разные тактики, покрытые текущим набором',
    },
    {
      label: 'Unique techniques',
      value: uniqueTechniques,
      meta: 'Уникальные technique_id в текущем matrix-layer',
    },
    {
      label: 'Avg techniques',
      value: formatScore(avgTechniques),
      meta: 'Среднее число техник на mapped utility',
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
      label: 'Candidate rows',
      value: refinement.length,
      meta: 'Все retrieval-кандидаты из refinement-layer',
    },
    {
      label: 'Needs review',
      value: gaps.length,
      meta: 'Новые unmapped suggestions для ручной валидации',
    },
    {
      label: 'Tools with gaps',
      value: new Set(gaps.map((row) => row.record_id).filter(Boolean)).size,
      meta: 'Сколько tool profiles получили новые MITRE-кандидаты',
    },
    {
      label: 'Mapped confirmations',
      value: mapped.length,
      meta: 'Кандидаты, которые совпали с уже существующим mapping-layer',
    },
    {
      label: 'Gap techniques',
      value: new Set(gaps.map((row) => row.technique_id).filter(Boolean)).size,
      meta: 'Уникальные techniques среди unmapped candidates',
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
      <span>Меньше coverage</span>
      <div className="heatmap-legend-scale">
        {[0.12, 0.22, 0.38, 0.58, 0.78].map((alpha) => (
          <span key={alpha} style={{ backgroundColor: `rgba(180, 35, 24, ${alpha})` }} />
        ))}
      </div>
      <span>Больше coverage</span>
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
          <div className="mitre-heatmap-technique-header">Technique</div>
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
                  title={`${row.technique_id} / ${cell.tactic}: ${cell.count} utilities`}
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
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('All')
  const [tacticFilter, setTacticFilter] = useState('All')
  const [currentTab, setCurrentTab] = useState('overview')
  const [isHeatmapOpen, setIsHeatmapOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const deferredSearch = useDeferredValue(search.trim().toLowerCase())

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      try {
        setLoading(true)
        setError('')

        const [summaryResponse, toolsResponse, matrixResponse, refinementResponse] = await Promise.all([
          fetch('/data/summary.json'),
          fetch('/data/tools.json'),
          fetch('/data/matrix.json'),
          fetch('/data/refinement.json'),
        ])

        if (!summaryResponse.ok || !toolsResponse.ok || !matrixResponse.ok) {
          throw new Error('Не удалось загрузить экспортированные JSON-данные для modern UI.')
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
        setTools((toolsPayload || []).map((tool) => ({
          ...tool,
          filter_tags: normaliseArray(tool.filter_tags),
          mitre_tactics: normaliseArray(tool.mitre_tactics),
          mitre_technique_ids: normaliseArray(tool.mitre_technique_ids),
          mitre_technique_names: normaliseArray(tool.mitre_technique_names),
        })))
        setMatrix(matrixPayload || [])
        setRefinement((refinementPayload || []).map((row) => ({
          ...row,
          already_mapped: normaliseBoolean(row.already_mapped),
          tactic_names: normaliseArray(row.tactic_names),
          matched_terms: splitKeywords(row.matched_terms),
        })))
        setSelectedId(toolsPayload?.[0]?.record_id || null)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      cancelled = true
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
  const selectedRefinement = selectedTool
    ? refinement.filter((row) => row.record_id === selectedTool.record_id).sort(sortRefinementRows)
    : []

  useEffect(() => {
    if (!filteredTools.length) {
      return
    }

    if (!selectedTool || !filteredTools.some((tool) => tool.record_id === selectedTool.record_id)) {
      startTransition(() => {
        setSelectedId(filteredTools[0].record_id)
      })
    }
  }, [filteredTools, selectedTool])

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
        <p>Загрузка modern UI и аналитических данных...</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="app-root loading-state">
        <div className="error-panel">
          <h1>Modern UI не смог загрузить данные</h1>
          <p>{error}</p>
          <p>Сначала выполни экспорт JSON через `data-raw/export_webapp_data.R`, затем перезапусти webapp.</p>
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
            <div className="site-brand-subtitle">modern intelligence cockpit</div>
          </div>
        </div>

        <nav className="site-nav-tabs" aria-label="Page sections">
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
          <a className="primary-action header-dashboard-link" href={R_DASHBOARD_URL} target="_blank" rel="noreferrer">
            R dashboard <ExternalLink size={15} />
          </a>
        </div>
      </header>

      {currentTab === 'overview' && (
      <>
      <section className="hero-shell" id="overview">
        <div className="hero-copy-modern glass-panel">
          <div className="eyebrow-modern">Offensive tooling intelligence</div>
          <h1>Каталог offensive utilities, сигналов и MITRE-связей в более продуктовой оболочке</h1>
          <p>
            Здесь собраны уже отфильтрованные и оценённые offensive tools: удобнее смотреть,
            какие утилиты реально выходят наверх, из каких источников они приходят, как покрывают
            MITRE ATT&CK и какие записи сейчас выглядят наиболее содержательными и полезными.
          </p>
          <div className="hero-actions">
            <button type="button" className="primary-action action-button" onClick={() => setCurrentTab('explorer')}>
              Перейти к explorer <ArrowRight size={16} />
            </button>
            <button type="button" className="secondary-action action-button" onClick={() => setCurrentTab('analytics')}>
              Смотреть аналитику <Radar size={16} />
            </button>
          </div>
          <div className="hero-strip">
            <MetricCard
              icon={Sparkles}
              label="UI-ready tools"
              value={summary?.tool_count || tools.length}
              meta="LLM-оценка, описание, MITRE mapping"
            />
            <MetricCard
              icon={Layers3}
              label="MITRE links"
              value={summary?.matrix_count || matrix.length}
              meta="Связи tool -> tactic/technique"
            />
            <MetricCard
              icon={Shield}
              label="Top rank"
              value={featuredTool ? rankLabel(featuredTool.visualization_rank) : 'n/a'}
              meta={featuredTool ? featuredTool.assessed_name : 'Нет данных'}
            />
          </div>
        </div>

        <aside className="hero-spotlight-modern glass-panel">
          <div className="spotlight-topline">
            <span className="eyebrow-modern">Featured signal</span>
            <span className="spotlight-rank">{featuredTool ? rankLabel(featuredTool.visualization_rank) : 'n/a'}</span>
          </div>
          <h2>{featuredTool?.assessed_name || 'Нет данных'}</h2>
          <p>{featuredTool?.short_description_ru || 'Описание недоступно.'}</p>
          <div className="spotlight-stats-grid">
            <div>
              <span>Source</span>
              <strong>{featuredTool?.source || 'n/a'}</strong>
            </div>
            <div>
              <span>Confidence</span>
              <strong>{formatScore(featuredTool?.confidence_score)}</strong>
            </div>
            <div>
              <span>Entity</span>
              <strong>{featuredTool?.entity_type || 'n/a'}</strong>
            </div>
            <div>
              <span>MITRE</span>
              <strong>{featuredTool?.mitre_technique_count || 0} techniques</strong>
            </div>
          </div>
          <div className="tag-ribbon">
            {normaliseArray(featuredTool?.filter_tags).slice(0, 7).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </aside>
      </section>

      <section className="featured-ribbon-shell" id="featured-tools">
        <div className="section-heading heading-light">
          <div>
            <div className="section-kicker-modern">Top ranked utilities</div>
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
            <div className="section-kicker-modern">MITRE coverage</div>
            <h3>Как текущий набор offensive tools покрывает tactics и techniques</h3>
          </div>
          <p>
            Ниже уже не просто общая аналитика, а отдельный coverage-layer: сколько утилит реально маппятся,
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
              <div className="section-kicker-modern">Refinement queue</div>
              <h3>Где retrieval-layer нашёл дополнительные MITRE возможности</h3>
            </div>
            <p>
              Этот слой показывает не подтверждённые mapping-линки, а самые правдоподобные кандидаты,
              которые стоит досмотреть вручную или вынести в следующий validation-pass.
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
              <div className="section-kicker-modern">Coverage</div>
              <h3>MITRE tactic pressure</h3>
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
              <div className="section-kicker-modern">Coverage by source</div>
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
              <div className="section-kicker-modern">Source mix</div>
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
              <div className="section-kicker-modern">Technique hotspots</div>
              <h3>Какие MITRE techniques собирают больше всего utilities</h3>
            </div>
            <Shield size={18} />
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={techniqueCoverageSeries} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(180, 35, 24, 0.08)" horizontal={false} />
              <XAxis type="number" stroke="rgba(23, 23, 23, 0.55)" />
              <YAxis dataKey="name" type="category" width={150} stroke="rgba(23, 23, 23, 0.75)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid rgba(180, 35, 24, 0.10)', borderRadius: 16, color: '#171717' }} formatter={(value) => [value, 'mapped utilities']} />
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
              <div className="section-kicker-modern">Signal quality</div>
              <h3>Confidence distribution</h3>
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
              <div className="section-kicker-modern">Coverage leaders</div>
              <h3>Утилиты с наибольшим MITRE coverage</h3>
            </div>
            <Sparkles size={18} />
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={topCoverageTools} layout="vertical" margin={{ top: 10, right: 12, left: 20, bottom: 0 }}>
              <CartesianGrid stroke="rgba(180, 35, 24, 0.08)" horizontal={false} />
              <XAxis type="number" stroke="rgba(23, 23, 23, 0.55)" />
              <YAxis dataKey="name" type="category" width={140} stroke="rgba(23, 23, 23, 0.75)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid rgba(180, 35, 24, 0.10)', borderRadius: 16, color: '#171717' }} formatter={(value, name) => [value, name === 'techniques' ? 'MITRE techniques' : name]} />
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
              <div className="section-kicker-modern">Refinement techniques</div>
              <h3>Какие candidate techniques чаще всплывают как gaps</h3>
            </div>
            <Sparkles size={18} />
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={refinementTechniqueSeries} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(180, 35, 24, 0.08)" horizontal={false} />
              <XAxis type="number" stroke="rgba(23, 23, 23, 0.55)" />
              <YAxis dataKey="name" type="category" width={180} stroke="rgba(23, 23, 23, 0.75)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid rgba(180, 35, 24, 0.10)', borderRadius: 16, color: '#171717' }} formatter={(value) => [value, 'tools needing review']} />
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
              <div className="section-kicker-modern">Review queue</div>
              <h3>Инструменты с самым большим числом новых candidate links</h3>
            </div>
            <Layers3 size={18} />
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={refinementToolSeries} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(180, 35, 24, 0.08)" horizontal={false} />
              <XAxis type="number" stroke="rgba(23, 23, 23, 0.55)" />
              <YAxis dataKey="name" type="category" width={160} stroke="rgba(23, 23, 23, 0.75)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid rgba(180, 35, 24, 0.10)', borderRadius: 16, color: '#171717' }} formatter={(value) => [value, 'unmapped technique suggestions']} />
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
              <div className="section-kicker-modern">High-signal candidates</div>
              <h3>Приоритетный список новых MITRE suggestions</h3>
            </div>
            <p>
              Здесь собраны верхние unmapped suggestions по retrieval score. Это удобная short-list для ручной проверки
              перед тем, как расширять финальный MITRE matrix-layer.
            </p>
          </div>
          <div className="refinement-highlight-grid">
            {refinementHighlights.map((row) => (
              <article key={`${row.record_id}-${row.technique_id}-${row.retrieval_rank}`} className="refinement-highlight-card">
                <div className="refinement-card-topline">
                  <span className="refinement-status-pill">Needs review</span>
                  <span>{formatScore(row.retrieval_score)} score</span>
                </div>
                <h4>{row.technique_id} · {row.technique_name}</h4>
                <p>{row.tool_name}</p>
                <div className="refinement-meta-row">
                  <span>{row.source}</span>
                  <span>rank #{row.retrieval_rank}</span>
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
              <div className="section-kicker-modern">Matrix snapshot</div>
              <h3>Top tools x top tactics</h3>
            </div>
            <p>
              Компактный view по тому, какие из верхних утилит реально закрывают основные tactic-зоны в текущем dataset.
            </p>
          </div>
          <div className="coverage-matrix-grid">
            <div className="coverage-matrix-row coverage-matrix-header">
              <div className="coverage-matrix-tool-cell">Tool</div>
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
              <div className="section-kicker-modern">MITRE heatmap preview</div>
              <h3>Компактный preview полной tactic x technique матрицы</h3>
            </div>
            <p>
              На странице оставлен сокращённый preview, чтобы Analytics не расползалась по высоте и ширине.
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
            <span>Показаны top {Math.min(8, mitreHeatmap.tactics.length)} tactics</span>
            <span>Показаны top {Math.min(10, mitreHeatmap.rows.length)} techniques</span>
            <span>Total matrix: {mitreHeatmap.rows.length} x {mitreHeatmap.tactics.length}</span>
          </div>

          <MitreHeatmapMatrix heatmap={mitreHeatmap} tacticLimit={8} rowLimit={10} />
        </article>
      </section>
      )}

      {isHeatmapOpen && (
        <div className="heatmap-modal-backdrop" role="presentation" onClick={() => setIsHeatmapOpen(false)}>
          <section className="heatmap-modal glass-panel" role="dialog" aria-modal="true" aria-label="Full MITRE heatmap" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading mitre-heatmap-heading heatmap-modal-heading">
              <div>
                <div className="section-kicker-modern">Full MITRE heatmap</div>
                <h3>Все tactics и techniques с интенсивностью по числу mapped utilities</h3>
              </div>
              <button type="button" className="heatmap-close-button" onClick={() => setIsHeatmapOpen(false)}>
                Закрыть <X size={16} />
              </button>
            </div>

            <p className="heatmap-modal-copy">
              Чем краснее ячейка, тем больше уникальных утилит относятся к конкретной паре tactic и technique.
              Это полный coverage-view без сокращений.
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
            <div className="section-kicker-modern">Explorer</div>
            <h3>Полноценный browser поверх tool intelligence layer</h3>
          </div>
          <p>
            Здесь уже можно работать как в отдельном продукте: быстро фильтровать, искать и читать полный профиль
            инструмента без ограничений старого layout.
          </p>
        </div>

        <div className="explorer-controls glass-panel">
          <label className="control-block search-block">
            <span><Search size={14} /> Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="tool name, tags, description..." />
          </label>
          <label className="control-block">
            <span>Source</span>
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
              {sourceOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="control-block">
            <span>MITRE tactic</span>
            <select value={tacticFilter} onChange={(event) => setTacticFilter(event.target.value)}>
              {tacticOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="explorer-grid">
          <section className="utility-list-panel glass-panel">
            <div className="panel-heading-row">
              <div>
                <div className="section-kicker-modern">Utility list</div>
                <h3>{filteredTools.length} visible tools</h3>
              </div>
              <span className="panel-chip">Ranked explorer</span>
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
                      <span>{formatScore(tool.confidence_score)} confidence</span>
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
                    <div className="section-kicker-modern">Tool details</div>
                    <h3>{selectedTool.assessed_name}</h3>
                  </div>
                  <a className="detail-link" href={selectedTool.url} target="_blank" rel="noreferrer">
                    Open source page <ExternalLink size={14} />
                  </a>
                </div>

                <div className="detail-stat-grid-modern">
                  <div>
                    <span>Rank</span>
                    <strong>{rankLabel(selectedTool.visualization_rank)}</strong>
                  </div>
                  <div>
                    <span>Confidence</span>
                    <strong>{formatScore(selectedTool.confidence_score)}</strong>
                  </div>
                  <div>
                    <span>Source</span>
                    <strong>{selectedTool.source}</strong>
                  </div>
                  <div>
                    <span>Entity</span>
                    <strong>{selectedTool.entity_type}</strong>
                  </div>
                </div>

                <div className="detail-copy-grid">
                  <article>
                    <div className="detail-section-kicker">Short description</div>
                    <p>{selectedTool.short_description_ru}</p>
                  </article>
                  <article>
                    <div className="detail-section-kicker">Category</div>
                    <p>{selectedTool.category_ru}</p>
                    <div className="tag-ribbon compact-tags">
                      {normaliseArray(selectedTool.filter_tags).slice(0, 12).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  </article>
                </div>

                <article className="detail-longform">
                  <div className="detail-section-kicker">Long description</div>
                  <p>{selectedTool.long_description_ru}</p>
                </article>

                <section className="matrix-section-modern refinement-section-modern">
                  <div className="panel-heading-row minor-heading">
                    <div>
                      <div className="detail-section-kicker">MITRE refinement</div>
                      <h4>{selectedRefinement.length} candidate mappings</h4>
                    </div>
                  </div>
                  {selectedRefinement.length ? (
                    <div className="refinement-highlight-grid refinement-highlight-grid-detail">
                      {selectedRefinement.slice(0, 8).map((row) => (
                        <article key={`${row.record_id}-${row.technique_id}-${row.retrieval_rank}`} className="refinement-highlight-card refinement-highlight-card-detail">
                          <div className="refinement-card-topline">
                            <span className={`refinement-status-pill ${row.already_mapped ? 'is-mapped' : ''}`}>
                              {row.already_mapped ? 'Already mapped' : 'Needs review'}
                            </span>
                            <span>{formatScore(row.retrieval_score)} score</span>
                          </div>
                          <h4>{row.technique_id} · {row.technique_name}</h4>
                          <div className="refinement-meta-row">
                            <span>rank #{row.retrieval_rank}</span>
                            <span>{row.mapped_confidence ? `${formatScore(row.mapped_confidence)} mapped confidence` : 'new candidate'}</span>
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
                    <div className="empty-detail refinement-empty">Для этой утилиты refinement-layer пока не нашёл дополнительных кандидатов.</div>
                  )}
                </section>

                <section className="matrix-section-modern">
                  <div className="panel-heading-row minor-heading">
                    <div>
                      <div className="detail-section-kicker">Selected tool MITRE</div>
                      <h4>{selectedMatrix.length} relevant mappings</h4>
                    </div>
                  </div>
                  <div className="matrix-table-modern">
                    <div className="matrix-table-head">
                      <span>Technique</span>
                      <span>Name</span>
                      <span>Tactic</span>
                      <span>Confidence</span>
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
