import type { AppNotification } from "@/lib/app/types";
import { getNotificationRepository } from "@/lib/notifications/repository";

function buildWelcomeNotification(userId: string): AppNotification {
  return {
    id: `welcome-${userId}`,
    userId,
    type: "system",
    title: "Welcome to the notification center",
    body: "Analysis completions, failures, and system updates will appear here. Unread counts also surface in the navigation bar.",
    relatedAnalysisId: null,
    readAt: null,
    createdAt: new Date(0).toISOString(),
  };
}

export async function createNotification(
  input: Omit<AppNotification, "id" | "createdAt" | "readAt"> & {
    readAt?: string | null;
    createdAt?: string;
  },
) {
  try {
    return await getNotificationRepository().create(input);
  } catch (error) {
    console.error(
      "[notifications] Failed to persist notification, continuing without blocking the request.",
      {
        userId: input.userId,
        type: input.type,
        error,
      },
    );

    return {
      id: `notification-fallback-${input.userId}-${Date.now()}`,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      relatedAnalysisId: input.relatedAnalysisId,
      readAt: input.readAt ?? null,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
  }
}

export async function listNotificationsForUser(userId: string) {
  let notifications: AppNotification[];

  try {
    notifications = await getNotificationRepository().listByUser(userId);
  } catch (error) {
    console.error("[notifications] Failed to load notifications, returning welcome fallback.", {
      userId,
      error,
    });
    notifications = [];
  }

  if (notifications.length === 0) {
    return [buildWelcomeNotification(userId)];
  }

  return notifications;
}

export async function countUnreadNotifications(userId: string) {
  try {
    return await getNotificationRepository().countUnread(userId);
  } catch (error) {
    console.error("[notifications] Failed to count unread notifications, returning zero.", {
      userId,
      error,
    });
    return 0;
  }
}

export async function markNotificationAsRead(userId: string, notificationId: string) {
  return getNotificationRepository().markAsRead(userId, notificationId);
}

export async function markAllNotificationsAsRead(userId: string) {
  return getNotificationRepository().markAllAsRead(userId);
}
