import { Bus } from "lucide-react";
import { useEffect, useState } from "react";

export function LoadingScreen({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (!visible) {
      const t = setTimeout(() => setMounted(false), 700);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background transition-opacity duration-700 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      aria-hidden={!visible}
    >
      {/* Subtle radial glow backdrop */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, color-mix(in oklab, var(--primary) 12%, transparent) 0%, transparent 60%)",
        }}
      />

      {/* Bus + road */}
      <div className="relative flex flex-col items-center">
        <div className="relative h-32 w-72 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="splash-bus relative">
              <Bus
                className="h-24 w-24 text-primary drop-shadow-[0_0_30px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                strokeWidth={1.5}
              />
            </div>
          </div>
          {/* Road */}
          <div className="absolute bottom-2 left-0 right-0 h-px bg-border/60" />
          <div className="splash-road absolute bottom-1.5 left-0 right-0 h-[2px]" />
        </div>

        {/* Title */}
        <div className="mt-10 overflow-hidden">
          <h1 className="splash-title text-3xl md:text-4xl font-semibold tracking-wide text-primary">
            B &amp; B Transportation
          </h1>
        </div>
        <div className="splash-tagline mt-3 text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
          Registration Hub
        </div>
      </div>

      <style>{`
        @keyframes splash-bus-bob {
          0%, 100% { transform: translateY(0) translateX(0); }
          25%      { transform: translateY(-2px) translateX(1px); }
          50%      { transform: translateY(0) translateX(0); }
          75%      { transform: translateY(-1px) translateX(-1px); }
        }
        @keyframes splash-road-dash {
          from { background-position: 0 0; }
          to   { background-position: -40px 0; }
        }
        @keyframes splash-title-rise {
          from { transform: translateY(110%); opacity: 0; filter: blur(6px); }
          to   { transform: translateY(0);    opacity: 1; filter: blur(0); }
        }
        @keyframes splash-title-glow {
          0%, 100% { text-shadow: 0 0 18px color-mix(in oklab, var(--primary) 35%, transparent),
                                  0 0 2px  color-mix(in oklab, var(--primary) 60%, transparent); }
          50%      { text-shadow: 0 0 32px color-mix(in oklab, var(--primary) 60%, transparent),
                                  0 0 4px  color-mix(in oklab, var(--primary) 80%, transparent); }
        }
        @keyframes splash-fade-up {
          from { transform: translateY(8px); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
        .splash-bus { animation: splash-bus-bob 1.4s ease-in-out infinite; }
        .splash-road {
          background-image: linear-gradient(to right, color-mix(in oklab, var(--primary) 70%, transparent) 50%, transparent 50%);
          background-size: 20px 2px;
          background-repeat: repeat-x;
          animation: splash-road-dash 0.6s linear infinite;
        }
        .splash-title {
          animation: splash-title-rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both,
                     splash-title-glow 2.4s ease-in-out 0.9s infinite;
        }
        .splash-tagline {
          animation: splash-fade-up 0.8s ease-out 0.6s both;
        }
      `}</style>
    </div>
  );
}
