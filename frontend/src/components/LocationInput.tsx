import { Loader2, MapPin, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import { searchPlaces, type Suggestion } from '../lib/geocode'
import type { PlaceInput } from '../types'

export interface LocationValue {
  text: string
  place: PlaceInput | null
}

interface Props {
  label: string
  placeholder: string
  value: LocationValue
  onChange: (v: LocationValue) => void
  accent: string
  icon?: React.ReactNode
}

export default function LocationInput({ label, placeholder, value, onChange, accent, icon }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<Suggestion[]>([])
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = value.text.trim()
    if (value.place || q.length < 3) {
      setItems([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await searchPlaces(q, ctrl.signal)
        setItems(res)
        setActive(0)
        setOpen(true)
      } catch {
        /* network hiccup or aborted: the backend can still geocode free text */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 280)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [value.text, value.place])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const pick = (s: Suggestion) => {
    onChange({ text: s.label, place: { label: s.label, lat: s.lat, lng: s.lng } })
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !items.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + items.length) % items.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(items[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="relative">
        <span
          className="pointer-events-none absolute left-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-white"
          style={{ background: accent }}
        >
          {icon ?? <MapPin size={13} strokeWidth={2.5} />}
        </span>
        <input
          id={id}
          className="input pl-11 pr-9"
          placeholder={placeholder}
          value={value.text}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          onChange={(e) => onChange({ text: e.target.value, place: null })}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : value.text ? (
            <button
              type="button"
              aria-label={`Clear ${label}`}
              className="rounded p-0.5 hover:text-slate-600"
              onClick={() => onChange({ text: '', place: null })}
            >
              <X size={15} />
            </button>
          ) : null}
        </span>
      </div>
      {open && items.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-[1000] mt-1.5 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
        >
          {items.map((s, i) => (
            <li
              key={`${s.lat},${s.lng},${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(s)
              }}
              onMouseEnter={() => setActive(i)}
              className={clsx(
                'flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm',
                i === active ? 'bg-slate-100' : 'bg-white',
              )}
            >
              <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-800">{s.label}</span>
                {s.secondary && <span className="block truncate text-xs text-slate-500">{s.secondary}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
