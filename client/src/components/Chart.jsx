/**
 * A dependency-free bar chart.
 *
 * Recharts would add ~120kB gzipped to draw fourteen rectangles. This is SVG
 * and about sixty lines.
 */
export function BarChart({ data, height = 132, format = (v) => v }) {
  if (!data?.length) return null
  const max = Math.max(1, ...data.map((d) => d.value))
  const gap = 4
  const w = 100 / data.length

  return (
    <div className="chart">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height, width: '100%' }} role="img"
           aria-label={`Bar chart, ${data.length} points, peak ${format(max)}`}>
        <defs>
          <linearGradient id="barfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#4338ca" stopOpacity="0.45" />
          </linearGradient>
        </defs>
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * (height - 8))
          return (
            <rect
              key={i}
              x={i * w + gap / 2}
              y={height - h}
              width={Math.max(0.5, w - gap)}
              height={h}
              rx="1.4"
              fill="url(#barfill)"
            >
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
          )
        })}
      </svg>
      <div className="chart__axis">
        {data.map((d, i) => (
          <span key={i}>{i % Math.ceil(data.length / 7) === 0 ? d.short : ''}</span>
        ))}
      </div>
    </div>
  )
}

/** Buckets timestamped records into the last `days` days. */
export function bucketByDay(records, days = 14, getDate = (r) => r.startedAt) {
  const out = []
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    out.push({
      key: d.toDateString(),
      label: d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
      short: d.toLocaleDateString([], { day: 'numeric' }),
      value: 0,
    })
  }

  const index = new Map(out.map((b) => [b.key, b]))
  for (const r of records) {
    const raw = getDate(r)
    if (!raw) continue
    // SQLite hands back "YYYY-MM-DD HH:MM:SS" in UTC.
    const d = new Date(String(raw).replace(' ', 'T') + (String(raw).endsWith('Z') ? '' : 'Z'))
    if (Number.isNaN(d.getTime())) continue
    d.setHours(0, 0, 0, 0)
    const bucket = index.get(d.toDateString())
    if (bucket) bucket.value += 1
  }

  return out
}
