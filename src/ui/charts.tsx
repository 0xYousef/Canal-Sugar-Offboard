import { useState } from 'react'

export interface Slice { label: string; value: number; color: string }
const AXIS = 'text-[9px] [&_text]:fill-current [&_text]:opacity-60'

const Key = ({ items }: { items: { label: string; color: string }[] }) => (
  <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
    {items.map((s) => <li key={s.label} className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</li>)}
  </ul>
)

/** Classic donut with the total in the middle and a plain legend underneath. */
export function Donut({ slices, centre, caption }: { slices: Slice[]; centre: string; caption: string }) {
  const [hot, setHot] = useState<number | null>(null)
  const total = slices.reduce((a, s) => a + s.value, 0)
  const R = 42, C = 2 * Math.PI * R
  let acc = 0
  const h = hot === null ? null : slices[hot]
  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 120 120" className="size-40" role="img" aria-label={`${caption}: ${slices.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="currentColor" strokeOpacity=".08" strokeWidth="18" />
        {total > 0 && slices.map((s, i) => {
          if (!s.value) return null
          const len = (s.value / total) * C, off = -acc
          acc += len
          return <circle key={s.label} cx="60" cy="60" r={R} fill="none" stroke={s.color} strokeWidth={hot === i ? 21 : 18}
            strokeDasharray={`${len} ${C}`} strokeDashoffset={off} transform="rotate(-90 60 60)" style={{ transition: 'stroke-width .15s' }}
            onPointerEnter={() => setHot(i)} onPointerLeave={() => setHot(null)} />
        })}
        <text x="60" y="63" textAnchor="middle" className="fill-current text-[20px] font-semibold">{h ? h.value : centre}</text>
        <text x="60" y="76" textAnchor="middle" className="fill-current text-[7px] opacity-60">{h ? h.label : caption}</text>
      </svg>
      <table className="w-full text-xs"><tbody>
        {slices.map((s, i) => (
          <tr key={s.label} onPointerEnter={() => setHot(i)} onPointerLeave={() => setHot(null)}>
            <td className="py-0.5"><i className="mr-2 inline-block size-2.5 rounded-sm align-middle" style={{ background: s.color }} />{s.label}</td>
            <td className="num text-right font-semibold">{s.value}</td>
            <td className="num w-12 text-right text-muted">{total ? Math.round((s.value / total) * 100) : 0}%</td>
          </tr>
        ))}
      </tbody></table>
    </div>
  )
}

/** Classic stacked column chart with a light value axis. */
export function Columns({ cols, parts, max: limit = 7 }: { cols: { label: string; values: number[] }[]; parts: { label: string; color: string }[]; max?: number }) {
  const [hot, setHot] = useState<number | null>(null)
  const all = cols.map((c) => ({ ...c, t: c.values.reduce((a, b) => a + b, 0) })).filter((c) => c.t > 0).sort((a, b) => b.t - a.t).slice(0, limit)
  if (!all.length) return <p className="text-sm text-muted">Nothing to show yet.</p>
  const top = Math.max(...all.map((c) => c.t)), nice = Math.max(2, Math.ceil(top / 2) * 2)
  const W = 300, H = 170, pl = 22, pb = 22, pt = 8, slot = (W - pl) / all.length, bw = Math.min(26, slot - 8)
  const y = (v: number) => H - pb - (v / nice) * (H - pb - pt)
  const short = (s: string) => (s.length > 6 ? s.slice(0, 5) + '.' : s)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${AXIS}`} role="img" aria-label={`Deadlines by owner: ${all.map((c) => `${c.label} ${c.t}`).join(', ')}`}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={pl} x2={W} y1={y(nice * f)} y2={y(nice * f)} stroke="currentColor" strokeOpacity=".1" /><text x="0" y={y(nice * f) + 3}>{Math.round(nice * f)}</text></g>)}
        {all.map((c, i) => {
          const x = pl + i * slot + (slot - bw) / 2
          let base = 0
          return (
            <g key={c.label} onPointerEnter={() => setHot(i)} onPointerLeave={() => setHot(null)} opacity={hot === null || hot === i ? 1 : 0.5}>
              {c.values.map((v, k) => { if (!v) return null; const h = y(base) - y(base + v), yy = y(base + v); base += v; return <rect key={k} x={x} y={yy} width={bw} height={h} fill={parts[k].color} rx={k === c.values.length - 1 || base === c.t ? 3 : 0} /> })}
              <text x={x + bw / 2} y={H - 8} textAnchor="middle">{short(c.label)}</text>
              <rect x={x - 3} y={pt} width={bw + 6} height={H - pb - pt} fill="transparent"><title>{`${c.label}: ${parts.map((p, k) => `${c.values[k]} ${p.label.toLowerCase()}`).join(', ')}`}</title></rect>
            </g>
          )
        })}
      </svg>
      <p className="mb-2 h-4 text-xs text-muted">{hot === null ? '' : `${all[hot].label}: ${parts.map((p, k) => `${all[hot].values[k]} ${p.label.toLowerCase()}`).join(', ')}`}</p>
      <Key items={parts} />
    </div>
  )
}

/** Classic line chart with a dot per point and a light grid. */
export function LineChart({ points, series }: { points: { label: string; values: number[] }[]; series: { label: string; color: string }[] }) {
  const [hot, setHot] = useState<number | null>(null)
  if (!points.length) return <p className="text-sm text-muted">No completed tasks yet.</p>
  const max = Math.max(2, ...points.flatMap((p) => p.values)), nice = Math.ceil(max / 2) * 2
  const W = 300, H = 170, pl = 22, pr = 14, pb = 22, pt = 8
  const x = (i: number) => pl + (points.length === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (points.length - 1))
  const y = (v: number) => H - pb - (v / nice) * (H - pb - pt)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${AXIS}`} role="img" aria-label={`Tasks finished each month: ${points.map((p) => `${p.label} ${p.values.join(' and ')}`).join('; ')}`}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={pl} x2={W - pr} y1={y(nice * f)} y2={y(nice * f)} stroke="currentColor" strokeOpacity=".1" /><text x="0" y={y(nice * f) + 3}>{Math.round(nice * f)}</text></g>)}
        {series.map((s, k) => (
          <g key={s.label}>
            <polyline points={points.map((p, i) => `${x(i)},${y(p.values[k])}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.values[k])} r={hot === i ? 4 : 2.8} fill="var(--surface, #fff)" stroke={s.color} strokeWidth="2" />)}
          </g>
        ))}
        {points.map((p, i) => (
          <g key={p.label}>
            <text x={x(i)} y={H - 8} textAnchor="middle">{p.label}</text>
            <rect x={x(i) - 16} y={pt} width="32" height={H - pb - pt} fill="transparent" tabIndex={0} aria-label={`${p.label}: ${series.map((s, k) => `${s.label} ${p.values[k]}`).join(', ')}`}
              onPointerEnter={() => setHot(i)} onPointerLeave={() => setHot(null)} onFocus={() => setHot(i)} onBlur={() => setHot(null)} />
          </g>
        ))}
        {hot !== null && <line x1={x(hot)} x2={x(hot)} y1={pt} y2={H - pb} stroke="currentColor" strokeOpacity=".15" />}
      </svg>
      <p className="mb-2 h-4 text-xs text-muted">{hot === null ? '' : `${points[hot].label}: ${series.map((s, k) => `${points[hot].values[k]} ${s.label.toLowerCase()}`).join(', ')}`}</p>
      <Key items={series} />
    </div>
  )
}
