import { FeaturesSection } from "~/features/landing/sections/features-section";
import { HeroSection } from "~/features/landing/sections/hero-section";
import { HowItWorksSection } from "~/features/landing/sections/how-it-works-section";
import { LogoBar } from "~/features/landing/sections/logo-bar";
import { LandingControlBar } from "../components/landing-control-bar";

export function LandingPage() {
  return (
    <div className="flex flex-col">
      <LandingControlBar />
      <HeroSection />
      <LogoBar />
      <HowItWorksSection />
      <FeaturesSection />
    </div>
  );
}
