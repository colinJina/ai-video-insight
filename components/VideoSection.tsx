"use client";

import type { ChangeEvent, FormEvent } from "react";

import type { AnalysisViewStatus } from "@/lib/analysis/types";

const STATUS_META: Record<
  AnalysisViewStatus,
  { badge: string; button: string; tone: string }
> = {
  idle: {
    badge: "Ready",
    button: "Start Analysis",
    tone: "text-(--text-muted)",
  },
  submitting: {
    badge: "Submitting",
    button: "Creating Task",
    tone: "text-primary",
  },
  processing: {
    badge: "Processing",
    button: "Processing",
    tone: "text-primary",
  },
  success: {
    badge: "Completed",
    button: "Run Again",
    tone: "text-(--primary-strong)",
  },
  error: {
    badge: "Failed",
    button: "Retry Analysis",
    tone: "text-[#ff8b8b]",
  },
};

type VideoMetric = {
  icon: string;
  label: string;
};

type VideoSectionProps = {
  description: string;
  isAuthenticated: boolean;
  metrics: VideoMetric[];
  onAnalyze: () => void | Promise<void>;
  fileInputKey: number;
  onVideoFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onVideoUrlChange: (value: string) => void;
  posterSrc?: string | null;
  selectedFileName?: string | null;
  status: AnalysisViewStatus;
  statusMessage: string;
  title: string;
  videoUrl: string;
};

const VideoSection = ({
  description,
  isAuthenticated,
  metrics,
  onAnalyze,
  fileInputKey,
  onVideoFileChange,
  onVideoUrlChange,
  posterSrc,
  selectedFileName,
  status,
  statusMessage,
  title,
  videoUrl,
}: VideoSectionProps) => {
  const statusMeta = STATUS_META[status];
  const isBusy = status === "submitting" || status === "processing";
  const hasPoster = Boolean(posterSrc);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onAnalyze();
  };

  return (
    <section className="flex flex-col gap-8">
      <div className="glass-panel amber-glow relative aspect-video overflow-hidden rounded-[1.25rem]">
        {hasPoster ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={title}
              className="absolute inset-0 h-full w-full object-cover"
              referrerPolicy="no-referrer"
              src={posterSrc ?? undefined}
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/82 via-black/18 to-black/35" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              <div className="max-w-2xl space-y-3">
                <span className="inline-flex rounded-full border border-white/15 bg-black/35 px-3 py-1 font-headline text-[10px] uppercase tracking-[0.24em] text-white/75 backdrop-blur-md">
                  Poster Ready
                </span>
                <h2 className="text-glow font-headline text-2xl font-bold tracking-[-0.03em] text-white sm:text-4xl">
                  {title}
                </h2>
                <p className="max-w-xl text-sm leading-7 text-white/78 sm:text-base">
                  {description}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,176,102,0.18),rgba(16,10,5,0.92)_58%)] p-6">
            <div className="glass-card max-w-md rounded-2xl border border-[rgba(255,255,255,0.08)] px-6 py-5 text-center">
              <span className="material-symbols-outlined mb-3 text-4xl text-primary">
                image_not_supported
              </span>
              <p className="font-headline text-xs font-bold uppercase tracking-[0.24em] text-(--primary-strong)">
                No Poster Yet
              </p>
              <p className="mt-3 text-sm leading-7 text-(--text-muted)">
                We can still analyze the video even when poster artwork is
                missing. This panel will update as soon as artwork becomes
                available.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="block font-headline text-[10px] font-bold uppercase tracking-[0.3em] text-(--primary-strong)">
                Video Analysis Console
              </span>
              <span
                className={`rounded-full border border-[rgba(88,66,53,0.25)] bg-[rgba(29,17,6,0.55)] px-3 py-1 font-headline text-[10px] uppercase tracking-[0.24em] ${statusMeta.tone}`}
              >
                {statusMeta.badge}
              </span>
              {!isAuthenticated ? (
                <span className="rounded-full border border-[rgba(255,127,0,0.2)] bg-[rgba(255,127,0,0.08)] px-3 py-1 font-headline text-[10px] uppercase tracking-[0.24em] text-primary">
                  Sign-in Required
                </span>
              ) : null}
            </div>
            <h1 className="text-glow max-w-4xl font-headline text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
              {title}
            </h1>
          </div>
        </div>

        <form
          className="glass-card rounded-[1.25rem] p-5 sm:p-6"
          onSubmit={handleSubmit}
        >
          <label
            className="font-headline text-[10px] font-bold uppercase tracking-[0.24em] text-(--primary-strong)"
            htmlFor="dashboard-video-url"
          >
            Video URL
          </label>

          <div className="mt-3 flex flex-col gap-3 lg:flex-row">
            <input
              className="w-full rounded-xl border border-[rgba(88,66,53,0.3)] bg-[rgba(23,12,3,0.8)] px-4 py-3 text-sm text-foreground outline-none transition-all placeholder:text-[rgba(88,66,53,1)] focus:border-(--primary-strong)"
              id="dashboard-video-url"
              onChange={(event) => onVideoUrlChange(event.target.value)}
              placeholder="https://example.com/video.mp4"
              type="url"
              value={videoUrl}
            />
            <button
              className="rounded-xl cursor-pointer bg-linear-to-br from-primary to-(--primary-strong) px-6 py-3 font-headline text-xs font-bold uppercase tracking-[0.24em] text-(--on-primary) transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
              disabled={isBusy}
              type="submit"
            >
              {isAuthenticated ? statusMeta.button : "Sign In To Analyze"}
            </button>
          </div>

          <div className="mt-5 border-t border-[rgba(88,66,53,0.18)] pt-5">
            <label
              className="font-headline text-[10px] font-bold uppercase tracking-[0.24em] text-(--primary-strong)"
              htmlFor="dashboard-video-file"
            >
              Local MP4 Upload
            </label>
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[rgba(88,66,53,0.3)] bg-[rgba(23,12,3,0.8)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <input
                accept="video/mp4,.mp4"
                className="sr-only"
                id="dashboard-video-file"
                key={fileInputKey}
                onChange={onVideoFileChange}
                type="file"
              />
              <label
                className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-[rgba(255,127,0,0.16)] px-3 py-2 font-headline text-xs font-bold uppercase tracking-[0.18em] text-primary transition-colors hover:bg-[rgba(255,127,0,0.22)]"
                htmlFor="dashboard-video-file"
              >
                Choose File
              </label>
              <p className="min-w-0 text-sm text-(--text-muted) sm:flex-1">
                <span className="block truncate">
                  {selectedFileName ?? "No file selected"}
                </span>
              </p>
            </div>
            <p className="mt-2 text-xs leading-6 text-(--text-muted)">
              Choose a local MP4 file if you do not want to paste a public URL.
            </p>
          </div>

          <p
            className={`mt-3 text-sm leading-7 ${
              status === "error" ? "text-[#ff9b9b]" : "text-(--text-muted)"
            }`}
          >
            {statusMessage}
          </p>
        </form>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-[rgba(223,192,175,0.72)]">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex items-center gap-2">
              <span className="material-symbols-outlined text-lg text-primary/80">
                {metric.icon}
              </span>
              <span className="font-headline">{metric.label}</span>
            </div>
          ))}
        </div>

        <div className="max-w-3xl border-t border-[rgba(88,66,53,0.2)] pt-6 text-[15px] leading-8 text-(--text-muted)">
          {description}
        </div>
      </div>
    </section>
  );
};

export default VideoSection;
