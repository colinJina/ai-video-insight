import type { AppThemePreference, NotificationType } from "@/lib/app/types";
import type {
  AnalysisCheckpointStatus,
  AnalysisJobStage,
  AnalysisJobStatus,
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
      analysis_jobs: {
        Row: {
          analysis_id: string;
          user_id: string;
          status: AnalysisJobStatus;
          stage: AnalysisJobStage;
          attempt_count: number;
          max_attempts: number;
          next_run_at: string;
          lease_owner: string | null;
          lease_expires_at: string | null;
          last_heartbeat_at: string | null;
          last_error: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          analysis_id: string;
          user_id: string;
          status?: AnalysisJobStatus;
          stage?: AnalysisJobStage;
          attempt_count?: number;
          max_attempts?: number;
          next_run_at?: string;
          lease_owner?: string | null;
          lease_expires_at?: string | null;
          last_heartbeat_at?: string | null;
          last_error?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["analysis_jobs"]["Row"]>;
        Relationships: [];
      };
      agent_checkpoints: {
        Row: {
          id: string;
          analysis_id: string;
          user_id: string;
          stage: AnalysisJobStage;
          attempt: number;
          status: AnalysisCheckpointStatus;
          payload: Json | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          analysis_id: string;
          user_id: string;
          stage: AnalysisJobStage;
          attempt: number;
          status: AnalysisCheckpointStatus;
          payload?: Json | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["agent_checkpoints"]["Row"]>;
        Relationships: [];
      };
      memory_store: {
        Row: {
          id: string;
          analysis_id: string;
          user_id: string;
          memory_key: string;
          kind: string;
          content: string;
          source: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          analysis_id: string;
          user_id: string;
          memory_key: string;
          kind: string;
          content: string;
          source?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["memory_store"]["Row"]>;
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
      claim_analysis_job: {
        Args: {
          claim_analysis_id: string;
          claim_worker_id: string;
          claim_lease_seconds?: number;
        };
        Returns: Database["public"]["Tables"]["analysis_jobs"]["Row"][];
      };
      heartbeat_analysis_job: {
        Args: {
          claim_analysis_id: string;
          claim_worker_id: string;
          claim_lease_seconds?: number;
        };
        Returns: Database["public"]["Tables"]["analysis_jobs"]["Row"][];
      };
      advance_analysis_job_stage: {
        Args: {
          claim_analysis_id: string;
          claim_worker_id: string;
          next_stage: string;
        };
        Returns: Database["public"]["Tables"]["analysis_jobs"]["Row"][];
      };
      complete_analysis_job: {
        Args: {
          claim_analysis_id: string;
          claim_worker_id: string;
        };
        Returns: Database["public"]["Tables"]["analysis_jobs"]["Row"][];
      };
      fail_analysis_job: {
        Args: {
          claim_analysis_id: string;
          claim_worker_id: string;
          failure_stage: string;
          failure_error: string;
          retry_delay_seconds?: number;
        };
        Returns: Database["public"]["Tables"]["analysis_jobs"]["Row"][];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
