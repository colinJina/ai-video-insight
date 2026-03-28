"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import type { AnalysisViewStatus } from "@/lib/analysis/types";

const DEFAULT_POSTER_SRC =
  "https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=1600&q=80";
const SEEK_STEP = 10;
const PLAYBACK_RATES = [1, 1.25, 1.5, 2];

const STATUS_META: Record<
  AnalysisViewStatus,
  { badge: string; button: string; tone: string }
> = {
  idle: {
    badge: "待分析",
    button: "开始分析",
    tone: "text-[color:var(--text-muted)]",
  },
  submitting: {
    badge: "提交中",
    button: "创建任务中…",
    tone: "text-primary",
  },
  processing: {
    badge: "分析中",
    button: "分析中…",
    tone: "text-primary",
  },
  success: {
    badge: "已完成",
    button: "重新分析",
    tone: "text-[color:var(--primary-strong)]",
  },
  error: {
    badge: "失败",
    button: "重试分析",
    tone: "text-[color:#ff8b8b]",
  },
};

export type VideoSectionHandle = {
  getCurrentTime: () => number;
  pause: () => void;
  play: () => Promise<void> | void;
  seekTo: (time: number) => void;
  toggle: () => Promise<void> | void;
};

type VideoMetric = {
  icon: string;
  label: string;
};

type VideoSectionProps = {
  authoritativeDurationSeconds?: number | null;
  description: string;
  metrics: VideoMetric[];
  onAnalyze: () => void | Promise<void>;
  onVideoUrlChange: (value: string) => void;
  posterSrc?: string | null;
  sourceUrl?: string | null;
  status: AnalysisViewStatus;
  statusMessage: string;
  title: string;
  videoSrc?: string | null;
  videoUrl: string;
};

