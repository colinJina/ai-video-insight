export type AppThemePreference = "system" | "light" | "dark";

export type NotificationType =
  | "analysis_completed"
  | "analysis_failed"
  | "system";

export interface AppUser {
  id: string;
  email: string;
  nickname: string | null;
  avatarUrl: string | null;
}

export interface AppSession {
  user: AppUser;
  provider: "supabase" | "demo";
}

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  relatedAnalysisId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface UserSettings {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  notificationsEnabled: boolean;
  themePreference: AppThemePreference;
  updatedAt: string;
}
