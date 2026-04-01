import RevealOnView from "./RevealOnView";

const steps = [
  {
    icon: "link",
    title: "1. Paste a video URL",
    description:
      "Use YouTube, Bilibili, TikTok, screen recordings, or hosted files. The system detects structure and starts the analysis flow automatically.",
  },
  {
    icon: "neurology",
    title: "2. Wait for the AI model",
    description:
      "Speech, captions, visual segments, and semantic cues are processed in parallel to generate a summary, labels, timeline, and follow-up context.",
  },
  {
    icon: "insights",
    title: "3. Enter the knowledge workspace",
    description:
      "Summary, questions, outline, and key moments resolve into one place so you can browse, revisit, and continue the conversation immediately after sign-in.",
  },
];

const features = [
  {
    title: "Structured Summary",
    icon: "auto_awesome_motion",
    accent: "text-primary",
    description:
      "Multimodal analysis turns long videos into a structured summary you can read in a few screens instead of scrubbing through the full recording.",
    wide: true,
  },
  {
    title: "Conversational Retrieval",
    icon: "forum",
    accent: "text-secondary",
    description:
      "Ask follow-up questions as if you were talking to the content itself and quickly locate people, opinions, pivots, and key moments.",
    wide: false,
  },
  {
    title: "Timeline Outline",
    icon: "list_alt",
    accent: "text-primary",
    description:
      "Important content nodes are marked automatically so one click can take you back to the relevant point without manual scrubbing.",
    wide: false,
  },
];

export default function OverviewSection() {
  return (
    <>
      <RevealOnView
        as="section"
        id="overview"
        className="mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8"
      >
        <div className="mb-16 text-center">
          <h2 className="font-headline text-4xl font-bold tracking-[-0.04em] text-white">
            Three steps from video to insight
          </h2>
          <div className="mx-auto mt-5 h-1 w-24 rounded-full bg-primary/60" />
        </div>

        <div className="grid gap-10 md:grid-cols-3 md:gap-12">
          {steps.map((step, index) => (
            <RevealOnView key={step.title} className="relative text-center" delay={index * 0.12}>
              <div className="obsidian-shadow glass-card relative mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full transition-transform duration-300 hover:scale-110">
                <span className="material-symbols-outlined text-4xl text-primary">
                  {step.icon}
                </span>
              </div>
              <h3 className="font-headline text-xl font-bold text-white">{step.title}</h3>
              <p className="mt-4 leading-7 text-(--text-muted)">{step.description}</p>
              {index < steps.length - 1 ? (
                <div className="absolute -right-8 top-12 hidden h-px w-16 bg-[rgba(88,66,53,0.35)] md:block" />
              ) : null}
            </RevealOnView>
          ))}
        </div>
      </RevealOnView>

      <RevealOnView as="section" className="bg-surface-container-low/50 py-28" delay={0.1}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <h2 className="font-headline text-4xl font-bold tracking-[-0.05em] text-white md:text-5xl">
                A single visual system from landing page to signed-in workspace
              </h2>
              <p className="mt-6 text-lg leading-8 text-(--text-muted)">
                The homepage explains the capability. The signed-in workspace delivers the usable knowledge. We keep the same amber obsidian language across both so the first impression and the working experience feel continuous.
              </p>
            </div>
            <div className="pb-2">
              <span className="border-b-2 border-primary pb-2 font-headline text-sm font-bold uppercase tracking-[0.24em] text-primary">
                Core Capabilities
              </span>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {features.map((feature) => (
              <RevealOnView
                key={feature.title}
                className={
                  feature.wide
                    ? "glass-card obsidian-shadow rounded-[1.6rem] p-8 transition-colors hover:bg-surface-container-highest/60 md:col-span-2"
                    : "glass-card obsidian-shadow rounded-[1.6rem] p-8 transition-colors hover:bg-surface-container-highest/60"
                }
                delay={feature.wide ? 0.06 : 0.14}
              >
                <span className={`material-symbols-outlined mb-6 text-3xl ${feature.accent}`}>
                  {feature.icon}
                </span>
                <h3 className="font-headline text-2xl font-bold text-white">{feature.title}</h3>
                <p className="mt-4 leading-7 text-(--text-muted)">{feature.description}</p>

                {feature.wide ? (
                  <div className="mt-8 rounded-2xl border border-[rgba(88,66,53,0.14)] bg-surface-container-low p-4">
                    <div className="space-y-3">
                      <div className="h-3 w-full rounded bg-primary/20" />
                      <div className="h-3 w-4/5 rounded bg-white/8" />
                      <div className="h-3 w-full rounded bg-white/8" />
                      <div className="h-3 w-3/4 rounded bg-white/8" />
                    </div>
                  </div>
                ) : null}
              </RevealOnView>
            ))}

            <RevealOnView
              className="glass-card obsidian-shadow relative overflow-hidden rounded-[1.6rem] p-8 transition-colors hover:bg-surface-container-highest/60 md:col-span-2"
              delay={0.2}
            >
              <div className="relative z-10 grid gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-center">
                <div>
                  <span className="material-symbols-outlined mb-6 text-3xl text-primary">
                    devices
                  </span>
                  <h3 className="font-headline text-2xl font-bold text-white">Multi-Source Input</h3>
                  <p className="mt-4 leading-7 text-(--text-muted)">
                    Bring in YouTube, Bilibili, TikTok, Zoom recordings, and local assets through one consistent knowledge entry point.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 opacity-30 grayscale">
                  <div className="aspect-square rounded-lg bg-secondary" />
                  <div className="aspect-square rounded-lg bg-primary" />
                  <div className="aspect-square rounded-lg bg-surface-container-highest" />
                  <div className="aspect-square rounded-lg bg-[rgba(88,66,53,0.9)]" />
                </div>
              </div>
              <div className="absolute inset-y-0 right-0 w-1/3 bg-primary/5 blur-3xl" />
            </RevealOnView>
          </div>
        </div>
      </RevealOnView>
    </>
  );
}
