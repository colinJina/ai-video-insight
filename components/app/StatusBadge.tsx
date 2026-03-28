import type { AnalysisTaskStatus } from "@/lib/analysis/types";

const STATUS_STYLES: Record<AnalysisTaskStatus, string> = {
  queued:
    "border-[color:rgba(255,182,136,0.28)] bg-[color:rgba(255,182,136,0.08)] text-primary",
  processing:
    "border-[color:rgba(255,127,0,0.28)] bg-[color:rgba(255,127,0,0.08)] text-[color:var(--primary-strong)]",
  completed:
    "border-[color:rgba(109,202,144,0.28)] bg-[color:rgba(80,160,110,0.12)] text-[color:#9ee6b7]",
  failed:
    "border-[color:rgba(255,120,120,0.28)] bg-[color:rgba(120,20,20,0.18)] text-[color:#ffb7b7]",
};

const STATUS_LABELS: Record<AnalysisTaskStatus, string> = {
  queued: "排队中",
  processing: "分析中",
  completed: "已完成",
  failed: "失败",
};

export default function StatusBadge({ status }: { status: AnalysisTaskStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 font-headline text-[10px] font-bold uppercase tracking-[0.22em] ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
