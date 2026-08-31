import { useLayoutEffect, useRef, useState } from 'react'
import USA from '@svg-maps/usa'
import { stateRegions } from '../data'

const stateNamesZh: Record<string, string> = {
  AL: '阿拉巴马', AK: '阿拉斯加', AZ: '亚利桑那', AR: '阿肯色', CA: '加利福尼亚',
  CO: '科罗拉多', CT: '康涅狄格', DE: '特拉华', FL: '佛罗里达', GA: '佐治亚',
  HI: '夏威夷', ID: '爱达荷', IL: '伊利诺伊', IN: '印第安纳', IA: '艾奥瓦',
  KS: '堪萨斯', KY: '肯塔基', LA: '路易斯安那', ME: '缅因', MD: '马里兰',
  MA: '马萨诸塞', MI: '密歇根', MN: '明尼苏达', MS: '密西西比', MO: '密苏里',
  MT: '蒙大拿', NE: '内布拉斯加', NV: '内华达', NH: '新罕布什尔', NJ: '新泽西',
  NM: '新墨西哥', NY: '纽约', NC: '北卡罗来纳', ND: '北达科他', OH: '俄亥俄',
  OK: '俄克拉荷马', OR: '俄勒冈', PA: '宾夕法尼亚', RI: '罗得岛', SC: '南卡罗来纳',
  SD: '南达科他', TN: '田纳西', TX: '得克萨斯', UT: '犹他', VT: '佛蒙特',
  VA: '弗吉尼亚', WA: '华盛顿', WV: '西弗吉尼亚', WI: '威斯康星', WY: '怀俄明',
  DC: '哥伦比亚特区',
}

function heatColor(intensity: number) {
  const r = Math.round(238 - (238 - 11) * intensity)
  const g = Math.round(244 - (244 - 94) * intensity)
  const b = Math.round(252 - (252 - 232) * intensity)
  return `rgb(${r},${g},${b})`
}

interface UsStatesMapProps {
  stateValues: Record<string, number>
  warehouses?: Array<{ code: string; state: string }>
  valueLabel?: string
}

interface UsaLocation {
  name: string
  id: string
  path: string
}

export default function UsStatesMap({ stateValues, warehouses = [], valueLabel = '订单量' }: UsStatesMapProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; abbr: string; region: string; value: number; ratio: string } | null>(null)
  const [stateCenters, setStateCenters] = useState<Record<string, [number, number]>>({})
  const svgRef = useRef<SVGSVGElement>(null)
  const total = Object.values(stateValues).reduce((sum, v) => sum + v, 0)
  const max = Math.max(1, ...Object.values(stateValues))

  useLayoutEffect(() => {
    const centers: Record<string, [number, number]> = {}
    svgRef.current?.querySelectorAll<SVGPathElement>('path[data-state]').forEach((element) => {
      const abbr = element.dataset.state
      if (!abbr) return
      const bounds = element.getBBox()
      centers[abbr] = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2]
    })
    setStateCenters(centers)
  }, [])

  return <div style={{ position: 'relative' }}>
    <svg ref={svgRef} viewBox={USA.viewBox} role="img" aria-label="美国各州订单分布图" style={{ width: '100%', height: 'auto' }}>
      {USA.locations.map((loc: UsaLocation) => {
        const abbr = loc.id.toUpperCase()
        const value = stateValues[abbr] ?? 0
        const region = stateRegions[abbr]
        const intensity = value / max
        return <path key={loc.id} data-state={abbr} d={loc.path} fill={value > 0 ? heatColor(intensity) : '#eef1f5'} stroke="#ffffff" strokeWidth="0.5"
          onMouseEnter={(event) => setTooltip({ x: event.clientX, y: event.clientY, name: stateNamesZh[abbr] ?? loc.name, abbr, region: region ?? '—', value, ratio: total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '0%' })}
          onMouseLeave={() => setTooltip(null)} />
      })}
      {warehouses.map((warehouse, index) => {
        const center = stateCenters[warehouse.state.toUpperCase()]
        if (!center) return null
        const [x, y] = center
        return <g key={`${warehouse.code}-${index}`} transform={`translate(${x} ${y})`}><circle r="5" fill="#e0342c" stroke="#fff" strokeWidth="1.5"/><text x="8" y="-6" fontSize="13" fontWeight="700" fill="#1f2937">{warehouse.code}</text></g>
      })}
    </svg>
    {tooltip && <div style={{ position: 'fixed', left: tooltip.x + 14, top: tooltip.y + 14, background: 'rgba(24,38,59,0.95)', color: '#fff', padding: '9px 12px', borderRadius: '8px', fontSize: '12px', lineHeight: '1.6', pointerEvents: 'none', zIndex: 50, boxShadow: '0 4px 14px rgba(0,0,0,0.2)' }}>
      <div style={{ fontWeight: 700 }}>{tooltip.name}（{tooltip.abbr}）</div>
      <div>区域：{tooltip.region}</div>
      <div>{valueLabel}：{tooltip.value.toLocaleString('zh-CN')}</div>
      <div>全国占比：{tooltip.ratio}</div>
    </div>}
  </div>
}
