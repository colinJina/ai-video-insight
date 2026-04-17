import { ExternalServiceError, TimeoutError } from "@/lib/analysis/errors";
import { fetchWithTimeout, isRecord } from "@/lib/analysis/utils";
import {
  getPythonBackendBaseUrl,
  getPythonBackendTimeoutMs,
} from "@/lib/python-backend/env";
import type {
  PythonBackendBinaryResponse,
  PythonBackendErrorPayload,
  PythonBackendJsonRequestOptions,
  PythonChatRequest,
  PythonChatResponse,
  PythonChatMemoryItem,
  PythonPdfReportRequest,
} from "@/lib/python-backend/types";

function resolvePythonBackendBaseUrl() {
  const baseUrl = getPythonBackendBaseUrl();

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
  return new URL(pathname, resolvePythonBackendBaseUrl()).toString();
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

  if (
    typedPayload &&
    isRecord(typedPayload.error) &&
    typeof typedPayload.error.message === "string" &&
    typedPayload.error.message.trim()
  ) {
    return typedPayload.error.message;
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
  options: PythonBackendJsonRequestOptions,
) {
  const {
    pathname,
    init,
    serviceLabel,
    timeoutMs = getPythonBackendTimeoutMs(),
  } = options;
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
      `The ${serviceLabel} is unavailable. Make sure the Python backend is running and /api/chat/respond is reachable, then try again.`,
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

function parseContentDispositionFilename(value: string | null) {
  if (!value) {
    return null;
  }

  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = value.match(/filename="?([^"]+)"?/i);
  return plainMatch?.[1] ?? null;
}

async function requestPythonBackendBinary(
  options: PythonBackendJsonRequestOptions,
): Promise<PythonBackendBinaryResponse> {
  const {
    pathname,
    init,
    serviceLabel,
    timeoutMs = getPythonBackendTimeoutMs(),
  } = options;
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
      `The ${serviceLabel} is unavailable. Make sure the Python backend is running and ${pathname} is reachable, then try again.`,
      true,
    );
  }

  if (!response.ok) {
    const rawBody = await response.text();
    let payload: unknown = null;

    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      payload = null;
    }

    throw new ExternalServiceError(
      readPythonBackendErrorMessage(payload, response.status, serviceLabel),
      true,
    );
  }

  return {
    data: await response.arrayBuffer(),
    contentType: response.headers.get("Content-Type") ?? "application/octet-stream",
    filename: parseContentDispositionFilename(
      response.headers.get("Content-Disposition"),
    ),
  };
}

async function requestPythonBackendStream(
  options: PythonBackendJsonRequestOptions,
): Promise<Response> {
  const {
    pathname,
    init,
    serviceLabel,
    timeoutMs = getPythonBackendTimeoutMs(),
  } = options;

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
      `The ${serviceLabel} is unavailable. Make sure the Python backend is running and ${pathname} is reachable, then try again.`,
      true,
    );
  }

  if (!response.ok) {
    const rawBody = await response.text();
    let payload: unknown = null;

    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      payload = null;
    }

    throw new ExternalServiceError(
      readPythonBackendErrorMessage(payload, response.status, serviceLabel),
      true,
    );
  }

  if (!response.body) {
    throw new ExternalServiceError(
      `The ${serviceLabel} did not return a readable stream.`,
      true,
    );
  }

  return response;
}

export async function requestPythonChatAnswer(
  payload: PythonChatRequest,
): Promise<PythonChatResponse> {
  const body = await requestPythonBackendJson(
    {
      pathname: "/api/chat/respond",
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      serviceLabel: "Python chat service",
    },
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
    memoryUpdates: parseMemoryItems(
      Array.isArray(body.memoryUpdates) ? body.memoryUpdates : body.memory_updates,
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

export async function requestPythonChatAnswerStream(
  payload: PythonChatRequest,
): Promise<Response> {
  return requestPythonBackendStream({
    pathname: "/api/chat/respond/stream",
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    serviceLabel: "Python chat stream service",
  });
}

export async function requestPythonPdfReport(
  payload: PythonPdfReportRequest,
): Promise<PythonBackendBinaryResponse> {
  return requestPythonBackendBinary({
    pathname: "/api/report/pdf",
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    serviceLabel: "Python PDF report service",
  });
}
