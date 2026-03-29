export function sanitizeRedirectPath(value: string | null | undefined) {
  if (!value) {
    return "/library";
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/library";
  }

  return value;
}
