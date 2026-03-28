export function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

export function getSupabasePublishableKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
}

export function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

export function isSupabaseAuthConfigured() {
  return Boolean(getSupabaseUrl() && getSupabasePublishableKey());
}

export function isSupabaseRepositoryConfigured() {
  return Boolean(
    getSupabaseUrl() &&
      getSupabasePublishableKey() &&
      getSupabaseServiceRoleKey(),
  );
}
