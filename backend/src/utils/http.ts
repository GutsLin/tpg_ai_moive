export interface ApiSuccessResponse<T> {
  code: 0
  data: T
  message: 'ok'
}

export interface ApiErrorResponse {
  code: number
  data: null
  message: string
}

export const ok = <T>(data: T): ApiSuccessResponse<T> => ({
  code: 0,
  data,
  message: 'ok',
})

export const fail = (code: number, message: string): ApiErrorResponse => ({
  code,
  data: null,
  message,
})
