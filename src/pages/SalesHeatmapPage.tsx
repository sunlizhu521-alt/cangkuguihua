import WorldMap, { type WorldMapPoint } from '../components/WorldMap'
import { PageHeader, StatusTag } from '../components/Common'
import { AlertTriangle } from 'lucide-react'
import type { HistoricalSummary } from './ResultsPage'

export default function SalesHeatmapPage({ history }: { history: HistoricalSummary }) {
  const points: WorldMapPoint[] = [
    { key: '美西', label: '美西', x: 135, y: 174, value: history.regionDemand['美西'] ?? 0, display: `${((history.regionDemand['美西'] ?? 0) * 100).toFixed(1)}%` },
    { key: '美中', label: '美中', x: 323, y: 186, value: history.regionDemand['美中'] ?? 0, display: `${((history.regionDemand['美中'] ?? 0) * 100).toFixed(1)}%` },
    { key: '美东', label: '美东', x: 492, y: 157, value: history.regionDemand['美东'] ?? 0, display: `${((history.regionDemand['美东'] ?? 0) * 100).toFixed(1)}%` },
    { key: '加拿大', label: '加拿大', x: 255, y: 42, value: history.regionDemand['加拿大'] ?? 0, display: `${((history.regionDemand['加拿大'] ?? 0) * 100).toFixed(1)}%` },
    { key: '英国', label: '英国', x: 570, y: 84, value: history.regionDemand['英国'] ?? 0, display: `${((history.regionDemand['英国'] ?? 0) * 100).toFixed(1)}%` },
    { key: '欧洲', label: '欧洲', x: 790, y: 176, value: history.regionDemand['欧洲'] ?? 0, display: `${((history.regionDemand['欧洲'] ?? 0) * 100).toFixed(1)}%` },
  ]
  return <div className="page">
    <PageHeader title="销售热力图" description="历史订单在各区域的占比，按邮编与国别识别" />
    <section className="section map-section">
      <div className="section-heading"><div><h2>全球销售需求分布</h2><p>热力表示历史订单占比，不等同于库存数量。</p></div><StatusTag tone={history.postcodeCoverage >= 0.8 ? 'success' : 'warning'}>有效邮编覆盖率 {(history.postcodeCoverage * 100).toFixed(1)}%</StatusTag></div>
      <div className="map-layout">
        <div className="us-map"><WorldMap points={points}/></div>
        <div className="map-side">
          {points.map((point) => <div className="region-stat" key={point.key}><span className="region-dot"/><div><strong>{point.label}</strong><small>历史需求占比</small></div><div className="region-values"><b>{point.display}</b><small>历史订单</small></div></div>)}
          {history.messages.map((message) => <div className="map-warning" key={message}><AlertTriangle size={15}/>{message}</div>)}
        </div>
      </div>
    </section>
  </div>
}
