import type {
  AnalysisChatMessage,
  AnalysisListInput,
  AnalysisPublicTask,
  AnalysisTask,
} from "@/lib/analysis/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseRepositoryConfigured } from "@/lib/supabase/env";

export interface AnalysisRepository {
  create(task: AnalysisTask): Promise<AnalysisTask>;
  findById(id: string): Promise<AnalysisTask | null>;
  findByIdForUser(id: string, userId: string): Promise<AnalysisTask | null>;
  listByUser(input: AnalysisListInput): Promise<AnalysisTask[]>;
  update(
    id: string,
    patch: Partial<Omit<AnalysisTask, "id" | "createdAt" | "userId">>,
  ): Promise<AnalysisTask | null>;
  appendChatMessages(
    id: string,
    messages: AnalysisChatMessage[],
  ): Promise<AnalysisTask | null>;
  setArchived(
    id: string,
    userId: string,
    archived: boolean,
  ): Promise<AnalysisTask | null>;
}

function cloneTask<T>(value: T) {
  return structuredClone(value);
}

type GlobalAnalysisStore = typeof globalThis & {
  __videoAnalysisTaskStore__?: Map<string, AnalysisTask>;
};

const taskStore =
  ((globalThis as GlobalAnalysisStore).__videoAnalysisTaskStore__ ??=
    new Map<string, AnalysisTask>());

export class MemoryAnalysisRepository implements AnalysisRepository {
  async create(task: AnalysisTask) {
    taskStore.set(task.id, cloneTask(task));
    return cloneTask(task);
  }

  async findById(id: string) {
    const task = taskStore.get(id);
    return task ? cloneTask(task) : null;
  }

  async findByIdForUser(id: string, userId: string) {
    const task = taskStore.get(id);
    if (!task || task.userId !== userId) {
      return null;
    }

    return cloneTask(task);
  }

  async listByUser({
    userId,
    archived = false,
    query,
    limit,
  }: AnalysisListInput) {
    const normalizedQuery = query?.trim().toLowerCase();
    const matchesQuery = (task: AnalysisTask) => {
      if (!normalizedQuery) {
        return true;
      }

      return [
        task.result?.title,
        task.result?.summary,
        task.video.title,
        task.video.originalUrl,
        task.video.normalizedUrl,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedQuery));
    };

    return Array.from(taskStore.values())
      .filter((task) => task.userId === userId)
      .filter((task) => Boolean(task.archivedAt) === archived)
      .filter(matchesQuery)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit ?? Number.MAX_SAFE_INTEGER)
      .map(cloneTask);
  }

  async update(
    id: string,
    patch: Partial<Omit<AnalysisTask, "id" | "createdAt" | "userId">>,
  ) {
    const current = taskStore.get(id);
    if (!current) {
      return null;
    }

    const next: AnalysisTask = {
      ...current,
      ...cloneTask(patch),
      updatedAt: new Date().toISOString(),
    };

    taskStore.set(id, next);
    return cloneTask(next);
  }

  async appendChatMessages(id: string, messages: AnalysisChatMessage[]) {
    const current = taskStore.get(id);
    if (!current) {
      return null;
    }

    const next: AnalysisTask = {
      ...current,
      chatMessages: [...current.chatMessages, ...cloneTask(messages)],
      updatedAt: new Date().toISOString(),
    };

    taskStore.set(id, next);
    return cloneTask(next);
  }

  async setArchived(id: string, userId: string, archived: boolean) {
    const current = taskStore.get(id);
    if (!current || current.userId !== userId) {
      return null;
    }

    const next: AnalysisTask = {
      ...current,
      archivedAt: archived ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    };

    taskStore.set(id, next);
    return cloneTask(next);
  }
}

