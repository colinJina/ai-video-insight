import type {
  ChatWithVideoContextInput,
  GenerateVideoSummaryInput,
} from "@/lib/analysis/types";
import { buildTranscriptExcerpt } from "@/lib/analysis/utils";

export function buildVideoSummarySystemPrompt() {
  return [
    "你是一名视频内容分析助手。",
    "请严格基于提供的 transcript 输出结构化分析结果。",
    "你必须只返回一个合法 JSON 对象，不要输出 Markdown、代码块或额外说明。",
    'JSON 结构必须为：{"title":"string","summary":"string","outline":[{"time":"MM:SS","text":"string"}],"keyPoints":["string"],"suggestedQuestions":["string"]}',
    "要求：",
    "1. summary 使用简体中文，长度控制在 120 到 220 字。",
    "2. outline 至少 3 条，time 必须是 MM:SS。",
    "3. keyPoints 输出 3 到 5 条最重要观点。",
    "4. suggestedQuestions 输出 3 到 5 条适合继续追问的问题。",
  ].join("\n");
}

export function buildVideoSummaryUserPrompt(input: GenerateVideoSummaryInput) {
  return JSON.stringify(
    {
      video: {
        title: input.video.title,
        sourceUrl: input.video.normalizedUrl,
        host: input.video.host,
        provider: input.video.provider,
      },
      transcript: {
        language: input.transcript.language,
        segments: input.transcript.segments.map((segment) => ({
          time: `${segment.startSeconds}s`,
          text: segment.text,
        })),
        fullText: input.transcript.fullText,
      },
    },
    null,
    2,
  );
}

export function buildChatSystemPrompt() {
  return [
    "你是一名视频问答助手。",
    "请只根据提供的视频摘要、时间大纲、关键观点和 transcript 回答用户问题。",
    "如果上下文不足以支撑确定性回答，请明确说明信息不足，不要编造。",
    "默认使用简体中文回答。",
    "当问题与某个片段有关时，尽量引用对应的时间点。",
    "回答尽量简洁、具体、可执行。",
  ].join("\n");
}

export function buildChatUserPrompt(input: ChatWithVideoContextInput) {
  return JSON.stringify(
    {
      question: input.question,
      video: {
        title: input.video.title,
        sourceUrl: input.video.normalizedUrl,
      },
      analysis: {
        summary: input.analysis.summary,
        outline: input.analysis.outline,
        keyPoints: input.analysis.keyPoints,
      },
      transcriptExcerpt: buildTranscriptExcerpt(input.transcript.segments, 2400),
      recentMessages: input.messages.slice(-6).map((message) => ({
        role: message.role,
        content: message.content,
      })),
    },
    null,
    2,
  );
}
