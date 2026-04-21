import "server-only";

import { createHash } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database";
import { isSupabaseRepositoryConfigured } from "@/lib/supabase/env";
import { shouldFallbackToMemoryRepository } from "@/lib/supabase/repository-fallback";
import { isSupabaseBackedUserId } from "@/lib/supabase/user-id";
import type {
  AnalysisChatState,
  AnalysisStoredMemoryItem,
} from "@/lib/analysis/types";
import { isRecord } from "@/lib/analysis/utils";

type PersistedMemoryStateInput = {
  analysisId: string;
  userId: string;
  state: AnalysisChatState;
};

type MemoryStoreRow = {
  id: string;
  analysis_id: string;
  user_id: string;
  memory_key: string;
  kind: string;
  content: string;
  source: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export interface AnalysisMemoryStoreRepository {
  getState(analysisId: string, userId: string): Promise<AnalysisChatState>;
  replaceState(input: PersistedMemoryStateInput): Promise<AnalysisChatState>;
}

const CONVERSATION_SUMMARY_KEY = "conversation_summary";

function cloneValue<T>(value: T) {
  return structuredClone(value);
}

function normalizeMemoryFingerprint(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function createMemoryKey(kind: string, content: string) {
  return createHash("sha256")
    .update(`${kind.toLowerCase()}::${normalizeMemoryFingerprint(content)}`)
    .digest("hex");
}

function mapRowsToChatState(rows: MemoryStoreRow[]): AnalysisChatState {
  let conversationSummary: string | null = null;
  const memoryItems: AnalysisStoredMemoryItem[] = [];

  for (const row of rows) {
    if (row.memory_key === CONVERSATION_SUMMARY_KEY) {
      conversationSummary = row.content;
      continue;
    }

    memoryItems.push({
      id: row.id,
      kind: row.kind,
      content: row.content,
      source: row.source,
      metadata: isRecord(row.metadata) ? row.metadata : {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  return {
    conversationSummary,
    memoryItems,
  };
}

type GlobalMemoryStore = typeof globalThis & {
  __analysisMemoryStore__?: Map<string, AnalysisChatState>;
};

const memoryStore =
  ((globalThis as GlobalMemoryStore).__analysisMemoryStore__ ??=
    new Map<string, AnalysisChatState>());

class MemoryAnalysisMemoryStoreRepository implements AnalysisMemoryStoreRepository {
  async getState(analysisId: string, userId: string) {
    void userId;
    const state = memoryStore.get(analysisId);
    return cloneValue(
      state ?? {
        conversationSummary: null,
        memoryItems: [],
      },
    );
  }

  async replaceState({ analysisId, state }: PersistedMemoryStateInput) {
    memoryStore.set(analysisId, cloneValue(state));
    return this.getState(analysisId, "");
  }
}

class SupabaseAnalysisMemoryStoreRepository implements AnalysisMemoryStoreRepository {
  private async listRows(analysisId: string, userId: string) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("memory_store")
      .select("*")
      .eq("analysis_id", analysisId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []) as MemoryStoreRow[];
  }

  async getState(analysisId: string, userId: string) {
    return mapRowsToChatState(await this.listRows(analysisId, userId));
  }

  async replaceState({ analysisId, userId, state }: PersistedMemoryStateInput) {
    const currentRows = await this.listRows(analysisId, userId);
    const desiredRows = [
      ...(state.conversationSummary
        ? [
            {
              analysis_id: analysisId,
              user_id: userId,
              memory_key: CONVERSATION_SUMMARY_KEY,
              kind: "conversation_summary",
              content: state.conversationSummary,
              source: "analysis.chat",
              metadata: {},
            },
          ]
        : []),
      ...state.memoryItems.map((item) => ({
        analysis_id: analysisId,
        user_id: userId,
        memory_key: createMemoryKey(item.kind, item.content),
        kind: item.kind,
        content: item.content,
        source: item.source ?? null,
        metadata: (item.metadata ?? {}) as Json,
      })),
    ];
    const desiredKeys = new Set(desiredRows.map((row) => row.memory_key));
    const staleIds = currentRows
      .filter((row) => !desiredKeys.has(row.memory_key))
      .map((row) => row.id);
    const supabase = createSupabaseAdminClient();

    if (staleIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("memory_store")
        .delete()
        .in("id", staleIds);

      if (deleteError) {
        throw deleteError;
      }
    }

    if (desiredRows.length > 0) {
      const { error: upsertError } = await supabase
        .from("memory_store")
        .upsert(desiredRows, {
          onConflict: "analysis_id,memory_key",
        });

      if (upsertError) {
        throw upsertError;
      }
    }

    return this.getState(analysisId, userId);
  }
}

const memoryRepository = new MemoryAnalysisMemoryStoreRepository();
const supabaseRepository = isSupabaseRepositoryConfigured()
  ? new SupabaseAnalysisMemoryStoreRepository()
  : null;
let didWarnAboutMemoryStoreFallback = false;

async function runMemoryStoreRepository<T>(
  operation: string,
  runMemory: () => Promise<T>,
  runSupabase: (() => Promise<T>) | null,
) {
  if (!runSupabase) {
    return runMemory();
  }

  try {
    return await runSupabase();
  } catch (error) {
    if (!shouldFallbackToMemoryRepository(error)) {
      throw error;
    }

    if (!didWarnAboutMemoryStoreFallback) {
      didWarnAboutMemoryStoreFallback = true;
      console.warn(
        `[analysis] Memory store repository is unavailable during ${operation}; falling back to in-memory storage.`,
        error,
      );
    }

    return runMemory();
  }
}

const repository: AnalysisMemoryStoreRepository = {
  getState(analysisId, userId) {
    const useSupabase = supabaseRepository && isSupabaseBackedUserId(userId);
    return runMemoryStoreRepository(
      "getState",
      () => memoryRepository.getState(analysisId, userId),
      useSupabase ? () => supabaseRepository.getState(analysisId, userId) : null,
    );
  },
  replaceState(input) {
    const useSupabase = supabaseRepository && isSupabaseBackedUserId(input.userId);
    return runMemoryStoreRepository(
      "replaceState",
      () => memoryRepository.replaceState(input),
      useSupabase ? () => supabaseRepository.replaceState(input) : null,
    );
  },
};

export function getAnalysisMemoryStoreRepository() {
  return repository;
}
