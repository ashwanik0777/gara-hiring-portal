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

/**
 * Maps well-known Prisma request errors (detected structurally so this module stays
 * free of database imports) to operational errors with safe messages.
 */
function fromPrismaKnownError(error: unknown): AppError | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = (error as { code: unknown }).code;
  if (code === "P2002") {
    return new ConflictError("A record with these details already exists.");
  }
  if (code === "P2025" || code === "P2001") {
    return new NotFoundError("The requested record no longer exists.");
  }
  if (code === "P2003") {
    return new ValidationError("A referenced record does not exist.");
  }
  return null;
}

/**
 * Converts any thrown value into a message that is safe to return from a Server Action.
 * Only operational AppError messages reach the client; everything else is logged
 * server-side and replaced with the provided generic fallback.
 */
export function toActionError(
  error: unknown,
  fallback = "An unexpected error occurred. Please try again later."
): string {
  if (error instanceof AppError && error.isOperational) {
    return error.message;
  }

  const prismaError = fromPrismaKnownError(error);
  if (prismaError) {
    return prismaError.message;
  }

  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message: "Unhandled Server Action error",
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
            }
          : String(error),
    })
  );
  return fallback;
}
