"use client";

import { useState } from "react";

import type {
  AnalysisPublicTask,
  AnalysisViewStatus,
  OutlineItem,
} from "@/lib/analysis/types";

export type AiPanelTab = "summary" | "outline" | "chat";

type TabOption = {
  id: AiPanelTab;
  label: string;
};

type AiPanelProps = {
  analysis: AnalysisPublicTask | null;
  chatError?: string | null;
  isChatPending?: boolean;
  onOutlineClick?: (time: number) => void;
  onSendMessage?: (message: string) => Promise<void> | void;
  viewStatus: AnalysisViewStatus;
};

const tabs: TabOption[] = [
  { id: "summary", label: "Summary" },
  { id: "outline", label: "Outline" },
  { id: "chat", label: "AI Chat" },
];

function parseTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const parts = value.split(":").map((part) => Number(part));
  if (parts.length === 0 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  return parts.reduce((total, part) => total * 60 + part, 0);
}

function hasUsableOutlineTime(outline: OutlineItem[]) {
  return outline.some((item) => item.time);
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="h-2 w-2 rounded-full bg-[color:var(--primary-strong)] shadow-[0_0_15px_rgba(255,127,0,0.6)]" />
      <h3 className="font-headline text-xs font-bold uppercase tracking-[0.24em] text-white">
        {children}
      </h3>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-[color:rgba(88,66,53,0.15)] bg-[color:rgba(29,17,6,0.35)] p-5">
      <p className="font-headline text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--primary-strong)]">
        {title}
      </p>
      <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">
        {description}
      </p>
    </div>
  );
}

