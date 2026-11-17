import { Flame } from 'lucide-react'

export function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

export function ProgressRing({ value, size = 88, label }: { value: number; size?: number; label?: string }) {
  const stroke = size < 70 ? 6 : 9
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, value))
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(pct * 100)}% mastered`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--good)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.23, 1, 0.32, 1)' }}
        />
      </svg>
      <span className={`absolute font-bold tabular-nums ${size < 70 ? 'text-sm' : 'text-lg'}`}>{Math.round(pct * 100)}%</span>
    </div>
  )
}

export function StreakBadge({ streak }: { streak: number }) {
  if (streak < 2) return <span className="text-sm text-muted">Streak 0</span>
  return (
    <span className="animate-pop inline-flex items-center gap-1 rounded-full bg-warn-soft px-3 py-1 text-sm font-bold" aria-label={`Answer streak ${streak}`}>
      <Flame className="animate-flame size-4 text-bad" aria-hidden strokeWidth={2.4} /> {streak} streak
    </span>
  )
}
