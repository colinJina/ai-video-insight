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
  id: string,
  userId: string,
  message: string,
  taskWithUserMessage: AnalysisTask,
): PythonChatRequest {
  if (!taskWithUserMessage?.result || !taskWithUserMessage.transcript) {
    throw new ConflictError(
      "Wait for the video analysis to complete before sending chat messages.",
    );
  }

  return {
    userId,
    analysisId: id,
    analysisSummary: taskWithUserMessage.result.summary,
    transcriptExcerpt: buildTranscriptExcerpt(
      taskWithUserMessage.transcript.segments,
      2400,
    ),
    outline: taskWithUserMessage.result.outline,
    keyPoints: taskWithUserMessage.result.keyPoints,
    message,
    recentMessages: toPythonChatMessages(taskWithUserMessage.chatMessages),
    memoryItems: [],
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
  const taskWithUserMessage = await repository.appendChatMessages(id, [userMessage]);

  if (!taskWithUserMessage) {
    throw new NotFoundError("Could not find the requested analysis task.");
  }

  const pythonRequest = buildPythonChatRequest(
    id,
    task.userId,
    userMessage.content,
    taskWithUserMessage,
  );
  const pythonResponse = await requestPythonChatAnswer(pythonRequest);

  const assistantMessage = createAssistantMessage(
    trimText(pythonResponse.answer, 480),
  );
  const updatedTask = await repository.appendChatMessages(id, [assistantMessage]);

  if (!updatedTask) {
    throw new NotFoundError("Could not find the requested analysis task.");
  }

  return toPublicAnalysisTask(updatedTask);
}