function formatTime(timeInSeconds: number) {
  if (!Number.isFinite(timeInSeconds) || timeInSeconds < 0) {
    return "00:00";
  }

  const totalSeconds = Math.floor(timeInSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const VideoSection = forwardRef<VideoSectionHandle, VideoSectionProps>(
  (
    {
      authoritativeDurationSeconds,
      description,
      metrics,
      onAnalyze,
      onVideoUrlChange,
      posterSrc = DEFAULT_POSTER_SRC,
      sourceUrl,
      status,
      statusMessage,
      title,
      videoSrc,
      videoUrl,
    },
    ref,
  ) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const progressRef = useRef<HTMLDivElement | null>(null);

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);

    const hasPlayableVideo = Boolean(videoSrc);
    const displayedDuration =
      typeof authoritativeDurationSeconds === "number" &&
      Number.isFinite(authoritativeDurationSeconds) &&
      authoritativeDurationSeconds >= 0
        ? authoritativeDurationSeconds
        : duration;
    const progressPercent =
      displayedDuration > 0
        ? Math.min((currentTime / displayedDuration) * 100, 100)
        : 0;
    const statusMeta = STATUS_META[status];
    const isBusy = status === "submitting" || status === "processing";

    const play = useCallback(async () => {
      const video = videoRef.current;
      if (!video || !hasPlayableVideo) {
        return;
      }

      try {
        await video.play();
      } catch {
        setIsPlaying(false);
      }
    }, [hasPlayableVideo]);

    const pause = useCallback(() => {
      videoRef.current?.pause();
    }, []);

    const seekTo = useCallback(
      (time: number) => {
        const video = videoRef.current;
        if (!video || !hasPlayableVideo) {
          return;
        }

        const nextTime = Math.min(Math.max(time, 0), duration || 0);
        video.currentTime = nextTime;
        setCurrentTime(nextTime);
      },
      [duration, hasPlayableVideo],
    );

    const toggle = useCallback(() => {
      if (!hasPlayableVideo) {
        return;
      }

      if (videoRef.current?.paused) {
        return play();
      }

      pause();
    }, [hasPlayableVideo, pause, play]);

    useImperativeHandle(
      ref,
      () => ({
        getCurrentTime: () => videoRef.current?.currentTime ?? 0,
        pause,
        play,
        seekTo,
        toggle,
      }),
      [pause, play, seekTo, toggle],
    );

    useEffect(() => {
      const video = videoRef.current;
      if (!video) {
        return;
      }

      const handleLoadedMetadata = () => {
        setIsReady(Boolean(video.currentSrc));
        setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      };
      const handleTimeUpdate = () => {
        setCurrentTime(video.currentTime);
      };
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(video.duration || 0);
      };
      const handleVolumeChange = () => {
        setIsMuted(video.muted || video.volume === 0);
      };
      const handleRateChange = () => {
        setPlaybackRate(video.playbackRate);
      };

      if (videoSrc) {
        video.load();
      }

      handleLoadedMetadata();
      handleTimeUpdate();
      handlePause();
      handleVolumeChange();
      handleRateChange();

      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("durationchange", handleLoadedMetadata);
      video.addEventListener("timeupdate", handleTimeUpdate);
      video.addEventListener("play", handlePlay);
      video.addEventListener("pause", handlePause);
      video.addEventListener("ended", handleEnded);
      video.addEventListener("volumechange", handleVolumeChange);
      video.addEventListener("ratechange", handleRateChange);

      return () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("durationchange", handleLoadedMetadata);
        video.removeEventListener("timeupdate", handleTimeUpdate);
        video.removeEventListener("play", handlePlay);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("ended", handleEnded);
        video.removeEventListener("volumechange", handleVolumeChange);
        video.removeEventListener("ratechange", handleRateChange);
      };
    }, [videoSrc]);

    const handleSeekStep = useCallback(
      (step: number) => {
        seekTo((videoRef.current?.currentTime ?? 0) + step);
      },
      [seekTo],
    );

    const handleProgressSelect = useCallback(
      (clientX: number) => {
        const progressElement = progressRef.current;
        if (!progressElement || duration <= 0 || !hasPlayableVideo) {
          return;
        }

        const rect = progressElement.getBoundingClientRect();
        const ratio = (clientX - rect.left) / rect.width;
        seekTo(duration * Math.min(Math.max(ratio, 0), 1));
      },
      [duration, hasPlayableVideo, seekTo],
    );

    const handleProgressClick = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        handleProgressSelect(event.clientX);
      },
      [handleProgressSelect],
    );

    const handleProgressKeyDown = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          handleSeekStep(-SEEK_STEP);
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          handleSeekStep(SEEK_STEP);
        }
      },
      [handleSeekStep],
    );

    const handleMuteToggle = useCallback(() => {
      const video = videoRef.current;
      if (!video || !hasPlayableVideo) {
        return;
      }

      video.muted = !video.muted;
      setIsMuted(video.muted);
    }, [hasPlayableVideo]);

    const handlePlaybackRateToggle = useCallback(() => {
      const video = videoRef.current;
      if (!video || !hasPlayableVideo) {
        return;
      }

      const currentIndex = PLAYBACK_RATES.indexOf(video.playbackRate);
      const nextRate =
        PLAYBACK_RATES[
          (currentIndex + 1 + PLAYBACK_RATES.length) % PLAYBACK_RATES.length
        ];

      video.playbackRate = nextRate;
      setPlaybackRate(nextRate);
    }, [hasPlayableVideo]);

    const handleFullscreenToggle = useCallback(async () => {
      const container = videoRef.current?.parentElement;
      if (!container || !hasPlayableVideo) {
        return;
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await container.requestFullscreen();
    }, [hasPlayableVideo]);

    return (
      <section className="flex flex-col gap-8">
        <div className="glass-panel amber-glow group relative aspect-video overflow-hidden rounded-[1.25rem]">
          <video
            ref={videoRef}
            aria-label="视频播放器"
            className="absolute inset-0 h-full w-full object-cover"
            playsInline
            poster={posterSrc ?? undefined}
            preload="metadata"
            src={videoSrc ?? undefined}
          />

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Video poster"
            className={`absolute inset-0 h-full w-full object-cover grayscale transition-all duration-700 group-hover:scale-[1.03] group-hover:grayscale-0 ${
              isReady ? "pointer-events-none opacity-0" : "opacity-55"
            }`}
            src={posterSrc ?? DEFAULT_POSTER_SRC}
          />

          {hasPlayableVideo ? (
            <div
              className={`absolute inset-0 flex items-center justify-center transition-all duration-700 group-hover:scale-110 ${
                isPlaying ? "pointer-events-none opacity-0" : "opacity-100"
              }`}
            >
              <div
                aria-label={isPlaying ? "Pause video" : "Play video"}
                className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full border border-primary/20 bg-black/45 backdrop-blur-md"
                onClick={() => {
                  void toggle();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void toggle();
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <span className="material-symbols-outlined ml-1 text-5xl text-primary">
                  {isPlaying ? "pause_circle" : "play_circle"}
                </span>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[1px]">
              <div className="glass-card max-w-sm rounded-2xl px-6 py-5 text-center">
                <span className="material-symbols-outlined mb-3 text-4xl text-primary">
                  slow_motion_video
                </span>
                <p className="text-sm leading-7 text-[color:var(--text-muted)]">
                  当前链接可以继续分析，但这个页面只支持直接视频文件预览。
                </p>
              </div>
            </div>
          )}

          {hasPlayableVideo ? (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/30 to-transparent p-5 opacity-100 transition-opacity duration-500 sm:p-6 lg:opacity-0 lg:group-hover:opacity-100">
              <div
                ref={progressRef}
                aria-label="Video progress"
                aria-valuemax={Math.round(displayedDuration)}
                aria-valuemin={0}
                aria-valuenow={Math.round(currentTime)}
                className="mb-5 h-1 w-full cursor-pointer rounded-full bg-[color:rgba(88,66,53,0.3)]"
                onClick={handleProgressClick}
                onKeyDown={handleProgressKeyDown}
                role="slider"
                tabIndex={0}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-[color:var(--primary-strong)] shadow-[0_0_18px_rgba(255,127,0,0.5)]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 text-white">
                <div className="flex items-center gap-5">
                  <span
                    aria-label={isPlaying ? "Pause video" : "Play video"}
                    className="material-symbols-outlined cursor-pointer transition-colors hover:text-primary"
                    onClick={() => {
                      void toggle();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void toggle();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    {isPlaying ? "pause" : "play_arrow"}
                  </span>
                  <span
                    aria-label="Skip forward ten seconds"
                    className="material-symbols-outlined cursor-pointer transition-colors hover:text-primary"
                    onClick={() => handleSeekStep(SEEK_STEP)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleSeekStep(SEEK_STEP);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    skip_next
                  </span>
                  <span
                    aria-label={isMuted ? "Unmute video" : "Mute video"}
                    className="material-symbols-outlined cursor-pointer transition-colors hover:text-primary"
                    onClick={handleMuteToggle}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleMuteToggle();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    {isMuted ? "volume_off" : "volume_up"}
                  </span>
                  <span className="font-headline text-[11px] uppercase tracking-[0.24em] text-[color:rgba(223,192,175,0.72)]">
                    {formatTime(currentTime)} / {formatTime(displayedDuration)}
                  </span>
                </div>

                <div className="flex items-center gap-5">
                  <span
                    aria-label={`Playback speed ${playbackRate}x`}
                    className="material-symbols-outlined cursor-pointer transition-colors hover:text-primary"
                    onClick={handlePlaybackRateToggle}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handlePlaybackRateToggle();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    title={`${playbackRate}x`}
                  >
                    settings
                  </span>
                  <span
                    aria-label="Toggle fullscreen"
                    className="material-symbols-outlined cursor-pointer transition-colors hover:text-primary"
                    onClick={() => {
                      void handleFullscreenToggle();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void handleFullscreenToggle();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    fullscreen
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="block font-headline text-[10px] font-bold uppercase tracking-[0.3em] text-[color:var(--primary-strong)]">
                  视频理解工作台
                </span>
                <span
                  className={`rounded-full border border-[color:rgba(88,66,53,0.25)] bg-[color:rgba(29,17,6,0.55)] px-3 py-1 font-headline text-[10px] uppercase tracking-[0.24em] ${statusMeta.tone}`}
                >
                  {statusMeta.badge}
                </span>
              </div>
              <h1 className="text-glow max-w-4xl font-headline text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
                {title}
              </h1>
            </div>

            {sourceUrl ? (
              <a
                className="rounded-xl bg-gradient-to-br from-primary to-[color:var(--primary-strong)] px-7 py-3 text-center font-headline text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--on-primary)] transition-transform hover:scale-[1.03]"
                href={sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                查看原视频
              </a>
            ) : null}
          </div>

          <form
            className="glass-card rounded-[1.25rem] p-5 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void onAnalyze();
            }}
          >
            <label
              className="font-headline text-[10px] font-bold uppercase tracking-[0.24em] text-[color:var(--primary-strong)]"
              htmlFor="dashboard-video-url"
            >
              视频链接
            </label>

            <div className="mt-3 flex flex-col gap-3 lg:flex-row">
              <input
                className="w-full rounded-xl border border-[color:rgba(88,66,53,0.3)] bg-[color:rgba(23,12,3,0.8)] px-4 py-3 text-sm text-foreground outline-none transition-all placeholder:text-[color:rgba(88,66,53,1)] focus:border-[color:var(--primary-strong)]"
                id="dashboard-video-url"
                onChange={(event) => onVideoUrlChange(event.target.value)}
                placeholder="https://example.com/video.mp4"
                type="url"
                value={videoUrl}
              />
              <button
                className="rounded-xl bg-gradient-to-br from-primary to-[color:var(--primary-strong)] px-6 py-3 font-headline text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--on-primary)] transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
                disabled={isBusy}
                type="submit"
              >
                {statusMeta.button}
              </button>
            </div>

            <p
              className={`mt-3 text-sm leading-7 ${
                status === "error"
                  ? "text-[color:#ff9b9b]"
                  : "text-[color:var(--text-muted)]"
              }`}
            >
              {statusMessage}
            </p>
          </form>

          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-[color:rgba(223,192,175,0.72)]">
            {metrics.map((metric) => (
              <div key={metric.label} className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-primary/80">
                  {metric.icon}
                </span>
                <span className="font-headline">{metric.label}</span>
              </div>
            ))}
          </div>

          <div className="max-w-3xl border-t border-[color:rgba(88,66,53,0.2)] pt-6 text-[15px] leading-8 text-[color:var(--text-muted)]">
            {description}
          </div>
        </div>
      </section>
    );
  },
);

VideoSection.displayName = "VideoSection";

export default VideoSection;
