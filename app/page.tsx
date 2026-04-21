import { redirect } from "next/navigation";

import LandingFooter from "@/components/home/LandingFooter";
import HeroSection from "@/components/home/HeroSection";
import LandingNavbar from "@/components/home/LandingNavbar";
import OverviewSection from "@/components/home/OverviewSection";
import { getOptionalAppSession } from "@/lib/auth/session";

export default async function Home() {
  const session = await getOptionalAppSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="page-shell">
      <LandingNavbar />
      <main className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[620px] w-[820px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
        <div className="pointer-events-none absolute bottom-[20%] right-0 h-[420px] w-[420px] rounded-full bg-secondary/5 blur-[100px]" />
        <HeroSection />
        <OverviewSection />
        <LandingFooter />
      </main>
    </div>
  );
}
