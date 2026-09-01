import { PageHeader } from '../components/Common'
import UsStatesMap from '../components/UsStatesMap'
import WorldMap, { type WorldMapPoint } from '../components/WorldMap'
import { stateRegions } from '../data'
import type { SiteInventorySummary, WarehouseAddress, WarehouseRegion } from '../types'

export default function InventoryHeatmapPage({ siteInventory, stateInventory, addresses }: { siteInventory: SiteInventorySummary[]; stateInventory: Record<string, number>; addresses: WarehouseAddress[] }) {
  const internationalRegions = ['加拿大', '英国', '欧洲'] as const
  const siteInventoryByRegion = new Map(siteInventory.map((row) => [row.region, row.onHand + row.inTransit]))
  const internationalTotal = internationalRegions.reduce((sum, region) => sum + (siteInventoryByRegion.get(region) ?? 0), 0)
  const internationalMax = Math.max(1, ...internationalRegions.map((region) => siteInventoryByRegion.get(region) ?? 0))
  const make = (key: typeof internationalRegions[number], label: string, x: number, y: number): WorldMapPoint => {
    const quantity = siteInventoryByRegion.get(key) ?? 0
    return { key, label, x, y, value: quantity / internationalMax, display: `${quantity.toLocaleString('zh-CN')} 件`, ratioDisplay: internationalTotal > 0 ? `${((quantity / internationalTotal) * 100).toFixed(1)}%` : '0%' }
  }
  const internationalPoints = [make('加拿大', '加拿大', 255, 42), make('英国', '英国', 570, 84), make('欧洲', '欧洲', 790, 176)]
  const usRegionInventory: Record<WarehouseRegion, number> = { 美西: 0, 美中: 0, 美东: 0 }
  Object.entries(stateInventory).forEach(([state, quantity]) => {
    const region = stateRegions[state]
    if (region) usRegionInventory[region] += quantity
  })
  const warehouses = addresses.filter((row) => row.confirmed).map((row) => ({ code: row.code, state: row.state }))
  return <div className="page">
    <PageHeader title="库存热力图" description="美国按仓库地址配置汇总到州，海外库存继续按区域展示" />
    <section className="section map-section">
      <div className="section-heading"><div><h2>美国州级库存分布</h2><p>仅统计配置了有效美国州的在库成品；悬停查看州库存量和占全美库存比例。</p></div></div>
      <div className="map-layout">
        <div className="us-map"><UsStatesMap stateValues={stateInventory} warehouses={warehouses} valueLabel="在库量"/></div>
        <div className="map-side">{(['美西', '美中', '美东'] as WarehouseRegion[]).map((region) => <div className="region-stat" key={region}><span className={`region-dot ${region}`}/><div><strong>{region}</strong><small>在库量</small></div><div className="region-values"><b>{usRegionInventory[region].toLocaleString('zh-CN')} 件</b><small>成品</small></div></div>)}</div>
      </div>
    </section>
    <section className="section map-section">
      <div className="section-heading"><div><h2>加拿大、英国和欧洲库存分布</h2><p>真实国家轮廓按在库量与在途量合计上色；海外仓库不进入美国州级热力及全美库存占比。</p></div></div>
      <div className="map-layout">
        <div className="us-map"><WorldMap points={internationalPoints} valueLabel="库存量（在库+在途）" ariaLabel="加拿大、英国和欧洲库存分布图"/></div>
        <div className="map-side">{internationalPoints.map((point) => <div className="region-stat" key={point.key}><span className="region-dot"/><div><strong>{point.label}</strong><small>在库量+在途量</small></div><div className="region-values"><b>{point.display}</b><small>成品</small></div></div>)}</div>
      </div>
    </section>
  </div>
}
