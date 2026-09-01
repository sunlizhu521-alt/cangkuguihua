import { RotateCcw, Search } from 'lucide-react'
import { useMemo } from 'react'
import { heatmapDetailRegionOrder } from '../heatmapDetails'
import type { DemandRegion } from '../types'

export interface HeatmapDimensionFilterValue {
  productLine: string
  series: string
  model: string
}

export interface HeatmapDimensionRow {
  productLine: string
  series: string
  model?: string
}

export interface HeatmapDetailFilterValue {
  search: string
  region: '' | DemandRegion
  sortDirection: 'desc' | 'asc'
}

export const emptyHeatmapDimensionFilters: HeatmapDimensionFilterValue = { productLine: '', series: '', model: '' }
export const emptyHeatmapDetailFilters: HeatmapDetailFilterValue = { search: '', region: '', sortDirection: 'desc' }

export function matchesHeatmapDimensionFilters(row: HeatmapDimensionRow, filters: HeatmapDimensionFilterValue) {
  return (!filters.productLine || row.productLine === filters.productLine)
    && (!filters.series || row.series === filters.series)
    && (!filters.model || row.model === filters.model)
}

export function hasHeatmapDimensionFilters(filters: HeatmapDimensionFilterValue) {
  return Boolean(filters.productLine || filters.series || filters.model)
}

export function hasHeatmapDetailFilters(filters: HeatmapDetailFilterValue) {
  return Boolean(filters.search || filters.region || filters.sortDirection !== 'desc')
}

function dimensionOptions(rows: HeatmapDimensionRow[], key: keyof HeatmapDimensionFilterValue) {
  return [...new Set(rows.map((row) => row[key]).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export default function HeatmapDimensionFilters({ rows, value, onChange, detailValue, onDetailChange }: { rows: HeatmapDimensionRow[]; value: HeatmapDimensionFilterValue; onChange: (value: HeatmapDimensionFilterValue) => void; detailValue: HeatmapDetailFilterValue; onDetailChange: (value: HeatmapDetailFilterValue) => void }) {
  const options = useMemo(() => ({
    productLine: dimensionOptions(rows, 'productLine'),
    series: dimensionOptions(rows, 'series'),
    model: dimensionOptions(rows, 'model'),
  }), [rows])

  const resetDisabled = !hasHeatmapDimensionFilters(value) && !hasHeatmapDetailFilters(detailValue)

  return <div className="heatmap-dimension-filters" aria-label="热力图商品筛选器">
    <label>销售产品线<select aria-label="销售产品线筛选" value={value.productLine} onChange={(event) => onChange({ ...value, productLine: event.target.value })}><option value="">全部销售产品线</option>{options.productLine.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <label>销售系列<select aria-label="销售系列筛选" value={value.series} onChange={(event) => onChange({ ...value, series: event.target.value })}><option value="">全部销售系列</option>{options.series.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <label>型号<select aria-label="型号筛选" value={value.model} onChange={(event) => onChange({ ...value, model: event.target.value })}><option value="">全部型号</option>{options.model.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <label>明细搜索<span className="heatmap-filter-search"><Search size={15}/><input aria-label="搜索商品编码级明细" value={detailValue.search} onChange={(event) => onDetailChange({ ...detailValue, search: event.target.value })} placeholder="商品编码/销售端编码/产品线/系列/型号"/></span></label>
    <label>区域<select aria-label="区域筛选" value={detailValue.region} onChange={(event) => onDetailChange({ ...detailValue, region: event.target.value as '' | DemandRegion })}><option value="">全部区域</option>{heatmapDetailRegionOrder.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <label>数量排序<select aria-label="数量排序" value={detailValue.sortDirection} onChange={(event) => onDetailChange({ ...detailValue, sortDirection: event.target.value as 'desc' | 'asc' })}><option value="desc">从高到低</option><option value="asc">从低到高</option></select></label>
    <button type="button" className="button secondary" disabled={resetDisabled} onClick={() => { onChange(emptyHeatmapDimensionFilters); onDetailChange(emptyHeatmapDetailFilters) }}><RotateCcw size={16}/>重置筛选</button>
  </div>
}
