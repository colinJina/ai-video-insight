import type { ReactNode } from "react";

import Navbar from "@/components/Navbar";
import { getOptionalAppSession } from "@/lib/auth/session";
import { countUnreadNotifications } from "@/lib/notifications/service";
import { getSettingsForUser } from "@/lib/settings/service";

export default async function AppShell({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  const session = await getOptionalAppSession();
  const settings = session ? await getSettingsForUser(session.user.id) : null;
  const unreadCount = session
    ? await countUnreadNotifications(session.user.id)
    : 0;

  return (
    <div className="page-shell">
      <Navbar
        currentUser={
          session
            ? {
                ...session.user,
                nickname: settings?.nickname ?? session.user.nickname,
                avatarUrl: settings?.avatarUrl ?? session.user.avatarUrl,
              }
            : null
        }
        unreadCount={unreadCount}
      />
      <main
        className={
          compact
            ? "mx-auto min-h-screen w-full max-w-[1280px] px-4 pb-24 pt-24 sm:px-6 lg:px-8"
            : "mx-auto min-h-screen w-full max-w-[1600px] px-4 pb-24 pt-24 sm:px-6 lg:px-8"
        }
      >
        {children}
      </main>
    </div>
  );
}
