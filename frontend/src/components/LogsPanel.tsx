import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Download, Loader2, Printer } from 'lucide-react'
import { useRef, useState } from 'react'
import LogSheet from './LogSheet'
import { exportLogsPdf } from '../lib/exportPdf'
import { STATUS_META, fmtDate, fmtHours, fmtMiles } from '../lib/format'
import type { DutyStatus, SheetDetails, TripPlan } from '../types'

interface Props {
  plan: TripPlan
  details: SheetDetails
}

export default function LogsPanel({ plan, details }: Props) {
  const [active, setActive] = useState(0)
  const [exporting, setExporting] = useState(false)
  const exportRefs = useRef<(SVGSVGElement | null)[]>([])
  const logs = plan.daily_logs
  const log = logs[Math.min(active, logs.length - 1)]
  const homeTerminal = plan.places.current.label

  const downloadPdf = async () => {
    setExporting(true)
    try {
      const sheets = exportRefs.current.filter((el): el is SVGSVGElement => !!el)
      await exportLogsPdf(sheets, `driver-logs-${logs[0].date}.pdf`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="card overflow-hidden" aria-label="Daily log sheets">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div>
          <h3 className="text-base font-bold text-ink">Driver's daily logs</h3>
          <p className="text-xs text-slate-500">
            {logs.length} sheet{logs.length > 1 ? 's' : ''} · midnight-to-midnight, home terminal time
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost py-2" onClick={() => window.print()}>
            <Printer size={16} /> <span className="hidden sm:inline">Print</span>
          </button>
          <button type="button" className="btn-primary py-2" onClick={downloadPdf} disabled={exporting}>
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Download PDF
          </button>
        </div>
      </div>

      <div className="no-print flex items-center gap-2 border-b border-slate-100 px-2 py-2 sm:px-3">
        <button
          type="button"
          aria-label="Previous day"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          disabled={active === 0}
          onClick={() => setActive((a) => a - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex flex-1 gap-1 overflow-x-auto" role="tablist">
          {logs.map((l, i) => (
            <button
              key={l.date}
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={clsx(
                'shrink-0 rounded-lg px-3 py-1.5 text-left transition',
                i === active ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              <span className="block text-xs font-semibold">Day {l.day_number}</span>
              <span className={clsx('block text-[11px]', i === active ? 'text-white/70' : 'text-slate-400')}>
                {fmtDate(l.date)}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Next day"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          disabled={active === logs.length - 1}
          onClick={() => setActive((a) => a + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="no-print grid grid-cols-2 gap-2 px-4 pt-4 sm:grid-cols-5 sm:px-5">
        {(['OFF', 'SB', 'D', 'ON'] as DutyStatus[]).map((s) => (
          <div key={s} className="rounded-xl border border-slate-100 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_META[s].color }} />
              {STATUS_META[s].label}
            </p>
            <p className="text-sm font-bold text-slate-800">{fmtHours(log.totals[s])}</p>
          </div>
        ))}
        <div className="col-span-2 rounded-xl border border-slate-100 px-3 py-2 sm:col-span-1">
          <p className="text-[11px] font-medium text-slate-500">Miles today</p>
          <p className="text-sm font-bold text-slate-800">{fmtMiles(log.total_miles)}</p>
        </div>
      </div>

      <div className="no-print overflow-x-auto p-3 sm:p-5">
        <div className="min-w-[680px] rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <LogSheet log={log} details={details} homeTerminal={homeTerminal} totalDays={logs.length} />
        </div>
      </div>

      {/* All sheets, rendered off-screen for PDF export and shown when printing. */}
      <div className="print-sheets" aria-hidden>
        {logs.map((l, i) => (
          <div key={l.date} className="log-sheet-page">
            <LogSheet
              ref={(el) => {
                exportRefs.current[i] = el
              }}
              log={l}
              details={details}
              homeTerminal={homeTerminal}
              totalDays={logs.length}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
