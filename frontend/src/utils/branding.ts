export const resolveSystemName = (value?: string | null): string => {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : 'Narrix'
}
