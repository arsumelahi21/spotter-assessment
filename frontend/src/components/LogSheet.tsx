import { forwardRef } from 'react'
import { STATUS_META, fmtMinuteOfDay } from '../lib/format'
import type { DailyLog, DutyStatus, SheetDetails } from '../types'

/*
 * A faithful SVG rendition of the paper "Driver's Daily Log" (RODS) form:
 * header, 24-hour graph grid with 15-minute ticks, totals column, remarks with
 * a "City, ST" note at each change of duty status, shipping docs and the
 * 70-hour/8-day recap. Filled-in values use a handwriting face in blue ink.
 */

const W = 1000
const H = 980
const GX = 150 // grid left
const GW = 760 // grid width (24 h)
const HW = GW / 24
const HEADER_Y = 262
const HEADER_H = 30
const ROW_H = 36
const GRID_TOP = HEADER_Y + HEADER_H
const ROWS: { status: DutyStatus; label: string[] }[] = [
  { status: 'OFF', label: ['1. Off Duty'] },
  { status: 'SB', label: ['2. Sleeper', 'Berth'] },
  { status: 'D', label: ['3. Driving'] },
  { status: 'ON', label: ['4. On Duty', '(not driving)'] },
]
const GRID_BOTTOM = GRID_TOP + ROW_H * ROWS.length
const TOT_X = GX + GW + 34

const INK = '#1f3fae'
const LINE = '#0f172a'
const HAND = "Kalam, 'Comic Sans MS', cursive"
const PRINT = "'Inter Variable', Inter, Arial, sans-serif"

const xAt = (minute: number) => GX + (minute / 60) * HW
const rowIndex = (s: DutyStatus) => ROWS.findIndex((r) => r.status === s)
const yAt = (s: DutyStatus) => GRID_TOP + rowIndex(s) * ROW_H + ROW_H / 2

const REMARK_LABEL: Record<string, string> = {
  pre_trip: 'Pre-trip insp.',
  drive: 'Driving',
  pickup: 'Pickup',
  dropoff: 'Drop-off',
  fuel: 'Fuel',
  break: '30-min break',
  rest: '10-hr rest',
  restart: '34-hr restart',
  post_trip: 'Post-trip insp.',
  off: 'Off duty',
}

const num = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0$/, ''))

function Field({ x, y, w, label, value, size = 17 }: { x: number; y: number; w: number; label?: string; value?: string; size?: number }) {
  return (
    <g>
      {value && (
        <text x={x + 6} y={y - 6} fontFamily={HAND} fontSize={size} fill={INK}>
          {value}
        </text>
      )}
      <line x1={x} x2={x + w} y1={y} y2={y} stroke={LINE} strokeWidth={1} />
      {label && (
        <text x={x + w / 2} y={y + 13} fontSize={10} textAnchor="middle" fill="#334155">
          {label}
        </text>
      )}
    </g>
  )
}

interface Props {
  log: DailyLog
  details: SheetDetails
  homeTerminal: string
  totalDays: number
}

