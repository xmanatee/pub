import { Navigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { ControlBarProvider } from "~/components/control-bar/control-bar-controller";
import { FeaturesSection } from "~/features/landing/sections/features-section";
import { HeroSection } from "~/features/landing/sections/hero-section";
import { HowItWorksSection } from "~/features/landing/sections/how-it-works-section";
import { LogoBar } from "~/features/landing/sections/logo-bar";
import { LandingControlBar } from "../components/landing-control-bar";

export function LandingPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <ControlBarProvider>
      <div className="fade-edges-narrow flex flex-col pb-28">
        <LandingControlBar />
        <HeroSection />
        <LogoBar />
        <HowItWorksSection />
        <FeaturesSection />
      </div>
    </ControlBarProvider>
  );
}
