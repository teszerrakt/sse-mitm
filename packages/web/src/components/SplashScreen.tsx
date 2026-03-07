import type { FC } from "react";
import orthrusLogo from "../assets/orthrus.png";

interface SplashScreenProps {
  /** When true, the splash fades out (300ms) then calls onComplete */
  fadeOut: boolean;
  onComplete: () => void;
}

export const SplashScreen: FC<SplashScreenProps> = ({ fadeOut, onComplete }) => (
  <div
    className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-background transition-opacity duration-300 ${fadeOut ? "opacity-0" : "opacity-100"}`}
    onTransitionEnd={() => {
      if (fadeOut) onComplete();
    }}
  >
    {/* Logo with pulse glow */}
    <div className="relative mb-8">
      <div className="absolute inset-0 rounded-full bg-accent opacity-20 blur-2xl animate-[splash-glow_2s_ease-in-out_infinite]" />
      <img
        src={orthrusLogo}
        alt="Orthrus"
        className="relative w-24 h-24 rounded-2xl"
        draggable={false}
      />
    </div>

    {/* App name */}
    <h1
      className="text-xl font-semibold tracking-widest text-foreground mb-6 uppercase"
      style={{ fontFamily: '"Satyp", "SF Mono", monospace' }}
    >
      Orthrus
    </h1>

    {/* Spinner */}
    <div className="w-5 h-5 rounded-full border-2 border-border border-t-accent animate-spin mb-4" />

    {/* Status text */}
    <p className="text-xs text-muted-foreground">Starting backend…</p>
  </div>
);
