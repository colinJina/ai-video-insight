export type VideoProvider =
  | "direct"
  | "youtube"
  | "vimeo"
  | "bilibili"
  | "generic";

export type AnalysisTaskStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type AnalysisViewStatus =
  | "idle"
  | "submitting"
  | "processing"
  | "success"
  | "error";

export type TranscriptSourceKind = "mock" | "remote";
export type AiProviderKind = "mock" | "http";

export interface VideoSource {
  originalUrl: string;
  normalizedUrl: string;
  host: string;
  provider: VideoProvider;
  title: string;
  description: string | null;
  posterUrl: string | null;
  playableUrl: string | null;
}

export interface TranscriptSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface TranscriptData {
  source: TranscriptSourceKind;
  language: string;
  fullText: string;
  segments: TranscriptSegment[];
}

export interface OutlineItem {
  time: string;
  text: string;
}

export interface AnalysisChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string;
}

export interface AnalysisChatContext {
  intro: string;
  suggestedQuestions: string[];
}

export interface StructuredVideoSummary {
  title: string;
  summary: string;
  outline: OutlineItem[];
  keyPoints: string[];
  suggestedQuestions: string[];
}

export interface AnalysisResult extends StructuredVideoSummary {
  chatContext: AnalysisChatContext;
}

export interface AnalysisTask {
  id: string;
  status: AnalysisTaskStatus;
  video: VideoSource;
  transcript: TranscriptData | null;
  transcriptSource: TranscriptSourceKind | null;
  result: AnalysisResult | null;
  chatMessages: AnalysisChatMessage[];
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AnalysisPublicTask = Omit<AnalysisTask, "transcript">;

export interface CreateAnalysisInput {
  videoUrl: string;
}

export interface ChatInput {
  message: string;
}

export interface GenerateVideoSummaryInput {
  video: VideoSource;
  transcript: TranscriptData;
}

export interface ChatWithVideoContextInput {
  video: VideoSource;
  transcript: TranscriptData;
  analysis: AnalysisResult;
  messages: AnalysisChatMessage[];
  question: string;
}

export interface AIProvider {
  kind: AiProviderKind;
  generateVideoSummary(
    input: GenerateVideoSummaryInput,
  ): Promise<StructuredVideoSummary>;
  chatWithVideoContext(input: ChatWithVideoContextInput): Promise<string>;
}

export interface TranscriptProvider {
  kind: TranscriptSourceKind;
  getTranscript(input: { video: VideoSource }): Promise<TranscriptData>;
}
