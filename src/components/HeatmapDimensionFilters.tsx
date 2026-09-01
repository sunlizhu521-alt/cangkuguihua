import { RotateCcw } from 'lucide-react'
import { useMemo } from 'react'

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

export const emptyHeatmapDimensionFilters: HeatmapDimensionFilterValue = { productLine: '', series: '', model: '' }

export function matchesHeatmapDimensionFilters(row: HeatmapDimensionRow, filters: HeatmapDimensionFilterValue) {
  return (!filters.productLine || row.productLine === filters.productLine)
    && (!filters.series || row.series === filters.series)
    && (!filters.model || row.model === filters.model)
}

export function hasHeatmapDimensionFilters(filters: HeatmapDimensionFilterValue) {
  return Boolean(filters.productLine || filters.series || filters.model)
}

function dimensionOptions(rows: HeatmapDimensionRow[], key: keyof HeatmapDimensionFilterValue) {
  return [...new Set(rows.map((row) => row[key]).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export default function HeatmapDimensionFilters({ rows, value, onChange }: { rows: HeatmapDimensionRow[]; value: HeatmapDimensionFilterValue; onChange: (value: HeatmapDimensionFilterValue) => void }) {
  const options = useMemo(() => ({
    productLine: dimensionOptions(rows, 'productLine'),
    series: dimensionOptions(rows, 'series'),
    model: dimensionOptions(rows, 'model'),
  }), [rows])

  return <div className="heatmap-dimension-filters" aria-label="热力图商品筛选器">
    <label>销售产品线<select aria-label="销售产品线筛选" value={value.productLine} onChange={(event) => onChange({ ...value, productLine: event.target.value })}><option value="">全部销售产品线</option>{options.productLine.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <label>销售系列<select aria-label="销售系列筛选" value={value.series} onChange={(event) => onChange({ ...value, series: event.target.value })}><option value="">全部销售系列</option>{options.series.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <label>型号<select aria-label="型号筛选" value={value.model} onChange={(event) => onChange({ ...value, model: event.target.value })}><option value="">全部型号</option>{options.model.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <button type="button" className="button secondary" disabled={!hasHeatmapDimensionFilters(value)} onClick={() => onChange(emptyHeatmapDimensionFilters)}><RotateCcw size={16}/>重置筛选</button>
  </div>
}
