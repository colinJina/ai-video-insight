export type VideoProvider =
  | "direct"
  | "local"
  | "youtube"
  | "vimeo"
  | "bilibili"
  | "generic";

export type VideoInputKind = "url" | "upload";

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
export type EmbeddingProviderKind = "disabled" | "http";

export interface VideoSource {
  originalUrl: string;
  normalizedUrl: string;
  host: string;
  provider: VideoProvider;
  inputKind: VideoInputKind;
  title: string;
  description: string | null;
  posterUrl: string | null;
  playableUrl: string | null;
  durationSeconds: number | null;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  mimeType?: string | null;
  localFilePath?: string | null;
}

export interface TranscriptSegment {
  startSeconds: number | null;
  endSeconds: number | null;
  text: string;
}

export interface TranscriptData {
  source: TranscriptSourceKind;
  language: string;
  fullText: string;
  segments: TranscriptSegment[];
}

export interface TranscriptChunk {
  chunkIndex: number;
  text: string;
  startSeconds: number | null;
  endSeconds: number | null;
}

export interface TranscriptChunkMatch extends TranscriptChunk {
  id: string;
  userId: string;
  analysisId: string;
  score: number;
}

export interface OutlineItem {
  time: string | null;
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

export interface AnalysisChatContextPayload {
  userId: string;
  analysisId: string;
  analysisSummary: string | null;
  transcriptExcerpt: string | null;
  storedConversationSummary: string | null;
  outline: OutlineItem[];
  keyPoints: string[];
  recentMessages: AnalysisChatMessage[];
  memoryItems: {
    kind: string;
    content: string;
    source?: string | null;
    metadata?: Record<string, unknown>;
  }[];
  storedMemoryItems: {
    kind: string;
    content: string;
    source?: string | null;
    metadata?: Record<string, unknown>;
  }[];
}

export interface AnalysisChatMemorySnapshot {
  kind: string;
  content: string;
  source?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AnalysisStoredMemoryItem extends AnalysisChatMemorySnapshot {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisChatState {
  conversationSummary: string | null;
  memoryItems: AnalysisStoredMemoryItem[];
}

export interface AnalysisChatCitation {
  chunkIndex: number;
  text: string;
  score: number;
  startSeconds: number | null;
  endSeconds: number | null;
}

export interface AnalysisChatRetrievalDebug {
  rewrittenQuery: string;
  candidateCount: number;
  selectedCount: number;
  fallbackUsed: boolean;
}

export interface AnalysisChatRuntimeState {
  memoryHits: string[];
  conversationSummary: string | null;
  memoryItems: AnalysisChatMemorySnapshot[];
  citations: AnalysisChatCitation[];
  retrievalDebug: AnalysisChatRetrievalDebug;
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
  chatState: AnalysisChatState;
}

export interface AnalysisTask {
  id: string;
  userId: string;
  status: AnalysisTaskStatus;
  video: VideoSource;
  transcript: TranscriptData | null;
  transcriptSource: TranscriptSourceKind | null;
  result: AnalysisResult | null;
  chatMessages: AnalysisChatMessage[];
  errorMessage: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AnalysisPublicTask = Omit<AnalysisTask, "transcript"> & {
  chatRuntime?: AnalysisChatRuntimeState;
};

export interface AnalysisListInput {
  userId: string;
  archived?: boolean;
  query?: string;
  limit?: number;
}

export interface CreateAnalysisInput {
  videoUrl?: string;
  uploadedVideo?:
    | {
        fileName: string;
        mimeType: string;
        fileSizeBytes: number;
        buffer: ArrayBuffer;
      }
    | undefined;
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

export interface EmbeddingProvider {
  kind: EmbeddingProviderKind;
  isConfigured(): boolean;
  embedText(input: string): Promise<number[]>;
}

export interface TranscriptProvider {
  kind: TranscriptSourceKind;
  getTranscript(input: { video: VideoSource }): Promise<TranscriptData>;
}
