import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseRepositoryConfigured } from "@/lib/supabase/env";
import { shouldFallbackToMemoryRepository } from "@/lib/supabase/repository-fallback";
import { isSupabaseBackedUserId } from "@/lib/supabase/user-id";
import type {
  AnalysisJob,
  AnalysisJobStage,
} from "@/lib/analysis/types";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_SECONDS = 120;

type UpsertAnalysisJobInput = {
  analysisId: string;
  userId: string;
  maxAttempts?: number;
};

type FailAnalysisJobInput = {
  analysisId: string;
  workerId: string;
  stage: AnalysisJobStage;
  errorMessage: string;
  retryDelaySeconds: number;
};

export interface AnalysisJobRepository {
  enqueue(input: UpsertAnalysisJobInput): Promise<AnalysisJob>;
  findByAnalysisId(analysisId: string): Promise<AnalysisJob | null>;
  listRunnable(limit: number): Promise<AnalysisJob[]>;
  claim(analysisId: string, workerId: string): Promise<AnalysisJob | null>;
  heartbeat(analysisId: string, workerId: string): Promise<AnalysisJob | null>;
  markStage(
    analysisId: string,
    workerId: string,
    stage: AnalysisJobStage,
  ): Promise<AnalysisJob | null>;
  complete(analysisId: string, workerId: string): Promise<AnalysisJob | null>;
  fail(input: FailAnalysisJobInput): Promise<AnalysisJob | null>;
}

function cloneValue<T>(value: T) {
  return structuredClone(value);
}

