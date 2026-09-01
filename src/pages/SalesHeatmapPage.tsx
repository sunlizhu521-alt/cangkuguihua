import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader, StatusTag } from '../components/Common'
import HeatmapDimensionFilters, { emptyHeatmapDimensionFilters, hasHeatmapDimensionFilters, matchesHeatmapDimensionFilters } from '../components/HeatmapDimensionFilters'
import HeatmapSkuDetailTable from '../components/HeatmapSkuDetailTable'
import UnifiedWorldMap from '../components/InventoryWorldMap'
import type { DemandRegion, SalesHeatmapLocationDetail, SalesHeatmapSkuDetail, WarehouseAddress, WarehouseRegion } from '../types'
import type { HistoricalSummary } from './ResultsPage'

const emptyRegionAmounts: Record<DemandRegion, number> = { 美西: 0, 美中: 0, 美东: 0, 加拿大: 0, 英国: 0, 欧洲: 0 }

function updateSalesRatios(rows: SalesHeatmapSkuDetail[]) {
  const allTotal = rows.reduce((sum, row) => sum + row.orderQuantity, 0)
  const usTotal = rows.filter((row) => ['美西', '美中', '美东'].includes(row.region)).reduce((sum, row) => sum + row.orderQuantity, 0)
  return rows.map((row) => ({ ...row, ratio: ['美西', '美中', '美东'].includes(row.region) ? (usTotal ? row.orderQuantity / usTotal : 0) : (allTotal ? row.orderQuantity / allTotal : 0) }))
}

export default function SalesHeatmapPage({ history, addresses, details, locationDetails = [], loading, onLoad }: { history: HistoricalSummary; addresses: WarehouseAddress[]; details: SalesHeatmapSkuDetail[]; locationDetails?: SalesHeatmapLocationDetail[]; loading: boolean; onLoad: () => Promise<void> }) {
  const [filters, setFilters] = useState(emptyHeatmapDimensionFilters)
  const filtersActive = hasHeatmapDimensionFilters(filters)
  const filteredDetails = useMemo(() => updateSalesRatios(details.filter((row) => matchesHeatmapDimensionFilters(row, filters))), [details, filters])
  const filteredLocations = useMemo(() => locationDetails.filter((row) => matchesHeatmapDimensionFilters(row, filters)), [filters, locationDetails])
  const filteredMap = useMemo(() => {
    if (!filtersActive) return { stateDemand: history.stateDemand, regionAmounts: history.regionDemandAmount, regionRatios: history.regionDemand }
    const stateDemand: Record<string, number> = {}
    const regionAmounts = { ...emptyRegionAmounts }
    for (const row of filteredLocations) {
      regionAmounts[row.region] += row.orderQuantity
      if (row.state) stateDemand[row.state] = (stateDemand[row.state] ?? 0) + row.orderQuantity
    }
    const total = Object.values(regionAmounts).reduce((sum, value) => sum + value, 0)
    const regionRatios = { ...emptyRegionAmounts }
    ;(Object.keys(regionRatios) as DemandRegion[]).forEach((region) => { regionRatios[region] = total ? regionAmounts[region] / total : 0 })
    return { stateDemand, regionAmounts, regionRatios }
  }, [filteredLocations, filtersActive, history.regionDemand, history.regionDemandAmount, history.stateDemand])
  const warehouses = addresses.filter((row) => row.confirmed).map((row) => ({ code: row.code, state: row.state }))
  const internationalRegions = ['加拿大', '英国', '欧洲'] as const
  const internationalDemand = {
    加拿大: filteredMap.regionAmounts.加拿大 ?? 0,
    英国: filteredMap.regionAmounts.英国 ?? 0,
    欧洲: filteredMap.regionAmounts.欧洲 ?? 0,
  }
  const salesHeatMax = Math.max(1, ...Object.values(filteredMap.stateDemand), ...Object.values(internationalDemand))
  const channelByRegion = new Map<keyof typeof history.regionDemand, { amazonQuantity: number; merchantQuantity: number }>()
  filteredDetails.forEach((row) => {
    const current = channelByRegion.get(row.region) ?? { amazonQuantity: 0, merchantQuantity: 0 }
    current.amazonQuantity += row.amazonQuantity ?? 0
    current.merchantQuantity += row.merchantQuantity ?? 0
    channelByRegion.set(row.region, current)
  })
  const channelText = (region: keyof typeof history.regionDemand) => {
    const value = channelByRegion.get(region)
    return `亚马逊仓配 ${value?.amazonQuantity.toLocaleString('zh-CN') ?? 0} · 商家自发货 ${value?.merchantQuantity.toLocaleString('zh-CN') ?? 0}`
  }
  return <div className="page">
    <PageHeader title="销售热力图" description="汇总亚马逊仓配发货与商家自发货，并分别保留两类发货数量" actions={<button type="button" className="button primary" disabled={loading} onClick={() => void onLoad()}><RefreshCw className={loading ? 'spin' : undefined} size={17}/>{loading ? '计算中…' : '加载计算'}</button>} />
    <section className="section map-section">
      <div className="section-heading"><div><h2>北美与欧洲销售需求地理分布</h2><p>美国按州级订单量上色，英国单独统计，其余欧洲国家共用欧洲订单量；全图采用同一投影和色阶。</p></div><StatusTag tone={history.postcodeCoverage >= 0.8 ? 'success' : 'warning'}>有效邮编覆盖率 {(history.postcodeCoverage * 100).toFixed(1)}%</StatusTag></div>
      <HeatmapDimensionFilters rows={locationDetails.length ? locationDetails : details} value={filters} onChange={setFilters}/>
      {filtersActive && !locationDetails.length ? <div className="map-warning"><AlertTriangle size={15}/>当前是旧版热力图快照，请点击“加载计算”后再按商品维度筛选地图。</div> : null}
      <div className="map-layout heatmap-wide-layout">
        <div className="us-map" style={{ alignSelf: 'start' }}><UnifiedWorldMap stateValues={filteredMap.stateDemand} siteValues={internationalDemand} warehouses={warehouses} maxValue={salesHeatMax} ariaLabel="统一世界投影销售热力图：北美和欧洲" stateValueLabel="订单量" countryValueLabel="订单量" countryRatioLabel="全部有效订单占比" countryRatios={{ 加拿大: filteredMap.regionRatios.加拿大, 英国: filteredMap.regionRatios.英国, 欧洲: filteredMap.regionRatios.欧洲 }}/></div>
        <div className="map-side">
          {(['美西', '美中', '美东'] as WarehouseRegion[]).map((region) => <div className="region-stat" key={region}><span className={`region-dot ${region}`}/><div><strong>{region}</strong><small>{channelText(region)}</small></div><div className="region-values"><b>{((filteredMap.regionRatios[region] ?? 0) * 100).toFixed(1)}%</b><small>合计历史发货</small></div></div>)}
          {internationalRegions.map((region) => <div className="region-stat" key={region}><span className="region-dot"/><div><strong>{region}</strong><small>{channelText(region)}</small></div><div className="region-values"><b>{((filteredMap.regionRatios[region] ?? 0) * 100).toFixed(1)}%</b><small>{internationalDemand[region] > 0 ? `合计 ${internationalDemand[region].toLocaleString('zh-CN')} 件` : '无订单数据'}</small></div></div>)}
          {history.messages.map((message) => <div className="map-warning" key={message}><AlertTriangle size={15}/>{message}</div>)}
        </div>
      </div>
    </section>
    <HeatmapSkuDetailTable mode="sales" rows={filteredDetails}/>
  </div>
}
