import { describe, it, expect } from "vitest";
import { cn, formatDate } from "@/lib/utils";
import {
  UnauthorizedError,
  ForbiddenError,
  toSafeErrorResponse,
} from "@/lib/errors";

describe("lib/utils", () => {
  it("cn merges class names properly and resolves conflicts", () => {
    expect(cn("bg-red-500", "text-white")).toBe("bg-red-500 text-white");
    expect(cn("p-4", "p-2")).toBe("p-2");
    expect(cn("px-4", undefined, null, false && "py-2")).toBe("px-4");
  });

  it("formatDate formats dates deterministically", () => {
    const formatted = formatDate(new Date("2026-10-12T12:00:00Z"));
    expect(formatted).toContain("Oct");
    expect(formatted).toContain("2026");
  });
});

describe("lib/errors", () => {
  it("creates domain error with correct properties", () => {
    const err = new UnauthorizedError("Session expired");
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("Session expired");
  });

  it("toSafeErrorResponse transforms AppError cleanly", () => {
    const err = new ForbiddenError("Forbidden action");
    const res = toSafeErrorResponse(err);
    expect(res).toEqual({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Forbidden action",
      },
    });
  });

  it("toSafeErrorResponse conceals internal unexpected exceptions", () => {
    const rawError = new Error("Database connection pool exhausted at secret_ip:5432");
    const res = toSafeErrorResponse(rawError);
    expect(res.success).toBe(false);
    expect(res.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(res.error.message).not.toContain("secret_ip");
  });
});