function mapRowToAnalysisJob(row: {
  analysis_id: string;
  user_id: string;
  status: AnalysisJob["status"];
  stage: AnalysisJobStage;
  attempt_count: number;
  max_attempts: number;
  next_run_at: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}): AnalysisJob {
  return {
    analysisId: row.analysis_id,
    userId: row.user_id,
    status: row.status,
    stage: row.stage,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextRunAt: row.next_run_at,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function isLeaseExpired(job: AnalysisJob, now = Date.now()) {
  if (!job.leaseExpiresAt) {
    return true;
  }

  return Date.parse(job.leaseExpiresAt) <= now;
}

type GlobalAnalysisJobStore = typeof globalThis & {
  __analysisJobStore__?: Map<string, AnalysisJob>;
};

const jobStore =
  ((globalThis as GlobalAnalysisJobStore).__analysisJobStore__ ??=
    new Map<string, AnalysisJob>());

class MemoryAnalysisJobRepository implements AnalysisJobRepository {
  async enqueue({ analysisId, userId, maxAttempts = DEFAULT_MAX_ATTEMPTS }: UpsertAnalysisJobInput) {
    const now = new Date().toISOString();
    const next: AnalysisJob = {
      analysisId,
      userId,
      status: "queued",
      stage: "queued",
      attemptCount: 0,
      maxAttempts,
      nextRunAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastHeartbeatAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
    };

    jobStore.set(analysisId, next);
    return cloneValue(next);
  }

  async findByAnalysisId(analysisId: string) {
    const job = jobStore.get(analysisId);
    return job ? cloneValue(job) : null;
  }

  async listRunnable(limit: number) {
    const now = Date.now();
    return [...jobStore.values()]
      .filter((job) => {
        const due = Date.parse(job.nextRunAt) <= now;
        return due && (job.status === "queued" || (job.status === "running" && isLeaseExpired(job, now)));
      })
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(0, limit)
      .map(cloneValue);
  }

  async claim(analysisId: string, workerId: string) {
    const job = jobStore.get(analysisId);
    if (!job) {
      return null;
    }

    const now = Date.now();
    const due = Date.parse(job.nextRunAt) <= now;
    if (!due) {
      return null;
    }

    if (job.status !== "queued" && !(job.status === "running" && isLeaseExpired(job, now))) {
      return null;
    }

    const next: AnalysisJob = {
      ...job,
      status: "running",
      attemptCount: job.attemptCount + 1,
      leaseOwner: workerId,
      leaseExpiresAt: new Date(now + DEFAULT_LEASE_SECONDS * 1000).toISOString(),
      lastHeartbeatAt: new Date(now).toISOString(),
      startedAt: job.startedAt ?? new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };

    jobStore.set(analysisId, next);
    return cloneValue(next);
  }

  async heartbeat(analysisId: string, workerId: string) {
    const job = jobStore.get(analysisId);
    if (!job || job.status !== "running" || job.leaseOwner !== workerId) {
      return null;
    }

    const now = Date.now();
    const next: AnalysisJob = {
      ...job,
      lastHeartbeatAt: new Date(now).toISOString(),
      leaseExpiresAt: new Date(now + DEFAULT_LEASE_SECONDS * 1000).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };

    jobStore.set(analysisId, next);
    return cloneValue(next);
  }

  async markStage(analysisId: string, workerId: string, stage: AnalysisJobStage) {
    const job = jobStore.get(analysisId);
    if (!job || job.status !== "running" || job.leaseOwner !== workerId) {
      return null;
    }

    const next: AnalysisJob = {
      ...job,
      stage,
      updatedAt: new Date().toISOString(),
    };

    jobStore.set(analysisId, next);
    return cloneValue(next);
  }

  async complete(analysisId: string, workerId: string) {
    const job = jobStore.get(analysisId);
    if (!job || job.status !== "running" || job.leaseOwner !== workerId) {
      return null;
    }

    const now = new Date().toISOString();
    const next: AnalysisJob = {
      ...job,
      status: "completed",
      stage: "completed",
      leaseOwner: null,
      leaseExpiresAt: null,
      lastHeartbeatAt: now,
      lastError: null,
      completedAt: now,
      updatedAt: now,
    };

    jobStore.set(analysisId, next);
    return cloneValue(next);
  }

  async fail({
    analysisId,
    workerId,
    stage,
    errorMessage,
    retryDelaySeconds,
  }: FailAnalysisJobInput) {
    const job = jobStore.get(analysisId);
    if (!job || job.status !== "running" || job.leaseOwner !== workerId) {
      return null;
    }

    const now = Date.now();
    const shouldRetry = job.attemptCount < job.maxAttempts;
    const next: AnalysisJob = {
      ...job,
      status: shouldRetry ? "queued" : "failed",
      stage: shouldRetry ? stage : "failed",
      nextRunAt: new Date(now + (shouldRetry ? retryDelaySeconds * 1000 : 0)).toISOString(),
      leaseOwner: null,
      leaseExpiresAt: null,
      lastHeartbeatAt: new Date(now).toISOString(),
      lastError: errorMessage,
      completedAt: shouldRetry ? null : new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };

    jobStore.set(analysisId, next);
    return cloneValue(next);
  }
}

class SupabaseAnalysisJobRepository implements AnalysisJobRepository {
  async enqueue({ analysisId, userId, maxAttempts = DEFAULT_MAX_ATTEMPTS }: UpsertAnalysisJobInput) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("analysis_jobs")
      .upsert(
        {
          analysis_id: analysisId,
          user_id: userId,
          status: "queued",
          stage: "queued",
          attempt_count: 0,
          max_attempts: maxAttempts,
          next_run_at: new Date().toISOString(),
          lease_owner: null,
          lease_expires_at: null,
          last_heartbeat_at: null,
          last_error: null,
          started_at: null,
          completed_at: null,
        },
        {
          onConflict: "analysis_id",
        },
      )
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return mapRowToAnalysisJob(data);
  }

  async findByAnalysisId(analysisId: string) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("analysis_jobs")
      .select("*")
      .eq("analysis_id", analysisId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? mapRowToAnalysisJob(data) : null;
  }

  async listRunnable(limit: number) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("analysis_jobs")
      .select("*")
      .in("status", ["queued", "running"])
      .order("updated_at", { ascending: true })
      .limit(Math.max(limit * 4, limit));

    if (error) {
      throw error;
    }

    const now = Date.now();
    return (data ?? [])
      .map(mapRowToAnalysisJob)
      .filter((job) => {
        const due = Date.parse(job.nextRunAt) <= now;
        return due && (job.status === "queued" || (job.status === "running" && isLeaseExpired(job, now)));
      })
      .slice(0, limit);
  }

  async claim(analysisId: string, workerId: string) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("claim_analysis_job", {
      claim_analysis_id: analysisId,
      claim_worker_id: workerId,
      claim_lease_seconds: DEFAULT_LEASE_SECONDS,
    });

    if (error) {
      throw error;
    }

    return data?.[0] ? mapRowToAnalysisJob(data[0]) : null;
  }

  async heartbeat(analysisId: string, workerId: string) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("heartbeat_analysis_job", {
      claim_analysis_id: analysisId,
      claim_worker_id: workerId,
      claim_lease_seconds: DEFAULT_LEASE_SECONDS,
    });

    if (error) {
      throw error;
    }

    return data?.[0] ? mapRowToAnalysisJob(data[0]) : null;
  }

  async markStage(analysisId: string, workerId: string, stage: AnalysisJobStage) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("advance_analysis_job_stage", {
      claim_analysis_id: analysisId,
      claim_worker_id: workerId,
      next_stage: stage,
    });

    if (error) {
      throw error;
    }

    return data?.[0] ? mapRowToAnalysisJob(data[0]) : null;
  }

  async complete(analysisId: string, workerId: string) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("complete_analysis_job", {
      claim_analysis_id: analysisId,
      claim_worker_id: workerId,
    });

    if (error) {
      throw error;
    }

    return data?.[0] ? mapRowToAnalysisJob(data[0]) : null;
  }

  async fail({
    analysisId,
    workerId,
    stage,
    errorMessage,
    retryDelaySeconds,
  }: FailAnalysisJobInput) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("fail_analysis_job", {
      claim_analysis_id: analysisId,
      claim_worker_id: workerId,
      failure_stage: stage,
      failure_error: errorMessage,
      retry_delay_seconds: retryDelaySeconds,
    });

    if (error) {
      throw error;
    }

    return data?.[0] ? mapRowToAnalysisJob(data[0]) : null;
  }
}

