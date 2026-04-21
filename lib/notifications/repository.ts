import { randomUUID } from "node:crypto";

import type { AppNotification, NotificationType } from "@/lib/app/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseRepositoryConfigured } from "@/lib/supabase/env";
import { shouldFallbackToMemoryRepository } from "@/lib/supabase/repository-fallback";
import { isSupabaseBackedUserId } from "@/lib/supabase/user-id";

export interface NotificationRepository {
  create(
    input: Omit<AppNotification, "id" | "createdAt" | "readAt"> & {
      readAt?: string | null;
      createdAt?: string;
    },
  ): Promise<AppNotification>;
  listByUser(userId: string): Promise<AppNotification[]>;
  countUnread(userId: string): Promise<number>;
  markAsRead(userId: string, notificationId: string): Promise<AppNotification | null>;
  markRelatedAnalysisAsRead(userId: string, analysisId: string): Promise<number>;
  markAllAsRead(userId: string): Promise<void>;
}

function cloneValue<T>(value: T) {
  return structuredClone(value);
}

type GlobalNotificationStore = typeof globalThis & {
  __videoAnalysisNotifications__?: Map<string, AppNotification>;
};

const notificationStore =
  ((globalThis as GlobalNotificationStore).__videoAnalysisNotifications__ ??=
    new Map<string, AppNotification>());

export class MemoryNotificationRepository implements NotificationRepository {
  async create(
    input: Omit<AppNotification, "id" | "createdAt" | "readAt"> & {
      readAt?: string | null;
      createdAt?: string;
    },
  ) {
    const notification: AppNotification = {
      id: randomUUID(),
      createdAt: input.createdAt ?? new Date().toISOString(),
      readAt: input.readAt ?? null,
      ...input,
    };

    notificationStore.set(notification.id, cloneValue(notification));
    return cloneValue(notification);
  }

  async listByUser(userId: string) {
    return Array.from(notificationStore.values())
      .filter((item) => item.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(cloneValue);
  }

  async countUnread(userId: string) {
    return Array.from(notificationStore.values()).filter(
      (item) => item.userId === userId && !item.readAt,
    ).length;
  }

  async markAsRead(userId: string, notificationId: string) {
    const current = notificationStore.get(notificationId);
    if (!current || current.userId !== userId) {
      return null;
    }

    const next = {
      ...current,
      readAt: current.readAt ?? new Date().toISOString(),
    };

    notificationStore.set(notificationId, next);
    return cloneValue(next);
  }

  async markRelatedAnalysisAsRead(userId: string, analysisId: string) {
    const now = new Date().toISOString();
    let markedCount = 0;

    for (const item of notificationStore.values()) {
      if (
        item.userId === userId &&
        item.relatedAnalysisId === analysisId &&
        !item.readAt
      ) {
        notificationStore.set(item.id, {
          ...item,
          readAt: now,
        });
        markedCount += 1;
      }
    }

    return markedCount;
  }

  async markAllAsRead(userId: string) {
    const now = new Date().toISOString();

    for (const item of notificationStore.values()) {
      if (item.userId === userId && !item.readAt) {
        notificationStore.set(item.id, {
          ...item,
          readAt: now,
        });
      }
    }
  }
}

export class SupabaseNotificationRepository implements NotificationRepository {
  async create(
    input: Omit<AppNotification, "id" | "createdAt" | "readAt"> & {
      readAt?: string | null;
      createdAt?: string;
    },
  ) {
    const supabase = createSupabaseAdminClient();
    const payload = {
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      related_analysis_id: input.relatedAnalysisId,
      read_at: input.readAt ?? null,
      created_at: input.createdAt ?? new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("user_notifications")
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      id: data.id,
      userId: data.user_id,
      type: data.type as NotificationType,
      title: data.title,
      body: data.body,
      relatedAnalysisId: data.related_analysis_id,
      readAt: data.read_at,
      createdAt: data.created_at,
    };
  }

