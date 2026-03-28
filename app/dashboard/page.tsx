import AiPanel from "@/components/AiPanel";
import Navbar from "@/components/Navbar";
import VideoSection from "@/components/VideoSection";

export default function DashboardPage() {
  return (
    <div className="page-shell">
      <Navbar />
      <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-8 px-4 pb-24 pt-24 sm:px-6 lg:flex-row lg:px-8 lg:pb-12">
        <div className="w-full lg:w-[62%]">
          <VideoSection />
        </div>
        <div className="w-full lg:w-[38%]">
          <AiPanel />
        </div>
      </main>
    </div>
  );
}