const memoryRepository = new MemoryAnalysisJobRepository();
const supabaseRepository = isSupabaseRepositoryConfigured()
  ? new SupabaseAnalysisJobRepository()
  : null;
let didWarnAboutJobRepositoryFallback = false;

async function runAnalysisJobRepository<T>(
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

    if (!didWarnAboutJobRepositoryFallback) {
      didWarnAboutJobRepositoryFallback = true;
      console.warn(
        `[analysis] Job repository is unavailable during ${operation}; falling back to in-memory storage.`,
        error,
      );
    }

    return runMemory();
  }
}

const repository: AnalysisJobRepository = {
  enqueue(input) {
    const useSupabase = supabaseRepository && isSupabaseBackedUserId(input.userId);
    return runAnalysisJobRepository(
      "enqueue",
      () => memoryRepository.enqueue(input),
      useSupabase ? () => supabaseRepository.enqueue(input) : null,
    );
  },
  findByAnalysisId(analysisId) {
    return runAnalysisJobRepository(
      "findByAnalysisId",
      () => memoryRepository.findByAnalysisId(analysisId),
      supabaseRepository ? () => supabaseRepository.findByAnalysisId(analysisId) : null,
    );
  },
  listRunnable(limit) {
    return runAnalysisJobRepository(
      "listRunnable",
      () => memoryRepository.listRunnable(limit),
      supabaseRepository ? () => supabaseRepository.listRunnable(limit) : null,
    );
  },
  claim(analysisId, workerId) {
    return runAnalysisJobRepository(
      "claim",
      () => memoryRepository.claim(analysisId, workerId),
      supabaseRepository ? () => supabaseRepository.claim(analysisId, workerId) : null,
    );
  },
  heartbeat(analysisId, workerId) {
    return runAnalysisJobRepository(
      "heartbeat",
      () => memoryRepository.heartbeat(analysisId, workerId),
      supabaseRepository ? () => supabaseRepository.heartbeat(analysisId, workerId) : null,
    );
  },
  markStage(analysisId, workerId, stage) {
    return runAnalysisJobRepository(
      "markStage",
      () => memoryRepository.markStage(analysisId, workerId, stage),
      supabaseRepository ? () => supabaseRepository.markStage(analysisId, workerId, stage) : null,
    );
  },
  complete(analysisId, workerId) {
    return runAnalysisJobRepository(
      "complete",
      () => memoryRepository.complete(analysisId, workerId),
      supabaseRepository ? () => supabaseRepository.complete(analysisId, workerId) : null,
    );
  },
  fail(input) {
    return runAnalysisJobRepository(
      "fail",
      () => memoryRepository.fail(input),
      supabaseRepository ? () => supabaseRepository.fail(input) : null,
    );
  },
};

export function getAnalysisJobRepository() {
  return repository;
}
