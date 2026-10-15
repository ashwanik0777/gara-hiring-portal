import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";

export const instant = false;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ user: null });
    }
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
      },
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}
