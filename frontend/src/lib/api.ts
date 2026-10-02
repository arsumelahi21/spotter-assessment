import type { PlaceInput, TripPlan } from '../types'

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export interface PlanRequest {
  current_location: PlaceInput | string
  pickup_location: PlaceInput | string
  dropoff_location: PlaceInput | string
  current_cycle_used: number
  start_time?: string | null
}

export class ApiError extends Error {
  fields?: Record<string, string[]>
  constructor(message: string, fields?: Record<string, string[]>) {
    super(message)
    this.fields = fields
  }
}

export async function planTrip(body: PlanRequest, signal?: AbortSignal): Promise<TripPlan> {
  let res: Response
  try {
    res = await fetch(`${API_URL}/api/trips/plan/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError('Could not reach the planning server. Check your connection and try again.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (data.detail) throw new ApiError(data.detail)
    const first = Object.entries(data as Record<string, string[]>)[0]
    throw new ApiError(first ? `${first[0].replace(/_/g, ' ')}: ${first[1]}` : 'Something went wrong.', data)
  }
  return data as TripPlan
}

/** Ping the API so a sleeping free-tier instance starts waking up while the user types. */
export async function pingHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/health/`)
    return res.ok
  } catch {
    return false
  }
}
