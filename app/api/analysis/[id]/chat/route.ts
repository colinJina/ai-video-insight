import { NextResponse } from "next/server";

import {
  getErrorCode,
  getErrorStatusCode,
  getPublicErrorMessage,
  ValidationError,
} from "@/lib/analysis/errors";
import { encodeSseEvent, readSseEvents } from "@/lib/analysis/sse";
import {
  finalizeAnalysisChatTurn,
  prepareAnalysisChatTurn,
} from "@/lib/analysis/services/chat";
import type { ChatInput } from "@/lib/analysis/types";
import { requestPythonChatAnswerStream } from "@/lib/python-backend/client";
import type { PythonChatResponse } from "@/lib/python-backend/types";

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
  try {
    const { id } = await context.params;
    const body = await readChatInput(request);
    const preparedTurn = await prepareAnalysisChatTurn(id, {
      message: body.message ?? "",
    });
    const pythonResponse = await requestPythonChatAnswerStream(
      preparedTurn.pythonRequest,
    );

    const stream = new ReadableStream({
      async start(controller) {
        let finalPayload: PythonChatResponse | null = null;

        try {
          for await (const event of readSseEvents(pythonResponse.body!)) {
            if (event.event === "token") {
              controller.enqueue(encodeChunk("token", {
                content: event.data,
              }));
              continue;
            }

            if (event.event === "final") {
              finalPayload = JSON.parse(event.data) as PythonChatResponse;
              continue;
            }

            if (event.event === "error") {
              const message = readStreamErrorMessage(event.data);
              controller.enqueue(encodeChunk("error", { message }));
              controller.close();
              return;
            }
          }

          if (!finalPayload) {
            controller.enqueue(
              encodeChunk("error", {
                message: "The Python chat stream ended before sending the final payload.",
              }),
            );
            controller.close();
            return;
          }

          const analysis = await finalizeAnalysisChatTurn(
            preparedTurn,
            finalPayload,
          );
          controller.enqueue(encodeChunk("done", { analysis }));
          controller.close();
        } catch (error) {
          controller.enqueue(
            encodeChunk("error", {
              message: getPublicErrorMessage(error),
            }),
          );
          controller.close();
        }
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
