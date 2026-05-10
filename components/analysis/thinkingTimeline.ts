export type ThinkingTimelinePhase = {
  id: string;
  label: string;
  status: "active" | "completed" | "failed";
  detail: string | null;
  source: "next" | "python";
  toolName?: string | null;
};

export type ThinkingTimelineState = {
  phases: ThinkingTimelinePhase[];
};

export function createThinkingTimelineState(): ThinkingTimelineState {
  return {
    phases: [],
  };
}

export function applyThinkingPhaseUpdate(
  state: ThinkingTimelineState,
  phase: ThinkingTimelinePhase,
): ThinkingTimelineState {
  const existingIndex = state.phases.findIndex((entry) => entry.id === phase.id);
  if (existingIndex === -1) {
    return {
      phases: [...state.phases, phase],
    };
  }

  const nextPhases = [...state.phases];
  nextPhases[existingIndex] = {
    ...nextPhases[existingIndex],
    ...phase,
  };

  return {
    phases: nextPhases,
  };
}

export function buildThinkingSummary(phases: ThinkingTimelinePhase[]) {
  const activePhase = [...phases].reverse().find((phase) => phase.status === "active");
  const failedPhase = [...phases].reverse().find((phase) => phase.status === "failed");
  const focusPhase = failedPhase ?? activePhase ?? phases.at(-1) ?? null;
  const completedCount = phases.filter((phase) => phase.status === "completed").length;

  return {
    title: "Thinking",
    detail:
      focusPhase?.detail ??
      "Reviewing transcript evidence and assembling the next reply.",
    completedCount,
    totalCount: phases.length,
    hasFailure: Boolean(failedPhase),
  };
}
