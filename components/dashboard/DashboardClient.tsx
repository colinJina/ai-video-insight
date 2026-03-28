"use client";

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import AiPanel from "@/components/AiPanel";
import VideoSection, { type VideoSectionHandle } from "@/components/VideoSection";
import type {
  AnalysisPublicTask,
  AnalysisTaskStatus,
  AnalysisViewStatus,
} from "@/lib/analysis/types";
import { isRecord } from "@/lib/analysis/utils";

const DEFAULT_VIDEO_URL =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

const DIRECT_VIDEO_FILE_PATTERN = /\.(mp4|webm|ogg|mov|m4v)(?:$|[?#])/i;

type AnalysisResponse = {
  analysis: AnalysisPublicTask;
};

function mapTaskStatusToView(status: AnalysisTaskStatus): AnalysisViewStatus {
  if (status === "queued" || status === "processing") {
    return "processing";
  }

  if (status === "completed") {
    return "success";
  }

  return "error";
}

function looksLikeDirectVideoUrl(value: string) {
  return DIRECT_VIDEO_FILE_PATTERN.test(value.trim());
}

function getSafeExternalUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function formatDurationLabel(durationSeconds: number | null | undefined) {
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds)) {
    return "时长暂不可用";
  }

  const totalSeconds = Math.max(0, Math.round(durationSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `时长：${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `时长：${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildStatusMessage(
  viewStatus: AnalysisViewStatus,
  analysis: AnalysisPublicTask | null,
  errorMessage: string | null,
) {
  if (viewStatus === "submitting") {
    return "正在创建分析任务，请稍候。";
  }

  if (viewStatus === "processing") {
    return "服务端正在校验链接、提取视频信息、准备转写并生成结构化摘要。";
  }

  if (viewStatus === "success" && analysis?.result) {
    const usableTimeline = analysis.result.outline.filter((item) => item.time).length;

    if (analysis.transcriptSource === "mock") {
      return "分析已完成，但当前仍在使用 mock transcript，所以摘要并不是基于这条视频的真实转写内容。";
    }

    return usableTimeline > 0
      ? `分析完成，已生成 ${usableTimeline} 个可定位时间点和 ${analysis.result.keyPoints.length} 条关键要点。`
      : `分析完成，已生成 ${analysis.result.keyPoints.length} 条关键要点；当前来源没有稳定的真实时间轴。`;
  }

  if (viewStatus === "error") {
    return errorMessage ?? "分析失败，请检查链接后重试。";
  }

  return "输入公开可访问的视频链接后，点击“开始分析”即可创建服务端任务。";
}

function buildVideoMetrics(
  analysis: AnalysisPublicTask | null,
  previewVideoUrl: string | null,
) {
  return [
    {
      icon: "link",
      label: analysis?.video.host
        ? `来源：${analysis.video.host}`
        : "支持 HTTP / HTTPS 视频链接",
    },
    {
      icon: "schedule",
      label: formatDurationLabel(analysis?.video.durationSeconds),
    },
    {
      icon: "play_circle",
      label: previewVideoUrl
        ? "当前链接支持页面内预览"
        : "部分网页链接仅支持分析，不支持内嵌播放",
    },
    {
      icon: "text_snippet",
      label: analysis?.transcriptSource
        ? `转写来源：${
            analysis.transcriptSource === "mock"
              ? "Mock Transcript"
              : "Remote Transcript"
          }`
        : "尚未生成转写内容",
    },
  ];
}

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
        : "请求失败，请稍后重试。";

    throw new Error(message);
  }

  return payload as T;
}

export default function DashboardClient() {
  const videoRef = useRef<VideoSectionHandle | null>(null);

  const [videoUrl, setVideoUrl] = useState(DEFAULT_VIDEO_URL);
  const [analysis, setAnalysis] = useState<AnalysisPublicTask | null>(null);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [viewStatus, setViewStatus] = useState<AnalysisViewStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isChatPending, setIsChatPending] = useState(false);

  const commitAnalysis = (nextAnalysis: AnalysisPublicTask) => {
    startTransition(() => {
      setAnalysis(nextAnalysis);
      setActiveAnalysisId(nextAnalysis.id);
      setErrorMessage(nextAnalysis.errorMessage);
      setViewStatus(mapTaskStatusToView(nextAnalysis.status));
    });
  };

  const pollAnalysis = useEffectEvent(async (analysisId: string) => {
    const response = await requestJson<AnalysisResponse>(`/api/analysis/${analysisId}`);
    commitAnalysis(response.analysis);

    return (
      response.analysis.status === "queued" ||
      response.analysis.status === "processing"
    );
  });

  useEffect(() => {
    if (!activeAnalysisId || viewStatus !== "processing") {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const loop = async () => {
      try {
        const shouldContinue = await pollAnalysis(activeAnalysisId);
        if (!cancelled && shouldContinue) {
          timeoutId = setTimeout(() => {
            void loop();
          }, 1500);
        }
      } catch (error) {
        if (!cancelled) {
          setViewStatus("error");
          setErrorMessage(
            error instanceof Error ? error.message : "轮询分析结果失败。",
          );
        }
      }
    };

    void loop();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [activeAnalysisId, viewStatus]);

  const handleAnalyze = async () => {
    setChatError(null);
    setErrorMessage(null);
    setViewStatus("submitting");

    try {
      const response = await requestJson<AnalysisResponse>("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ videoUrl }),
      });

      commitAnalysis(response.analysis);
    } catch (error) {
      setViewStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "创建分析任务失败。",
      );
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!activeAnalysisId) {
      return;
    }

    setIsChatPending(true);
    setChatError(null);

    try {
      const response = await requestJson<AnalysisResponse>(
        `/api/analysis/${activeAnalysisId}/chat`,
        {
          method: "POST",
          body: JSON.stringify({ message }),
        },
      );

      startTransition(() => {
        setAnalysis(response.analysis);
      });
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : "发送问题失败，请稍后重试。",
      );
    } finally {
      setIsChatPending(false);
    }
  };

  const previewVideoUrl =
    analysis?.video.playableUrl ??
    (looksLikeDirectVideoUrl(videoUrl) ? videoUrl.trim() : null);
  const posterUrl = analysis?.video.posterUrl ?? null;
  const sourceUrl = getSafeExternalUrl(analysis?.video.normalizedUrl ?? videoUrl.trim());
  const title =
    analysis?.result?.title ?? analysis?.video.title ?? "输入视频链接，开始生成视频摘要";
  const description =
    analysis?.result?.summary ??
    analysis?.video.description ??
    "服务端会校验链接、提取基础信息、获取字幕或真实转写，并生成结构化概要与问答上下文。";
  const statusMessage = buildStatusMessage(viewStatus, analysis, errorMessage);
  const metrics = buildVideoMetrics(analysis, previewVideoUrl);

  return (
    <div className="flex w-full flex-col gap-8 lg:flex-row lg:pb-12">
      <div className="w-full lg:w-[62%]">
        <VideoSection
          ref={videoRef}
          authoritativeDurationSeconds={analysis?.video.durationSeconds ?? null}
          description={description}
          metrics={metrics}
          onAnalyze={handleAnalyze}
          onVideoUrlChange={setVideoUrl}
          posterSrc={posterUrl}
          sourceUrl={sourceUrl}
          status={viewStatus}
          statusMessage={statusMessage}
          title={title}
          videoSrc={previewVideoUrl}
          videoUrl={videoUrl}
        />
      </div>
      <div className="w-full lg:w-[38%]">
        <AiPanel
          analysis={analysis}
          chatError={chatError}
          isChatPending={isChatPending}
          onOutlineClick={(seconds) => {
            videoRef.current?.seekTo(seconds);
          }}
          onSendMessage={handleSendMessage}
          viewStatus={viewStatus}
        />
      </div>
    </div>
  );
}
