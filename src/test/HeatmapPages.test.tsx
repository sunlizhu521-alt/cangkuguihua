import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InventoryHeatmapPage from '../pages/InventoryHeatmapPage'
import ResultsPage, { type HistoricalSummary } from '../pages/ResultsPage'
import SalesHeatmapPage from '../pages/SalesHeatmapPage'
import type { InventoryHeatmapLocationDetail, InventoryHeatmapSkuDetail, SalesHeatmapLocationDetail, SalesHeatmapSkuDetail, SiteInventorySummary, WarehouseAddress } from '../types'

const originalPointerEvent = window.PointerEvent

const history: HistoricalSummary = {
  channelAmazonShare: 0.5,
  channelMerchantShare: 0.5,
  postcodeCoverage: 1,
  regionDemand: { 美西: 0.4, 美中: 0.2, 美东: 0.2, 加拿大: 0.1, 英国: 0.05, 欧洲: 0.05 },
  regionDemandAmount: { 美西: 80, 美中: 40, 美东: 40, 加拿大: 20, 英国: 10, 欧洲: 10 },
  stateDemand: { CA: 100, TX: 50 },
  siteDailyDemand: { 美国: 10, 加拿大: 2, 英国: 1, 欧洲: 1 },
  commonDateRange: '2026-08-01 至 2026-08-31',
  messages: [],
}

const addresses: WarehouseAddress[] = [
  { code: 'CA-WH', name: '加州仓', state: 'CA', city: '', address: '', postalCode: '', suggestedRegion: '美西', confirmedRegion: '美西', confirmed: true },
  { code: 'CA-CANADA', name: '加拿大仓', state: 'ON', city: '', address: '', postalCode: '', suggestedRegion: '美东', confirmedRegion: '美东', confirmed: true },
]

const siteInventory: SiteInventorySummary[] = [
  { region: '美国', onHand: 20, inTransit: 6, dailyDemand: 1, safetyStock: 45, coverageDays: 26, status: '预警' },
  { region: '加拿大', onHand: 9, inTransit: 4, dailyDemand: 0, safetyStock: 0, coverageDays: Number.POSITIVE_INFINITY, status: '安全' },
  { region: '英国', onHand: 3, inTransit: 1, dailyDemand: 0, safetyStock: 0, coverageDays: Number.POSITIVE_INFINITY, status: '安全' },
  { region: '欧洲', onHand: 2, inTransit: 1, dailyDemand: 0, safetyStock: 0, coverageDays: Number.POSITIVE_INFINITY, status: '安全' },
]

const salesDetails: SalesHeatmapSkuDetail[] = [
  { region: '美东', productLine: '产品线甲', series: '系列甲', model: '型号甲', sku: 'SKU-A', sourceCode: 'V-SALES-A', amazonQuantity: 70, merchantQuantity: 30, orderQuantity: 100, ratio: 2 / 3 },
  { region: '美东', productLine: '产品线乙', series: '系列乙', model: '型号乙', sku: 'SKU-B', amazonQuantity: 20, merchantQuantity: 30, orderQuantity: 50, ratio: 1 / 3 },
  { region: '欧洲', productLine: '产品线欧', series: '系列欧', model: '型号欧', sku: 'SKU-EU', amazonQuantity: 0, merchantQuantity: 20, orderQuantity: 20, ratio: 0.1 },
]

const inventoryDetails: InventoryHeatmapSkuDetail[] = [
  { region: '美西', productLine: '产品线甲', series: '系列甲', model: '型号甲', sku: 'SKU-A', onHand: 12, inTransit: 8, total: 20, ratio: 1 },
  { region: '英国', productLine: '产品线英', series: '系列英', model: '型号英', sku: 'SKU-UK', onHand: 3, inTransit: 2, total: 5, ratio: 0.2 },
]

