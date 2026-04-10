"use client";

import { startTransition, useState } from "react";

import type { AnalysisPublicTask } from "@/lib/analysis/types";
import { isRecord } from "@/lib/analysis/utils";

type AnalysisConversationProps = {
  initialAnalysis: AnalysisPublicTask;
};

type AnalysisResponse = {
  analysis: AnalysisPublicTask;
};

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      isRecord(payload) &&
      isRecord(payload.error) &&
      typeof payload.error.message === "string"
        ? payload.error.message
        : "Request failed. Please try again.";

    throw new Error(message);
  }

  return payload as T;
}

export default function AnalysisConversation({
  initialAnalysis,
}: AnalysisConversationProps) {
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [draft, setDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const canContinueChat =
    analysis.status === "completed" && Boolean(analysis.result);
  const suggestedQuestions =
    analysis.result?.chatContext.suggestedQuestions.length
      ? analysis.result.chatContext.suggestedQuestions
      : analysis.result?.suggestedQuestions ?? [];

  const handleSend = async (message: string) => {
    const nextMessage = message.trim();
    if (!nextMessage || !canContinueChat) {
      return;
    }

    setIsPending(true);
    setChatError(null);

    try {
      const response = await requestJson<AnalysisResponse>(
        `/api/analysis/${analysis.id}/chat`,
        {
          method: "POST",
          body: JSON.stringify({ message: nextMessage }),
        },
      );

      startTransition(() => {
        setAnalysis(response.analysis);
        setDraft("");
      });
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : "Sending the follow-up question failed.",
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="mt-5 space-y-5">
      {analysis.chatMessages.length > 0 ? (
        analysis.chatMessages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "assistant"
                ? "rounded-2xl border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.55)] p-4 text-sm leading-7 text-[color:var(--text-muted)]"
                : "rounded-2xl border border-primary/20 bg-[color:rgba(255,127,0,0.06)] p-4 text-sm leading-7 text-white"
            }
          >
            {message.content}
          </div>
        ))
      ) : (
        <p className="text-sm leading-7 text-[color:var(--text-muted)]">
          This record does not have any conversation history yet. Start with a
          follow-up question below.
        </p>
      )}

      {suggestedQuestions.length > 0 ? (
        <div className="space-y-3">
          <p className="font-headline text-[11px] font-bold uppercase tracking-[0.22em] text-[color:var(--primary-strong)]">
            Continue The Conversation
          </p>
          <div className="flex flex-wrap gap-3">
            {suggestedQuestions.map((question) => (
              <button
                key={question}
                className="rounded-full border border-[color:rgba(88,66,53,0.2)] bg-[color:rgba(29,17,6,0.4)] px-4 py-2 text-left text-xs leading-6 text-[color:var(--text-muted)] transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
                disabled={!canContinueChat || isPending}
                onClick={() => {
                  void handleSend(question);
                }}
                type="button"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {chatError ? (
        <div className="rounded-xl border border-[color:rgba(255,120,120,0.25)] bg-[color:rgba(120,20,20,0.18)] p-4 text-sm leading-7 text-[color:#ffb7b7]">
          {chatError}
        </div>
      ) : null}

      {canContinueChat ? (
        <form
          className="relative"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend(draft);
          }}
        >
          <input
            className="w-full rounded-xl border border-[color:rgba(88,66,53,0.3)] bg-[color:rgba(23,12,3,0.8)] px-4 py-3 pr-12 text-sm text-foreground outline-none transition-all placeholder:text-[color:rgba(88,66,53,1)] focus:border-[color:var(--primary-strong)]"
            disabled={isPending}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask a follow-up about this video"
            type="text"
            value={draft}
          />
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--primary-strong)] transition-transform hover:scale-110 disabled:opacity-60"
            disabled={isPending || !draft.trim()}
            type="submit"
          >
            <span className="material-symbols-outlined">
              {isPending ? "hourglass_top" : "auto_awesome"}
            </span>
          </button>
        </form>
      ) : (
        <p className="rounded-2xl border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.55)] p-4 text-sm leading-7 text-[color:var(--text-muted)]">
          Finish the analysis first, then this page can keep the same
          conversation going.
        </p>
      )}
    </div>
  );
}
