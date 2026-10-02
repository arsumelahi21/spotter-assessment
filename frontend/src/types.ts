export type DutyStatus = 'OFF' | 'SB' | 'D' | 'ON'

export type EventKind =
  | 'pre_trip'
  | 'drive'
  | 'pickup'
  | 'dropoff'
  | 'fuel'
  | 'break'
  | 'rest'
  | 'restart'
  | 'post_trip'

export interface PlaceInput {
  label: string
  lat: number
  lng: number
}

export interface TripEvent {
  status: DutyStatus
  kind: EventKind
  note: string
  start: string
  end: string
  duration_hours: number
  start_mile: number
  end_mile: number
  lat: number
  lng: number
  location: string
  miles?: number
  to_location?: string
}

export interface LogSegment {
  status: DutyStatus
  start: number
  end: number
}

export interface LogRemark {
  minute: number
  status: DutyStatus
  kind: EventKind | 'off'
  location: string
  note: string
}

export interface DailyLog {
  date: string
  day_number: number
  total_miles: number
  from_location: string
  to_location: string
  segments: LogSegment[]
  totals: Record<DutyStatus, number>
  remarks: LogRemark[]
  recap: { on_duty_today: number; last_8_days: number; available_tomorrow: number }
}

export interface TripPlan {
  summary: {
    total_miles: number
    driving_hours: number
    on_duty_hours: number
    off_duty_hours: number
    trip_hours: number
    start: string
    end: string
    cycle_used_start: number
    cycle_used_end: number
    cycle_available_end: number
    stop_counts: Partial<Record<EventKind, number>>
    days: number
    timezone: string
  }
  places: Record<'current' | 'pickup' | 'dropoff', PlaceInput>
  route: {
    geometry: [number, number][]
    legs: { from: string; to: string; miles: number; drive_hours: number }[]
  }
  events: TripEvent[]
  stops: TripEvent[]
  daily_logs: DailyLog[]
}

/** Optional header info printed on the log sheets (not used by the HOS math). */
export interface SheetDetails {
  driverName: string
  coDriver: string
  carrier: string
  mainOffice: string
  homeTerminal: string
  vehicles: string
  shippingDoc: string
  shipper: string
}