const salesLocationDetails: SalesHeatmapLocationDetail[] = [
  { region: '美西', state: 'CA', productLine: '产品线甲', series: '系列甲', model: '型号甲', sku: 'SKU-A', amazonQuantity: 70, merchantQuantity: 30, orderQuantity: 100 },
  { region: '美中', state: 'TX', productLine: '产品线乙', series: '系列乙', model: '型号乙', sku: 'SKU-B', amazonQuantity: 20, merchantQuantity: 30, orderQuantity: 50 },
  { region: '欧洲', productLine: '产品线欧', series: '系列欧', model: '型号欧', sku: 'SKU-EU', amazonQuantity: 0, merchantQuantity: 20, orderQuantity: 20 },
]

const inventoryLocationDetails: InventoryHeatmapLocationDetail[] = [
  { region: '美西', state: 'CA', productLine: '产品线甲', series: '系列甲', model: '型号甲', sku: 'SKU-A', onHand: 12, inTransit: 8, total: 20 },
  { region: '美中', state: 'TX', productLine: '产品线乙', series: '系列乙', model: '型号乙', sku: 'SKU-B', onHand: 20, inTransit: 5, total: 25 },
  { region: '英国', productLine: '产品线英', series: '系列英', model: '型号英', sku: 'SKU-UK', onHand: 3, inTransit: 2, total: 5 },
]

beforeEach(() => {
  Object.defineProperty(window, 'PointerEvent', { configurable: true, writable: true, value: MouseEvent })
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: () => ({ x: 10, y: 20, width: 100, height: 60 }),
  })
})

afterEach(() => {
  cleanup()
  Object.defineProperty(window, 'PointerEvent', { configurable: true, writable: true, value: originalPointerEvent })
  Reflect.deleteProperty(SVGElement.prototype, 'getBBox')
})

