import type { AppThemePreference, NotificationType } from "@/lib/app/types";
import type {
  AnalysisChatMessage,
  AnalysisResult,
  AnalysisTaskStatus,
  TranscriptData,
  TranscriptSourceKind,
  VideoSource,
} from "@/lib/analysis/types";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TranscriptChunkRow = {
  id: string;
  analysis_id: string;
  user_id: string;
  chunk_index: number;
  text: string;
  start_seconds: number | null;
  end_seconds: number | null;
  embedding: number[];
  created_at: string;
};

export interface Database {
  public: {
    Tables: {
      analysis_records: {
        Row: {
          id: string;
          user_id: string;
          status: AnalysisTaskStatus;
          video: VideoSource;
          transcript: TranscriptData | null;
          transcript_source: TranscriptSourceKind | null;
          result: AnalysisResult | null;
          chat_messages: AnalysisChatMessage[];
          error_message: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          status: AnalysisTaskStatus;
          video: VideoSource;
          transcript?: TranscriptData | null;
          transcript_source?: TranscriptSourceKind | null;
          result?: AnalysisResult | null;
          chat_messages?: AnalysisChatMessage[];
          error_message?: string | null;
          archived_at?: string | null;
          created_at: string;
          updated_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["analysis_records"]["Row"]>;
        Relationships: [];
      };
      analysis_transcript_chunks: {
        Row: TranscriptChunkRow;
        Insert: {
          id?: string;
          analysis_id: string;
          user_id: string;
          chunk_index: number;
          text: string;
          start_seconds?: number | null;
          end_seconds?: number | null;
          embedding: number[];
          created_at?: string;
        };
        Update: Partial<TranscriptChunkRow>;
        Relationships: [];
      };
      user_notifications: {
        Row: {
          id: string;
          user_id: string;
          type: NotificationType;
          title: string;
          body: string;
          related_analysis_id: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: NotificationType;
          title: string;
          body: string;
          related_analysis_id?: string | null;
          read_at?: string | null;
          created_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_notifications"]["Row"]>;
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          nickname: string | null;
          avatar_url: string | null;
          notifications_enabled: boolean;
          theme_preference: AppThemePreference;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          nickname?: string | null;
          avatar_url?: string | null;
          notifications_enabled?: boolean;
          theme_preference?: AppThemePreference;
          updated_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_settings"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_analysis_transcript_chunks: {
        Args: {
          filter_analysis_id: string;
          filter_user_id: string;
          query_embedding: number[];
          match_count?: number;
          filter_start_seconds?: number | null;
          filter_end_seconds?: number | null;
        };
        Returns: Array<{
          id: string;
          analysis_id: string;
          user_id: string;
          chunk_index: number;
          text: string;
          start_seconds: number | null;
          end_seconds: number | null;
          score: number;
        }>;
      };
      search_analysis_transcript_chunks: {
        Args: {
          filter_analysis_id: string;
          filter_user_id: string;
          query_text: string;
          match_count?: number;
          filter_start_seconds?: number | null;
          filter_end_seconds?: number | null;
        };
        Returns: Array<{
          id: string;
          analysis_id: string;
          user_id: string;
          chunk_index: number;
          text: string;
          start_seconds: number | null;
          end_seconds: number | null;
          score: number;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
