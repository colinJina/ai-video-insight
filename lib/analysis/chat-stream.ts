export type ThinkingPhaseStatus = "active" | "completed" | "failed";

export type ThinkingPhaseSource = "next" | "python";

export type ThinkingPhase = {
  id: string;
  label: string;
  status: ThinkingPhaseStatus;
  detail: string | null;
  source: ThinkingPhaseSource;
  toolName?: string | null;
};

export type ChatPreparationStreamEvent<TPreparedTurn> =
  | {
      type: "phase";
      phase: ThinkingPhase;
    }
  | {
      type: "prepared";
      preparedTurn: TPreparedTurn;
    };

export type ChatStreamOutputEvent<TAnalysis> =
  | {
      event: "phase";
      data: ThinkingPhase;
    }
  | {
      event: "token";
      data: {
        content: string;
      };
    }
  | {
      event: "done";
      data: {
        analysis: TAnalysis;
      };
    }
  | {
      event: "error";
      data: {
        message: string;
      };
    };

type SseEvent = {
  event: string;
  data: string;
};

type StreamAnalysisChatEventsInput<
  TChatInput,
  TPreparedTurn,
  TPythonRequest,
  TPythonResponse,
  TAnalysis,
> = {
  id: string;
  input: TChatInput;
  prepareTurn: (
    id: string,
    input: TChatInput,
  ) => AsyncGenerator<ChatPreparationStreamEvent<TPreparedTurn>>;
  requestPythonStream: (pythonRequest: TPythonRequest) => Promise<Response>;
  finalizeTurn: (
    preparedTurn: TPreparedTurn,
    pythonResponse: TPythonResponse,
  ) => Promise<TAnalysis>;
  readSseEvents: (stream: ReadableStream<Uint8Array>) => AsyncGenerator<SseEvent>;
  parsePythonFinal: (data: string) => TPythonResponse;
  readStreamErrorMessage: (data: string) => string;
  getErrorMessage: (error: unknown) => string;
};

const NEXT_CONNECT_PHASE_ID = "next-connect-python";

export async function* streamAnalysisChatEvents<
  TChatInput,
  TPythonRequest,
  TPreparedTurn extends { pythonRequest: TPythonRequest },
  TPythonResponse,
  TAnalysis,
>(
  input: StreamAnalysisChatEventsInput<
    TChatInput,
    TPreparedTurn,
    TPythonRequest,
    TPythonResponse,
    TAnalysis
  >,
): AsyncGenerator<ChatStreamOutputEvent<TAnalysis>> {
  let activePhase: ThinkingPhase | null = null;
  let preparedTurn: TPreparedTurn | null = null;
  let finalPayload: TPythonResponse | null = null;

  try {
    for await (const event of input.prepareTurn(input.id, input.input)) {
      if (event.type === "phase") {
        activePhase = trackActivePhase(activePhase, event.phase);
        yield {
          event: "phase",
          data: event.phase,
        };
        continue;
      }

      preparedTurn = event.preparedTurn;
    }

    if (!preparedTurn) {
      throw new Error("The chat preparation stream ended before producing a prepared turn.");
    }

    const connectingPhase = createConnectPythonPhase(
      "active",
      "Connecting to the Python answer stream.",
    );
    activePhase = connectingPhase;
    yield {
      event: "phase",
      data: connectingPhase,
    };

    const pythonResponse = await input.requestPythonStream(preparedTurn.pythonRequest);
    const connectedPhase = createConnectPythonPhase(
      "completed",
      "Connected. Waiting for streamed backend phases and answer tokens.",
    );
    activePhase = trackActivePhase(activePhase, connectedPhase);
    yield {
      event: "phase",
      data: connectedPhase,
    };

    if (!pythonResponse.body) {
      throw new Error("The Python chat stream did not return a readable response body.");
    }

    for await (const event of input.readSseEvents(pythonResponse.body)) {
      if (event.event === "phase") {
        const phase = parseThinkingPhase(event.data);
        if (!phase) {
          continue;
        }

        activePhase = trackActivePhase(activePhase, phase);
        yield {
          event: "phase",
          data: phase,
        };
        continue;
      }

      if (event.event === "token") {
        yield {
          event: "token",
          data: {
            content: event.data,
          },
        };
        continue;
      }

      if (event.event === "final") {
        finalPayload = input.parsePythonFinal(event.data);
        continue;
      }

      if (event.event === "error") {
        const message = input.readStreamErrorMessage(event.data);

        if (activePhase) {
          yield {
            event: "phase",
            data: toFailedPhase(activePhase, message),
          };
          activePhase = null;
        }

        yield {
          event: "error",
          data: {
            message,
          },
        };
        return;
      }
    }

    if (!finalPayload) {
      throw new Error(
        "The Python chat stream ended before sending the final payload.",
      );
    }

    const analysis = await input.finalizeTurn(preparedTurn, finalPayload);
    yield {
      event: "done",
      data: {
        analysis,
      },
    };
  } catch (error) {
    const message = input.getErrorMessage(error);

    if (activePhase) {
      yield {
        event: "phase",
        data: toFailedPhase(activePhase, message),
      };
    }

    yield {
      event: "error",
      data: {
        message,
      },
    };
  }
}

function createConnectPythonPhase(
  status: ThinkingPhaseStatus,
  detail: string,
): ThinkingPhase {
  return {
    id: NEXT_CONNECT_PHASE_ID,
    label: "Connecting to answer stream",
    status,
    detail,
    source: "next",
    toolName: null,
  };
}

function parseThinkingPhase(data: string): ThinkingPhase | null {
  try {
    const payload = JSON.parse(data) as Partial<ThinkingPhase>;
    if (
      typeof payload.id !== "string" ||
      typeof payload.label !== "string" ||
      typeof payload.status !== "string" ||
      typeof payload.source !== "string"
    ) {
      return null;
    }

    return {
      id: payload.id,
      label: payload.label,
      status:
        payload.status === "completed" || payload.status === "failed"
          ? payload.status
          : "active",
      detail: typeof payload.detail === "string" ? payload.detail : null,
      source: payload.source === "python" ? "python" : "next",
      toolName: typeof payload.toolName === "string" ? payload.toolName : null,
    };
  } catch {
    return null;
  }
}

function trackActivePhase(
  activePhase: ThinkingPhase | null,
  phase: ThinkingPhase,
) {
  if (phase.status === "active") {
    return phase;
  }

  if (activePhase?.id === phase.id) {
    return null;
  }

  return activePhase;
}

function toFailedPhase(phase: ThinkingPhase, message: string): ThinkingPhase {
  return {
    ...phase,
    status: "failed",
    detail: message,
  };
}
