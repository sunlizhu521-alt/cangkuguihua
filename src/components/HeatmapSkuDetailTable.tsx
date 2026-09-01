import { useMemo } from 'react'
import type { HeatmapDetailFilterValue } from './HeatmapDimensionFilters'
import { heatmapDetailRegionOrder } from '../heatmapDetails'
import type { DemandRegion, InventoryHeatmapSkuDetail, SalesHeatmapSkuDetail } from '../types'

type DetailRow = SalesHeatmapSkuDetail | InventoryHeatmapSkuDetail

type HeatmapSkuDetailTableProps =
  | { mode: 'sales'; rows: SalesHeatmapSkuDetail[]; filters: HeatmapDetailFilterValue }
  | { mode: 'inventory'; rows: InventoryHeatmapSkuDetail[]; filters: HeatmapDetailFilterValue }

const regionGroups: Array<{ label: string; regions: DemandRegion[] }> = [
  { label: '美区组', regions: ['美东', '美西', '美中', '加拿大'] },
  { label: '欧区组', regions: ['欧洲', '英国'] },
]

function quantityOf(row: DetailRow) {
  return 'orderQuantity' in row ? row.orderQuantity : row.total
}

export default function HeatmapSkuDetailTable(props: HeatmapSkuDetailTableProps) {
  const { search, region, sortDirection } = props.filters
  const sourceRows: DetailRow[] = props.rows
  const groupedRows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase()
    const filtered = sourceRows.filter((row) => {
      const matchesRegion = !region || row.region === region
      const matchesSearch = !keyword || [row.sku, row.sourceCode ?? '', row.productLine, row.series, row.model ?? ''].some((value) => value.toLocaleLowerCase().includes(keyword))
      return matchesRegion && matchesSearch
    })
    return regionGroups.map((group) => ({
      ...group,
      rows: filtered.filter((row) => group.regions.includes(row.region)).sort((a, b) => {
        const quantityDifference = quantityOf(b) - quantityOf(a)
        if (quantityDifference) return sortDirection === 'desc' ? quantityDifference : -quantityDifference
        return heatmapDetailRegionOrder.indexOf(a.region) - heatmapDetailRegionOrder.indexOf(b.region)
      }),
    })).filter((group) => group.rows.length)
  }, [region, search, sortDirection, sourceRows])
  const visibleCount = groupedRows.reduce((sum, group) => sum + group.rows.length, 0)
  const columnCount = props.mode === 'sales' ? 10 : 9

  return <section className="section sku-detail-section">
    <div className="section-heading">
      <div><h2>{props.mode === 'sales' ? '商品编码级销售明细' : '商品编码级库存明细'}</h2><p>美区组包含美东、美西、美中和加拿大；欧区组包含欧洲和英国。</p></div>
      <span className="muted">显示 {visibleCount.toLocaleString('zh-CN')} / {sourceRows.length.toLocaleString('zh-CN')} 行</span>
    </div>
    <div className="table-frame sku-detail-scroll">
      <table>
        <thead><tr><th>区域</th><th>销售产品线</th><th>销售系列</th><th>型号</th><th>商品编码</th>{props.mode === 'sales' ? <><th>销售端编码</th><th>亚马逊仓配发货量</th><th>商家自发货发货量</th><th>合计发货量</th><th>占比</th></> : <><th>在库量（件）</th><th>在途量（件）</th><th>合计（件）</th><th>占比</th></>}</tr></thead>
        <tbody>{groupedRows.length ? groupedRows.flatMap((group) => [
          <tr className="sku-detail-group" key={`group-${group.label}`}><td colSpan={columnCount}>{group.label}<small>{group.rows.length.toLocaleString('zh-CN')} 个商品编码明细</small></td></tr>,
          ...group.rows.map((row) => <tr key={`${group.label}-${row.region}-${row.sku || row.sourceCode}`}><td><span className="sku-region">{row.region}</span></td><td>{row.productLine || '—'}</td><td>{row.series || '—'}</td><td>{row.model || '—'}</td><td className="strong">{row.sku || '未匹配'}</td>{'orderQuantity' in row ? <><td>{row.sourceCode || '—'}</td><td>{(row.amazonQuantity ?? 0).toLocaleString('zh-CN')}</td><td>{(row.merchantQuantity ?? 0).toLocaleString('zh-CN')}</td><td className="strong">{row.orderQuantity.toLocaleString('zh-CN')}</td><td>{(row.ratio * 100).toFixed(1)}%</td></> : <><td>{row.onHand.toLocaleString('zh-CN')}</td><td>{row.inTransit.toLocaleString('zh-CN')}</td><td className="strong">{row.total.toLocaleString('zh-CN')}</td><td>{(row.ratio * 100).toFixed(1)}%</td></>}</tr>),
        ]) : <tr><td colSpan={columnCount} className="sku-detail-empty">{sourceRows.length ? '没有符合筛选条件的商品编码明细' : '请运行分析生成商品编码级明细'}</td></tr>}</tbody>
      </table>
    </div>
  </section>
}
