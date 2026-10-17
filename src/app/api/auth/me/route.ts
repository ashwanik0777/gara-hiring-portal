import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";

export const instant = false;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { user: null },
        {
          headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
        }
      );
    }
    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          roles: user.roles,
        },
      },
      {
        headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
      }
    );
  } catch {
    return NextResponse.json(
      { user: null },
      {
        headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
      }
    );
  }
}
