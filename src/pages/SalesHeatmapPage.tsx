import { AlertTriangle, RefreshCw } from 'lucide-react'
import { PageHeader, StatusTag } from '../components/Common'
import HeatmapSkuDetailTable from '../components/HeatmapSkuDetailTable'
import UnifiedWorldMap from '../components/InventoryWorldMap'
import type { SalesHeatmapSkuDetail, WarehouseAddress, WarehouseRegion } from '../types'
import type { HistoricalSummary } from './ResultsPage'

export default function SalesHeatmapPage({ history, addresses, details, loading, onLoad }: { history: HistoricalSummary; addresses: WarehouseAddress[]; details: SalesHeatmapSkuDetail[]; loading: boolean; onLoad: () => Promise<void> }) {
  const warehouses = addresses.filter((row) => row.confirmed).map((row) => ({ code: row.code, state: row.state }))
  const internationalRegions = ['加拿大', '英国', '欧洲'] as const
  const internationalDemand = {
    加拿大: history.regionDemandAmount.加拿大 ?? 0,
    英国: history.regionDemandAmount.英国 ?? 0,
    欧洲: history.regionDemandAmount.欧洲 ?? 0,
  }
  const salesHeatMax = Math.max(1, ...Object.values(history.stateDemand), ...Object.values(internationalDemand))
  return <div className="page">
    <PageHeader title="销售热力图" description="美国、加拿大、英国和欧洲使用同一世界投影，按真实地理关系展示历史订单" actions={<button type="button" className="button primary" disabled={loading} onClick={() => void onLoad()}><RefreshCw className={loading ? 'spin' : undefined} size={17}/>{loading ? '计算中…' : '加载计算'}</button>} />
    <section className="section map-section">
      <div className="section-heading"><div><h2>北美与欧洲销售需求地理分布</h2><p>美国按州级订单量上色，英国单独统计，其余欧洲国家共用欧洲订单量；全图采用同一投影和色阶。</p></div><StatusTag tone={history.postcodeCoverage >= 0.8 ? 'success' : 'warning'}>有效邮编覆盖率 {(history.postcodeCoverage * 100).toFixed(1)}%</StatusTag></div>
      <div className="map-layout heatmap-wide-layout">
        <div className="us-map" style={{ alignSelf: 'start' }}><UnifiedWorldMap stateValues={history.stateDemand} siteValues={internationalDemand} warehouses={warehouses} maxValue={salesHeatMax} ariaLabel="统一世界投影销售热力图：北美和欧洲" stateValueLabel="订单量" countryValueLabel="订单量" countryRatioLabel="全部有效订单占比" countryRatios={{ 加拿大: history.regionDemand.加拿大, 英国: history.regionDemand.英国, 欧洲: history.regionDemand.欧洲 }}/></div>
        <div className="map-side">
          {(['美西', '美中', '美东'] as WarehouseRegion[]).map((region) => <div className="region-stat" key={region}><span className={`region-dot ${region}`}/><div><strong>{region}</strong><small>历史需求占比</small></div><div className="region-values"><b>{((history.regionDemand[region] ?? 0) * 100).toFixed(1)}%</b><small>历史订单</small></div></div>)}
          {internationalRegions.map((region) => <div className="region-stat" key={region}><span className="region-dot"/><div><strong>{region}</strong><small>历史需求占比</small></div><div className="region-values"><b>{((history.regionDemand[region] ?? 0) * 100).toFixed(1)}%</b><small>{internationalDemand[region] > 0 ? `${internationalDemand[region].toLocaleString('zh-CN')} 件` : '无订单数据'}</small></div></div>)}
          {history.messages.map((message) => <div className="map-warning" key={message}><AlertTriangle size={15}/>{message}</div>)}
        </div>
      </div>
    </section>
    <HeatmapSkuDetailTable mode="sales" rows={details}/>
  </div>
}
