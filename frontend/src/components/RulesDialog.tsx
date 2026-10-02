import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

const RULES: [string, string][] = [
  ['11-hour driving limit', 'At most 11 hours of driving after 10 consecutive hours off duty.'],
  ['14-hour window', 'No driving after the 14th hour since coming on duty. Breaks do not extend it.'],
  ['30-minute break', 'Required after 8 cumulative hours of driving. Fuel, pickup or any 30+ minute non-driving stop satisfies it.'],
  ['10-hour reset', 'Logged as sleeper berth; restores the 11- and 14-hour limits.'],
  ['70 hours / 8 days', 'All on-duty time counts. When the cycle runs out, a 34-hour restart resets it to zero.'],
  ['Fuel', 'A 30-minute on-duty fuel stop at least every 1,000 miles.'],
  ['Pickup & drop-off', '1 hour on duty each.'],
  ['Inspections', '30-minute pre-trip at departure and post-trip at arrival (on duty).'],
]

const ASSUMPTIONS = [
  'Property-carrying driver, 70-hr/8-day cycle, no adverse driving conditions.',
  'Driver starts the trip after a full 10-hour rest.',
  '"Current cycle used" hours all fall inside the rolling 8-day window.',
  'Drive times come from OSRM road routing; times are rounded to 15-minute log increments.',
  'Home terminal time zone = time zone of the current location.',
  'Split sleeper-berth pairings are not used (full 10-hour rests only).',
]

export default function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="w-[min(640px,calc(100vw-2rem))] rounded-2xl p-0 shadow-2xl backdrop:bg-ink-900/50 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <h2 className="text-lg font-bold text-ink">Hours-of-Service rules applied</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          <X size={18} />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
        <dl className="space-y-3">
          {RULES.map(([t, d]) => (
            <div key={t} className="grid gap-1 sm:grid-cols-[170px_1fr]">
              <dt className="text-sm font-semibold text-slate-800">{t}</dt>
              <dd className="text-sm text-slate-600">{d}</dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-6 text-xs font-bold uppercase tracking-wide text-slate-500">Assumptions</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
          {ASSUMPTIONS.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <p className="mt-5 text-xs text-slate-400">Source: FMCSA Interstate Truck Driver's Guide to Hours of Service (49 CFR Part 395).</p>
      </div>
    </dialog>
  )
}
