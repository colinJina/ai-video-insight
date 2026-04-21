"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type MarkAnalysisNotificationsReadProps = {
  analysisId: string;
};

export default function MarkAnalysisNotificationsRead({
  analysisId,
}: MarkAnalysisNotificationsReadProps) {
  const router = useRouter();
  const hasMarkedRef = useRef(false);

  useEffect(() => {
    if (hasMarkedRef.current) {
      return;
    }

    hasMarkedRef.current = true;
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/notifications", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ mode: "analysis", analysisId }),
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json().catch(() => null)) as
          | { markedCount?: number }
          | null;

        if ((payload?.markedCount ?? 0) > 0) {
          router.refresh();
        }
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [analysisId, router]);

  return null;
}
