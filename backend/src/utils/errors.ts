export class AppError extends Error {
  public readonly status: number
  public readonly code: number

  public constructor(status: number, code: number, message: string) {
    super(message)
    this.name = this.constructor.name
    this.status = status
    this.code = code
  }
}

export class UnauthorizedError extends AppError {
  public constructor(message = '未登录或登录已过期') {
    super(401, 401, message)
  }
}

export class ForbiddenError extends AppError {
  public constructor(message = '无权限访问该资源') {
    super(403, 403, message)
  }
}

export class NotFoundError extends AppError {
  public constructor(message = '资源不存在') {
    super(404, 404, message)
  }
}

export class ConflictError extends AppError {
  public constructor(message = '资源状态冲突') {
    super(409, 409, message)
  }
}

export class ValidationAppError extends AppError {
  public constructor(message = '参数校��失败') {
    super(422, 422, message)
  }
}