function mapRowToTask(row: {
  id: string;
  user_id: string;
  status: AnalysisTask["status"];
  video: AnalysisTask["video"];
  transcript: AnalysisTask["transcript"];
  transcript_source: AnalysisTask["transcriptSource"];
  result: AnalysisTask["result"];
  chat_messages: AnalysisTask["chatMessages"];
  error_message: AnalysisTask["errorMessage"];
  archived_at: AnalysisTask["archivedAt"];
  created_at: string;
  updated_at: string;
}): AnalysisTask {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    video: row.video,
    transcript: row.transcript,
    transcriptSource: row.transcript_source,
    result: row.result,
    chatMessages: row.chat_messages ?? [],
    errorMessage: row.error_message,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseAnalysisRepository implements AnalysisRepository {
  async create(task: AnalysisTask) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("analysis_records")
      .insert({
        id: task.id,
        user_id: task.userId,
        status: task.status,
        video: task.video,
        transcript: task.transcript,
        transcript_source: task.transcriptSource,
        result: task.result,
        chat_messages: task.chatMessages,
        error_message: task.errorMessage,
        archived_at: task.archivedAt,
        created_at: task.createdAt,
        updated_at: task.updatedAt,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return mapRowToTask(data);
  }

  async findById(id: string) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("analysis_records")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? mapRowToTask(data) : null;
  }

  async findByIdForUser(id: string, userId: string) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("analysis_records")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? mapRowToTask(data) : null;
  }

  async listByUser({
    userId,
    archived = false,
    query,
    limit,
  }: AnalysisListInput) {
    const supabase = createSupabaseAdminClient();
    let builder = supabase
      .from("analysis_records")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    builder = archived
      ? builder.not("archived_at", "is", null)
      : builder.is("archived_at", null);

    if (query?.trim()) {
      const escaped = query.trim().replaceAll("%", "\\%").replaceAll(",", " ");
      builder = builder.or(
        [
          `video->>title.ilike.%${escaped}%`,
          `video->>originalUrl.ilike.%${escaped}%`,
          `video->>normalizedUrl.ilike.%${escaped}%`,
          `result->>title.ilike.%${escaped}%`,
          `result->>summary.ilike.%${escaped}%`,
        ].join(","),
      );
    }

    if (limit) {
      builder = builder.limit(limit);
    }

    const { data, error } = await builder;

    if (error) {
      throw error;
    }

    return data.map(mapRowToTask);
  }

  async update(
    id: string,
    patch: Partial<Omit<AnalysisTask, "id" | "createdAt" | "userId">>,
  ) {
    const supabase = createSupabaseAdminClient();
    const updatePayload = {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.video ? { video: patch.video } : {}),
      ...(patch.transcript !== undefined ? { transcript: patch.transcript } : {}),
      ...(patch.transcriptSource !== undefined
        ? { transcript_source: patch.transcriptSource }
        : {}),
      ...(patch.result !== undefined ? { result: patch.result } : {}),
      ...(patch.chatMessages ? { chat_messages: patch.chatMessages } : {}),
      ...(patch.errorMessage !== undefined
        ? { error_message: patch.errorMessage }
        : {}),
      ...(patch.archivedAt !== undefined ? { archived_at: patch.archivedAt } : {}),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("analysis_records")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? mapRowToTask(data) : null;
  }

  async appendChatMessages(id: string, messages: AnalysisChatMessage[]) {
    const current = await this.findById(id);
    if (!current) {
      return null;
    }

    return this.update(id, {
      chatMessages: [...current.chatMessages, ...messages],
    });
  }

  async setArchived(id: string, userId: string, archived: boolean) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("analysis_records")
      .update({
        archived_at: archived ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? mapRowToTask(data) : null;
  }
}

const repository: AnalysisRepository = isSupabaseRepositoryConfigured()
  ? new SupabaseAnalysisRepository()
  : new MemoryAnalysisRepository();

export function getAnalysisRepository() {
  return repository;
}

export function toPublicAnalysisTask(task: AnalysisTask): AnalysisPublicTask {
  const cloned = cloneTask(task);
  return {
    id: cloned.id,
    userId: cloned.userId,
    status: cloned.status,
    video: cloned.video,
    transcriptSource: cloned.transcriptSource,
    result: cloned.result,
    chatMessages: cloned.chatMessages,
    errorMessage: cloned.errorMessage,
    archivedAt: cloned.archivedAt,
    createdAt: cloned.createdAt,
    updatedAt: cloned.updatedAt,
  };
}
