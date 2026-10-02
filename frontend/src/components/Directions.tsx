import clsx from 'clsx'
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  GitFork,
  LogOut,
  Merge,
  Navigation,
  RotateCw,
  Undo2,
} from 'lucide-react'
import { fmtHours } from '../lib/format'
import type { RouteStep, TripPlan } from '../types'

function StepIcon({ step }: { step: RouteStep }) {
  const p = { size: 15, strokeWidth: 2.4 }
  const m = step.modifier
  if (step.type === 'depart') return <Navigation {...p} />
  if (step.type === 'arrive') return <Flag {...p} />
  if (step.type === 'merge') return <Merge {...p} />
  if (step.type === 'fork') return <GitFork {...p} className="rotate-180" />
  if (step.type === 'off ramp') return <LogOut {...p} />
  if (step.type.includes('roundabout') || step.type === 'rotary') return <RotateCw {...p} />
  if (m.includes('uturn')) return <Undo2 {...p} />
  if (m === 'slight left') return <ArrowUpLeft {...p} />
  if (m === 'slight right') return <ArrowUpRight {...p} />
  if (m.includes('left')) return <CornerUpLeft {...p} />
  if (m.includes('right')) return <CornerUpRight {...p} />
  return <ArrowUp {...p} />
}

const dist = (mi: number) => (mi < 0.1 ? '< 0.1 mi' : mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi).toLocaleString()} mi`)

interface Props {
  plan: TripPlan
  focused: string | null
  onFocus: (key: string, step: RouteStep) => void
}

export default function Directions({ plan, focused, onFocus }: Props) {
  const legTitle = { current: plan.places.current.label, pickup: plan.places.pickup.label, dropoff: plan.places.dropoff.label }
  return (
    <div className="space-y-5">
      {plan.route.legs.map((leg, li) => (
        <div key={li}>
          <div className="sticky top-0 z-10 mb-1 bg-white/95 py-1.5 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Leg {li + 1} · {li === 0 ? 'To pickup' : 'To drop-off'}
            </p>
            <p className="truncate text-xs text-slate-400">
              {legTitle[leg.from as keyof typeof legTitle]} → {legTitle[leg.to as keyof typeof legTitle]} ·{' '}
              {Math.round(leg.miles).toLocaleString()} mi · {fmtHours(leg.drive_hours)} driving
            </p>
          </div>
          {leg.steps.length === 0 ? (
            <p className="py-2 text-sm text-slate-500">Already at this location — no driving needed.</p>
          ) : (
            <ol>
              {leg.steps.map((s, si) => {
                const key = `${li}-${si}`
                const highway = s.distance_mi >= 20
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => onFocus(key, s)}
                      className={clsx(
                        'flex w-full items-start gap-3 rounded-xl px-1.5 py-2 text-left transition hover:bg-slate-50',
                        focused === key && 'bg-slate-100',
                      )}
                    >
                      <span
                        className={clsx(
                          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                          s.type === 'arrive' ? 'bg-brand text-white' : highway ? 'bg-ink text-white' : 'bg-slate-100 text-slate-600',
                        )}
                      >
                        <StepIcon step={s} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={clsx('block text-sm leading-snug text-slate-800', highway && 'font-semibold')}>
                          {s.instruction}
                        </span>
                        {s.type !== 'arrive' && (
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {dist(s.distance_mi)}
                            {s.duration_min >= 1 && ` · ${fmtHours(s.duration_min / 60)}`}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      ))}
      <p className="px-1 text-[11px] leading-relaxed text-slate-400">
        Directions from OSRM (OpenStreetMap). Verify truck restrictions (height, weight, hazmat) before driving.
      </p>
    </div>
  )
}
