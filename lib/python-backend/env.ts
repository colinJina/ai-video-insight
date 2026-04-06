const DEFAULT_PYTHON_BACKEND_TIMEOUT_MS = 20000;

function normalizeTimeout(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PYTHON_BACKEND_TIMEOUT_MS;
  }

  return Math.floor(parsed);
}

export function getPythonBackendBaseUrl() {
  return process.env.PYTHON_BACKEND_BASE_URL?.trim() ?? "";
}

export function getPythonBackendTimeoutMs() {
  return normalizeTimeout(
    process.env.PYTHON_BACKEND_TIMEOUT_MS ?? process.env.PYTHON_CHAT_TIMEOUT_MS,
  );
}

export function isPythonBackendConfigured() {
  return Boolean(getPythonBackendBaseUrl());
}

