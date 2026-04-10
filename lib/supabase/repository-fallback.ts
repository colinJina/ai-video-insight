type SupabaseLikeError = {
  code?: string | null;
  hint?: string | null;
  message?: string | null;
  details?: string | null;
};

function includesTableMissingText(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return (
    value.includes("schema cache") ||
    value.includes("Could not find the table") ||
    value.includes('relation "') && value.includes('" does not exist')
  );
}

export function shouldFallbackToMemoryRepository(error: unknown) {
  const candidate = error as SupabaseLikeError | null | undefined;

  if (!candidate) {
    return false;
  }

  return (
    candidate.code === "PGRST205" ||
    candidate.code === "42P01" ||
    includesTableMissingText(candidate.message) ||
    includesTableMissingText(candidate.details) ||
    includesTableMissingText(candidate.hint)
  );
}
