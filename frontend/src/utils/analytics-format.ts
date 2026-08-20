export const formatCompactNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-'
  }

  const absoluteValue = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  if (absoluteValue >= 1_000_000) {
    return `${sign}${(absoluteValue / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  }

  if (absoluteValue >= 1_000) {
    return `${sign}${(absoluteValue / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  }

  return `${value}`
}

export const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-'
  }

  return `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`
}

export const formatDurationSeconds = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-'
  }

  if (value < 60) {
    return `${value.toFixed(value % 1 === 0 ? 0 : 1).replace(/\.0$/, '')} 秒`
  }

  const minutes = Math.floor(value / 60)
  const remainSeconds = value - minutes * 60
  const remainText = remainSeconds > 0 ? ` ${remainSeconds.toFixed(remainSeconds % 1 === 0 ? 0 : 1).replace(/\.0$/, '')} 秒` : ''

  return `${minutes} 分${remainText}`
}
