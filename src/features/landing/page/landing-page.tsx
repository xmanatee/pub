import { Navigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { CodeSection } from "~/features/landing/sections/code-section";
import { CtaSection } from "~/features/landing/sections/cta-section";
import { FeaturesSection } from "~/features/landing/sections/features-section";
import { HeroSection } from "~/features/landing/sections/hero-section";
import { HowItWorksSection } from "~/features/landing/sections/how-it-works-section";
import { LogoBar } from "~/features/landing/sections/logo-bar";

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
    <div className="flex flex-col">
      <HeroSection />
      <LogoBar />
      <FeaturesSection />
      <HowItWorksSection />
      <CodeSection />
      <CtaSection />
    </div>
  );
}
