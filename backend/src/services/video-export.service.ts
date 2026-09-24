export interface VideoExportData {
  models: Array<{
    projectName: string
    model: string
    totalRequests: number
    avgDurationSeconds: number
    totalTokensConsumed: number
    totalTokensSucceeded: number
  }>
  projects: Array<{
    projectName: string
    validRequestCount: number
    avgDurationSeconds: number
  }>
  members: Array<{
    projectName: string
    userName: string
    requestCount: number
    totalTokensConsumed: number
  }>
}

export interface VideoTaskExportRow {
  userName: string
  createdAt: Date
  taskId: number
  arkTaskId: string | null
  model: string
}

const neutralizeSpreadsheetFormula = (value: string): string =>
  /^[=+\-@\t\r]/.test(value) ? `'${value}` : value

const escapeCsv = (value: unknown): string => {
  const raw = String(value ?? '')
  const normalized = neutralizeSpreadsheetFormula(raw)

  if (normalized.includes(',') || normalized.includes('"') || normalized.includes('\n')) {
    return `"${normalized.replace(/"/g, '""')}"`
  }

  return normalized
}

const appendCsvRow = (lines: string[], values: unknown[]): void => {
  lines.push(values.map(escapeCsv).join(','))
}

export const buildVideoExportCsv = ({ models, projects, members }: VideoExportData): string => {
  const lines: string[] = []

  lines.push('按项目×模型汇总')
  appendCsvRow(lines, ['项目名称', '模型', '总请求数', '平均视频时长(秒)', '消耗总Token(M)', '生成总Token(M)'])
  for (const row of models) {
    appendCsvRow(lines, [
      row.projectName,
      row.model,
      row.totalRequests,
      row.avgDurationSeconds.toFixed(2),
      (row.totalTokensConsumed / 1_000_000).toFixed(2),
      (row.totalTokensSucceeded / 1_000_000).toFixed(2),
    ])
  }

  lines.push('', '按项目金额汇总')
  appendCsvRow(lines, ['项目名称', '总有效请求数', '平均时长(秒)', '项目金额'])

  const projectAmounts = new Map<string, number>()
  for (const row of projects) {
    const projectAmount = Number((row.validRequestCount * row.avgDurationSeconds).toFixed(2))
    projectAmounts.set(row.projectName, projectAmount)
    appendCsvRow(lines, [
      row.projectName,
      row.validRequestCount,
      row.avgDurationSeconds.toFixed(2),
      projectAmount.toFixed(2),
    ])
  }

  lines.push('', '按项目×成员请求数')
  appendCsvRow(lines, ['项目名称', '成员', '请求数', '消耗Token(M)', 'Token占比(%)', '个人金额'])

  const projectTokenTotals = new Map<string, number>()
  for (const row of members) {
    projectTokenTotals.set(
      row.projectName,
      (projectTokenTotals.get(row.projectName) ?? 0) + row.totalTokensConsumed
    )
  }

  let currentProject: string | null = null
  let projectRequestCount = 0
  let projectTokenTotal = 0
  let projectPersonalAmount = 0

  const appendProjectSummary = (): void => {
    if (currentProject === null) {
      return
    }

    appendCsvRow(lines, [
      currentProject,
      '项目汇总',
      projectRequestCount,
      (projectTokenTotal / 1_000_000).toFixed(2),
      projectTokenTotal > 0 ? '100.00%' : '0.00%',
      projectPersonalAmount.toFixed(2),
    ])
  }

  for (const row of members) {
    if (currentProject !== null && row.projectName !== currentProject) {
      appendProjectSummary()
      projectRequestCount = 0
      projectTokenTotal = 0
      projectPersonalAmount = 0
    }

    currentProject = row.projectName
    const projectTokenTotalForRatio = projectTokenTotals.get(row.projectName) ?? 0
    const tokenRatio = projectTokenTotalForRatio > 0
      ? (row.totalTokensConsumed / projectTokenTotalForRatio) * 100
      : 0
    const projectAmount = projectAmounts.get(row.projectName) ?? 0
    const personalAmount = Number(((tokenRatio / 100) * projectAmount).toFixed(2))

    projectRequestCount += row.requestCount
    projectTokenTotal += row.totalTokensConsumed
    projectPersonalAmount += personalAmount

    appendCsvRow(lines, [
      row.projectName,
      row.userName,
      row.requestCount,
      (row.totalTokensConsumed / 1_000_000).toFixed(2),
      `${tokenRatio.toFixed(2)}%`,
      personalAmount.toFixed(2),
    ])
  }
  appendProjectSummary()

  return `\uFEFF${lines.join('\r\n')}`
}

const formatShanghaiDateTime = (value: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(value)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

export const buildVideoTaskExportCsv = (rows: VideoTaskExportRow[]): string => {
  const lines: string[] = []
  appendCsvRow(lines, ['用户名称', '时间', '任务ID', 'TaskId', '模型名称'])
  for (const row of rows) {
    appendCsvRow(lines, [
      row.userName,
      formatShanghaiDateTime(row.createdAt),
      row.taskId,
      row.arkTaskId,
      row.model,
    ])
  }
  return `\uFEFF${lines.join('\r\n')}`
}

export const createVideoExportFileNames = (
  date: Date,
  status?: string
): { ascii: string; utf8: string } => {
  const shanghaiDate = new Date(date.getTime() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '')
  const statusTag = status ? `_${status}` : ''

  return {
    ascii: `Narrix_${shanghaiDate}${statusTag}.csv`,
    utf8: `Narrix全项目统计_${shanghaiDate}${statusTag}.csv`,
  }
}

export const createVideoTaskExportFileName = (date: Date): { ascii: string; utf8: string } => {
  const shanghaiDate = new Date(date.getTime() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '')

  return {
    ascii: `Narrix_tasks_${shanghaiDate}.csv`,
    utf8: `Narrix用户任务明细_${shanghaiDate}.csv`,
  }
}
