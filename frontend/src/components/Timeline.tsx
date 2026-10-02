import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import { KIND_META, STATUS_META, fmtDate, fmtHours, fmtTime } from '../lib/format'
import type { TripEvent, TripPlan } from '../types'

interface Props {
  plan: TripPlan
  selected: number | null
  onSelect: (i: number) => void
}

export default function Timeline({ plan, selected, onSelect }: Props) {
  const stopIndex = new Map(plan.stops.map((s, i) => [s.start + s.kind, i]))
  const dayNumber = new Map(plan.daily_logs.map((l) => [l.date, l.day_number]))
  const days: { date: string; events: TripEvent[] }[] = []
  for (const e of plan.events) {
    const date = e.start.slice(0, 10)
    if (days[days.length - 1]?.date !== date) days.push({ date, events: [] })
    days[days.length - 1].events.push(e)
  }

  return (
    <div className="space-y-5">
      {days.map((d) => (
        <div key={d.date}>
          <p className="sticky top-0 z-10 mb-2 bg-white/95 py-1 text-xs font-bold uppercase tracking-wide text-slate-500 backdrop-blur">
            Day {dayNumber.get(d.date)} · {fmtDate(d.date)}
          </p>
          <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-[9px] before:top-3 before:w-0.5 before:bg-slate-100">
            {d.events.map((e) => {
              const idx = stopIndex.get(e.start + e.kind)
              const clickable = idx !== undefined
              const color = e.kind === 'drive' ? STATUS_META.D.color : KIND_META[e.kind].color
              return (
                <li key={e.start + e.kind}>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && onSelect(idx)}
                    className={clsx(
                      'relative flex w-full items-start gap-3 rounded-xl py-2 pl-0 pr-2 text-left transition',
                      clickable && 'hover:bg-slate-50',
                      idx !== undefined && idx === selected && 'bg-slate-100',
                    )}
                  >
                    <span
                      className="relative z-[1] mt-1 h-5 w-5 shrink-0 rounded-full border-[3px] border-white shadow"
                      style={{ background: color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="text-sm font-semibold text-slate-800">
                          {e.kind === 'drive' ? `Drive ${Math.round(e.miles ?? 0)} mi` : KIND_META[e.kind].label}
                        </span>
                        <span className="text-xs tabular-nums text-slate-500">
                          {fmtTime(e.start)} – {fmtTime(e.end)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                        {e.location}
                        {e.kind === 'drive' && (
                          <>
                            <ArrowRight size={11} className="shrink-0" /> {e.to_location}
                          </>
                        )}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={clsx('rounded-md px-1.5 py-0.5 text-[10px] font-semibold', STATUS_META[e.status].bg)}>
                          {STATUS_META[e.status].short}
                        </span>
                        <span className="text-[11px] text-slate-500">{fmtHours(e.duration_hours)}</span>
                        {e.kind !== 'drive' && e.note !== KIND_META[e.kind].label && (
                          <span className="truncate text-[11px] text-slate-400">· {e.note}</span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </div>
  )
}
