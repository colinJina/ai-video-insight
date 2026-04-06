import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/analysis/errors";
import { createAiProvider } from "@/lib/analysis/providers/ai";
import {
  getAnalysisRepository,
  toPublicAnalysisTask,
} from "@/lib/analysis/repository";
import { createAssistantMessage, createUserMessage } from "@/lib/analysis/services/messages";
import type { AnalysisPublicTask, ChatInput } from "@/lib/analysis/types";
import { normalizeWhitespace, trimText } from "@/lib/analysis/utils";

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
    throw new NotFoundError("Could not find the requested analysis task.");
  }

  return toPublicAnalysisTask(updatedTask);
}
