import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { BedDouble, Coffee, Flag, Fuel, Navigation, Package, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { KIND_META, STATUS_META, fmtDateTime, fmtHours, fmtMiles } from '../lib/format'
import type { EventKind, TripPlan } from '../types'

type MarkerKind = EventKind | 'current'

const ICONS: Partial<Record<MarkerKind, React.ReactNode>> = {
  current: <Navigation size={14} strokeWidth={2.5} />,
  pickup: <Package size={14} strokeWidth={2.5} />,
  dropoff: <Flag size={14} strokeWidth={2.5} />,
  fuel: <Fuel size={13} strokeWidth={2.5} />,
  break: <Coffee size={13} strokeWidth={2.5} />,
  rest: <BedDouble size={13} strokeWidth={2.5} />,
  restart: <RotateCcw size={13} strokeWidth={2.5} />,
}

const iconCache = new Map<string, L.DivIcon>()
function markerIcon(kind: MarkerKind, active = false) {
  const key = `${kind}-${active}`
  if (!iconCache.has(key)) {
    const big = kind === 'current' || kind === 'pickup' || kind === 'dropoff'
    const size = big ? 34 : 28
    const html = renderToStaticMarkup(
      <div
        style={{
          width: size,
          height: size,
          background: KIND_META[kind].color,
          border: '2.5px solid white',
          borderRadius: 999,
          boxShadow: active ? `0 0 0 5px ${KIND_META[kind].color}55, 0 4px 10px rgba(0,0,0,.3)` : '0 3px 8px rgba(0,0,0,.28)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {ICONS[kind]}
      </div>,
    )
    iconCache.set(key, L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] }))
  }
  return iconCache.get(key)!
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [36, 36] })
  }, [map, points])
  return null
}

function FlyTo({ target, zoom = 8 }: { target: [number, number] | null; zoom?: number }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), zoom), { duration: 0.8 })
  }, [map, target, zoom])
  return null
}

export interface FocusPoint {
  lat: number
  lng: number
  label: string
}

interface Props {
  plan: TripPlan | null
  selected: number | null
  onSelect: (i: number | null) => void
  focus?: FocusPoint | null
}

export default function RouteMap({ plan, selected, onSelect, focus }: Props) {
  const focusTarget = useMemo<[number, number] | null>(() => (focus ? [focus.lat, focus.lng] : null), [focus])
  const markerRefs = useRef<Record<number, L.Marker | null>>({})
  const geometry = useMemo(() => plan?.route.geometry ?? [], [plan])
  const target = useMemo<[number, number] | null>(() => {
    if (!plan || selected == null) return null
    const s = plan.stops[selected]
    return s ? [s.lat, s.lng] : null
  }, [plan, selected])

  useEffect(() => {
    if (selected != null) markerRefs.current[selected]?.openPopup()
  }, [selected])

  const legend = useMemo(() => {
    if (!plan) return []
    const kinds = new Set(plan.stops.map((s) => s.kind))
    return (['current', 'pickup', 'dropoff', 'fuel', 'break', 'rest', 'restart'] as MarkerKind[]).filter(
      (k) => k === 'current' || kinds.has(k as EventKind),
    )
  }, [plan])

  return (
    <div className="relative h-full min-h-[360px] w-full overflow-hidden rounded-2xl">
      <MapContainer center={[39.5, -98.35]} zoom={4} scrollWheelZoom className="h-full w-full" zoomControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {plan && (
          <>
            <Polyline positions={geometry} pathOptions={{ color: '#0b2e3a', weight: 7, opacity: 0.18 }} />
            <Polyline positions={geometry} pathOptions={{ color: '#e8505b', weight: 4, opacity: 0.95 }} />
            <FitBounds points={geometry} />
            <FlyTo target={target} />
            <FlyTo target={focusTarget} zoom={13} />
            {focus && (
              <CircleMarker
                key={`${focus.lat},${focus.lng}`}
                center={[focus.lat, focus.lng]}
                radius={9}
                pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#0b2e3a', fillOpacity: 1 }}
              >
                <Tooltip direction="top" offset={[0, -8]} permanent className="step-tip">
                  <span className="text-xs font-semibold">{focus.label}</span>
                </Tooltip>
              </CircleMarker>
            )}
            <Marker position={[plan.places.current.lat, plan.places.current.lng]} icon={markerIcon('current')}>
              <Popup>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start</p>
                <p className="font-semibold text-slate-800">{plan.places.current.label}</p>
                <p className="text-xs text-slate-500">{fmtDateTime(plan.summary.start)}</p>
              </Popup>
            </Marker>
            {plan.stops.map((s, i) => (
              <Marker
                key={i}
                position={[s.lat, s.lng]}
                icon={markerIcon(s.kind, i === selected)}
                zIndexOffset={s.kind === 'pickup' || s.kind === 'dropoff' ? 500 : i === selected ? 1000 : 0}
                ref={(m) => {
                  markerRefs.current[i] = m
                }}
                eventHandlers={{ click: () => onSelect(i), popupclose: () => selected === i && onSelect(null) }}
              >
                <Popup>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: KIND_META[s.kind].color }}>
                    {KIND_META[s.kind].label}
                  </p>
                  <p className="font-semibold text-slate-800">{s.location}</p>
                  <p className="mt-1 text-xs text-slate-600">{s.note}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {fmtDateTime(s.start)} · {fmtHours(s.duration_hours)} · {STATUS_META[s.status].label}
                  </p>
                  <p className="text-xs text-slate-500">Mile {fmtMiles(s.start_mile).replace(' mi', '')} of {fmtMiles(plan.summary.total_miles)}</p>
                </Popup>
              </Marker>
            ))}
          </>
        )}
      </MapContainer>

      {plan && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-x-3 gap-y-1 rounded-xl bg-white/90 px-3 py-2 text-[11px] font-medium text-slate-600 shadow-md backdrop-blur">
          {legend.map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_META[k].color }} />
              {k === 'current' ? 'Start' : KIND_META[k].label}
            </span>
          ))}
        </div>
      )}
      {!plan && (
        <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center">
          <div className="rounded-2xl bg-white/90 px-5 py-4 text-center shadow-lg backdrop-blur">
            <p className="text-sm font-semibold text-ink">Your route will appear here</p>
            <p className="mt-0.5 text-xs text-slate-500">with every fuel stop, break and rest marked</p>
          </div>
        </div>
      )}
    </div>
  )
}
