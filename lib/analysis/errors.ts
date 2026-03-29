export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly exposeMessage = true,
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}

export class ValidationError extends AnalysisError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AnalysisError {
  constructor(message = "请先登录后继续。") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AnalysisError {
  constructor(message = "你没有权限访问这项内容。") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AnalysisError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AnalysisError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class ExternalServiceError extends AnalysisError {
  constructor(message: string, exposeMessage = false) {
    super(message, 502, "EXTERNAL_SERVICE_ERROR", exposeMessage);
    this.name = "ExternalServiceError";
  }
}

export class TimeoutError extends AnalysisError {
  constructor(message: string) {
    super(message, 504, "TIMEOUT");
    this.name = "TimeoutError";
  }
}

export function getErrorStatusCode(error: unknown) {
  return error instanceof AnalysisError ? error.statusCode : 500;
}

export function getErrorCode(error: unknown) {
  return error instanceof AnalysisError ? error.code : "INTERNAL_SERVER_ERROR";
}

export function getPublicErrorMessage(error: unknown) {
  if (error instanceof AnalysisError) {
    if (error.exposeMessage) {
      return error.message;
    }

    if (error instanceof ExternalServiceError) {
      return "AI 服务暂时不可用，请稍后重试。";
    }
  }

  return "服务端暂时无法完成请求，请稍后重试。";
}
