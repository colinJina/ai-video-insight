import { randomUUID } from "node:crypto";

import type { AnalysisChatMessage } from "@/lib/analysis/types";

export function createAssistantMessage(content: string): AnalysisChatMessage {
  return {
    id: randomUUID(),
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
  };
}

export function createUserMessage(content: string): AnalysisChatMessage {
  return {
    id: randomUUID(),
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  };
}
