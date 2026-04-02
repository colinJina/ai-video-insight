"use client";

import {
  startTransition,
  type ChangeEvent,
  useEffect,
  useEffectEvent,
  useState,
} from "react";

import AiPanel from "@/components/AiPanel";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import VideoSection from "@/components/VideoSection";
import type {
  AnalysisPublicTask,
  AnalysisTaskStatus,
  AnalysisViewStatus,
} from "@/lib/analysis/types";
import { isRecord, isUploadedVideoSource } from "@/lib/analysis/utils";

const DEFAULT_VIDEO_URL =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

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

function formatDurationLabel(durationSeconds: number | null | undefined) {
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds)) {
    return "Duration unavailable";
  }

  const totalSeconds = Math.max(0, Math.round(durationSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `Duration ${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `Duration ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildStatusMessage(
  viewStatus: AnalysisViewStatus,
  analysis: AnalysisPublicTask | null,
  errorMessage: string | null,
  isAuthenticated: boolean,
) {
  if (!isAuthenticated && viewStatus === "idle") {
    return "Paste a video URL or upload an MP4 file, then sign in from the modal before we create the analysis task.";
  }

  if (viewStatus === "submitting") {
    return "Creating your analysis task now. This keeps the dashboard state warm while the job is queued.";
  }

  if (viewStatus === "processing") {
    return "The server is validating the link, extracting metadata, preparing a transcript, and generating a structured summary.";
  }

  if (viewStatus === "success" && analysis?.result) {
    const usableTimeline = analysis.result.outline.filter((item) => item.time).length;

    if (analysis.transcriptSource === "mock") {
      return "The task finished with a mock transcript source, so the summary is useful for UI review but not grounded in the real video transcript.";
    }

    return usableTimeline > 0
      ? `Analysis completed with ${usableTimeline} timestamped outline points and ${analysis.result.keyPoints.length} key takeaways.`
      : `Analysis completed with ${analysis.result.keyPoints.length} key takeaways, but the current source did not return a stable timeline.`;
  }

  if (viewStatus === "error") {
    return errorMessage ?? "Analysis failed. Check the video link and try again.";
  }

  return "Enter a public video URL or upload an MP4 file to extract metadata, transcript context, and a structured summary.";
}

function buildVideoMetrics(
  analysis: AnalysisPublicTask | null,
  posterUrl: string | null,
) {
  return [
    {
      icon: "link",
      label: analysis?.video.host
        ? `Source ${analysis.video.host}`
        : "Supports URLs and local MP4 uploads",
    },
    {
      icon: "schedule",
      label: formatDurationLabel(analysis?.video.durationSeconds),
    },
    {
      icon: "image",
      label: posterUrl ? "Poster artwork resolved" : "Poster artwork not available yet",
    },
    {
      icon: "text_snippet",
      label: analysis?.transcriptSource
        ? `Transcript ${
            analysis.transcriptSource === "mock"
              ? "Mock Source"
              : "Remote Source"
          }`
        : "Transcript not generated yet",
    },
  ];
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const isFormDataPayload =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetch(input, {
    cache: "no-store",
    ...init,
    headers: {
      ...(!isFormDataPayload && init?.body ? { "Content-Type": "application/json" } : {}),
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

    throw Object.assign(new Error(message), { status: response.status });
  }

  return payload as T;
}

export default function DashboardClient({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const { openAuthModal } = useAuthModal();
  const [videoUrl, setVideoUrl] = useState(DEFAULT_VIDEO_URL);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
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
            error instanceof Error ? error.message : "Polling analysis results failed.",
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
    if (!isAuthenticated) {
      setViewStatus("idle");
      setErrorMessage("Sign in to create a video analysis task and store it in your workspace.");
      openAuthModal("/dashboard");
      return;
    }

    setChatError(null);
    setErrorMessage(null);
    setViewStatus("submitting");

    try {
      const response = videoFile
        ? await (async () => {
            const formData = new FormData();
            formData.set("videoFile", videoFile);
            return requestJson<AnalysisResponse>("/api/analyze", {
              method: "POST",
              body: formData,
            });
          })()
        : await requestJson<AnalysisResponse>("/api/analyze", {
            method: "POST",
            body: JSON.stringify({ videoUrl }),
          });

      commitAnalysis(response.analysis);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        error.status === 401
      ) {
        setViewStatus("idle");
        setErrorMessage("Your session expired. Sign in again to continue analyzing videos.");
        openAuthModal("/dashboard");
        return;
      }

      setViewStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Creating the analysis task failed.",
      );
    }
  };

  const handleVideoUrlChange = (value: string) => {
    setVideoUrl(value);

    if (value.trim()) {
      setVideoFile(null);
      setFileInputKey((current) => current + 1);
    }
  };

  const handleVideoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setVideoFile(nextFile);

    if (nextFile) {
      setVideoUrl("");
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
        error instanceof Error ? error.message : "Sending the follow-up question failed.",
      );
    } finally {
      setIsChatPending(false);
    }
  };

  const posterUrl = analysis?.video.posterUrl ?? null;
  const title =
    analysis?.result?.title ?? analysis?.video.title ?? "Paste a video link to generate the next insight layer.";
  const description =
    analysis?.result?.summary ??
    analysis?.video.description ??
    "The server validates the link, extracts metadata, retrieves transcript context, and turns the result into a reusable analysis workspace.";
  const statusMessage = buildStatusMessage(
    viewStatus,
    analysis,
    errorMessage,
    isAuthenticated,
  );
  const metrics = buildVideoMetrics(analysis, posterUrl);
  const activeFileName =
    videoFile?.name ??
    (analysis && isUploadedVideoSource(analysis.video) ? analysis.video.fileName ?? null : null);

  return (
    <div className="flex w-full flex-col gap-8 lg:flex-row lg:pb-12">
      <div className="w-full lg:w-[62%]">
        <VideoSection
          description={description}
          isAuthenticated={isAuthenticated}
          metrics={metrics}
          onAnalyze={handleAnalyze}
          fileInputKey={fileInputKey}
          onVideoFileChange={handleVideoFileChange}
          onVideoUrlChange={handleVideoUrlChange}
          posterSrc={posterUrl}
          selectedFileName={activeFileName}
          status={viewStatus}
          statusMessage={statusMessage}
          title={title}
          videoUrl={videoUrl}
        />
      </div>
      <div className="w-full lg:w-[38%]">
        <AiPanel
          analysis={analysis}
          chatError={chatError}
          isChatPending={isChatPending}
          onSendMessage={handleSendMessage}
          viewStatus={viewStatus}
        />
      </div>
    </div>
  );
}
