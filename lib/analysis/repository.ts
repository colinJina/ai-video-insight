import type {
  AnalysisChatMessage,
  AnalysisPublicTask,
  AnalysisTask,
} from "@/lib/analysis/types";

export interface AnalysisRepository {
  create(task: AnalysisTask): Promise<AnalysisTask>;
  findById(id: string): Promise<AnalysisTask | null>;
  update(
    id: string,
    patch: Partial<Omit<AnalysisTask, "id" | "createdAt">>,
  ): Promise<AnalysisTask | null>;
  appendChatMessages(
    id: string,
    messages: AnalysisChatMessage[],
  ): Promise<AnalysisTask | null>;
}

function cloneTask<T>(value: T) {
  return structuredClone(value);
}

type GlobalAnalysisStore = typeof globalThis & {
  __videoAnalysisTaskStore__?: Map<string, AnalysisTask>;
};

const globalStore = globalThis as GlobalAnalysisStore;
const taskStore =
  globalStore.__videoAnalysisTaskStore__ ??
  (globalStore.__videoAnalysisTaskStore__ = new Map<string, AnalysisTask>());

class InMemoryAnalysisRepository implements AnalysisRepository {
  async create(task: AnalysisTask) {
    taskStore.set(task.id, cloneTask(task));
    return cloneTask(task);
  }

  async findById(id: string) {
    const task = taskStore.get(id);
    return task ? cloneTask(task) : null;
  }

  async update(
    id: string,
    patch: Partial<Omit<AnalysisTask, "id" | "createdAt">>,
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
}

const repository = new InMemoryAnalysisRepository();

export function getAnalysisRepository() {
  return repository;
}

export function toPublicAnalysisTask(task: AnalysisTask): AnalysisPublicTask {
  const cloned = cloneTask(task);
  return {
    id: cloned.id,
    status: cloned.status,
    video: cloned.video,
    transcriptSource: cloned.transcriptSource,
    result: cloned.result,
    chatMessages: cloned.chatMessages,
    errorMessage: cloned.errorMessage,
    createdAt: cloned.createdAt,
    updatedAt: cloned.updatedAt,
  };
}
