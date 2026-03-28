import { randomUUID } from "node:crypto";

import {
  ConflictError,
  getPublicErrorMessage,
  NotFoundError,
  ValidationError,
} from "@/lib/analysis/errors";
import { buildAnalysisResult } from "@/lib/analysis/result";
import {
  getAnalysisRepository,
  toPublicAnalysisTask,
} from "@/lib/analysis/repository";
import { createAiProvider } from "@/lib/analysis/providers/ai";
import { createTranscriptProvider } from "@/lib/analysis/providers/transcript";
import type {
  AnalysisChatMessage,
  AnalysisPublicTask,
  AnalysisTask,
  ChatInput,
  CreateAnalysisInput,
} from "@/lib/analysis/types";
import {
  assertValidVideoUrl,
  normalizeWhitespace,
  trimText,
} from "@/lib/analysis/utils";
import { extractVideoMetadata } from "@/lib/analysis/video-metadata";

const runningTasks = new Map<string, Promise<void>>();

function createAssistantMessage(content: string): AnalysisChatMessage {
  return {
    id: randomUUID(),
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
  };
}

function createUserMessage(content: string): AnalysisChatMessage {
  return {
    id: randomUUID(),
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  };
}

async function processAnalysisTask(id: string) {
  const repository = getAnalysisRepository();
  const existing = await repository.findById(id);

  if (!existing || existing.status === "completed" || existing.status === "failed") {
    return;
  }

  await repository.update(id, {
    status: "processing",
    errorMessage: null,
  });

  const transcriptProvider = createTranscriptProvider();
  const aiProvider = createAiProvider();
  const latestTask = await repository.findById(id);

  if (!latestTask) {
    return;
  }

  try {
    const transcript = await transcriptProvider.getTranscript({
      video: latestTask.video,
    });
    const structuredSummary = await aiProvider.generateVideoSummary({
      video: latestTask.video,
      transcript,
    });
    const result = buildAnalysisResult(structuredSummary);
    const introMessage = createAssistantMessage(result.chatContext.intro);

    await repository.update(id, {
      status: "completed",
      transcript,
      transcriptSource: transcript.source,
      result,
      chatMessages: [introMessage],
      errorMessage: null,
    });
  } catch (error) {
    await repository.update(id, {
      status: "failed",
      errorMessage: getPublicErrorMessage(error),
    });
  }
}

function ensureAnalysisTaskRunning(id: string) {
  const existing = runningTasks.get(id);
  if (existing) {
    return existing;
  }

  const promise = processAnalysisTask(id).finally(() => {
    runningTasks.delete(id);
  });

  runningTasks.set(id, promise);

  return promise;
}

export async function createAnalysisTask(
  input: CreateAnalysisInput,
): Promise<AnalysisPublicTask> {
  const validUrl = assertValidVideoUrl(input.videoUrl);
  const video = await extractVideoMetadata(validUrl.toString());
  const now = new Date().toISOString();

  const task: AnalysisTask = {
    id: randomUUID(),
    status: "queued",
    video,
    transcript: null,
    transcriptSource: null,
    result: null,
    chatMessages: [],
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };

  const repository = getAnalysisRepository();
  const createdTask = await repository.create(task);

  void ensureAnalysisTaskRunning(createdTask.id);

  return toPublicAnalysisTask(createdTask);
}

export async function getAnalysisTask(id: string): Promise<AnalysisPublicTask> {
  const repository = getAnalysisRepository();
  const task = await repository.findById(id);

  if (!task) {
    throw new NotFoundError("找不到对应的分析任务。");
  }

  if (task.status === "queued" || task.status === "processing") {
    void ensureAnalysisTaskRunning(task.id);
  }

  return toPublicAnalysisTask(task);
}

export async function chatOnAnalysis(
  id: string,
  input: ChatInput,
): Promise<AnalysisPublicTask> {
  const message = normalizeWhitespace(input.message ?? "");
  if (!message) {
    throw new ValidationError("请输入你想继续追问的问题。");
  }

  const repository = getAnalysisRepository();
  const task = await repository.findById(id);

  if (!task) {
    throw new NotFoundError("找不到对应的分析任务。");
  }

  if (!task.result || !task.transcript || task.status !== "completed") {
    throw new ConflictError("请先等待视频分析完成，再继续提问。");
  }

  const userMessage = createUserMessage(trimText(message, 500));
  const taskWithUserMessage = await repository.appendChatMessages(id, [userMessage]);

  if (!taskWithUserMessage) {
    throw new NotFoundError("找不到对应的分析任务。");
  }

  const aiProvider = createAiProvider();
  const assistantReply = await aiProvider.chatWithVideoContext({
    video: task.video,
    transcript: task.transcript,
    analysis: task.result,
    messages: taskWithUserMessage.chatMessages,
    question: userMessage.content,
  });

  const assistantMessage = createAssistantMessage(trimText(assistantReply, 480));
  const updatedTask = await repository.appendChatMessages(id, [assistantMessage]);

  if (!updatedTask) {
    throw new NotFoundError("找不到对应的分析任务。");
  }

  return toPublicAnalysisTask(updatedTask);
}
