import { NextRequest, NextResponse } from "next/server";
import { logAppError } from "@/lib/appErrors";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await logAppError({
      message: body.message ?? "Unknown error",
      error: body.error,
      category: body.category,
      level: body.level,
      projectId: body.projectId,
      userId: body.userId,
      path: body.path,
      statusCode: body.statusCode,
      metadata: body.metadata,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
