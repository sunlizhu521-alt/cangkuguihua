import { useMemo, useState } from 'react'
import { AlertTriangle, Calculator, Download, MapPinned, PackageSearch, Plus, Route } from 'lucide-react'
import type { AnalysisResult, DemandRegion, ManualTransferQuote, SiteInventorySummary, SiteRegion, WarehouseAddress, WarehouseRegion } from '../types'
import { EmptyState, Money, PageHeader, StatusTag } from '../components/Common'

export interface HistoricalSummary {
  channelAmazonShare: number
  channelMerchantShare: number
  postcodeCoverage: number
  regionDemand: Record<DemandRegion, number>
  siteDailyDemand: Record<SiteRegion, number>
  commonDateRange?: string
  messages: string[]
}

export default function ResultsPage({ results, addresses, manualQuotes, history, siteInventory, running, onRun, onAddManualQuote, onDeleteManualQuote, onExport }: {
  results: AnalysisResult[]
  addresses: WarehouseAddress[]
  manualQuotes: ManualTransferQuote[]
  history: HistoricalSummary
  siteInventory: SiteInventorySummary[]
  running: boolean
  onRun: () => void
  onAddManualQuote: (quote: ManualTransferQuote) => void
  onDeleteManualQuote: (id?: number) => void
  onExport: () => void
}) {
  return <div className="page results-page">
    <PageHeader title="分析结果" description="比较不调拨与不同调拨数量的完整费用，自动选择有效成本更低的中转资源" actions={<><button className="button secondary" disabled={!results.length} onClick={onExport}><Download size={17}/>导出Excel</button><button className="button primary" disabled={running} onClick={onRun}><Calculator size={17}/>{running ? '正在测算…' : '重新测算'}</button></>} />
    <SummaryCards results={results} history={history}/>
    <WarehouseMap addresses={addresses} results={results} history={history}/>
    <EuropeDemandMap history={history}/>
    <SiteInventorySection siteInventory={siteInventory}/>
    <PreAnalysis results={results}/>
    <ManualQuotePanel quotes={manualQuotes} results={results} onAdd={onAddManualQuote} onDelete={onDeleteManualQuote}/>
    <ResultTable results={results}/>
  </div>
}

function SummaryCards({ results, history }: { results: AnalysisResult[]; history: HistoricalSummary }) {
  const transferCount = results.filter((row) => row.decision === '建议调拨').length
  const savings = results.reduce((sum, row) => sum + Math.max(0, row.savings), 0)
  return <div className="metric-grid"><div className="metric-card"><span>建议调拨销售系列</span><strong>{transferCount}</strong><small>共分析 {results.length} 个销售系列与原仓组合</small></div><div className="metric-card"><span>预计总节省</span><strong><Money value={savings}/></strong><small>节省金额与比例同时达标</small></div><div className="metric-card"><span>有效邮编覆盖率</span><strong>{(history.postcodeCoverage * 100).toFixed(1)}%</strong><small>{history.commonDateRange ?? '历史出库共同区间待补充'}</small></div><div className="metric-card"><span>历史履约结构</span><strong className="channel-share">{(history.channelAmazonShare * 100).toFixed(0)}% / {(history.channelMerchantShare * 100).toFixed(0)}%</strong><small>亚马逊仓配 / 商家自发货</small></div></div>
}

