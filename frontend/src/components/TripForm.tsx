import { CalendarClock, ChevronDown, Flag, Loader2, Navigation, Package, Route, Sparkles } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import LocationInput, { type LocationValue } from './LocationInput'
import { nextQuarterHourLocal } from '../lib/format'
import type { PlanRequest } from '../lib/api'
import type { SheetDetails } from '../types'

const empty: LocationValue = { text: '', place: null }
const at = (label: string, lat: number, lng: number): LocationValue => ({ text: label, place: { label, lat, lng } })

const PRESETS = [
  {
    name: 'Regional run',
    hint: '10-hr rest',
    current: at('Chicago, IL', 41.8781, -87.6298),
    pickup: at('St. Louis, MO', 38.627, -90.1994),
    dropoff: at('Dallas, TX', 32.7767, -96.797),
    cycle: 12,
  },
  {
    name: 'Coast to coast',
    hint: '34-hr restart',
    current: at('Los Angeles, CA', 34.0522, -118.2437),
    pickup: at('Phoenix, AZ', 33.4484, -112.074),
    dropoff: at('New York, NY', 40.7128, -74.006),
    cycle: 50,
  },
  {
    name: 'Day trip',
    hint: 'One shift',
    current: at('Atlanta, GA', 33.749, -84.388),
    pickup: at('Macon, GA', 32.8407, -83.6324),
    dropoff: at('Savannah, GA', 32.0809, -81.0912),
    cycle: 20,
  },
]

export const DEFAULT_DETAILS: SheetDetails = {
  driverName: 'Alex Driver',
  coDriver: '',
  carrier: 'Spotter Freight Lines',
  mainOffice: 'Dallas, TX',
  homeTerminal: '',
  vehicles: 'Tractor 1042 / Trailer 5521',
  shippingDoc: 'BOL-' + String(Math.floor(100000 + Math.random() * 900000)),
  shipper: 'General freight',
}

interface Props {
  loading: boolean
  onSubmit: (req: PlanRequest, details: SheetDetails) => void
  details: SheetDetails
  onDetailsChange: (d: SheetDetails) => void
}

