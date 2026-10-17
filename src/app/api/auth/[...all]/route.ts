import { auth } from "@/lib/auth/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";

const handlers = toNextJsHandler(auth.handler);

export async function POST(request: NextRequest) {
  try {
    return await handlers.POST(request);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Internal Server Error";
    console.error("[BetterAuth API Error - POST]:", error);
    return NextResponse.json(
      {
        error: "Authentication service error",
        message: errorMsg,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    return await handlers.GET(request);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Internal Server Error";
    console.error("[BetterAuth API Error - GET]:", error);
    return NextResponse.json(
      {
        error: "Authentication service error",
        message: errorMsg,
      },
      { status: 500 }
    );
  }
}
