export default function CountdownRing({
  seconds,
  total,
  size = 72,
}: {
  seconds: number
  total: number
  size?: number
}) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = circ * (seconds / total)
  const urgent = seconds <= 10
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6}
          className="stroke-slate-200 dark:stroke-slate-700" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          className={urgent ? "stroke-red-500" : "stroke-emerald-500"}
          style={{ transition: "stroke-dasharray 0.9s linear" }}
        />
      </svg>
      <span className={`absolute text-xl font-bold tabular-nums ${urgent ? "text-red-600 dark:text-red-400" : "text-[var(--foreground)]"}`}>
        {seconds}
      </span>
    </div>
  )
}
