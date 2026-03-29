import type { UserSettings } from "@/lib/app/types";
import { getSettingsRepository } from "@/lib/settings/repository";

export function getDefaultSettings(userId: string): UserSettings {
  return {
    userId,
    nickname: null,
    avatarUrl: null,
    notificationsEnabled: true,
    themePreference: "system",
    updatedAt: new Date().toISOString(),
  };
}

export async function getSettingsForUser(userId: string) {
  try {
    const existing = await getSettingsRepository().getByUserId(userId);
    return existing ?? getDefaultSettings(userId);
  } catch (error) {
    console.error("[settings] Failed to load user settings, falling back to defaults.", {
      userId,
      error,
    });
    return getDefaultSettings(userId);
  }
}

export async function upsertSettingsForUser(
  userId: string,
  patch: Omit<UserSettings, "userId" | "updatedAt">,
) {
  const next: UserSettings = {
    userId,
    updatedAt: new Date().toISOString(),
    ...patch,
  };

  return getSettingsRepository().upsert(next);
}