function WarehouseMap({ addresses, results, history }: { addresses: WarehouseAddress[]; results: AnalysisResult[]; history: HistoricalSummary }) {
  const suggested = useMemo(() => ({
    美西: results.filter((row) => row.region === '美西').reduce((sum, row) => sum + row.initialQuantity - row.transferQuantity, 0),
    美中: results.filter((row) => row.region === '美中').reduce((sum, row) => sum + row.initialQuantity - row.transferQuantity, 0),
    美东: results.filter((row) => row.region === '美东').reduce((sum, row) => sum + row.initialQuantity - row.transferQuantity, 0),
  }), [results])
  const points: Record<WarehouseRegion, [number, number]> = { 美西: [135, 174], 美中: [323, 186], 美东: [492, 157] }
  const path = 'M54 91l35-19 49 7 41-20 57 23 46-8 48 19 45-2 41 22 46-11 47 23 30 39-12 38-37 7-31 39-38 18-46-4-46 28-39-17-61 12-48-28-27-51-42-25z'
  return <section className="section map-section"><div className="section-heading"><div><h2><MapPinned size={20}/>美国仓库与需求分布</h2><p>热力表示历史订单在各区域的占比，不等同于仓库库存数量。</p></div><StatusTag tone={history.postcodeCoverage >= .8 ? 'success' : 'warning'}>有效邮编覆盖率 {(history.postcodeCoverage * 100).toFixed(1)}%</StatusTag></div>
    <div className="map-layout"><div className="us-map"><svg viewBox="0 0 600 340" role="img" aria-label="美国美西、美中、美东仓库分布图"><defs><clipPath id="country"><path d={path}/></clipPath></defs><g clipPath="url(#country)"><rect x="20" y="40" width="205" height="260" fill="#d8f4ef"/><rect x="225" y="40" width="185" height="260" fill="#c9ebe7"/><rect x="410" y="40" width="160" height="260" fill="#b6dedb"/></g><path d={path} fill="none" stroke="#66918e" strokeWidth="2"/><path d="M225 78v205M410 96v164" stroke="#fff" strokeWidth="2" strokeDasharray="5 5"/>{(['美西','美中','美东'] as WarehouseRegion[]).map((region) => { const [x,y] = points[region]; const demand = history.regionDemand[region] ?? 0; return <g key={region}><circle cx={x} cy={y} r={22 + demand * 30} fill="#13a89e" fillOpacity={.18 + demand * .35}/><circle cx={x} cy={y} r="7" fill="#087e78" stroke="white" strokeWidth="3"/><text x={x} y={y - 39} textAnchor="middle" className="map-region">{region}</text><text x={x} y={y + 45} textAnchor="middle" className="map-demand">历史需求 {(demand * 100).toFixed(1)}%</text></g>})}{addresses.filter((row) => row.confirmed).map((address, index) => { const region = address.confirmedRegion ?? address.suggestedRegion; const [x,y] = points[region]; return <g key={`${address.code}-${index}`} transform={`translate(${x + (index % 3 - 1) * 18} ${y + 15 + Math.floor(index / 3) * 16})`}><rect x="-31" y="-9" width="62" height="18" rx="9" fill="#fff" stroke="#157f79"/><text textAnchor="middle" dominantBaseline="central" className="map-label">{address.code}</text></g>})}</svg></div>
      <div className="map-side">{(['美西','美中','美东'] as WarehouseRegion[]).map((region) => <div className="region-stat" key={region}><span className={`region-dot ${region}`}/><div><strong>{region}</strong><small>{addresses.filter((row) => row.confirmedRegion === region).length} 个已确认仓库</small></div><div className="region-values"><b>{Math.round(suggested[region]).toLocaleString('zh-CN')}</b><small>建议期末库存</small></div></div>)}<div className="state-detail"><strong>州级仓库明细</strong>{addresses.filter((row) => row.confirmed).map((row) => <span key={row.code}><b>{row.state || '州待补充'}</b>{row.name}（{row.code}）</span>)}</div>{history.messages.map((message) => <div className="map-warning" key={message}><AlertTriangle size={15}/>{message}</div>)}</div></div>
  </section>
}

function PreAnalysis({ results }: { results: AnalysisResult[] }) {
  const rows = results.filter((row) => row.destinationWarehouse)
  return <section className="section"><div className="section-heading"><div><h2><PackageSearch size={20}/>预分析询价清单</h2><p>先按候选路线取得自行寻找的承运商报价，再录入下方重新测算。</p></div></div>{!rows.length ? <EmptyState title="暂无候选调拨路线" description="上传并映射库存、预测、仓库及包装参数后运行测算。"/> : <div className="table-frame"><table><thead><tr><th>原仓</th><th>目的仓</th><th>销售系列</th><th>候选件数</th><th>整箱数量</th><th>总重量（千克）</th><th>体积（立方米）</th><th>物流商中转参考费用</th><th>预计运输天数</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.originWarehouse}</td><td>{row.destinationWarehouse}</td><td>{row.series}</td><td>{row.transferQuantity || row.initialQuantity}</td><td>{row.cartonCount ?? '包装参数待补充'}</td><td>{row.weightKg.toFixed(2)}</td><td>{row.volumeCubicMeters.toFixed(3)}</td><td><Money value={row.transferCost.transfer}/></td><td>{row.transitDays || '待询价'}</td></tr>)}</tbody></table></div>}</section>
}

