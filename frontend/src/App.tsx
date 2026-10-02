import { AlertTriangle, BookOpen, FileText, Map as MapIcon, Route as RouteIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import LogsPanel from './components/LogsPanel'
import RouteMap from './components/RouteMap'
import RulesDialog from './components/RulesDialog'
import SummaryStats from './components/SummaryStats'
import Timeline from './components/Timeline'
import TripForm, { DEFAULT_DETAILS } from './components/TripForm'
import { ApiError, pingHealth, planTrip, type PlanRequest } from './lib/api'
import type { SheetDetails, TripPlan } from './types'

type ServerState = 'checking' | 'waking' | 'ready' | 'down'

function ServerPill({ state }: { state: ServerState }) {
  const map = {
    checking: ['bg-slate-400', 'Connecting'],
    waking: ['bg-amber-400 animate-pulse', 'Server waking up'],
    ready: ['bg-emerald-400', 'Server ready'],
    down: ['bg-rose-400', 'Server unreachable'],
  } as const
  const [dot, text] = map[state]
  return (
    <span className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 sm:flex">
      <span className={clsx('h-2 w-2 rounded-full', dot)} /> {text}
    </span>
  )
}

function LoadingState({ slow }: { slow: boolean }) {
  return (
    <div className="space-y-4" aria-busy>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton h-[76px] rounded-2xl" />
        ))}
      </div>
      <div className="skeleton h-[420px] rounded-2xl" />
      <p className="text-center text-sm text-slate-500">
        {slow
          ? 'The free-tier server is waking up after being idle — the first request can take up to a minute.'
          : 'Routing and simulating Hours-of-Service rules…'}
      </p>
    </div>
  )
}

function EmptyState() {
  const steps = [
    [RouteIcon, 'Enter the trip', 'Current, pickup and drop-off locations plus the hours already used in your 70-hr cycle.'],
    [MapIcon, 'Get a compliant route', 'Every 30-min break, 10-hr rest, fuel stop and 34-hr restart placed on the map.'],
    [FileText, 'Download the logs', 'One filled-out driver daily log per day, ready to print or save as PDF.'],
  ] as const
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {steps.map(([Icon, t, d], i) => (
        <div key={t} className="card p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Icon size={18} />
          </span>
          <p className="mt-3 text-sm font-bold text-ink">
            {i + 1}. {t}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{d}</p>
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const [plan, setPlan] = useState<TripPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<SheetDetails>(DEFAULT_DETAILS)
  const [selected, setSelected] = useState<number | null>(null)
  const [server, setServer] = useState<ServerState>('checking')
  const [rulesOpen, setRulesOpen] = useState(false)
  const resultsRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const slowTimer = setTimeout(() => setServer((s) => (s === 'checking' ? 'waking' : s)), 2500)
    pingHealth().then((ok) => {
      clearTimeout(slowTimer)
      setServer(ok ? 'ready' : 'down')
    })
    return () => clearTimeout(slowTimer)
  }, [])

  const submit = async (req: PlanRequest) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setSlow(false)
    setError(null)
    setSelected(null)
    const slowTimer = setTimeout(() => setSlow(true), 6000)
    if (window.innerWidth < 1024) resultsRef.current?.scrollIntoView({ behavior: 'smooth' })
    try {
      const result = await planTrip(req, ctrl.signal)
      setPlan(result)
      setServer('ready')
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(err instanceof ApiError ? err.message : 'Something went wrong while planning the trip.')
    } finally {
      clearTimeout(slowTimer)
      if (abortRef.current === ctrl) setLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      <header className="no-print bg-ink-800 text-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="h-9 w-9 rounded-xl ring-1 ring-white/15" />
            <div>
              <h1 className="text-[15px] font-bold leading-tight sm:text-base">ELD Trip Planner</h1>
              <p className="text-xs text-white/60">HOS-compliant routes &amp; driver daily logs</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ServerPill state={server} />
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              <BookOpen size={15} /> HOS rules
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1440px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:py-6">
        <aside className="no-print lg:sticky lg:top-6 lg:self-start">
          <TripForm loading={loading} onSubmit={submit} details={details} onDetailsChange={setDetails} />
          <p className="mt-3 px-1 text-[11px] leading-relaxed text-slate-400">
            Routing: OSRM · Geocoding: Photon & Nominatim · Map data © OpenStreetMap contributors. For planning only — not
            a certified ELD.
          </p>
        </aside>

        <div ref={resultsRef} className="min-w-0 scroll-mt-4 space-y-5">
          {error && (
            <div role="alert" className="no-print flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Couldn't plan this trip</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {loading && <LoadingState slow={slow} />}

          {!loading && plan && (
            <div className="no-print">
              <SummaryStats plan={plan} />
            </div>
          )}

          <div className={clsx('no-print grid gap-5', plan && !loading && 'xl:grid-cols-[minmax(0,1fr)_360px]', loading && 'hidden')}>
            <div className="card h-[440px] p-1.5 lg:h-[520px]">
              <RouteMap plan={plan} selected={selected} onSelect={setSelected} />
            </div>
            {plan && !loading && (
              <div className="card flex h-[520px] flex-col">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h3 className="text-base font-bold text-ink">Trip timeline</h3>
                  <p className="text-xs text-slate-500">Tap a stop to find it on the map</p>
                </div>
                <div className="flex-1 overflow-y-auto px-3 pb-3">
                  <Timeline plan={plan} selected={selected} onSelect={setSelected} />
                </div>
              </div>
            )}
          </div>

          {!plan && !loading && <EmptyState />}

          {plan && !loading && <LogsPanel plan={plan} details={details} />}
        </div>
      </main>

      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  )
}
