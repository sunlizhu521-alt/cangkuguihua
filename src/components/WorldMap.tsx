import { useState, type MouseEvent } from 'react'
import { canadaCountry, europeCountries } from '../data/europeCountries'

export interface WorldMapPoint {
  key: string
  label: string
  x: number
  y: number
  value: number
  display: string
  ratioDisplay?: string
}

function heatColor(intensity: number) {
  const value = Math.max(0, Math.min(1, intensity))
  const r = Math.round(238 - (238 - 11) * value)
  const g = Math.round(244 - (244 - 94) * value)
  const b = Math.round(252 - (252 - 232) * value)
  return `rgb(${r},${g},${b})`
}

interface WorldMapProps {
  points: WorldMapPoint[]
  valueLabel?: string
  ariaLabel?: string
}

export default function WorldMap({ points, valueLabel = '历史需求', ariaLabel = '加拿大、英国和欧洲需求分布图' }: WorldMapProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; country: string; point: WorldMapPoint } | null>(null)
  const pointByKey = new Map(points.map((point) => [point.key, point]))
  const canada = pointByKey.get('加拿大')
  const uk = pointByKey.get('英国')
  const europe = pointByKey.get('欧洲')
  const showTooltip = (event: MouseEvent<SVGPathElement>, country: string, point: WorldMapPoint) => setTooltip({ x: event.clientX, y: event.clientY, country, point })
  const fill = (point?: WorldMapPoint) => point && point.value > 0 ? heatColor(point.value) : '#eef1f5'

  return <div style={{ position: 'relative' }}>
    <svg viewBox="0 0 1060 420" role="img" aria-label={ariaLabel} style={{ width: '100%', height: 'auto' }}>
      <rect x="0" y="0" width="1060" height="420" fill="#eef6f6" rx="10"/>
      {canada ? <path data-country="加拿大" d={canadaCountry.path} fill={fill(canada)} stroke="#ffffff" strokeWidth="0.8"
        onMouseEnter={(event) => showTooltip(event, '加拿大', canada)} onMouseMove={(event) => showTooltip(event, '加拿大', canada)} onMouseLeave={() => setTooltip(null)}/> : null}
      <g transform="translate(520 15) scale(0.64)">
        {europeCountries.map((country) => {
          const point = country.id === 'United Kingdom' ? uk : europe
          if (!point) return null
          return <path key={country.id} data-country={country.name} d={country.path} fill={fill(point)} stroke="#ffffff" strokeWidth="1.25"
            onMouseEnter={(event) => showTooltip(event, country.name, point)} onMouseMove={(event) => showTooltip(event, country.name, point)} onMouseLeave={() => setTooltip(null)}/>
        })}
      </g>
      {canada ? <g pointerEvents="none"><text x="225" y="350" textAnchor="middle" className="map-region">加拿大</text><text x="225" y="370" textAnchor="middle" className="map-demand">{canada.display}</text></g> : null}
      {uk ? <g pointerEvents="none"><text x="680" y="146" textAnchor="middle" className="map-region">英国</text><text x="680" y="164" textAnchor="middle" className="map-demand">{uk.display}</text></g> : null}
      {europe ? <g pointerEvents="none"><text x="860" y="354" textAnchor="middle" className="map-region">欧洲</text><text x="860" y="374" textAnchor="middle" className="map-demand">{europe.display}</text></g> : null}
    </svg>
    {tooltip ? <div style={{ position: 'fixed', left: tooltip.x + 14, top: tooltip.y + 14, background: 'rgba(24,38,59,0.95)', color: '#fff', padding: '9px 12px', borderRadius: '8px', fontSize: '12px', lineHeight: '1.6', pointerEvents: 'none', zIndex: 50, boxShadow: '0 4px 14px rgba(0,0,0,0.2)' }}>
      <div style={{ fontWeight: 700 }}>{tooltip.country}</div>
      <div>区域：{tooltip.point.label}</div>
      <div>{valueLabel}：{tooltip.point.display}</div>
      {tooltip.point.ratioDisplay ? <div>占比：{tooltip.point.ratioDisplay}</div> : null}
    </div> : null}
  </div>
}
