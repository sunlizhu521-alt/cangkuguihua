import { AlertTriangle } from 'lucide-react'
import { PageHeader, StatusTag } from '../components/Common'
import UsStatesMap from '../components/UsStatesMap'
import WorldMap, { type WorldMapPoint } from '../components/WorldMap'
import type { WarehouseAddress, WarehouseRegion } from '../types'
import type { HistoricalSummary } from './ResultsPage'

export default function SalesHeatmapPage({ history, addresses }: { history: HistoricalSummary; addresses: WarehouseAddress[] }) {
  const warehouses = addresses.filter((row) => row.confirmed).map((row) => ({ code: row.code, state: row.state }))
  const internationalPoints: WorldMapPoint[] = [
    { key: '加拿大', label: '加拿大', x: 255, y: 42, value: history.regionDemand['加拿大'] ?? 0, display: `${((history.regionDemand['加拿大'] ?? 0) * 100).toFixed(1)}%` },
    { key: '英国', label: '英国', x: 570, y: 84, value: history.regionDemand['英国'] ?? 0, display: `${((history.regionDemand['英国'] ?? 0) * 100).toFixed(1)}%` },
    { key: '欧洲', label: '欧洲', x: 790, y: 176, value: history.regionDemand['欧洲'] ?? 0, display: `${((history.regionDemand['欧洲'] ?? 0) * 100).toFixed(1)}%` },
  ]
  return <div className="page">
    <PageHeader title="销售热力图" description="历史订单在各区域的占比，按邮编与国别识别" />
    <section className="section map-section">
      <div className="section-heading"><div><h2>美国州级销售需求分布</h2><p>邮编前3位映射到州；悬停查看州订单量和占全美订单比例。</p></div><StatusTag tone={history.postcodeCoverage >= 0.8 ? 'success' : 'warning'}>有效邮编覆盖率 {(history.postcodeCoverage * 100).toFixed(1)}%</StatusTag></div>
      <div className="map-layout">
        <div className="us-map"><UsStatesMap stateValues={history.stateDemand} warehouses={warehouses} valueLabel="订单量"/></div>
        <div className="map-side">
          {(['美西', '美中', '美东'] as WarehouseRegion[]).map((region) => <div className="region-stat" key={region}><span className={`region-dot ${region}`}/><div><strong>{region}</strong><small>历史需求占比</small></div><div className="region-values"><b>{((history.regionDemand[region] ?? 0) * 100).toFixed(1)}%</b><small>历史订单</small></div></div>)}
          {history.messages.map((message) => <div className="map-warning" key={message}><AlertTriangle size={15}/>{message}</div>)}
        </div>
      </div>
    </section>
    <section className="section map-section">
      <div className="section-heading"><div><h2>加拿大、英国和欧洲需求分布</h2><p>保留现有海外区域热力展示，不计入美国州级全国占比。</p></div></div>
      <div className="map-layout">
        <div className="us-map"><WorldMap points={internationalPoints}/></div>
        <div className="map-side">{internationalPoints.map((point) => <div className="region-stat" key={point.key}><span className="region-dot"/><div><strong>{point.label}</strong><small>历史需求占比</small></div><div className="region-values"><b>{point.display}</b><small>历史订单</small></div></div>)}</div>
      </div>
    </section>
  </div>
}
