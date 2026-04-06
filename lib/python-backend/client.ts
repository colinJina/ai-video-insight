import { ExternalServiceError, TimeoutError } from "@/lib/analysis/errors";
import { fetchWithTimeout, isRecord } from "@/lib/analysis/utils";
import type {
  PythonBackendErrorPayload,
  PythonChatRequest,
  PythonChatResponse,
  PythonChatMemoryItem,
} from "@/lib/python-backend/types";

const DEFAULT_PYTHON_BACKEND_TIMEOUT_MS = Number(
  process.env.PYTHON_BACKEND_TIMEOUT_MS ?? process.env.PYTHON_CHAT_TIMEOUT_MS ?? 20000,
);

function getPythonBackendBaseUrl() {
  const baseUrl = process.env.PYTHON_BACKEND_BASE_URL?.trim();

  if (!baseUrl) {
    throw new ExternalServiceError(
      "The Python backend is not configured. Set PYTHON_BACKEND_BASE_URL and try again.",
      true,
    );
  }

  try {
    return new URL(baseUrl).toString();
  } catch {
    throw new ExternalServiceError(
      "The Python backend URL is invalid. Check PYTHON_BACKEND_BASE_URL and try again.",
      true,
    );
  }
}

function buildPythonBackendUrl(pathname: string) {
  return new URL(pathname, getPythonBackendBaseUrl()).toString();
}

function readPythonBackendErrorMessage(
  payload: unknown,
  status: number,
  serviceLabel: string,
) {
  const typedPayload = isRecord(payload) ? (payload as PythonBackendErrorPayload) : null;
  if (typedPayload && typeof typedPayload.detail === "string" && typedPayload.detail.trim()) {
    return typedPayload.detail;
  }

  return `The ${serviceLabel} returned status ${status}.`;
}

function parseMemoryItems(value: unknown): PythonChatMemoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is PythonChatMemoryItem => {
    return (
      isRecord(item) &&
      typeof item.kind === "string" &&
      typeof item.content === "string"
    );
  });
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

async function requestPythonBackendJson(
  pathname: string,
  init: RequestInit,
  serviceLabel: string,
  timeoutMs = DEFAULT_PYTHON_BACKEND_TIMEOUT_MS,
) {
  let response: Response;

  try {
    response = await fetchWithTimeout(
      buildPythonBackendUrl(pathname),
      init,
      timeoutMs,
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      throw new TimeoutError(
        `The ${serviceLabel} timed out. Please try again in a moment.`,
      );
    }

    throw new ExternalServiceError(
      `The ${serviceLabel} is unavailable. Start the Python backend and try again.`,
      true,
    );
  }

  const rawBody = await response.text();
  let body: unknown = null;

  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    throw new ExternalServiceError(
      `The ${serviceLabel} returned invalid JSON. Please check the backend logs.`,
      true,
    );
  }

  if (!response.ok) {
    throw new ExternalServiceError(
      readPythonBackendErrorMessage(body, response.status, serviceLabel),
      true,
    );
  }

  return body;
}

export async function requestPythonChatAnswer(
  payload: PythonChatRequest,
): Promise<PythonChatResponse> {
  const body = await requestPythonBackendJson(
    "/api/chat/respond",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Python chat service",
  );

  if (!isRecord(body) || typeof body.answer !== "string" || !body.answer.trim()) {
    throw new ExternalServiceError(
      "The Python chat service returned an empty answer. Please check the backend response shape.",
      true,
    );
  }

  return {
    answer: body.answer.trim(),
    memoryItems: parseMemoryItems(
      Array.isArray(body.memoryItems) ? body.memoryItems : body.memory_items,
    ),
    memoryHits: parseStringArray(
      Array.isArray(body.memoryHits) ? body.memoryHits : body.memory_hits,
    ),
    conversationSummary:
      typeof body.conversationSummary === "string"
        ? body.conversationSummary
        : typeof body.conversation_summary === "string"
          ? body.conversation_summary
          : null,
  };
}
