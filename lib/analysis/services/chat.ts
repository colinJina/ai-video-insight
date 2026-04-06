import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/analysis/errors";
import {
  getAnalysisRepository,
  toPublicAnalysisTask,
} from "@/lib/analysis/repository";
import { createAssistantMessage, createUserMessage } from "@/lib/analysis/services/messages";
import type {
  AnalysisChatMessage,
  AnalysisChatContextPayload,
  AnalysisTask,
  AnalysisPublicTask,
  ChatInput,
} from "@/lib/analysis/types";
import { requestPythonChatAnswer } from "@/lib/python-backend/client";
import type { PythonChatRequest } from "@/lib/python-backend/types";
import {
  buildTranscriptExcerpt,
  normalizeWhitespace,
  trimText,
} from "@/lib/analysis/utils";

function toPythonChatMessages(
  messages: AnalysisChatMessage[],
): PythonChatRequest["recentMessages"] {
  return messages.slice(-6).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function buildPythonChatRequest(
  message: string,
  context: AnalysisChatContextPayload,
): PythonChatRequest {
  return {
    userId: context.userId,
    analysisId: context.analysisId,
    analysisSummary: context.analysisSummary,
    transcriptExcerpt: context.transcriptExcerpt,
    outline: context.outline,
    keyPoints: context.keyPoints,
    message,
    recentMessages: toPythonChatMessages(context.recentMessages),
    memoryItems: [],
  };
}

function buildAnalysisChatContext(
  id: string,
  task: AnalysisTask,
  recentMessages: AnalysisChatMessage[],
): AnalysisChatContextPayload {
  if (!task.result || !task.transcript) {
    throw new ConflictError(
      "Wait for the video analysis to complete before sending chat messages.",
    );
  }

  return {
    userId: task.userId,
    analysisId: id,
    analysisSummary: task.result.summary,
    transcriptExcerpt: buildTranscriptExcerpt(task.transcript.segments, 2400),
    outline: task.result.outline,
    keyPoints: task.result.keyPoints,
    recentMessages,
  };
}

export async function chatOnAnalysis(
  id: string,
  input: ChatInput,
): Promise<AnalysisPublicTask> {
  const message = normalizeWhitespace(input.message ?? "");
  if (!message) {
    throw new ValidationError("Please enter a follow-up question.");
  }

  const repository = getAnalysisRepository();
  const task = await repository.findById(id);

  if (!task) {
    throw new NotFoundError("Could not find the requested analysis task.");
  }

  if (!task.result || !task.transcript || task.status !== "completed") {
    throw new ConflictError("Wait for the video analysis to complete before sending chat messages.");
  }

  const userMessage = createUserMessage(trimText(message, 500));
  const context = buildAnalysisChatContext(id, task, [...task.chatMessages, userMessage]);
  const pythonRequest = buildPythonChatRequest(
    userMessage.content,
    context,
  );
  const pythonResponse = await requestPythonChatAnswer(pythonRequest);

  const assistantMessage = createAssistantMessage(
    trimText(pythonResponse.answer, 480),
  );
  const updatedTask = await repository.appendChatMessages(id, [
    userMessage,
    assistantMessage,
  ]);

  if (!updatedTask) {
    throw new NotFoundError("Could not find the requested analysis task.");
  }

  return toPublicAnalysisTask(updatedTask);
}