const LogSheet = forwardRef<SVGSVGElement, Props>(function LogSheet({ log, details, homeTerminal, totalDays }, ref) {
  const [year, month, day] = log.date.split('-')

  // Duty-status line: horizontal runs on each row joined by vertical risers.
  let d = ''
  log.segments.forEach((s, i) => {
    const y = yAt(s.status)
    d += i === 0 ? `M ${xAt(s.start)} ${y}` : ` V ${y}`
    d += ` H ${xAt(s.end)}`
  })

  // Remarks: leader from the grid down to an angled label, nudged apart when crowded.
  const REM_Y = GRID_BOTTOM + 46
  let lastX = -Infinity
  const remarks = log.remarks.map((r) => {
    const x = xAt(r.minute)
    const lx = Math.max(x, lastX + 17)
    lastX = lx
    return { ...r, x, lx }
  })

  const totalHours = Object.values(log.totals).reduce((a, b) => a + b, 0)

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      className="h-auto w-full"
      role="img"
      aria-label={`Driver's daily log for ${log.date}`}
      fontFamily={PRINT}
      fill={LINE}
    >
      <rect width={W} height={H} fill="white" />

      {/* ---------- Header ---------- */}
      <text x={30} y={52} fontSize={28} fontWeight={800}>
        Drivers Daily Log
      </text>
      <text x={78} y={70} fontSize={11}>
        (24 hours)
      </text>
      <Field x={330} y={50} w={78} label="(month)" value={month} />
      <text x={414} y={48} fontSize={22}>/</text>
      <Field x={428} y={50} w={64} label="(day)" value={day} />
      <text x={498} y={48} fontSize={22}>/</text>
      <Field x={512} y={50} w={78} label="(year)" value={year} />
      <text x={640} y={34} fontSize={10.5}>
        Original - File at home terminal.
      </text>
      <text x={640} y={50} fontSize={10.5}>
        Duplicate - Driver retains in his/her possession for 8 days.
      </text>
      <text x={640} y={70} fontSize={10.5} fill="#64748b">
        Sheet {log.day_number} of {totalDays}
      </text>

      <text x={30} y={108} fontSize={14} fontWeight={700}>
        From:
      </text>
      <Field x={80} y={110} w={400} value={log.from_location} />
      <text x={520} y={108} fontSize={14} fontWeight={700}>
        To:
      </text>
      <Field x={550} y={110} w={420} value={log.to_location} />

      {[
        [30, 'Total Miles Driving Today'],
        [215, 'Total Mileage Today'],
      ].map(([x, label]) => (
        <g key={label as string}>
          <rect x={x as number} y={128} width={170} height={44} fill="none" stroke={LINE} strokeWidth={1.4} />
          <text x={(x as number) + 85} y={158} fontFamily={HAND} fontSize={20} fill={INK} textAnchor="middle">
            {Math.round(log.total_miles)}
          </text>
          <text x={(x as number) + 85} y={186} fontSize={10} fontWeight={600} textAnchor="middle">
            {label as string}
          </text>
        </g>
      ))}
      <Field x={420} y={150} w={550} label="Name of Carrier or Carriers" value={details.carrier} />
      <Field x={420} y={192} w={550} label="Main Office Address" value={details.mainOffice} />
      <Field x={420} y={234} w={550} label="Home Terminal Address" value={details.homeTerminal || homeTerminal} />
      <Field x={30} y={222} w={355} value={details.vehicles} size={15} />
      <text x={207} y={235} fontSize={9.5} textAnchor="middle">
        Truck/Tractor and Trailer Numbers or
      </text>
      <text x={207} y={247} fontSize={9.5} textAnchor="middle">
        License Plate(s)/State (show each unit)
      </text>

      {/* ---------- Graph grid ---------- */}
      <rect x={GX - 92} y={HEADER_Y} width={GW + 92 + 24} height={HEADER_H} fill={LINE} />
      {Array.from({ length: 25 }, (_, h) => {
        const x = GX + h * HW
        const label = h === 0 || h === 24 ? ['Mid-', 'night'] : h === 12 ? ['Noon'] : [String(h % 12)]
        return (
          <text key={h} x={x} y={HEADER_Y + (label.length === 2 ? 13 : 19)} fontSize={10} fontWeight={700} fill="white" textAnchor="middle">
            {label.map((l, i) => (
              <tspan key={i} x={x} dy={i ? 11 : 0}>
                {l}
              </tspan>
            ))}
          </text>
        )
      })}
      <text x={TOT_X + 24} y={HEADER_Y + 13} fontSize={10} fontWeight={700} textAnchor="middle">
        Total
      </text>
      <text x={TOT_X + 24} y={HEADER_Y + 25} fontSize={10} fontWeight={700} textAnchor="middle">
        Hours
      </text>

      {ROWS.map((r, i) => {
        const y = GRID_TOP + i * ROW_H
        return (
          <g key={r.status}>
            <rect x={GX} y={y} width={GW} height={ROW_H} fill={i % 2 ? '#f8fafc' : 'white'} stroke={LINE} strokeWidth={1.2} />
            {r.label.map((l, li) => (
              <text key={li} x={GX - 92} y={y + (r.label.length === 2 ? 15 : 22) + li * 12} fontSize={11} fontWeight={li ? 400 : 600}>
                {l}
              </text>
            ))}
            {Array.from({ length: 24 }, (_, h) => {
              const x = GX + h * HW
              return (
                <g key={h} stroke={LINE}>
                  {h > 0 && <line x1={x} x2={x} y1={y} y2={y + ROW_H} strokeWidth={0.9} />}
                  <line x1={x + HW / 4} x2={x + HW / 4} y1={y} y2={y + 9} strokeWidth={0.7} />
                  <line x1={x + HW / 2} x2={x + HW / 2} y1={y} y2={y + 15} strokeWidth={0.7} />
                  <line x1={x + (3 * HW) / 4} x2={x + (3 * HW) / 4} y1={y} y2={y + 9} strokeWidth={0.7} />
                </g>
              )
            })}
            <text x={TOT_X + 24} y={y + 24} fontFamily={HAND} fontSize={18} fill={INK} textAnchor="middle">
              {num(log.totals[r.status])}
            </text>
            <line x1={TOT_X} x2={TOT_X + 48} y1={y + ROW_H - 3} y2={y + ROW_H - 3} stroke={LINE} />
          </g>
        )
      })}
      <text x={TOT_X + 24} y={GRID_BOTTOM + 22} fontFamily={HAND} fontSize={18} fill={INK} textAnchor="middle">
        ={num(totalHours)}
      </text>
      <line x1={TOT_X} x2={TOT_X + 48} y1={GRID_BOTTOM + 27} y2={GRID_BOTTOM + 27} stroke={LINE} />

      {/* status-colored guide under the ink line, then the ink line itself */}
      {log.segments.map((s, i) => (
        <rect
          key={i}
          x={xAt(s.start)}
          y={GRID_TOP + rowIndex(s.status) * ROW_H + 3}
          width={xAt(s.end) - xAt(s.start)}
          height={ROW_H - 6}
          fill={STATUS_META[s.status].color}
          opacity={0.13}
        />
      ))}
      <path d={d} fill="none" stroke={INK} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />

      {/* ---------- Remarks ---------- */}
      <text x={30} y={GRID_BOTTOM + 30} fontSize={15} fontWeight={800}>
        Remarks
      </text>
      <line x1={36} x2={36} y1={GRID_BOTTOM + 42} y2={GRID_BOTTOM + 390} stroke={LINE} strokeWidth={3} />
      {remarks.map((r, i) => (
        <g key={i}>
          <line x1={r.x} x2={r.x} y1={GRID_BOTTOM} y2={GRID_BOTTOM + 14} stroke={INK} strokeWidth={1.5} />
          <polyline
            points={`${r.x},${GRID_BOTTOM + 14} ${r.lx},${REM_Y - 14} ${r.lx},${REM_Y - 4}`}
            fill="none"
            stroke={INK}
            strokeWidth={1}
            opacity={0.7}
          />
          <text
            transform={`translate(${r.lx - 3} ${REM_Y}) rotate(${r.lx > 830 ? 84 : 58})`}
            fontFamily={HAND}
            fontSize={13}
            fill={INK}
          >
            {r.location}
            <tspan fontSize={10.5} fill="#475569" fontFamily={PRINT}>
              {'  '}
              {fmtMinuteOfDay(r.minute)} · {REMARK_LABEL[r.kind] ?? r.note}
            </tspan>
          </text>
        </g>
      ))}

      {/* ---------- Shipping documents ---------- */}
      <g transform={`translate(0 ${GRID_BOTTOM + 282})`}>
        <text x={48} y={0} fontSize={12} fontWeight={700}>
          Shipping
        </text>
        <text x={48} y={14} fontSize={12} fontWeight={700}>
          Documents:
        </text>
        <Field x={48} y={52} w={210} value={details.shippingDoc} size={15} />
        <text x={48} y={66} fontSize={10}>
          DVL or Manifest No.
        </text>
        <text x={48} y={78} fontSize={10}>
          or
        </text>
        <Field x={48} y={106} w={210} value={details.shipper} size={15} />
        <text x={48} y={120} fontSize={10}>
          Shipper &amp; Commodity
        </text>
      </g>
      <text x={W / 2 + 60} y={GRID_BOTTOM + 304} fontSize={10.5} textAnchor="middle" fontWeight={600}>
        Enter name of place you reported and where released from work and when and where each change of duty occurred.
      </text>
      <text x={W / 2 + 60} y={GRID_BOTTOM + 318} fontSize={10.5} textAnchor="middle" fontWeight={600}>
        Use time standard of home terminal.
      </text>

      {/* ---------- Recap ---------- */}
      <g transform={`translate(0 ${GRID_BOTTOM + 412})`} fontSize={10}>
        <line x1={30} x2={970} y1={0} y2={0} stroke={LINE} strokeWidth={2} />
        <text x={30} y={18} fontWeight={700}>
          Recap:
        </text>
        <text x={30} y={31}>Complete at</text>
        <text x={30} y={44}>end of day</text>

        <text x={120} y={60}>On duty hours</text>
        <text x={120} y={73}>today, Total</text>
        <text x={120} y={86}>lines 3 &amp; 4</text>
        <text x={120} y={44} fontFamily={HAND} fontSize={18} fill={INK}>
          {num(log.recap.on_duty_today)}
        </text>
        <line x1={118} x2={190} y1={48} y2={48} stroke={LINE} />

        <text x={215} y={18} fontWeight={700}>70 Hour/</text>
        <text x={215} y={31} fontWeight={700}>8 Day Drivers</text>
        {[
          ['A.', ['Total hours on', 'duty last 8 days', 'including today.'], num(log.recap.last_8_days)],
          ['B.', ['Total hours', 'available', 'tomorrow 70 hr.', 'minus A*'], num(log.recap.available_tomorrow)],
          ['C.', ['Total hours on', 'duty last 7 days', 'including today.'], num(log.recap.last_8_days)],
        ].map(([letter, lines, value], i) => {
          const x = 315 + i * 112
          return (
            <g key={letter as string}>
              <text x={x} y={18} fontSize={13} fontWeight={700}>
                {letter as string}
              </text>
              <text x={x + 18} y={18} fontFamily={HAND} fontSize={18} fill={INK}>
                {value as string}
              </text>
              <line x1={x + 16} x2={x + 92} y1={22} y2={22} stroke={LINE} />
              {(lines as string[]).map((l, li) => (
                <text key={li} x={x} y={40 + li * 12}>
                  {l}
                </text>
              ))}
            </g>
          )
        })}

        <g opacity={0.45}>
          <text x={655} y={18} fontWeight={700}>60 Hour/7</text>
          <text x={655} y={31} fontWeight={700}>Day Drivers</text>
          <text x={655} y={50}>A. / B. / C.</text>
          <text x={655} y={63}>(not applicable)</text>
        </g>
        <text x={790} y={18}>*If you took 34</text>
        <text x={790} y={31}>consecutive hours off</text>
        <text x={790} y={44}>duty you have 60/70</text>
        <text x={790} y={57}>hours available</text>
      </g>

      {/* Driver certification */}
      <g transform={`translate(0 ${H - 16})`} fontSize={9.5} fill="#475569">
        <text x={30} y={0}>
          I certify that these entries are true and correct —{' '}
        </text>
        <text x={258} y={0} fontFamily={HAND} fontSize={15} fill={INK}>
          {details.driverName}
        </text>
        {details.coDriver && (
          <text x={520} y={0}>
            Co-driver: <tspan fontFamily={HAND} fontSize={15} fill={INK}>{details.coDriver}</tspan>
          </text>
        )}
      </g>
    </svg>
  )
})

export default LogSheet
