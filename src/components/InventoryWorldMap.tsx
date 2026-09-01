import { useState, type MouseEvent } from 'react'
import { stateRegions } from '../data'
import { inventoryCanada, inventoryEuropeCountries, inventoryMapLabels, inventoryUsStates, inventoryWorldViewBox } from '../data/inventoryWorldMap'

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

type InternationalRegion = '加拿大' | '英国' | '欧洲'

interface InventoryWorldMapProps {
  stateValues: Record<string, number>
  siteValues: Record<InternationalRegion, number>
  warehouses?: Array<{ code: string; state: string }>
  maxValue: number
  ariaLabel?: string
  stateValueLabel?: string
  countryValueLabel?: string
  stateRatioLabel?: string
  countryRatioLabel?: string
  countryRatios?: Partial<Record<InternationalRegion, number>>
}

interface Tooltip {
  x: number
  y: number
  title: string
  region: string
  value: number
  valueLabel: string
  ratioLabel: string
  ratio: string
}

function heatColor(intensity: number) {
  const value = Math.max(0, Math.min(1, intensity))
  const r = Math.round(238 - (238 - 11) * value)
  const g = Math.round(244 - (244 - 94) * value)
  const b = Math.round(252 - (252 - 232) * value)
  return `rgb(${r},${g},${b})`
}

const inventoryStateById = new Map(inventoryUsStates.map((state) => [state.id, state]))

export default function InventoryWorldMap({
  stateValues,
  siteValues,
  warehouses = [],
  maxValue,
  ariaLabel = '统一世界投影库存热力图：北美和欧洲',
  stateValueLabel = '在库量',
  countryValueLabel = '库存量（在库+在途）',
  stateRatioLabel = '全国占比',
  countryRatioLabel = '占比',
  countryRatios,
}: InventoryWorldMapProps) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const stateTotal = Object.values(stateValues).reduce((sum, value) => sum + value, 0)
  const internationalTotal = Object.values(siteValues).reduce((sum, value) => sum + value, 0)
  const fill = (value: number) => value > 0 ? heatColor(value / Math.max(1, maxValue)) : '#eef1f5'
  const showStateTooltip = (event: MouseEvent<SVGPathElement>, id: string, name: string, value: number) => setTooltip({
    x: event.clientX, y: event.clientY, title: `${stateNamesZh[id] ?? name}（${id}）`, region: stateRegions[id] ?? '—', value, valueLabel: stateValueLabel, ratioLabel: stateRatioLabel, ratio: stateTotal > 0 ? `${((value / stateTotal) * 100).toFixed(1)}%` : '0%',
  })
  const showCountryTooltip = (event: MouseEvent<SVGPathElement>, title: string, region: InternationalRegion, value: number) => setTooltip({
    x: event.clientX, y: event.clientY, title, region, value, valueLabel: countryValueLabel, ratioLabel: countryRatioLabel, ratio: countryRatios?.[region] !== undefined ? `${(countryRatios[region]! * 100).toFixed(1)}%` : internationalTotal > 0 ? `${((value / internationalTotal) * 100).toFixed(1)}%` : '0%',
  })

  return <div style={{ position: 'relative' }}>
    <svg viewBox={inventoryWorldViewBox} role="img" aria-label={ariaLabel} style={{ width: '100%', height: 'auto' }}>
      <rect x="0" y="0" width="1400" height="640" fill="#eef6f6" rx="10"/>
      <text x="470" y="28" textAnchor="middle" className="map-region">北美组（美国 + 加拿大）</text>
      <text x="1220" y="28" textAnchor="middle" className="map-region">欧洲组（英国 + 欧洲大陆）</text>
      <g data-group="north-america">
        <path data-country="加拿大" d={inventoryCanada.path} fill={fill(siteValues.加拿大)} stroke="#ffffff" strokeWidth="0.8"
          onMouseEnter={(event) => showCountryTooltip(event, '加拿大', '加拿大', siteValues.加拿大)} onMouseMove={(event) => showCountryTooltip(event, '加拿大', '加拿大', siteValues.加拿大)} onMouseLeave={() => setTooltip(null)}/>
        {inventoryUsStates.map((state) => {
          const value = stateValues[state.id] ?? 0
          return <path key={state.id} data-state={state.id} d={state.path} fill={fill(value)} stroke="#ffffff" strokeWidth="0.65"
            onMouseEnter={(event) => showStateTooltip(event, state.id, state.name, value)} onMouseMove={(event) => showStateTooltip(event, state.id, state.name, value)} onMouseLeave={() => setTooltip(null)}/>
        })}
        {warehouses.map((warehouse, index) => {
          const state = inventoryStateById.get(warehouse.state.trim().toUpperCase())
          if (!state) return null
          const [x, y] = state.center
          return <g key={`${warehouse.code}-${index}`} transform={`translate(${x} ${y})`}><circle r="4.5" fill="#e0342c" stroke="#fff" strokeWidth="1.4"/><text x="7" y="-5" fontSize="11" fontWeight="700" fill="#1f2937">{warehouse.code}</text></g>
        })}
      </g>
      <g data-group="europe">
        {inventoryEuropeCountries.map((country) => {
          const region: InternationalRegion = country.id === 'United Kingdom' ? '英国' : '欧洲'
          const value = siteValues[region]
          return <path key={country.id} data-country={country.name} d={country.path} fill={fill(value)} stroke="#ffffff" strokeWidth="0.8"
            onMouseEnter={(event) => showCountryTooltip(event, country.name, region, value)} onMouseMove={(event) => showCountryTooltip(event, country.name, region, value)} onMouseLeave={() => setTooltip(null)}/>
        })}
      </g>
      <g pointerEvents="none"><text x={inventoryMapLabels.canada[0]} y={inventoryMapLabels.canada[1] - 8} textAnchor="middle" className="map-region">加拿大</text><text x={inventoryMapLabels.canada[0]} y={inventoryMapLabels.canada[1] + 11} textAnchor="middle" className="map-demand">{siteValues.加拿大.toLocaleString('zh-CN')} 件</text></g>
      <g pointerEvents="none"><text x={inventoryMapLabels.uk[0] - 18} y={inventoryMapLabels.uk[1] - 12} textAnchor="middle" className="map-region">英国</text><text x={inventoryMapLabels.uk[0] - 18} y={inventoryMapLabels.uk[1] + 7} textAnchor="middle" className="map-demand">{siteValues.英国.toLocaleString('zh-CN')} 件</text></g>
      <g pointerEvents="none"><text x={inventoryMapLabels.europe[0] + 18} y={inventoryMapLabels.europe[1] + 105} textAnchor="middle" className="map-region">欧洲</text><text x={inventoryMapLabels.europe[0] + 18} y={inventoryMapLabels.europe[1] + 124} textAnchor="middle" className="map-demand">{siteValues.欧洲.toLocaleString('zh-CN')} 件</text></g>
    </svg>
    {tooltip ? <div role="tooltip" style={{ position: 'fixed', left: tooltip.x + 14, top: tooltip.y + 14, background: 'rgba(24,38,59,0.95)', color: '#fff', padding: '9px 12px', borderRadius: '8px', fontSize: '12px', lineHeight: '1.6', pointerEvents: 'none', zIndex: 50, boxShadow: '0 4px 14px rgba(0,0,0,0.2)' }}>
      <div style={{ fontWeight: 700 }}>{tooltip.title}</div><div>区域：{tooltip.region}</div><div>{tooltip.valueLabel}：{tooltip.value.toLocaleString('zh-CN')} 件</div><div>{tooltip.ratioLabel}：{tooltip.ratio}</div>
    </div> : null}
  </div>
}
