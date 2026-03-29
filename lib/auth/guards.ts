import "server-only";

import { redirect } from "next/navigation";

import { UnauthorizedError } from "@/lib/analysis/errors";
import { getOptionalAppSession } from "@/lib/auth/session";

export async function requireAppSession(returnTo = "/library") {
  const session = await getOptionalAppSession();

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  }

  return session;
}

export async function requireAppApiSession() {
  const session = await getOptionalAppSession();

  if (!session) {
    throw new UnauthorizedError();
  }

  return session;
}
