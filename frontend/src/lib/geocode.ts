import type { PlaceInput } from '../types'

export interface Suggestion extends PlaceInput {
  secondary: string
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    name?: string
    housenumber?: string
    street?: string
    city?: string
    state?: string
    country?: string
    countrycode?: string
    osm_value?: string
  }
}

const STATE_ABBR: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO',
  Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
  Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA',
  Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR',
  Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
  Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
  'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC',
}

const abbr = (state?: string) => (state ? STATE_ABBR[state] ?? state : '')

/** Address autocomplete via Photon (komoot) — free, keyless, CORS-enabled. Biased to North America. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '10')
  url.searchParams.set('lang', 'en')
  url.searchParams.set('lat', '39.5')
  url.searchParams.set('lon', '-98.35')
  const res = await fetch(url, { signal })
  if (!res.ok) return []
  const data: { features: PhotonFeature[] } = await res.json()
  const seen = new Set<string>()
  const out: Suggestion[] = []
  for (const f of data.features) {
    const p = f.properties
    if (p.countrycode && !['US', 'CA', 'MX'].includes(p.countrycode)) continue
    const street = p.street ? `${p.housenumber ? p.housenumber + ' ' : ''}${p.street}` : ''
    const primary = p.name || street || p.city
    if (!primary) continue
    const secondary = [p.name && p.city && p.city !== p.name ? p.city : '', abbr(p.state), p.countrycode === 'US' ? '' : p.country]
      .filter(Boolean)
      .join(', ')
    const label = [primary, abbr(p.state)].filter(Boolean).join(', ')
    const key = `${label}|${secondary}`
    if (seen.has(key)) continue
    seen.add(key)
    const [lng, lat] = f.geometry.coordinates
    out.push({ label, secondary, lat, lng })
    if (out.length === 6) break
  }
  return out
}