function SummaryPanel({ analysis }: { analysis: AnalysisPublicTask }) {
  if (!analysis.result) {
    return null;
  }

  return (
    <section>
      <SectionTitle>{analysis.result.title}</SectionTitle>
      <p className="border-l border-[color:rgba(88,66,53,0.3)] pl-4 text-sm leading-7 text-[color:var(--text-muted)]">
        {analysis.result.summary}
      </p>

      <div className="mt-8">
        <SectionTitle>Key Takeaways</SectionTitle>
        <div className="space-y-3">
          {analysis.result.keyPoints.map((point) => (
            <div
              key={point}
              className="rounded-xl border border-[color:rgba(88,66,53,0.15)] bg-[color:rgba(29,17,6,0.4)] p-4 text-sm leading-7 text-[color:var(--text-muted)]"
            >
              {point}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function OutlinePanel({
  analysis,
  onOutlineClick,
}: {
  analysis: AnalysisPublicTask;
  onOutlineClick: (time: number) => void;
}) {
  if (!analysis.result) {
    return null;
  }

  const canSeekByTime = hasUsableOutlineTime(analysis.result.outline);

  return (
    <section>
      <SectionTitle>Key Moments</SectionTitle>

      {!canSeekByTime || analysis.transcriptSource === "mock" ? (
        <div className="mb-5 rounded-2xl border border-[color:rgba(255,127,0,0.18)] bg-[color:rgba(255,127,0,0.06)] p-4 text-sm leading-7 text-[color:var(--text-muted)]">
          This result does not contain a stable real timeline yet. Treat the entries below as
          content notes rather than precise seek points.
        </div>
      ) : null}

      <div className="space-y-4">
        {analysis.result.outline.map((item) => {
          const timeInSeconds = parseTimestamp(item.time);
          const isClickable = typeof timeInSeconds === "number";

          return (
            <div
              key={`${item.time ?? "no-time"}-${item.text}`}
              className={`group flex gap-4 ${isClickable ? "cursor-pointer" : "cursor-default"}`}
              onClick={() => {
                if (typeof timeInSeconds === "number") {
                  onOutlineClick(timeInSeconds);
                }
              }}
              onKeyDown={(event) => {
                if (
                  typeof timeInSeconds === "number" &&
                  (event.key === "Enter" || event.key === " ")
                ) {
                  event.preventDefault();
                  onOutlineClick(timeInSeconds);
                }
              }}
              role={isClickable ? "button" : undefined}
              tabIndex={isClickable ? 0 : undefined}
            >
              <span className="pt-1 font-headline text-xs text-[color:var(--primary-strong)]">
                {item.time ?? "No time"}
              </span>
              <div className="flex-1 border-l border-[color:rgba(88,66,53,0.2)] py-1 pl-4 text-sm leading-6 text-foreground transition-all group-hover:border-[color:var(--primary-strong)] group-hover:bg-[color:rgba(255,127,0,0.05)]">
                {item.text}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ChatPanel({
  analysis,
  chatError,
  isChatPending,
  onSendMessage,
}: {
  analysis: AnalysisPublicTask;
  chatError: string | null;
  isChatPending: boolean;
  onSendMessage?: (message: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState("");

  if (!analysis.result) {
    return null;
  }

  const messages = analysis.chatMessages;
  const conversationSummary =
    analysis.chatRuntime?.conversationSummary ??
    analysis.result.chatState.conversationSummary;
  const persistedMemoryCount =
    analysis.chatRuntime?.memoryItems.length ??
    analysis.result.chatState.memoryItems.length;
  const suggestedQuestions =
    analysis.result.chatContext.suggestedQuestions.length > 0
      ? analysis.result.chatContext.suggestedQuestions
      : analysis.result.suggestedQuestions;

  const handleSend = async (message: string) => {
    const nextMessage = message.trim();
    if (!nextMessage || !onSendMessage) {
      return;
    }

    try {
      await onSendMessage(nextMessage);
      setDraft("");
    } catch {
      // Parent exposes the user-facing error copy.
    }
  };

  return (
    <div className="space-y-10">
      {conversationSummary ? (
        <section>
          <SectionTitle>Conversation Summary</SectionTitle>
          <div className="rounded-xl border border-[color:rgba(255,127,0,0.18)] bg-[color:rgba(255,127,0,0.06)] p-4">
            <p className="text-sm leading-7 text-[color:var(--text-muted)]">
              {conversationSummary}
            </p>
            <p className="mt-3 font-headline text-[10px] uppercase tracking-[0.2em] text-[color:rgba(240,220,204,0.56)]">
              Persisted memory items: {persistedMemoryCount}
            </p>
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle>Conversation Context</SectionTitle>
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "assistant"
                  ? "rounded-xl border border-[color:rgba(88,66,53,0.15)] bg-[color:rgba(29,17,6,0.4)] p-4 text-sm leading-7 text-[color:var(--text-muted)]"
                  : "rounded-xl border border-primary/20 bg-[color:rgba(255,127,0,0.05)] p-4 text-sm leading-7 text-foreground"
              }
            >
              {message.content}
            </div>
          ))}
        </div>
      </section>

      {suggestedQuestions.length > 0 ? (
        <section>
          <SectionTitle>Suggested Follow-Ups</SectionTitle>
          <div className="flex flex-wrap gap-3">
            {suggestedQuestions.map((question) => (
              <button
                key={question}
                className="rounded-full border border-[color:rgba(88,66,53,0.2)] bg-[color:rgba(29,17,6,0.4)] px-4 py-2 text-left text-xs leading-6 text-[color:var(--text-muted)] transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
                disabled={isChatPending}
                onClick={() => {
                  void handleSend(question);
                }}
                type="button"
              >
                {question}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {chatError ? (
        <div className="rounded-xl border border-[color:rgba(255,120,120,0.25)] bg-[color:rgba(120,20,20,0.18)] p-4 text-sm leading-7 text-[color:#ffb7b7]">
          {chatError}
        </div>
      ) : null}

      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend(draft);
        }}
      >
        <input
          className="w-full rounded-xl border border-[color:rgba(88,66,53,0.3)] bg-[color:rgba(23,12,3,0.8)] px-4 py-3 pr-12 text-sm text-foreground outline-none transition-all placeholder:text-[color:rgba(88,66,53,1)] focus:border-[color:var(--primary-strong)]"
          disabled={isChatPending}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask a follow-up about this video"
          type="text"
          value={draft}
        />
        <button
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--primary-strong)] transition-transform hover:scale-110 disabled:opacity-60"
          disabled={isChatPending || !draft.trim()}
          type="submit"
        >
          <span className="material-symbols-outlined">
            {isChatPending ? "hourglass_top" : "auto_awesome"}
          </span>
        </button>
      </form>
    </div>
  );
}

export default function AiPanel({
  analysis,
  chatError = null,
  isChatPending = false,
  onOutlineClick,
  onSendMessage,
  viewStatus,
}: AiPanelProps) {
  const [activeTab, setActiveTab] = useState<AiPanelTab>("summary");

  const renderSummary = () => {
    if (viewStatus === "idle") {
      return (
        <EmptyState
          description="After the task starts, this panel will fill with an AI summary, key takeaways, and suggested follow-up questions."
          title="Waiting For Analysis"
        />
      );
    }

    if (viewStatus === "submitting" || viewStatus === "processing") {
      return (
        <EmptyState
          description="The server is preparing transcript context and structured output. Results usually arrive a few seconds after the task is queued."
          title="Generating Summary"
        />
      );
    }

    if (viewStatus === "error") {
      return (
        <EmptyState
          description={analysis?.errorMessage ?? "This analysis did not complete successfully. Adjust the video link and try again."}
          title="Analysis Failed"
        />
      );
    }

    return analysis ? <SummaryPanel analysis={analysis} /> : null;
  };

  const renderOutline = () => {
    if (!analysis || viewStatus !== "success" || !analysis.result) {
      return (
        <EmptyState
          description="Once the analysis finishes, this tab shows a clickable outline. If the current source has no stable real timestamps, we label that explicitly."
          title="No Outline Yet"
        />
      );
    }

    return <OutlinePanel analysis={analysis} onOutlineClick={(time) => onOutlineClick?.(time)} />;
  };

  const renderChat = () => {
    if (!analysis || viewStatus !== "success" || !analysis.result) {
      return (
        <EmptyState
          description="Complete the video analysis first, then continue asking questions against the transcript and summary context."
          title="AI Chat Not Ready"
        />
      );
    }

    return (
      <ChatPanel
        analysis={analysis}
        chatError={chatError}
        isChatPending={isChatPending}
        onSendMessage={onSendMessage}
      />
    );
  };

  return (
    <aside className="glass-panel amber-glow flex h-[calc(100vh-8rem)] min-h-[620px] flex-col overflow-hidden rounded-[1.25rem]">
      <div className="flex border-b border-[color:rgba(88,66,53,0.15)] bg-[color:rgba(29,17,6,0.6)]">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              className={
                isActive
                  ? "flex-1 border-b-2 border-[color:var(--primary-strong)] bg-[color:rgba(255,127,0,0.05)] py-4 font-headline text-[11px] uppercase tracking-[0.24em] text-primary"
                  : "flex-1 py-4 font-headline text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)] transition-colors hover:bg-[color:rgba(255,127,0,0.05)] hover:text-primary"
              }
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-6 sm:p-8">
        {activeTab === "summary" ? renderSummary() : null}
        {activeTab === "outline" ? renderOutline() : null}
        {activeTab === "chat" ? renderChat() : null}
      </div>
    </aside>
  );
}