describe('州级真实轮廓热力图页面接入', () => {
  it('销售热力图用统一世界投影展示美国51州和29个海外国家轮廓', () => {
    render(<SalesHeatmapPage history={history} addresses={addresses} details={salesDetails} loading={false} onLoad={vi.fn()}/>)

    const map = screen.getByRole('img', { name: '统一世界投影销售热力图：北美和欧洲' })
    expect(screen.queryByRole('img', { name: '美国各州订单量分布图' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '加拿大、英国和欧洲需求分布图' })).not.toBeInTheDocument()
    expect(map.querySelectorAll('path[data-state]')).toHaveLength(51)
    expect(map.querySelectorAll('path[data-country]')).toHaveLength(29)
    expect(map.querySelector('g[data-group="north-america"] path[data-country="加拿大"]')).toBeInTheDocument()
    expect(map.querySelector('g[data-group="europe"] path[data-country="英国"]')).toBeInTheDocument()
    expect(map.querySelector('path[data-country="英国"]')).toHaveAttribute('fill', map.querySelector('path[data-country="德国"]')?.getAttribute('fill'))
    expect(map.querySelector('path[data-country="加拿大"]')?.getAttribute('fill')).not.toBe(map.querySelector('path[data-country="英国"]')?.getAttribute('fill'))
    expect(map.closest('.heatmap-wide-layout')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '放大地图' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '缩小地图' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重置地图' })).toBeInTheDocument()
    expect(screen.getByText('CA-WH')).toBeInTheDocument()
    expect(screen.queryByText('CA-CANADA')).not.toBeInTheDocument()
  })

  it('销售地图按订单量悬停展示，并在加拿大无订单时显示灰色', () => {
    const noCanadaHistory: HistoricalSummary = {
      ...history,
      regionDemand: { ...history.regionDemand, 加拿大: 0 },
      regionDemandAmount: { ...history.regionDemandAmount, 加拿大: 0 },
    }
    render(<SalesHeatmapPage history={noCanadaHistory} addresses={addresses} details={salesDetails} loading={false} onLoad={vi.fn()}/>)

    const map = screen.getByRole('img', { name: '统一世界投影销售热力图：北美和欧洲' })
    expect(map.querySelector('path[data-country="加拿大"]')).toHaveAttribute('fill', '#eef1f5')
    expect(screen.getByText('无订单数据')).toBeInTheDocument()

    const germany = map.querySelector('path[data-country="德国"]')
    expect(germany).toBeInTheDocument()
    fireEvent.mouseEnter(germany!, { clientX: 100, clientY: 100 })
    expect(screen.getByRole('tooltip')).toHaveTextContent('订单量：10 件')
    expect(screen.getByRole('tooltip')).toHaveTextContent('全部有效订单占比：5.0%')
    fireEvent.mouseLeave(germany!)

    const california = map.querySelector('path[data-state="CA"]')
    expect(california).toBeInTheDocument()
    fireEvent.mouseEnter(california!, { clientX: 120, clientY: 100 })
    expect(screen.getByRole('tooltip')).toHaveTextContent('订单量：100 件')
    expect(screen.getByRole('tooltip')).toHaveTextContent('全国占比：66.7%')
  })

  it('库存热力图使用统一世界投影展示相邻的北美和欧洲，并共用库存色阶', () => {
    render(<InventoryHeatmapPage siteInventory={siteInventory} stateInventory={{ CA: 13, TX: 20 }} addresses={addresses} details={inventoryDetails} loading={false} onLoad={vi.fn()}/>)

    const map = screen.getByRole('img', { name: '统一世界投影库存热力图：北美和欧洲' })
    expect(screen.queryByRole('img', { name: '美国各州在库量分布图' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '加拿大、英国和欧洲库存分布图' })).not.toBeInTheDocument()
    expect(map.querySelectorAll('path[data-state]')).toHaveLength(51)
    expect(map.querySelectorAll('path[data-country]')).toHaveLength(29)
    expect(map.querySelector('g[data-group="north-america"] path[data-country="加拿大"]')).toBeInTheDocument()
    expect(map.querySelector('g[data-group="europe"] path[data-country="英国"]')).toBeInTheDocument()
    expect(screen.getAllByText('13 件')).not.toHaveLength(0)
    expect(map.querySelector('path[data-state="CA"]')).toHaveAttribute('fill', map.querySelector('path[data-country="加拿大"]')?.getAttribute('fill'))
    expect(map.querySelector('path[data-country="德国"]')).toHaveAttribute('fill', map.querySelector('path[data-country="法国"]')?.getAttribute('fill'))
    expect(map.querySelector('path[data-country="英国"]')?.getAttribute('fill')).not.toBe(map.querySelector('path[data-country="德国"]')?.getAttribute('fill'))
    expect(screen.getByText('CA-WH')).toBeInTheDocument()
    expect(screen.queryByText('CA-CANADA')).not.toBeInTheDocument()
  })

  it('美国库存已读取但未匹配州配置时显示明确提示', () => {
    render(<InventoryHeatmapPage siteInventory={siteInventory} stateInventory={{}} addresses={addresses} details={inventoryDetails} loading={false} onLoad={vi.fn()}/>)

    expect(screen.getByText(/已读取美国库存 26 件，但没有匹配到仓库州配置/)).toBeInTheDocument()
  })

  it('统一地图悬停仍使用美国全国占比和海外区域占比口径', () => {
    render(<InventoryHeatmapPage siteInventory={siteInventory} stateInventory={{ CA: 13, TX: 20 }} addresses={addresses} details={inventoryDetails} loading={false} onLoad={vi.fn()}/>)

    const map = screen.getByRole('img', { name: '统一世界投影库存热力图：北美和欧洲' })
    const germany = map.querySelector('path[data-country="德国"]')
    expect(germany).toBeInTheDocument()
    fireEvent.mouseEnter(germany!, { clientX: 100, clientY: 100 })
    expect(screen.getByRole('tooltip')).toHaveTextContent('区域：欧洲')
    expect(screen.getByRole('tooltip')).toHaveTextContent('库存量（在库+在途）：3 件')
    expect(screen.getByRole('tooltip')).toHaveTextContent('占比：15.0%')
    fireEvent.mouseLeave(germany!)

    const california = map.querySelector('path[data-state="CA"]')
    expect(california).toBeInTheDocument()
    fireEvent.mouseEnter(california!, { clientX: 120, clientY: 100 })
    expect(screen.getByRole('tooltip')).toHaveTextContent('加利福尼亚（CA）')
    expect(screen.getByRole('tooltip')).toHaveTextContent('区域：美西')
    expect(screen.getByRole('tooltip')).toHaveTextContent('在库量：13 件')
    expect(screen.getByRole('tooltip')).toHaveTextContent('全国占比：39.4%')
  })

  it('统一地图支持按钮、滚轮缩放、拖拽平移和重置，并限制缩放范围', () => {
    render(<InventoryHeatmapPage siteInventory={siteInventory} stateInventory={{ CA: 13, TX: 20 }} addresses={addresses} details={inventoryDetails} loading={false} onLoad={vi.fn()}/>)

    const map = screen.getByRole('img', { name: '统一世界投影库存热力图：北美和欧洲' })
    const transform = map.querySelector('[data-map-transform]')
    const zoomIn = screen.getByRole('button', { name: '放大地图' })
    const zoomOut = screen.getByRole('button', { name: '缩小地图' })
    const reset = screen.getByRole('button', { name: '重置地图' })
    expect(transform).toHaveAttribute('transform', 'translate(0 0) scale(1)')
    expect(zoomOut).toBeDisabled()

    fireEvent.click(zoomIn)
    expect(screen.getByText('135%')).toBeInTheDocument()
    const beforeDrag = transform?.getAttribute('transform')
    fireEvent.pointerDown(map, { button: 0, pointerId: 1, clientX: 600, clientY: 300 })
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 520, clientY: 260 })
    fireEvent.pointerUp(map, { pointerId: 1 })
    expect(transform?.getAttribute('transform')).not.toBe(beforeDrag)

    fireEvent.wheel(map, { deltaY: -100, clientX: 500, clientY: 250 })
    expect(screen.getByText('155%')).toBeInTheDocument()
    const california = map.querySelector('path[data-state="CA"]')
    fireEvent.mouseEnter(california!, { clientX: 140, clientY: 120 })
    expect(screen.getByRole('tooltip')).toHaveTextContent('加利福尼亚（CA）')

    fireEvent.click(reset)
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(transform).toHaveAttribute('transform', 'translate(0 0) scale(1)')
    expect(zoomOut).toBeDisabled()

    for (let index = 0; index < 8; index += 1) fireEvent.click(zoomIn)
    expect(screen.getByText('500%')).toBeInTheDocument()
    expect(zoomIn).toBeDisabled()
  })

  it('结果页替换美国地图且保留欧洲地图', () => {
    render(<ResultsPage results={[]} addresses={addresses} manualQuotes={[]} history={history} siteInventory={[]} running={false} onRun={vi.fn()} onAddManualQuote={vi.fn()} onDeleteManualQuote={vi.fn()} onExport={vi.fn()}/>)

    expect(screen.getByRole('img', { name: '美国各州订单量分布图' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '欧洲英国与欧洲大陆需求分布图' })).toBeInTheDocument()
  })

  it('销售SKU明细按美区、欧区分组，并支持搜索、区域筛选和数量排序', () => {
    const { container } = render(<SalesHeatmapPage history={history} addresses={addresses} details={salesDetails} loading={false} onLoad={vi.fn()}/>)

    const filterRow = screen.getByLabelText('热力图商品筛选器')
    expect(filterRow).toContainElement(screen.getByRole('combobox', { name: '销售产品线筛选' }))
    for (const label of ['搜索商品编码级明细', '区域筛选', '数量排序']) expect(filterRow).toContainElement(screen.getByLabelText(label))
    expect(container.querySelector('.sku-detail-controls')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '商品编码级销售明细' })).toBeInTheDocument()
    expect(screen.getByText('美区组')).toBeInTheDocument()
    expect(screen.getByText('欧区组')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '亚马逊仓配发货量' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '商家自发货发货量' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '合计发货量' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '销售端编码' })).toBeInTheDocument()
    expect(screen.getByText('SKU-A').closest('tr')).toHaveTextContent('V-SALES-A7030100')

    fireEvent.change(screen.getByRole('textbox', { name: '搜索商品编码级明细' }), { target: { value: 'sku-b' } })
    expect(screen.getByText('SKU-B')).toBeInTheDocument()
    expect(screen.queryByText('SKU-A')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: '搜索商品编码级明细' }), { target: { value: '' } })
    fireEvent.change(screen.getByRole('combobox', { name: '区域筛选' }), { target: { value: '欧洲' } })
    expect(screen.getByText('SKU-EU')).toBeInTheDocument()
    expect(screen.queryByText('SKU-A')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: '区域筛选' }), { target: { value: '美东' } })
    fireEvent.change(screen.getByRole('combobox', { name: '数量排序' }), { target: { value: 'asc' } })
    const rows = [...container.querySelectorAll('.sku-detail-scroll tbody tr:not(.sku-detail-group)')]
    expect(rows.map((row) => row.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('SKU-A'), expect.stringContaining('SKU-B')]))
    expect(rows[0]).toHaveTextContent('SKU-B')
  })

  it('库存SKU明细分别显示在库、在途、合计和占比', () => {
    render(<InventoryHeatmapPage siteInventory={siteInventory} stateInventory={{ CA: 13 }} addresses={addresses} details={inventoryDetails} loading={false} onLoad={vi.fn()}/>)

    expect(screen.getByRole('heading', { name: '商品编码级库存明细' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '在库量（件）' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '在途量（件）' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '合计（件）' })).toBeInTheDocument()
    expect(screen.getByText('SKU-A').closest('tr')).toHaveTextContent('12820')
  })

  it('销售和库存热力图都提供加载计算按钮并显示计算状态', () => {
    const onLoad = vi.fn(async () => undefined)
    const { rerender } = render(<SalesHeatmapPage history={history} addresses={addresses} details={salesDetails} loading={false} onLoad={onLoad}/>)

    fireEvent.click(screen.getByRole('button', { name: '加载计算' }))
    expect(onLoad).toHaveBeenCalledTimes(1)

    rerender(<InventoryHeatmapPage siteInventory={siteInventory} stateInventory={{ CA: 13 }} addresses={addresses} details={inventoryDetails} loading onLoad={onLoad}/>)
    expect(screen.getByRole('button', { name: '计算中…' })).toBeDisabled()
  })

  it('销售产品线、销售系列和型号联合筛选后，销售地图与明细同步变化', () => {
    render(<SalesHeatmapPage history={history} addresses={addresses} details={salesDetails} locationDetails={salesLocationDetails} loading={false} onLoad={vi.fn()}/>)

    expect(screen.getByRole('combobox', { name: '销售产品线筛选' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '销售系列筛选' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '型号筛选' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: '销售产品线筛选' }), { target: { value: '产品线乙' } })

    const map = screen.getByRole('img', { name: '统一世界投影销售热力图：北美和欧洲' })
    expect(map.querySelector('path[data-state="CA"]')).toHaveAttribute('fill', '#eef1f5')
    expect(map.querySelector('path[data-state="TX"]')).not.toHaveAttribute('fill', '#eef1f5')
    expect(screen.getByText('SKU-B')).toBeInTheDocument()
    expect(screen.queryByText('SKU-A')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: '销售系列筛选' }), { target: { value: '系列乙' } })
    fireEvent.change(screen.getByRole('combobox', { name: '型号筛选' }), { target: { value: '型号乙' } })
    expect(screen.getByText('SKU-B').closest('tr')).toHaveTextContent('型号乙')
    expect(screen.getByRole('button', { name: '重置筛选' })).toBeEnabled()
  })

  it('库存商品筛选后，州级在库热力、海外合计和明细同步变化', () => {
    render(<InventoryHeatmapPage siteInventory={siteInventory} stateInventory={{ CA: 13, TX: 20 }} addresses={addresses} details={inventoryDetails} locationDetails={inventoryLocationDetails} loading={false} onLoad={vi.fn()}/>)

    fireEvent.change(screen.getByRole('combobox', { name: '型号筛选' }), { target: { value: '型号甲' } })
    const map = screen.getByRole('img', { name: '统一世界投影库存热力图：北美和欧洲' })
    expect(map.querySelector('path[data-state="CA"]')).not.toHaveAttribute('fill', '#eef1f5')
    expect(map.querySelector('path[data-state="TX"]')).toHaveAttribute('fill', '#eef1f5')
    expect(map.querySelector('path[data-country="英国"]')).toHaveAttribute('fill', '#eef1f5')
    expect(screen.getByText('SKU-A')).toBeInTheDocument()
    expect(screen.queryByText('SKU-UK')).not.toBeInTheDocument()
  })
})
