import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database";
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  isSupabaseRepositoryConfigured,
} from "@/lib/supabase/env";

let adminClient: ReturnType<typeof createClient<Database>> | null = null;

export function createSupabaseAdminClient() {
  if (!isSupabaseRepositoryConfigured()) {
    throw new Error("Supabase repository is not configured.");
  }

  if (!adminClient) {
    adminClient = createClient<Database>(
      getSupabaseUrl(),
      getSupabaseServiceRoleKey(),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  return adminClient;
}
