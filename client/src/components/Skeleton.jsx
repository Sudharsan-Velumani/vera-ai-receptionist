/**
 * Skeletons rather than spinners.
 *
 * A spinner tells you to wait; a skeleton tells you what is coming and stops
 * the layout jumping when it arrives.
 */
export function Skeleton({ w = '100%', h = 14, r = 7, style }) {
  return <span className="sk" style={{ width: w, height: h, borderRadius: r, ...style }} />
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card">
      <Skeleton w="42%" h={18} />
      <div style={{ display: 'grid', gap: 9, marginTop: 16 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} w={i === lines - 1 ? '65%' : '100%'} h={11} />
        ))}
      </div>
    </div>
  )
}

export function SkeletonStats({ n = 4 }) {
  return (
    <div className="grid-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="card">
          <Skeleton w="55%" h={30} />
          <Skeleton w="80%" h={11} style={{ marginTop: 12 }} />
        </div>
      ))}
    </div>
  )
}

export function SkeletonRows({ n = 6 }) {
  return (
    <div className="card" style={{ display: 'grid', gap: 16 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Skeleton w={34} h={34} r={10} />
          <div style={{ flex: 1, display: 'grid', gap: 7 }}>
            <Skeleton w="30%" h={12} />
            <Skeleton w="70%" h={10} />
          </div>
          <Skeleton w={54} h={10} />
        </div>
      ))}
    </div>
  )
}
