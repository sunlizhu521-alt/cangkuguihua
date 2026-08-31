import WorldMap, { type WorldMapPoint } from '../components/WorldMap'
import { PageHeader } from '../components/Common'
import type { DemandRegion } from '../types'

export default function InventoryHeatmapPage({ regionInventory }: { regionInventory: Record<DemandRegion, number> }) {
  const max = Math.max(1, ...Object.values(regionInventory))
  const make = (key: DemandRegion, label: string, x: number, y: number): WorldMapPoint => ({ key, label, x, y, value: (regionInventory[key] ?? 0) / max, display: `${(regionInventory[key] ?? 0).toLocaleString('zh-CN')} 件` })
  const points = [make('美西', '美西', 135, 174), make('美中', '美中', 323, 186), make('美东', '美东', 492, 157), make('加拿大', '加拿大', 255, 42), make('英国', '英国', 570, 84), make('欧洲', '欧洲', 790, 176)]
  return <div className="page">
    <PageHeader title="库存热力图" description="各区域在库成品件数，美国按仓库地址配置细分到美西/美中/美东" />
    <section className="section map-section">
      <div className="section-heading"><div><h2>全球库存分布</h2><p>热力圈大小表示在库量相对高低，不等同于需求。</p></div></div>
      <div className="map-layout">
        <div className="us-map"><WorldMap points={points}/></div>
        <div className="map-side">{points.map((point) => <div className="region-stat" key={point.key}><span className="region-dot"/><div><strong>{point.label}</strong><small>在库量</small></div><div className="region-values"><b>{point.display}</b><small>成品</small></div></div>)}</div>
      </div>
    </section>
  </div>
}
