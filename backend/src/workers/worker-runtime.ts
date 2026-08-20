import { ConfigNotFoundError } from '../services/config.service'
import { appLogger } from '../utils/logger'

export interface WorkerLogBindings {
  service: string
  environment: string
}

export interface WorkerErrorClassification {
  recoverable: boolean
  reason: 'missing_required_config' | 'worker_processing_error'
  errorName: string
  errorMessage: string
}

export const getWorkerLogBindings = (service: string): WorkerLogBindings => ({
  service,
  environment: process.env.NARRIX_PROFILE ?? process.env.NODE_ENV ?? 'unknown',
})

export const createWorkerLogger = (service: string) => appLogger.child(getWorkerLogBindings(service))

export const classifyWorkerError = (error: unknown): WorkerErrorClassification => {
  if (error instanceof ConfigNotFoundError) {
    return {
      recoverable: true,
      reason: 'missing_required_config',
      errorName: error.name,
      errorMessage: error.message,
    }
  }

  if (error instanceof Error) {
    return {
      recoverable: false,
      reason: 'worker_processing_error',
      errorName: error.name,
      errorMessage: error.message,
    }
  }

  return {
    recoverable: false,
    reason: 'worker_processing_error',
    errorName: 'UnknownError',
    errorMessage: String(error),
  }
}
