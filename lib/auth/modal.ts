import { sanitizeRedirectPath } from "@/lib/auth/utils";

function sanitizeBasePath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export function buildAuthModalHref(basePath: string, nextPath: string) {
  const safeBasePath = sanitizeBasePath(basePath);
  const [pathname, search = ""] = safeBasePath.split("?");
  const params = new URLSearchParams(search);

  params.set("auth", "login");
  params.set("next", sanitizeRedirectPath(nextPath));

  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function stripAuthModalParams(basePath: string) {
  const safeBasePath = sanitizeBasePath(basePath);
  const [pathname, search = ""] = safeBasePath.split("?");
  const params = new URLSearchParams(search);

  params.delete("auth");
  params.delete("next");

  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}