  async listByUser(userId: string) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("user_notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return data.map((item) => ({
      id: item.id,
      userId: item.user_id,
      type: item.type as NotificationType,
      title: item.title,
      body: item.body,
      relatedAnalysisId: item.related_analysis_id,
      readAt: item.read_at,
      createdAt: item.created_at,
    }));
  }

  async countUnread(userId: string) {
    const supabase = createSupabaseAdminClient();
    const { count, error } = await supabase
      .from("user_notifications")
      .select("*", { head: true, count: "exact" })
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) {
      throw error;
    }

    return count ?? 0;
  }

  async markAsRead(userId: string, notificationId: string) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("user_notifications")
      .update({
        read_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("id", notificationId)
      .select("*")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      type: data.type as NotificationType,
      title: data.title,
      body: data.body,
      relatedAnalysisId: data.related_analysis_id,
      readAt: data.read_at,
      createdAt: data.created_at,
    };
  }

  async markRelatedAnalysisAsRead(userId: string, analysisId: string) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("user_notifications")
      .update({
        read_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("related_analysis_id", analysisId)
      .is("read_at", null)
      .select("id");

    if (error) {
      throw error;
    }

    return data.length;
  }

  async markAllAsRead(userId: string) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("user_notifications")
      .update({
        read_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) {
      throw error;
    }
  }
}

const memoryRepository = new MemoryNotificationRepository();
const supabaseRepository = isSupabaseRepositoryConfigured()
  ? new SupabaseNotificationRepository()
  : null;
let didWarnAboutNotificationFallback = false;

async function runNotificationRepository<T>(
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

    if (!didWarnAboutNotificationFallback) {
      didWarnAboutNotificationFallback = true;
      console.warn(
        `[notifications] Supabase repository is unavailable during ${operation}; falling back to in-memory storage.`,
        error,
      );
    }

    return runMemory();
  }
}

const repository: NotificationRepository = {
  create(input) {
    const useSupabase = supabaseRepository && isSupabaseBackedUserId(input.userId);
    return runNotificationRepository(
      "create",
      () => memoryRepository.create(input),
      useSupabase ? () => supabaseRepository.create(input) : null,
    );
  },
  listByUser(userId) {
    const useSupabase = supabaseRepository && isSupabaseBackedUserId(userId);
    return runNotificationRepository(
      "listByUser",
      () => memoryRepository.listByUser(userId),
      useSupabase ? () => supabaseRepository.listByUser(userId) : null,
    );
  },
  countUnread(userId) {
    const useSupabase = supabaseRepository && isSupabaseBackedUserId(userId);
    return runNotificationRepository(
      "countUnread",
      () => memoryRepository.countUnread(userId),
      useSupabase ? () => supabaseRepository.countUnread(userId) : null,
    );
  },
  markAsRead(userId, notificationId) {
    const useSupabase = supabaseRepository && isSupabaseBackedUserId(userId);
    return runNotificationRepository(
      "markAsRead",
      () => memoryRepository.markAsRead(userId, notificationId),
      useSupabase ? () => supabaseRepository.markAsRead(userId, notificationId) : null,
    );
  },
  markAllAsRead(userId) {
    const useSupabase = supabaseRepository && isSupabaseBackedUserId(userId);
    return runNotificationRepository(
      "markAllAsRead",
      () => memoryRepository.markAllAsRead(userId),
      useSupabase ? () => supabaseRepository.markAllAsRead(userId) : null,
    );
  },
  markRelatedAnalysisAsRead(userId, analysisId) {
    const useSupabase = supabaseRepository && isSupabaseBackedUserId(userId);
    return runNotificationRepository(
      "markRelatedAnalysisAsRead",
      () => memoryRepository.markRelatedAnalysisAsRead(userId, analysisId),
      useSupabase
        ? () => supabaseRepository.markRelatedAnalysisAsRead(userId, analysisId)
        : null,
    );
  },
};

export function getNotificationRepository() {
  return repository;
}
