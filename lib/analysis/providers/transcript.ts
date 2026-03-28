import { ExternalServiceError } from "@/lib/analysis/errors";
import type {
  TranscriptData,
  TranscriptProvider,
  VideoSource,
} from "@/lib/analysis/types";
import { sleep, trimText } from "@/lib/analysis/utils";

function buildMockTranscriptSegments(video: VideoSource) {
  const title = trimText(video.title, 40);

  return [
    {
      startSeconds: 0,
      endSeconds: 72,
      text: `开场先交代了《${title}》的主题背景，说明这段内容为什么值得看，以及观众最应该关注的核心问题。`,
    },
    {
      startSeconds: 72,
      endSeconds: 168,
      text: "随后视频把问题拆成几个层次，先讲现状和常见误区，再解释为什么传统做法在效率、协同和反馈速度上会遇到瓶颈。",
    },
    {
      startSeconds: 168,
      endSeconds: 284,
      text: "中段给出了更系统的方法论，包括如何定义目标、如何组织数据，以及如何用更清晰的流程把输入转成可执行的输出。",
    },
    {
      startSeconds: 284,
      endSeconds: 396,
      text: "接着通过案例或场景推演，展示方案落地后的变化，并强调哪些指标最能帮助团队判断这套方法是否真正有效。",
    },
    {
      startSeconds: 396,
      endSeconds: 510,
      text: "结尾部分回到决策层视角，提醒观众在推进这件事时既要关注效率，也要关注风险、边界和后续迭代空间。",
    },
  ];
}

class MockTranscriptProvider implements TranscriptProvider {
  readonly kind = "mock" as const;

  async getTranscript({ video }: { video: VideoSource }): Promise<TranscriptData> {
    const delayMs = Number(process.env.ANALYSIS_MOCK_DELAY_MS ?? 1200);
    if (Number.isFinite(delayMs) && delayMs > 0) {
      await sleep(delayMs);
    }

    const segments = buildMockTranscriptSegments(video);

    return {
      source: "mock",
      language: "zh-CN",
      fullText: segments.map((segment) => segment.text).join(" "),
      segments,
    };
  }
}

export function createTranscriptProvider(): TranscriptProvider {
  const provider = (process.env.TRANSCRIPT_PROVIDER ?? "mock").toLowerCase();

  if (provider === "mock") {
    return new MockTranscriptProvider();
  }

  throw new ExternalServiceError(
    `暂未实现的 transcript provider: ${provider}`,
    true,
  );
}
