import { RefreshCw } from 'lucide-react'
import { PageHeader } from '../components/Common'
import HeatmapSkuDetailTable from '../components/HeatmapSkuDetailTable'
import InventoryWorldMap from '../components/InventoryWorldMap'
import { stateRegions } from '../data'
import type { InventoryHeatmapSkuDetail, SiteInventorySummary, WarehouseAddress, WarehouseRegion } from '../types'

export default function InventoryHeatmapPage({ siteInventory, stateInventory, addresses, details, loading, onLoad }: { siteInventory: SiteInventorySummary[]; stateInventory: Record<string, number>; addresses: WarehouseAddress[]; details: InventoryHeatmapSkuDetail[]; loading: boolean; onLoad: () => Promise<void> }) {
  const internationalRegions = ['加拿大', '英国', '欧洲'] as const
  const siteInventoryByRegion = new Map(siteInventory.map((row) => [row.region, row.onHand + row.inTransit]))
  const internationalTotal = internationalRegions.reduce((sum, region) => sum + (siteInventoryByRegion.get(region) ?? 0), 0)
  const inventoryHeatMax = Math.max(1, ...Object.values(stateInventory), ...internationalRegions.map((region) => siteInventoryByRegion.get(region) ?? 0))
  const internationalInventory = { 加拿大: siteInventoryByRegion.get('加拿大') ?? 0, 英国: siteInventoryByRegion.get('英国') ?? 0, 欧洲: siteInventoryByRegion.get('欧洲') ?? 0 }
  const usRegionInventory: Record<WarehouseRegion, number> = { 美西: 0, 美中: 0, 美东: 0 }
  Object.entries(stateInventory).forEach(([state, quantity]) => {
    const region = stateRegions[state]
    if (region) usRegionInventory[region] += quantity
  })
  const warehouses = addresses.filter((row) => row.confirmed).map((row) => ({ code: row.code, state: row.state }))
  return <div className="page">
    <PageHeader title="库存热力图" description="美国、加拿大、英国和欧洲使用同一世界投影，按真实地理关系展示" actions={<button type="button" className="button primary" disabled={loading} onClick={() => void onLoad()}><RefreshCw className={loading ? 'spin' : undefined} size={17}/>{loading ? '计算中…' : '加载计算'}</button>} />
    <section className="section map-section">
      <div className="section-heading"><div><h2>北美与欧洲库存地理分布</h2><p>加拿大位于美国上方，英国位于欧洲大陆旁；全图使用同一投影和库存色阶。美国州显示在库量，海外区域显示在库量与在途量合计。</p></div></div>
      <div className="map-layout heatmap-wide-layout">
        <div className="us-map" style={{ alignSelf: 'start' }}><InventoryWorldMap stateValues={stateInventory} siteValues={internationalInventory} warehouses={warehouses} maxValue={inventoryHeatMax}/></div>
        <div className="map-side">
          {(['美西', '美中', '美东'] as WarehouseRegion[]).map((region) => <div className="region-stat" key={region}><span className={`region-dot ${region}`}/><div><strong>{region}</strong><small>美国州在库量</small></div><div className="region-values"><b>{usRegionInventory[region].toLocaleString('zh-CN')} 件</b><small>成品</small></div></div>)}
          {internationalRegions.map((region) => <div className="region-stat" key={region}><span className="region-dot"/><div><strong>{region}</strong><small>在库量+在途量</small></div><div className="region-values"><b>{internationalInventory[region].toLocaleString('zh-CN')} 件</b><small>{internationalTotal > 0 ? `${((internationalInventory[region] / internationalTotal) * 100).toFixed(1)}%` : '0%'}</small></div></div>)}
        </div>
      </div>
    </section>
    <HeatmapSkuDetailTable mode="inventory" rows={details}/>
  </div>
}
