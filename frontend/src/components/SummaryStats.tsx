import { CalendarDays, Clock, Gauge, Route, ShieldCheck, Timer } from 'lucide-react'
import { KIND_META, fmtDate, fmtHours, fmtMiles, fmtTime } from '../lib/format'
import type { EventKind, TripPlan } from '../types'

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="card flex items-start gap-3 p-4 xl:p-3.5">
      <span className="flex h-9 w-9 xl:hidden 2xl:flex shrink-0 items-center justify-center rounded-xl bg-ink/5 text-ink-700">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 whitespace-nowrap text-lg font-bold text-ink">{value}</p>
        {sub && <p className="text-xs leading-snug text-slate-500">{sub}</p>}
      </div>
    </div>
  )
}

const STOP_ORDER: EventKind[] = ['fuel', 'break', 'rest', 'restart']

export default function SummaryStats({ plan }: { plan: TripPlan }) {
  const s = plan.summary
  const counts = s.stop_counts
  return (
    <section aria-label="Trip summary" className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Stat icon={<Route size={18} />} label="Distance" value={fmtMiles(s.total_miles)} sub={`${fmtMiles(plan.route.legs[0].miles)} to pickup`} />
        <Stat icon={<Gauge size={18} />} label="Driving" value={fmtHours(s.driving_hours)} sub={`${fmtHours(s.on_duty_hours)} on duty`} />
        <Stat icon={<Timer size={18} />} label="Trip time" value={fmtHours(s.trip_hours)} sub={`Arrives ${fmtDate(s.end, false)}, ${fmtTime(s.end)}`} />
        <Stat icon={<CalendarDays size={18} />} label="Log sheets" value={`${s.days} day${s.days > 1 ? 's' : ''}`} sub={s.timezone.replace('_', ' ')} />
        <Stat
          icon={<Clock size={18} />}
          label="Cycle left"
          value={fmtHours(s.cycle_available_end)}
          sub={`${fmtHours(s.cycle_used_end)} of 70h used at arrival`}
        />
      </div>
      <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-teal-700">
          <ShieldCheck size={17} /> HOS compliant plan
        </span>
        <span className="hidden h-4 w-px bg-slate-200 sm:block" />
        {STOP_ORDER.map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_META[k].color }} />
            <b className="font-semibold text-slate-800">{counts[k] ?? 0}</b> {KIND_META[k].label.toLowerCase()}
            {(counts[k] ?? 0) === 1 ? '' : 's'}
          </span>
        ))}
      </div>
    </section>
  )
}
