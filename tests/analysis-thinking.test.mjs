import test from "node:test";
import assert from "node:assert/strict";

import {
  applyThinkingPhaseUpdate,
  buildThinkingSummary,
  describeThinkingPhaseMotion,
  createThinkingTimelineState,
} from "../components/analysis/thinkingTimeline.ts";

test("applyThinkingPhaseUpdate appends new phases and updates existing ones in place", () => {
  let state = createThinkingTimelineState();

  state = applyThinkingPhaseUpdate(state, {
    id: "next-load-analysis",
    label: "Loading analysis state",
    status: "active",
    detail: "Loading the completed analysis record.",
    source: "next",
    toolName: null,
  });
  state = applyThinkingPhaseUpdate(state, {
    id: "next-load-analysis",
    label: "Loading analysis state",
    status: "completed",
    detail: "Loaded the analysis and validated chat readiness.",
    source: "next",
    toolName: null,
  });
  state = applyThinkingPhaseUpdate(state, {
    id: "python-generate-answer",
    label: "Generating answer",
    status: "active",
    detail: "Drafting the reply from the assembled context.",
    source: "python",
    toolName: null,
  });

  assert.equal(state.phases.length, 2);
  assert.equal(state.phases[0].status, "completed");
  assert.equal(state.phases[1].id, "python-generate-answer");
});

test("buildThinkingSummary prefers the active phase detail and reports completion counts", () => {
  const summary = buildThinkingSummary([
    {
      id: "next-load-analysis",
      label: "Loading analysis state",
      status: "completed",
      detail: "Loaded the analysis and validated chat readiness.",
      source: "next",
      toolName: null,
    },
    {
      id: "python-generate-answer",
      label: "Generating answer",
      status: "active",
      detail: "Drafting the reply from the assembled context.",
      source: "python",
      toolName: null,
    },
  ]);

  assert.equal(summary.title, "Thinking");
  assert.match(summary.detail, /Drafting the reply/);
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.totalCount, 2);
});

test("describeThinkingPhaseMotion flags active phases for pulse motion and staggered entry", () => {
  const motion = describeThinkingPhaseMotion(
    {
      id: "python-generate-answer",
      label: "Generating answer",
      status: "active",
      detail: "Drafting the reply from the assembled context.",
      source: "python",
      toolName: null,
    },
    2,
  );

  assert.equal(motion.delayMs, 120);
  assert.equal(motion.shouldPulse, true);
  assert.equal(motion.shouldSheen, true);
  assert.equal(motion.statusClassName, "is-active");
});
