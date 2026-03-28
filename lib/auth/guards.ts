import "server-only";

import { redirect } from "next/navigation";

import { getOptionalAppSession } from "@/lib/auth/session";

export async function requireAppSession() {
  const session = await getOptionalAppSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}
