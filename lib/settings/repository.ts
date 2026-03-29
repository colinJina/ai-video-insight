import type { UserSettings } from "@/lib/app/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseRepositoryConfigured } from "@/lib/supabase/env";
import { shouldFallbackToMemoryRepository } from "@/lib/supabase/repository-fallback";
import { isSupabaseBackedUserId } from "@/lib/supabase/user-id";

export interface SettingsRepository {
  getByUserId(userId: string): Promise<UserSettings | null>;
  upsert(settings: UserSettings): Promise<UserSettings>;
}

function cloneValue<T>(value: T) {
  return structuredClone(value);
}

type GlobalSettingsStore = typeof globalThis & {
  __videoAnalysisUserSettings__?: Map<string, UserSettings>;
};

const settingsStore =
  ((globalThis as GlobalSettingsStore).__videoAnalysisUserSettings__ ??=
    new Map<string, UserSettings>());

export class MemorySettingsRepository implements SettingsRepository {
  async getByUserId(userId: string) {
    const existing = settingsStore.get(userId);
    return existing ? cloneValue(existing) : null;
  }

  async upsert(settings: UserSettings) {
    settingsStore.set(settings.userId, cloneValue(settings));
    return cloneValue(settings);
  }
}

export class SupabaseSettingsRepository implements SettingsRepository {
  async getByUserId(userId: string) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    return {
      userId: data.user_id,
      nickname: data.nickname,
      avatarUrl: data.avatar_url,
      notificationsEnabled: data.notifications_enabled,
      themePreference: data.theme_preference,
      updatedAt: data.updated_at,
    };
  }

  async upsert(settings: UserSettings) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("user_settings")
      .upsert({
        user_id: settings.userId,
        nickname: settings.nickname,
        avatar_url: settings.avatarUrl,
        notifications_enabled: settings.notificationsEnabled,
        theme_preference: settings.themePreference,
        updated_at: settings.updatedAt,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return {
      userId: data.user_id,
      nickname: data.nickname,
      avatarUrl: data.avatar_url,
      notificationsEnabled: data.notifications_enabled,
      themePreference: data.theme_preference,
      updatedAt: data.updated_at,
    };
  }
}

const memoryRepository = new MemorySettingsRepository();
const supabaseRepository = isSupabaseRepositoryConfigured()
  ? new SupabaseSettingsRepository()
  : null;
let didWarnAboutSettingsFallback = false;

async function runSettingsRepository<T>(
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

    if (!didWarnAboutSettingsFallback) {
      didWarnAboutSettingsFallback = true;
      console.warn(
        `[settings] Supabase repository is unavailable during ${operation}; falling back to in-memory storage.`,
        error,
      );
    }

    return runMemory();
  }
}

const repository: SettingsRepository = {
  getByUserId(userId) {
    const useSupabase = supabaseRepository && isSupabaseBackedUserId(userId);
    return runSettingsRepository(
      "getByUserId",
      () => memoryRepository.getByUserId(userId),
      useSupabase ? () => supabaseRepository.getByUserId(userId) : null,
    );
  },
  upsert(settings) {
    const useSupabase = supabaseRepository && isSupabaseBackedUserId(settings.userId);
    return runSettingsRepository(
      "upsert",
      () => memoryRepository.upsert(settings),
      useSupabase ? () => supabaseRepository.upsert(settings) : null,
    );
  },
};

export function getSettingsRepository() {
  return repository;
}