export default function TripForm({ loading, onSubmit, details, onDetailsChange }: Props) {
  const [current, setCurrent] = useState<LocationValue>(empty)
  const [pickup, setPickup] = useState<LocationValue>(empty)
  const [dropoff, setDropoff] = useState<LocationValue>(empty)
  const [cycle, setCycle] = useState<string>('0')
  const [departNow, setDepartNow] = useState(true)
  const [startTime, setStartTime] = useState(nextQuarterHourLocal())
  const [showDetails, setShowDetails] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cycleNum = Number(cycle)
  const cycleValid = cycle !== '' && !Number.isNaN(cycleNum) && cycleNum >= 0 && cycleNum <= 70

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setCurrent(p.current)
    setPickup(p.pickup)
    setDropoff(p.dropoff)
    setCycle(String(p.cycle))
    setError(null)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!current.text.trim() || !pickup.text.trim() || !dropoff.text.trim()) {
      setError('Enter the current, pickup and drop-off locations.')
      return
    }
    if (!cycleValid) {
      setError('Current cycle used must be between 0 and 70 hours.')
      return
    }
    setError(null)
    const loc = (v: LocationValue) => v.place ?? v.text.trim()
    onSubmit(
      {
        current_location: loc(current),
        pickup_location: loc(pickup),
        dropoff_location: loc(dropoff),
        current_cycle_used: cycleNum,
        start_time: departNow ? null : startTime,
      },
      details,
    )
  }

  const setDetail = (k: keyof SheetDetails) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onDetailsChange({ ...details, [k]: e.target.value })

  return (
    <form onSubmit={submit} className="card p-5 sm:p-6" noValidate>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Plan a trip</h2>
          <p className="mt-0.5 text-sm text-slate-500">Route, HOS stops and daily logs in one go.</p>
        </div>
        <span className="whitespace-nowrap rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-semibold text-ink-700">70 hr / 8 day</span>
      </div>

      <div className="mb-5">
        <span className="field-label flex items-center gap-1.5">
          <Sparkles size={12} /> Try an example
        </span>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => applyPreset(p)}
              className="group rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left transition hover:border-ink-600/40 hover:bg-white"
            >
              <span className="block text-xs font-semibold text-slate-700 group-hover:text-ink">{p.name}</span>
              <span className="block text-[11px] text-slate-500">{p.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="relative space-y-4">
        <div className="absolute bottom-9 left-[23px] top-9 w-px border-l-2 border-dashed border-slate-200" aria-hidden />
        <LocationInput
          label="Current location"
          placeholder="Where is the truck now?"
          value={current}
          onChange={setCurrent}
          accent="#0b2e3a"
          icon={<Navigation size={12} strokeWidth={2.5} />}
        />
        <LocationInput
          label="Pickup location"
          placeholder="Shipper address or city"
          value={pickup}
          onChange={setPickup}
          accent="#2563eb"
          icon={<Package size={12} strokeWidth={2.5} />}
        />
        <LocationInput
          label="Drop-off location"
          placeholder="Receiver address or city"
          value={dropoff}
          onChange={setDropoff}
          accent="#e8505b"
          icon={<Flag size={12} strokeWidth={2.5} />}
        />
      </div>

      <div className="mt-5">
        <div className="flex items-end justify-between">
          <label htmlFor="cycle" className="field-label">
            Current cycle used
          </label>
          <span className="mb-1.5 text-xs text-slate-500">
            {cycleValid ? `${(70 - cycleNum).toFixed(cycleNum % 1 ? 2 : 0)} hrs available` : '0 – 70 hrs'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={70}
            step={0.5}
            value={cycleValid ? cycleNum : 0}
            onChange={(e) => setCycle(e.target.value)}
            className="h-2 flex-1 cursor-pointer accent-[#e8505b]"
            aria-label="Current cycle used slider"
          />
          <div className="relative w-24">
            <input
              id="cycle"
              type="number"
              inputMode="decimal"
              min={0}
              max={70}
              step={0.25}
              value={cycle}
              onChange={(e) => setCycle(e.target.value)}
              className={clsx('input pr-10 text-right', !cycleValid && 'border-brand ring-4 ring-brand/10')}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">hrs</span>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <span className="field-label">Departure</span>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium">
          {[
            [true, 'Leave now'],
            [false, 'Schedule'],
          ].map(([val, text]) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => setDepartNow(val as boolean)}
              className={clsx(
                'rounded-lg py-1.5 transition',
                departNow === val ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {text as string}
            </button>
          ))}
        </div>
        {departNow ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <CalendarClock size={13} /> Starts at the next quarter hour, in the start location's time zone.
          </p>
        ) : (
          <input
            type="datetime-local"
            step={900}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="input mt-2"
            aria-label="Departure date and time (home terminal time)"
          />
        )}
      </div>

      <div className="mt-5 rounded-xl border border-slate-200">
        <button
          type="button"
          onClick={() => setShowDetails((s) => !s)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700"
          aria-expanded={showDetails}
        >
          Log sheet details
          <ChevronDown size={16} className={clsx('text-slate-400 transition', showDetails && 'rotate-180')} />
        </button>
        {showDetails && (
          <div className="grid grid-cols-1 gap-3 border-t border-slate-200 p-4 sm:grid-cols-2">
            {(
              [
                ['driverName', 'Driver name'],
                ['coDriver', 'Co-driver'],
                ['carrier', 'Carrier'],
                ['mainOffice', 'Main office address'],
                ['homeTerminal', 'Home terminal address'],
                ['vehicles', 'Truck / trailer numbers'],
                ['shippingDoc', 'DVL or manifest no.'],
                ['shipper', 'Shipper & commodity'],
              ] as [keyof SheetDetails, string][]
            ).map(([k, l]) => (
              <label key={k} className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">{l}</span>
                <input className="input py-2" value={details[k]} onChange={setDetail(k)} />
              </label>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm font-medium text-[#b4232e]">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary mt-5 w-full py-3 text-[15px]" disabled={loading}>
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Route size={18} />}
        {loading ? 'Planning route…' : 'Plan trip & generate logs'}
      </button>
    </form>
  )
}
