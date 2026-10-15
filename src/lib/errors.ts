export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, code = "INTERNAL_ERROR", statusCode = 500, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required to access this resource") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Requested resource was not found") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ValidationError extends AppError {
  public readonly issues: unknown[];

  constructor(message = "Invalid input data", issues: unknown[] = []) {
    super(message, "VALIDATION_ERROR", 400);
    this.issues = issues;
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict detected") {
    super(message, "CONFLICT", 409);
  }
}

export class PolicyBlockedError extends AppError {
  public readonly decisionRef: string;

  constructor(decisionRef: string, message: string) {
    super(`[POLICY BLOCKED - ${decisionRef}] ${message}`, "POLICY_BLOCKED", 422);
    this.decisionRef = decisionRef;
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfterSeconds: number;

  constructor(
    retryAfterSeconds: number,
    message = "Too many requests. Please wait before trying again."
  ) {
    super(message, "RATE_LIMIT_EXCEEDED", 429);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Transforms an unknown error into a safe client-facing payload without leaking stack traces.
 */
export function toSafeErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      success: false as const,
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }

  // Generic fallback: never expose internal exceptions in production
  return {
    success: false as const,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred. Please try again later.",
    },
  };
}
