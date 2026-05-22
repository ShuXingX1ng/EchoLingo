"use client";

interface VoiceVisualizerProps {
  isActive: boolean;
  type?: "recording" | "playing";
}

const BARS = [
  { height: 14, delay: 0, duration: 0.55 },
  { height: 24, delay: 0.1, duration: 0.7 },
  { height: 18, delay: 0.2, duration: 0.5 },
  { height: 28, delay: 0.3, duration: 0.8 },
  { height: 16, delay: 0.4, duration: 0.6 },
];

export default function VoiceVisualizer({
  isActive,
  type = "recording",
}: VoiceVisualizerProps) {
  if (!isActive) return null;

  const color = type === "recording" ? "bg-red-500" : "bg-blue-500";

  return (
    <div className="flex items-center gap-1 h-6">
      {BARS.map((bar, i) => (
        <div
          key={i}
          className={`w-1 ${color} rounded-full animate-pulse`}
          style={{
            height: `${bar.height}px`,
            animationDelay: `${bar.delay}s`,
            animationDuration: `${bar.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
