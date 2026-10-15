type LogLevel = "debug" | "info" | "warn" | "error";

interface LogPayload {
  message: string;
  context?: Record<string, unknown>;
  error?: Error | unknown;
  correlationId?: string;
  userId?: string;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "token",
  "access_token",
  "refresh_token",
  "secret",
  "authorization",
  "cookie",
  "ssn",
  "pan",
  "aadhaar",
]);

/**
 * Recursively redacts sensitive fields from log metadata.
 */
function sanitize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

class Logger {
  private format(level: LogLevel, payload: LogPayload): string {
    const entry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message: payload.message,
      correlationId: payload.correlationId,
      userId: payload.userId,
      context: payload.context ? sanitize(payload.context) : undefined,
      error:
        payload.error instanceof Error
          ? {
              name: payload.error.name,
              message: payload.error.message,
              stack: process.env.NODE_ENV === "development" ? payload.error.stack : undefined,
            }
          : payload.error,
    };
    return JSON.stringify(entry);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "development") {
      console.debug(this.format("debug", { message, context }));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    console.info(this.format("info", { message, context }));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(this.format("warn", { message, context }));
  }

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    console.error(this.format("error", { message, error, context }));
  }
}

export const logger = new Logger();
