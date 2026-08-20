export const isUniqueViolationError = (
  error: unknown,
  constraintNames: string[] = []
): error is Error & { code: string; constraint?: string } => {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as { code?: string; constraint?: string }
  if (candidate.code !== '23505') {
    return false
  }

  if (constraintNames.length === 0) {
    return true
  }

  return Boolean(candidate.constraint && constraintNames.includes(candidate.constraint))
}
