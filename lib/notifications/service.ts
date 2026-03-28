import type { AppNotification } from "@/lib/app/types";
import { getNotificationRepository } from "@/lib/notifications/repository";

function buildWelcomeNotification(userId: string): AppNotification {
  return {
    id: `welcome-${userId}`,
    userId,
    type: "system",
    title: "欢迎使用通知中心",
    body: "分析完成、失败和系统提示都会出现在这里，未读数量会同步展示到导航栏。",
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
  return getNotificationRepository().create(input);
}

export async function listNotificationsForUser(userId: string) {
  const notifications = await getNotificationRepository().listByUser(userId);

  if (notifications.length === 0) {
    return [buildWelcomeNotification(userId)];
  }

  return notifications;
}

export async function countUnreadNotifications(userId: string) {
  return getNotificationRepository().countUnread(userId);
}

export async function markNotificationAsRead(userId: string, notificationId: string) {
  return getNotificationRepository().markAsRead(userId, notificationId);
}

export async function markAllNotificationsAsRead(userId: string) {
  return getNotificationRepository().markAllAsRead(userId);
}
