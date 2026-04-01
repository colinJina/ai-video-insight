import { redirect } from "next/navigation";

import { buildAuthModalHref } from "@/lib/auth/modal";
import { sanitizeRedirectPath } from "@/lib/auth/utils";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const nextPath = sanitizeRedirectPath(requestedNext);

  redirect(buildAuthModalHref("/dashboard", nextPath));
}