function ManualQuotePanel({ quotes, results, onAdd, onDelete }: { quotes: ManualTransferQuote[]; results: AnalysisResult[]; onAdd: (quote: ManualTransferQuote) => void; onDelete: (id?: number) => void }) {
  const routes = [...new Map(results.filter((row) => row.destinationWarehouse).map((row) => [`${row.originWarehouse}→${row.destinationWarehouse}`, row])).values()]
  const initialRoute = routes[0]
  const blank = (): ManualTransferQuote => ({ carrier: '', originWarehouse: initialRoute?.originWarehouse ?? '', destinationWarehouse: initialRoute?.destinationWarehouse ?? '', quantity: initialRoute?.transferQuantity || initialRoute?.initialQuantity || 0, volumeCubicMeters: initialRoute?.volumeCubicMeters || 0, priceMode: '总价', price: 0, currency: '人民币', transitDays: 0, scope: '仅运输费', quoteDate: new Date().toISOString().slice(0,10), expiresAt: '', notes: '' })
  const [draft, setDraft] = useState(blank)
  const update = (patch: Partial<ManualTransferQuote>) => setDraft((value) => ({ ...value, ...patch }))
  return <section className="section manual-section"><div className="section-heading"><div><h2><Route size={20}/>自行寻找中转报价</h2><p>总价仅适用于所填体积；每立方米单价按实际体积计算。全包价不会重复计算出库费和入库费。</p></div></div>
    <div className="manual-form form-grid four"><label>承运商名称<input value={draft.carrier} onChange={(event) => update({ carrier: event.target.value })}/></label><label>原仓<input value={draft.originWarehouse} onChange={(event) => update({ originWarehouse: event.target.value })}/></label><label>目的仓<input value={draft.destinationWarehouse} onChange={(event) => update({ destinationWarehouse: event.target.value })}/></label><label>报价对应件数<input type="number" min="1" value={draft.quantity} onChange={(event) => update({ quantity: Number(event.target.value) })}/></label><label>报价对应体积（立方米）<input type="number" min="0" step="0.001" value={draft.volumeCubicMeters} onChange={(event) => update({ volumeCubicMeters: Number(event.target.value) })}/></label><label>报价方式<select value={draft.priceMode} onChange={(event) => update({ priceMode: event.target.value as ManualTransferQuote['priceMode'] })}><option>总价</option><option>每立方米单价</option></select></label><label>金额<input type="number" min="0" value={draft.price} onChange={(event) => update({ price: Number(event.target.value) })}/></label><label>币种<select value={draft.currency} onChange={(event) => update({ currency: event.target.value as ManualTransferQuote['currency'] })}><option>人民币</option><option>美元</option></select></label><label>运输天数<input type="number" min="0" value={draft.transitDays} onChange={(event) => update({ transitDays: Number(event.target.value) })}/></label><label>报价口径<select value={draft.scope} onChange={(event) => update({ scope: event.target.value as ManualTransferQuote['scope'] })}><option>仅运输费</option><option>全包价</option></select></label><label>报价日期<input type="date" value={draft.quoteDate} onChange={(event) => update({ quoteDate: event.target.value })}/></label><label>有效期至<input type="date" value={draft.expiresAt} onChange={(event) => update({ expiresAt: event.target.value })}/></label><label className="wide-label">备注<input value={draft.notes} onChange={(event) => update({ notes: event.target.value })}/></label><button className="button primary align-end" disabled={!draft.carrier || !draft.originWarehouse || !draft.destinationWarehouse || draft.price <= 0} onClick={() => { onAdd(draft); setDraft(blank()) }}><Plus size={17}/>保存报价并重新测算</button></div>
    {quotes.length ? <div className="quote-chips">{quotes.map((quote) => <div key={quote.id}><strong>{quote.carrier}</strong><span>{quote.originWarehouse} → {quote.destinationWarehouse}</span><span>{quote.currency} {quote.price.toLocaleString('zh-CN')} · {quote.scope}</span><button onClick={() => onDelete(quote.id)}>删除</button></div>)}</div> : null}
  </section>
}

