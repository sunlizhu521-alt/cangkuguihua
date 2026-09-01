import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Common'
import HeatmapDimensionFilters, { emptyHeatmapDetailFilters, emptyHeatmapDimensionFilters, hasHeatmapDimensionFilters, matchesHeatmapDimensionFilters } from '../components/HeatmapDimensionFilters'
import HeatmapSkuDetailTable from '../components/HeatmapSkuDetailTable'
import InventoryWorldMap from '../components/InventoryWorldMap'
import { stateRegions } from '../data'
import type { DemandRegion, InventoryHeatmapLocationDetail, InventoryHeatmapSkuDetail, SiteInventorySummary, WarehouseAddress, WarehouseRegion } from '../types'

function updateInventoryRatios(rows: InventoryHeatmapSkuDetail[]) {
  const allTotal = rows.reduce((sum, row) => sum + row.total, 0)
  const usTotal = rows.filter((row) => ['美西', '美中', '美东'].includes(row.region)).reduce((sum, row) => sum + row.total, 0)
  return rows.map((row) => ({ ...row, ratio: ['美西', '美中', '美东'].includes(row.region) ? (usTotal ? row.total / usTotal : 0) : (allTotal ? row.total / allTotal : 0) }))
}

export default function InventoryHeatmapPage({ siteInventory, regionInventory, stateInventory, addresses, details, locationDetails = [], loading, onLoad }: { siteInventory: SiteInventorySummary[]; regionInventory?: Record<DemandRegion, number>; stateInventory: Record<string, number>; addresses: WarehouseAddress[]; details: InventoryHeatmapSkuDetail[]; locationDetails?: InventoryHeatmapLocationDetail[]; loading: boolean; onLoad: () => Promise<void> }) {
  const [filters, setFilters] = useState(emptyHeatmapDimensionFilters)
  const [detailFilters, setDetailFilters] = useState(emptyHeatmapDetailFilters)
  const filtersActive = hasHeatmapDimensionFilters(filters)
  const filteredDetails = useMemo(() => updateInventoryRatios(details.filter((row) => matchesHeatmapDimensionFilters(row, filters))), [details, filters])
  const filteredLocations = useMemo(() => locationDetails.filter((row) => matchesHeatmapDimensionFilters(row, filters)), [filters, locationDetails])
  const internationalRegions = ['加拿大', '英国', '欧洲'] as const
  const siteInventoryByRegion = new Map(siteInventory.map((row) => [row.region, row.onHand + row.inTransit]))
  const filteredMap = useMemo(() => {
    const usRegionInventory: Record<WarehouseRegion, number> = { 美西: 0, 美中: 0, 美东: 0 }
    if (!filtersActive) {
      if (regionInventory) (Object.keys(usRegionInventory) as WarehouseRegion[]).forEach((region) => { usRegionInventory[region] = regionInventory[region] ?? 0 })
      else Object.entries(stateInventory).forEach(([state, quantity]) => {
          const region = stateRegions[state]
          if (region) usRegionInventory[region] += quantity
        })
      return {
        stateInventory,
        internationalInventory: { 加拿大: siteInventoryByRegion.get('加拿大') ?? 0, 英国: siteInventoryByRegion.get('英国') ?? 0, 欧洲: siteInventoryByRegion.get('欧洲') ?? 0 },
        usRegionInventory,
        usSiteInventory: siteInventoryByRegion.get('美国') ?? 0,
      }
    }
    const nextStateInventory: Record<string, number> = {}
    const internationalInventory = { 加拿大: 0, 英国: 0, 欧洲: 0 }
    let usSiteInventory = 0
    for (const row of filteredLocations) {
      if (row.state) {
        nextStateInventory[row.state] = (nextStateInventory[row.state] ?? 0) + row.onHand
        if (row.region === '美西' || row.region === '美中' || row.region === '美东') usRegionInventory[row.region] += row.onHand
        usSiteInventory += row.total
      } else if (row.region === '美西' || row.region === '美中' || row.region === '美东') {
        usRegionInventory[row.region] += row.onHand
        usSiteInventory += row.total
      } else if (row.region === '加拿大' || row.region === '英国' || row.region === '欧洲') internationalInventory[row.region] += row.total
    }
    return { stateInventory: nextStateInventory, internationalInventory, usRegionInventory, usSiteInventory }
  }, [filteredLocations, filtersActive, siteInventoryByRegion, stateInventory])
  const internationalTotal = internationalRegions.reduce((sum, region) => sum + filteredMap.internationalInventory[region], 0)
  const mappedUsInventory = Object.values(filteredMap.stateInventory).reduce((sum, quantity) => sum + quantity, 0)
  const inventoryHeatMax = Math.max(1, ...Object.values(filteredMap.stateInventory), ...Object.values(filteredMap.internationalInventory))
  const warehouses = addresses.filter((row) => row.confirmed).map((row) => ({ code: row.code, state: row.state }))
  return <div className="page">
    <PageHeader title="库存热力图" description="美国、加拿大、英国和欧洲使用同一世界投影，按真实地理关系展示" actions={<button type="button" className="button primary" disabled={loading} onClick={() => void onLoad()}><RefreshCw className={loading ? 'spin' : undefined} size={17}/>{loading ? '计算中…' : '加载计算'}</button>} />
    <section className="section map-section">
      <div className="section-heading"><div><h2>北美与欧洲库存地理分布</h2><p>加拿大位于美国上方，英国位于欧洲大陆旁；全图使用同一投影和库存色阶。美国州显示在库量，海外区域显示在库量与在途量合计。</p></div></div>
      <HeatmapDimensionFilters rows={locationDetails.length ? locationDetails : details} value={filters} onChange={setFilters} detailValue={detailFilters} onDetailChange={setDetailFilters}/>
      {filtersActive && !locationDetails.length ? <div className="map-warning"><AlertTriangle size={15}/>当前是旧版热力图快照，请点击“加载计算”后再按商品维度筛选地图。</div> : null}
      <div className="map-layout heatmap-wide-layout">
        <div className="us-map" style={{ alignSelf: 'start' }}><InventoryWorldMap stateValues={filteredMap.stateInventory} siteValues={filteredMap.internationalInventory} warehouses={warehouses} maxValue={inventoryHeatMax}/></div>
        <div className="map-side">
          {(['美西', '美中', '美东'] as WarehouseRegion[]).map((region) => <div className="region-stat" key={region}><span className={`region-dot ${region}`}/><div><strong>{region}</strong><small>美国州在库量</small></div><div className="region-values"><b>{filteredMap.usRegionInventory[region].toLocaleString('zh-CN')} 件</b><small>成品</small></div></div>)}
          {filteredMap.usSiteInventory > 0 && mappedUsInventory === 0 ? <div className="map-warning"><AlertTriangle size={15}/>已读取美国库存 {filteredMap.usSiteInventory.toLocaleString('zh-CN')} 件，但没有匹配到仓库州配置。请将仓库维度“仓库”映射到真实编码，并在分析设置中用相同编码补充州。</div> : null}
          {internationalRegions.map((region) => <div className="region-stat" key={region}><span className="region-dot"/><div><strong>{region}</strong><small>在库量+在途量</small></div><div className="region-values"><b>{filteredMap.internationalInventory[region].toLocaleString('zh-CN')} 件</b><small>{internationalTotal > 0 ? `${((filteredMap.internationalInventory[region] / internationalTotal) * 100).toFixed(1)}%` : '0%'}</small></div></div>)}
        </div>
      </div>
    </section>
    <HeatmapSkuDetailTable mode="inventory" rows={filteredDetails} filters={detailFilters}/>
  </div>
}
