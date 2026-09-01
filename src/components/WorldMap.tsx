export interface WorldMapPoint {
  key: string
  label: string
  x: number
  y: number
  value: number
  display: string
}

const CANADA = 'M80 50 L130 22 L200 16 L280 20 L360 16 L430 28 L430 50 L80 50 Z'
const UK = 'M92 40 L116 34 L138 46 L146 74 L134 108 L110 128 L86 118 L72 92 L78 58 Z'
const EUROPE = 'M246 44 L300 40 L334 52 L356 74 L344 98 L366 116 L352 144 L374 168 L358 196 L370 220 L344 244 L320 264 L292 272 L268 262 L252 236 L240 206 L234 170 L228 132 L234 94 L240 66 Z'

export default function WorldMap({ points }: { points: WorldMapPoint[] }) {
  return <svg viewBox="0 0 920 360" role="img" aria-label="加拿大、英国和欧洲需求分布图" style={{ width: '100%', height: 'auto' }}>
    <rect x="0" y="0" width="920" height="360" fill="#eef6f6" rx="10"/>
    <path d={CANADA} fill="#d8f4ef" stroke="#66918e" strokeWidth="2"/>
    <g transform="translate(460 0)">
      <path d={UK} fill="#d8f4ef" stroke="#66918e" strokeWidth="2"/>
      <path d={EUROPE} fill="#b6dedb" stroke="#66918e" strokeWidth="2"/>
    </g>
    {points.map((point) => <g key={point.key}>
      <circle cx={point.x} cy={point.y} r={18 + point.value * 28} fill="#13a89e" fillOpacity={0.15 + point.value * 0.4}/>
      <circle cx={point.x} cy={point.y} r="6" fill="#087e78" stroke="white" strokeWidth="3"/>
      <text x={point.x} y={point.y - 26} textAnchor="middle" className="map-region">{point.label}</text>
      <text x={point.x} y={point.y + 30} textAnchor="middle" className="map-demand">{point.display}</text>
    </g>)}
  </svg>
}
