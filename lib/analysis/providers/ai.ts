import {
  buildChatSystemPrompt,
  buildChatUserPrompt,
  buildVideoSummarySystemPrompt,
  buildVideoSummaryUserPrompt,
} from "@/lib/ai/prompts";
import { ExternalServiceError } from "@/lib/analysis/errors";
import {
  buildFallbackStructuredSummary,
  safeParseStructuredSummary,
} from "@/lib/analysis/result";
import type {
  AIProvider,
  ChatWithVideoContextInput,
  GenerateVideoSummaryInput,
  StructuredVideoSummary,
} from "@/lib/analysis/types";
import { fetchWithTimeout, isRecord, trimText } from "@/lib/analysis/utils";

function resolveChatCompletionsUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  const trimmedPath = url.pathname.replace(/\/$/, "");

  if (
    trimmedPath === "" ||
    trimmedPath === "/" ||
    trimmedPath.endsWith("/v1") ||
    trimmedPath.endsWith("/v1/chat")
  ) {
    url.pathname = `${trimmedPath}/chat/completions`.replace("//", "/");
  }

  return url.toString();
}

function readTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (isRecord(item) && item.type === "text" && typeof item.text === "string") {
          return item.text;
        }

        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

function extractAssistantText(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return "";
  }

  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return "";
  }

  return readTextContent(firstChoice.message.content);
}

class MockAiProvider implements AIProvider {
  readonly kind = "mock" as const;

  async generateVideoSummary(
    input: GenerateVideoSummaryInput,
  ): Promise<StructuredVideoSummary> {
    return buildFallbackStructuredSummary(input);
  }

  async chatWithVideoContext(input: ChatWithVideoContextInput) {
    const lead = input.analysis.outline[0];
    const related = input.analysis.outline[1] ?? input.analysis.outline[0];
    const leadText = lead
      ? `${lead.time ? `${lead.time}: ` : ""}"${lead.text}"`
      : "";
    const relatedText = related
      ? related.time
        ? `${related.time} in the outline`
        : "a nearby section from the outline"
      : "";

    return trimText(
      `Based on the current transcript and summary, the clearest answer is: ${input.analysis.summary} ${
        lead ? `If you want a quick rewatch point, start with ${leadText}.` : ""
      } ${related ? `For extra context, review ${relatedText} as well.` : ""}`,
      320,
    );
  }
}

class HttpAiProvider implements AIProvider {
  readonly kind = "http" as const;

  private readonly endpoint: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    baseUrl: string,
    private readonly timeoutMs: number,
  ) {
    this.endpoint = resolveChatCompletionsUrl(baseUrl);
  }

  private async requestCompletion(
    messages: Array<{ role: string; content: string }>,
    jsonMode = false,
  ) {
    const response = await fetchWithTimeout(
      this.endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
          messages,
        }),
      },
      this.timeoutMs,
    );

    const rawBody = await response.text();
    let body: unknown = null;

    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      throw new ExternalServiceError("The AI service returned a response that could not be parsed.");
    }

    if (!response.ok) {
      const message =
        isRecord(body) &&
        isRecord(body.error) &&
        typeof body.error.message === "string"
          ? body.error.message
          : `The AI service returned status ${response.status}.`;

      throw new ExternalServiceError(message);
    }

    return extractAssistantText(body);
  }

  async generateVideoSummary(input: GenerateVideoSummaryInput) {
    const raw = await this.requestCompletion(
      [
        { role: "system", content: buildVideoSummarySystemPrompt() },
        { role: "user", content: buildVideoSummaryUserPrompt(input) },
      ],
      true,
    );

    return safeParseStructuredSummary(raw, input);
  }

  async chatWithVideoContext(input: ChatWithVideoContextInput) {
    const raw = await this.requestCompletion([
      { role: "system", content: buildChatSystemPrompt() },
      { role: "user", content: buildChatUserPrompt(input) },
    ]);

    return raw.trim() || "I could not produce a stable answer from the current context. Please try rephrasing the question.";
  }
}

export function createAiProvider(): AIProvider {
  const explicitProvider = (process.env.AI_PROVIDER ?? "").toLowerCase();
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 25000);

  if (explicitProvider === "mock") {
    return new MockAiProvider();
  }

  if (baseUrl && apiKey && model) {
    return new HttpAiProvider(apiKey, model, baseUrl, timeoutMs);
  }

  if (explicitProvider === "http") {
    throw new ExternalServiceError(
      "AI_PROVIDER=http requires AI_BASE_URL, AI_API_KEY, and AI_MODEL to be configured together.",
      true,
    );
  }

  return new MockAiProvider();
}