function ResultTable({ results }: { results: AnalysisResult[] }) {
  return <section className="section"><div className="section-heading"><div><h2>完整费用比较</h2><p>金额统一换算成人民币展示。</p></div></div>{!results.length ? <EmptyState title="尚未生成分析结果" description="先完成文件映射、仓库区域确认和报价应用，然后点击重新测算。"/> : <div className="table-frame"><table className="results-table"><thead><tr><th>判断结果</th><th>销售系列</th><th>原仓 → 目的仓</th><th>区域</th><th>调拨件数 / 比例</th><th>采用中转资源</th><th>不调拨费用</th><th>调拨费用</th><th>节省金额 / 比例</th><th>到仓日期</th><th>期末库存</th><th>风险</th></tr></thead><tbody>{results.map((row) => <tr key={row.id}><td><StatusTag tone={row.decision === '建议调拨' ? 'success' : row.decision === '待补数据' ? 'warning' : 'neutral'}>{row.decision}</StatusTag></td><td className="strong">{row.series}</td><td>{row.originWarehouse}{row.destinationWarehouse ? ` → ${row.destinationWarehouse}` : ''}</td><td>{row.region}</td><td>{row.transferQuantity.toLocaleString('zh-CN')} / {(row.transferRatio * 100).toFixed(1)}%</td><td>{row.transferResource}</td><td><Money value={row.noTransferCost.total}/></td><td><Money value={row.transferCost.total}/><small className="cell-detail">仓储 {Math.round(row.transferCost.storage)} · 配送 {Math.round(row.transferCost.delivery)} · 中转 {Math.round(row.transferCost.transfer + row.transferCost.outbound + row.transferCost.inbound)}</small></td><td className={row.savings > 0 ? 'positive' : 'negative'}><Money value={row.savings}/> / {(row.savingsRate * 100).toFixed(1)}%</td><td>{row.expectedArrivalDate ?? '—'}</td><td>{Math.round(row.endingQuantity).toLocaleString('zh-CN')}</td><td>{[...row.riskMessages, ...row.dataQualityMessages].join('；') || '无'}</td></tr>)}</tbody></table></div>}</section>
}

function EuropeDemandMap({ history }: { history: HistoricalSummary }) {
  const ukDemand = history.regionDemand['英国'] ?? 0
  const euDemand = history.regionDemand['欧洲'] ?? 0
  return <section className="section map-section">
    <div className="section-heading">
      <div><h2><MapPinned size={20}/>欧洲需求分布</h2><p>英国单独统计，其余欧洲国家归入「欧洲」。热力表示历史订单占比，不等同于库存数量。</p></div>
    </div>
    <div className="map-layout">
      <div className="us-map">
        <svg viewBox="0 0 600 340" role="img" aria-label="欧洲英国与欧洲大陆需求分布图">
          <path d="M92 40 L116 34 L138 46 L146 74 L134 108 L110 128 L86 118 L72 92 L78 58 Z" fill="#d8f4ef" stroke="#66918e" strokeWidth="2"/>
          <path d="M246 44 L300 40 L334 52 L356 74 L344 98 L366 116 L352 144 L374 168 L358 196 L370 220 L344 244 L320 264 L292 272 L268 262 L252 236 L240 206 L234 170 L228 132 L234 94 L240 66 Z" fill="#b6dedb" stroke="#66918e" strokeWidth="2"/>
          <circle cx="110" cy="84" r={20 + ukDemand * 28} fill="#13a89e" fillOpacity={0.18 + ukDemand * 0.35}/>
          <circle cx="110" cy="84" r="7" fill="#087e78" stroke="white" strokeWidth="3"/>
          <text x="110" y="49" textAnchor="middle" className="map-region">英国</text>
          <text x="110" y="126" textAnchor="middle" className="map-demand">历史需求 {(ukDemand * 100).toFixed(1)}%</text>
          <circle cx="330" cy="176" r={20 + euDemand * 28} fill="#13a89e" fillOpacity={0.18 + euDemand * 0.35}/>
          <circle cx="330" cy="176" r="7" fill="#087e78" stroke="white" strokeWidth="3"/>
          <text x="330" y="141" textAnchor="middle" className="map-region">欧洲</text>
          <text x="330" y="218" textAnchor="middle" className="map-demand">历史需求 {(euDemand * 100).toFixed(1)}%</text>
        </svg>
      </div>
      <div className="map-side">
        <div className="region-stat"><span className="region-dot"/><div><strong>英国</strong><small>历史需求占比</small></div><div className="region-values"><b>{(ukDemand * 100).toFixed(1)}%</b><small>历史订单</small></div></div>
        <div className="region-stat"><span className="region-dot"/><div><strong>欧洲</strong><small>历史需求占比</small></div><div className="region-values"><b>{(euDemand * 100).toFixed(1)}%</b><small>历史订单</small></div></div>
      </div>
    </div>
  </section>
}

function SiteInventorySection({ siteInventory }: { siteInventory: SiteInventorySummary[] }) {
  if (!siteInventory.length) return null
  return <section className="section">
    <div className="section-heading"><div><h2><PackageSearch size={20}/>区域库存分布</h2><p>按仓库维度「站点」归类，加拿大单独统计并与美国相邻展示。在库/在途均为成品件数。</p></div></div>
    <div className="metric-grid">
      {siteInventory.map((row) => <div className="metric-card" key={row.region}><span>{row.region}</span><strong>{row.onHand.toLocaleString('zh-CN')}</strong><small>在库量（件）</small><strong>{row.inTransit.toLocaleString('zh-CN')}</strong><small>在途量（件）</small></div>)}
    </div>
  </section>
}
