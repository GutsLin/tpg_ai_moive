import pino from 'pino'

const redactPaths = [
  'req.headers.authorization',
  'req.body.password',
  '*.password',
  '*.password_hash',
  '*.ark_api_key',
  '*.ark_access_key',
  '*.ark_secret_key',
  '*.oss_access_key_id',
  '*.oss_access_key_secret',
  '*.value',
]

export const appLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
})
