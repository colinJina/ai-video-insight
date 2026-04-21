import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database";
import { isSupabaseRepositoryConfigured } from "@/lib/supabase/env";
import { shouldFallbackToMemoryRepository } from "@/lib/supabase/repository-fallback";
import { isSupabaseBackedUserId } from "@/lib/supabase/user-id";
import type {
  AnalysisCheckpoint,
  AnalysisCheckpointStatus,
  AnalysisJobStage,
} from "@/lib/analysis/types";
import { isRecord } from "@/lib/analysis/utils";

type SaveAnalysisCheckpointInput = {
  analysisId: string;
  userId: string;
  stage: AnalysisJobStage;
  attempt: number;
  status: AnalysisCheckpointStatus;
  payload?: Record<string, unknown> | null;
  errorMessage?: string | null;
};

export interface AnalysisCheckpointRepository {
  save(input: SaveAnalysisCheckpointInput): Promise<AnalysisCheckpoint>;
  findLatestCompleted(
    analysisId: string,
    stage: AnalysisJobStage,
  ): Promise<AnalysisCheckpoint | null>;
}

function cloneValue<T>(value: T) {
  return structuredClone(value);
}

function mapRowToCheckpoint(row: {
  id: string;
  analysis_id: string;
  user_id: string;
  stage: AnalysisJobStage;
  attempt: number;
  status: AnalysisCheckpointStatus;
  payload: Json | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}): AnalysisCheckpoint {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    userId: row.user_id,
    stage: row.stage,
    attempt: row.attempt,
    status: row.status,
    payload: isRecord(row.payload) ? row.payload : null,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type GlobalCheckpointStore = typeof globalThis & {
  __analysisCheckpointStore__?: Map<string, AnalysisCheckpoint[]>;
};

const checkpointStore =
  ((globalThis as GlobalCheckpointStore).__analysisCheckpointStore__ ??=
    new Map<string, AnalysisCheckpoint[]>());

class MemoryAnalysisCheckpointRepository implements AnalysisCheckpointRepository {
  async save(input: SaveAnalysisCheckpointInput) {
    const now = new Date().toISOString();
    const current = checkpointStore.get(input.analysisId) ?? [];
    const existingIndex = current.findIndex(
      (entry) => entry.stage === input.stage && entry.attempt === input.attempt,
    );

    const nextCheckpoint: AnalysisCheckpoint = existingIndex >= 0
      ? {
          ...current[existingIndex],
          status: input.status,
          payload: input.payload ?? null,
          errorMessage: input.errorMessage ?? null,
          updatedAt: now,
        }
      : {
          id: crypto.randomUUID(),
          analysisId: input.analysisId,
          userId: input.userId,
          stage: input.stage,
          attempt: input.attempt,
          status: input.status,
          payload: input.payload ?? null,
          errorMessage: input.errorMessage ?? null,
          createdAt: now,
          updatedAt: now,
        };

    const next = [...current];
    if (existingIndex >= 0) {
      next[existingIndex] = nextCheckpoint;
    } else {
      next.push(nextCheckpoint);
    }

    checkpointStore.set(input.analysisId, next);
    return cloneValue(nextCheckpoint);
  }

  async findLatestCompleted(analysisId: string, stage: AnalysisJobStage) {
    const checkpoints = checkpointStore.get(analysisId) ?? [];
    const match = checkpoints
      .filter((entry) => entry.stage === stage && entry.status === "completed")
      .sort((left, right) => right.attempt - left.attempt)[0];

    return match ? cloneValue(match) : null;
  }
}

class SupabaseAnalysisCheckpointRepository implements AnalysisCheckpointRepository {
  async save(input: SaveAnalysisCheckpointInput) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("agent_checkpoints")
      .upsert(
        {
          analysis_id: input.analysisId,
          user_id: input.userId,
          stage: input.stage,
          attempt: input.attempt,
          status: input.status,
          payload: (input.payload ?? null) as Json | null,
          error_message: input.errorMessage ?? null,
        },
        {
          onConflict: "analysis_id,stage,attempt",
        },
      )
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return mapRowToCheckpoint(data);
  }

  async findLatestCompleted(analysisId: string, stage: AnalysisJobStage) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("agent_checkpoints")
      .select("*")
      .eq("analysis_id", analysisId)
      .eq("stage", stage)
      .eq("status", "completed")
      .order("attempt", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? mapRowToCheckpoint(data) : null;
  }
}

const memoryRepository = new MemoryAnalysisCheckpointRepository();
const supabaseRepository = isSupabaseRepositoryConfigured()
  ? new SupabaseAnalysisCheckpointRepository()
  : null;
let didWarnAboutCheckpointFallback = false;

async function runCheckpointRepository<T>(
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

    if (!didWarnAboutCheckpointFallback) {
      didWarnAboutCheckpointFallback = true;
      console.warn(
        `[analysis] Checkpoint repository is unavailable during ${operation}; falling back to in-memory storage.`,
        error,
      );
    }

    return runMemory();
  }
}

const repository: AnalysisCheckpointRepository = {
  save(input) {
    const useSupabase = supabaseRepository && isSupabaseBackedUserId(input.userId);
    return runCheckpointRepository(
      "save",
      () => memoryRepository.save(input),
      useSupabase ? () => supabaseRepository.save(input) : null,
    );
  },
  findLatestCompleted(analysisId, stage) {
    return runCheckpointRepository(
      "findLatestCompleted",
      () => memoryRepository.findLatestCompleted(analysisId, stage),
      supabaseRepository
        ? () => supabaseRepository.findLatestCompleted(analysisId, stage)
        : null,
    );
  },
};

export function getAnalysisCheckpointRepository() {
  return repository;
}
