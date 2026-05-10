import { NextResponse } from "next/server";

import {
  getErrorCode,
  getErrorStatusCode,
  getPublicErrorMessage,
  ValidationError,
} from "@/lib/analysis/errors";
import {
  createPipelineTraceId,
  logPipelineEvent,
  previewText,
} from "@/lib/analysis/debug";
import { streamAnalysisChatEvents } from "@/lib/analysis/chat-stream";
import { encodeSseEvent, readSseEvents } from "@/lib/analysis/sse";
import {
  finalizeAnalysisChatTurn,
  prepareAnalysisChatTurnStream,
} from "@/lib/analysis/services/chat";
import type { ChatInput } from "@/lib/analysis/types";
import { requestPythonChatAnswerStream } from "@/lib/python-backend/client";
import type {
  PythonChatRequest,
  PythonChatResponse,
} from "@/lib/python-backend/types";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

type AnalysisRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  request: Request,
  context: AnalysisRouteContext,
) {
  const traceId = createPipelineTraceId("chat");

  try {
    const { id } = await context.params;
    const body = await readChatInput(request);
    logPipelineEvent("next.chat.route", "received_chat_request", {
      traceId,
      analysisId: id,
      message: previewText(body.message ?? null),
    });

    const stream = new ReadableStream({
      async start(controller) {
        for await (const event of streamAnalysisChatEvents({
          id,
          input: {
            message: body.message ?? "",
          },
          prepareTurn: async function* (analysisId, chatInput) {
            for await (const prepareEvent of prepareAnalysisChatTurnStream(
              analysisId,
              chatInput,
            )) {
              if (prepareEvent.type === "prepared") {
                logPipelineEvent("next.chat.route", "prepared_chat_turn", {
                  traceId,
                  analysisId,
                  recentMessageCount:
                    prepareEvent.preparedTurn.pythonRequest.recentMessages.length,
                  memoryItemCount:
                    prepareEvent.preparedTurn.pythonRequest.memoryItems.length,
                  storedMemoryItemCount:
                    prepareEvent.preparedTurn.pythonRequest.storedMemoryItems.length,
                  transcriptExcerpt: previewText(
                    prepareEvent.preparedTurn.pythonRequest.transcriptExcerpt,
                    320,
                  ),
                });
              }

              yield prepareEvent;
            }
          },
          requestPythonStream: async (pythonRequest: PythonChatRequest) => {
            const response = await requestPythonChatAnswerStream(pythonRequest);
            logPipelineEvent("next.chat.route", "python_stream_connected", {
              traceId,
              analysisId: id,
            });
            return response;
          },
          finalizeTurn: async (
            preparedTurn,
            finalPayload: PythonChatResponse,
          ) => {
            const analysis = await finalizeAnalysisChatTurn(
              preparedTurn,
              finalPayload,
            );
            logPipelineEvent("next.chat.route", "chat_turn_finalized", {
              traceId,
              analysisId: id,
              answer: previewText(finalPayload.answer, 320),
              memoryUpdateCount: finalPayload.memoryUpdates.length,
              memoryHitCount: finalPayload.memoryHits.length,
              conversationSummary: previewText(
                finalPayload.conversationSummary,
                240,
              ),
            });
            return analysis;
          },
          readSseEvents,
          parsePythonFinal: (data) => JSON.parse(data) as PythonChatResponse,
          readStreamErrorMessage,
          getErrorMessage: (error) => {
            const message = getPublicErrorMessage(error);
            logPipelineEvent("next.chat.route", "chat_stream_failed", {
              traceId,
              analysisId: id,
              message,
            });
            return message;
          },
        })) {
          controller.enqueue(encodeChunk(event.event, event.data));
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "text/event-stream; charset=utf-8",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    logPipelineEvent("next.chat.route", "chat_request_failed", {
      traceId,
      errorCode: getErrorCode(error),
      message: getPublicErrorMessage(error),
    });

    return NextResponse.json(
      {
        error: {
          code: getErrorCode(error),
          message: getPublicErrorMessage(error),
        },
      },
      {
        status: getErrorStatusCode(error),
        headers: NO_STORE_HEADERS,
      },
    );
  }
}

async function readChatInput(request: Request): Promise<Partial<ChatInput>> {
  try {
    return (await request.json()) as Partial<ChatInput>;
  } catch {
    throw new ValidationError("The chat request body must be valid JSON.");
  }
}

function encodeChunk(event: string, data: unknown) {
  return new TextEncoder().encode(encodeSseEvent(event, data));
}

function readStreamErrorMessage(data: string) {
  try {
    const payload = JSON.parse(data) as {
      message?: string;
    };
    return payload.message?.trim() || "The chat stream failed.";
  } catch {
    return data.trim() || "The chat stream failed.";
  }
}
