import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { destroySession, getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export const POST = apiHandler(async (request: Request) => {
  const user = await getSessionUser();
  await destroySession();
  if (user) {
    await audit("LOGOUT", { userId: user.id, email: user.email, request });
  }
  return NextResponse.json({ ok: true });
});
