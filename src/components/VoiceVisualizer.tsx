"use client";

interface VoiceVisualizerProps {
  isActive: boolean;
  type?: "recording" | "playing";
}

export default function VoiceVisualizer({
  isActive,
  type = "recording",
}: VoiceVisualizerProps) {
  if (!isActive) return null;

  const color = type === "recording" ? "bg-red-500" : "bg-blue-500";

  return (
    <div className="flex items-center gap-1 h-6">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`w-1 ${color} rounded-full animate-pulse`}
          style={{
            height: `${12 + Math.random() * 16}px`,
            animationDelay: `${i * 0.1}s`,
            animationDuration: `${0.4 + Math.random() * 0.4}s`,
          }}
        />
      ))}
    </div>
  );
}
