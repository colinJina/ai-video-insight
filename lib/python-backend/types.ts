export interface PythonBackendErrorPayload {
  detail?: string;
}

export interface PythonBackendJsonRequestOptions {
  pathname: string;
  init: RequestInit;
  serviceLabel: string;
  timeoutMs?: number;
}

export interface PythonChatMessage {
  role: "system" | "assistant" | "user";
  content: string;
}

export interface PythonChatOutlineItem {
  time: string | null;
  text: string;
}

export interface PythonChatMemoryItem {
  kind: string;
  content: string;
  source?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PythonChatRequest {
  userId: string;
  analysisId: string;
  analysisSummary: string | null;
  transcriptExcerpt: string | null;
  outline: PythonChatOutlineItem[];
  keyPoints: string[];
  message: string;
  recentMessages: PythonChatMessage[];
  memoryItems: PythonChatMemoryItem[];
}

export interface PythonChatResponse {
  answer: string;
  memoryItems: PythonChatMemoryItem[];
  memoryHits: string[];
  conversationSummary: string | null;
}
