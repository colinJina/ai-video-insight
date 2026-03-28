import type { UserSettings } from "@/lib/app/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseRepositoryConfigured } from "@/lib/supabase/env";

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

const repository: SettingsRepository = isSupabaseRepositoryConfigured()
  ? new SupabaseSettingsRepository()
  : new MemorySettingsRepository();

export function getSettingsRepository() {
  return repository;
}
