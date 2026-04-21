"use client";

import { startTransition, useState } from "react";

import { readSseEvents } from "@/lib/analysis/sse";
import type {
  AnalysisChatCitation,
  AnalysisPublicTask,
} from "@/lib/analysis/types";
import {
  formatTimestamp,
  hasUsableTimestamp,
  isRecord,
  trimText,
} from "@/lib/analysis/utils";

type AnalysisConversationProps = {
  initialAnalysis: AnalysisPublicTask;
};

type AnalysisResponse = {
  analysis: AnalysisPublicTask;
};

function formatCitationWindow(citation: AnalysisChatCitation) {
  const hasStart = hasUsableTimestamp(citation.startSeconds);
  const hasEnd = hasUsableTimestamp(citation.endSeconds);

  if (hasStart && hasEnd && citation.startSeconds !== citation.endSeconds) {
    return `${formatTimestamp(citation.startSeconds)} - ${formatTimestamp(citation.endSeconds)}`;
  }

  if (hasStart) {
    return formatTimestamp(citation.startSeconds);
  }

  if (hasEnd) {
    return formatTimestamp(citation.endSeconds);
  }

  return "No timestamp";
}

function formatCitationScore(score: number) {
  if (!Number.isFinite(score)) {
    return null;
  }

  return score.toFixed(2);
}

function LatestReplyCitations({
  citations,
}: {
  citations: AnalysisChatCitation[];
}) {
  if (citations.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-2xl border border-[color:rgba(88,66,53,0.18)] bg-[color:rgba(13,7,1,0.6)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-headline text-[11px] font-bold uppercase tracking-[0.22em] text-[color:var(--primary-strong)]">
          Latest Answer Evidence
        </p>
        <p className="text-[11px] uppercase tracking-[0.18em] text-[color:rgba(240,220,204,0.58)]">
          Transcript Chunks
        </p>
      </div>
      <div className="mt-3 space-y-3">
        {citations.map((citation) => {
          const scoreLabel = formatCitationScore(citation.score);

          return (
            <div
              key={`${citation.chunkIndex}-${citation.startSeconds ?? "none"}-${citation.endSeconds ?? "none"}`}
              className="rounded-2xl border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(29,17,6,0.42)] px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-primary/25 bg-[color:rgba(255,127,0,0.08)] px-2.5 py-1 font-headline text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                  {formatCitationWindow(citation)}
                </span>
                <span className="text-[11px] uppercase tracking-[0.18em] text-[color:rgba(240,220,204,0.56)]">
                  Chunk {citation.chunkIndex}
                </span>
                {scoreLabel ? (
                  <span className="text-[11px] uppercase tracking-[0.18em] text-[color:rgba(240,220,204,0.56)]">
                    Score {scoreLabel}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                {trimText(citation.text, 240)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AnalysisConversation({
  initialAnalysis,
}: AnalysisConversationProps) {
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [draft, setDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(
    null,
  );
  const [streamedAssistantAnswer, setStreamedAssistantAnswer] = useState("");

  const canContinueChat =
    analysis.status === "completed" && Boolean(analysis.result);
  const suggestedQuestions = analysis.result?.chatContext.suggestedQuestions
    .length
    ? analysis.result.chatContext.suggestedQuestions
    : (analysis.result?.suggestedQuestions ?? []);
  const conversationSummary =
    analysis.chatRuntime?.conversationSummary ??
    analysis.result?.chatState.conversationSummary ??
    null;
  const persistedMemoryCount =
    analysis.chatRuntime?.memoryItems.length ??
    analysis.result?.chatState.memoryItems.length ??
    0;
  const latestMessageIndex = analysis.chatMessages.length - 1;
  const latestAssistantCitations =
    analysis.chatMessages[latestMessageIndex]?.role === "assistant"
      ? (analysis.chatRuntime?.citations ?? [])
      : [];

  const handleSend = async (message: string) => {
    const nextMessage = message.trim();
    if (!nextMessage || !canContinueChat) {
      return;
    }

    setIsPending(true);
    setChatError(null);
    setPendingUserMessage(nextMessage);
    setStreamedAssistantAnswer("");
    try {
      const response = await fetch(`/api/analysis/${analysis.id}/chat`, {
        cache: "no-store",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: nextMessage }),
      });

      if (!response.ok) {
        let payload: unknown = null;

        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        const errorMessage =
          isRecord(payload) &&
          isRecord(payload.error) &&
          typeof payload.error.message === "string"
            ? payload.error.message
            : "Request failed. Please try again.";

        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error(
          "The chat stream did not return a readable response body.",
        );
      }

      let nextAnalysis: AnalysisPublicTask | null = null;

      for await (const event of readSseEvents(response.body)) {
        if (event.event === "token") {
          const payload = parseStreamEvent<{ content?: string }>(event.data);
          const content = payload?.content ?? "";

          if (content) {
            setStreamedAssistantAnswer((current) => current + content);
          }

          continue;
        }

        if (event.event === "done") {
          const payload = parseStreamEvent<AnalysisResponse>(event.data);
          nextAnalysis = payload?.analysis ?? null;
          continue;
        }

        if (event.event === "error") {
          const payload = parseStreamEvent<{ message?: string }>(event.data);
          throw new Error(payload?.message ?? "The chat stream failed.");
        }
      }

      if (!nextAnalysis) {
        throw new Error(
          "The chat stream ended before the final analysis payload arrived.",
        );
      }

      startTransition(() => {
        setAnalysis(nextAnalysis);
        setDraft("");
        setPendingUserMessage(null);
        setStreamedAssistantAnswer("");
      });
    } catch (error) {
      setPendingUserMessage(null);
      setStreamedAssistantAnswer("");
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
      {conversationSummary ? (
        <div className="rounded-2xl border border-[color:rgba(255,127,0,0.18)] bg-[color:rgba(255,127,0,0.06)] p-4">
          <p className="font-headline text-[11px] font-bold uppercase tracking-[0.22em] text-[color:var(--primary-strong)]">
            Conversation Summary
          </p>
          <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">
            {conversationSummary}
          </p>
          <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-[color:rgba(240,220,204,0.56)]">
            Persisted memory items {persistedMemoryCount}
          </p>
        </div>
      ) : null}

      {analysis.chatMessages.length > 0 ? (
        analysis.chatMessages.map((message, index) => {
          const isLatestAssistantReply =
            message.role === "assistant" && index === latestMessageIndex;

          return (
            <div key={message.id}>
              <div
                className={
                  message.role === "assistant"
                    ? "rounded-2xl border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.55)] p-4 text-sm leading-7 text-[color:var(--text-muted)]"
                    : "rounded-2xl border border-primary/20 bg-[color:rgba(255,127,0,0.06)] p-4 text-sm leading-7 text-white"
                }
              >
                {message.content}
              </div>
              {isLatestAssistantReply ? (
                <LatestReplyCitations citations={latestAssistantCitations} />
              ) : null}
            </div>
          );
        })
      ) : (
        <p className="text-sm leading-7 text-[color:var(--text-muted)]">
          This record does not have any conversation history yet. Start with a
          follow-up question below.
        </p>
      )}

      {pendingUserMessage ? (
        <div className="rounded-2xl border border-primary/20 bg-[color:rgba(255,127,0,0.06)] p-4 text-sm leading-7 text-white">
          {pendingUserMessage}
        </div>
      ) : null}

      {isPending ? (
        <div className="rounded-2xl border border-[color:rgba(88,66,53,0.16)] bg-[color:rgba(23,12,3,0.55)] p-4 text-sm leading-7 text-[color:var(--text-muted)]">
          {streamedAssistantAnswer ||
            "Thinking through the transcript and assembling an answer..."}
        </div>
      ) : null}

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

function parseStreamEvent<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}
