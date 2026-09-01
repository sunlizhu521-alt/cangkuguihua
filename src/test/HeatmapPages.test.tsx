import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InventoryHeatmapPage from '../pages/InventoryHeatmapPage'
import ResultsPage, { type HistoricalSummary } from '../pages/ResultsPage'
import SalesHeatmapPage from '../pages/SalesHeatmapPage'
import type { SiteInventorySummary, WarehouseAddress } from '../types'

const history: HistoricalSummary = {
  channelAmazonShare: 0.5,
  channelMerchantShare: 0.5,
  postcodeCoverage: 1,
  regionDemand: { 美西: 0.4, 美中: 0.2, 美东: 0.2, 加拿大: 0.1, 英国: 0.05, 欧洲: 0.05 },
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

beforeEach(() => {
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: () => ({ x: 10, y: 20, width: 100, height: 60 }),
  })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(SVGElement.prototype, 'getBBox')
})

describe('州级真实轮廓热力图页面接入', () => {
  it('销售热力图共用州级订单量并保留海外地图', async () => {
    render(<SalesHeatmapPage history={history} addresses={addresses}/>)

    expect(screen.getByRole('img', { name: '美国各州订单量分布图' })).toBeInTheDocument()
    const internationalMap = screen.getByRole('img', { name: '加拿大、英国和欧洲需求分布图' })
    expect(internationalMap.querySelectorAll('path')).toHaveLength(29)
    expect(internationalMap.querySelector('path[data-country="加拿大"]')).toBeInTheDocument()
    expect(internationalMap.querySelector('path[data-country="英国"]')).toBeInTheDocument()
    expect(internationalMap.querySelector('path[data-country="德国"]')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('CA-WH')).toBeInTheDocument())
    expect(screen.queryByText('CA-CANADA')).not.toBeInTheDocument()
  })

  it('库存热力图只把美国州库存传入州地图，海外按在库加在途展示真实轮廓', async () => {
    render(<InventoryHeatmapPage siteInventory={siteInventory} stateInventory={{ CA: 20 }} addresses={addresses}/>)

    expect(screen.getByRole('img', { name: '美国各州在库量分布图' })).toBeInTheDocument()
    const internationalMap = screen.getByRole('img', { name: '加拿大、英国和欧洲库存分布图' })
    expect(internationalMap.querySelectorAll('path')).toHaveLength(29)
    expect(screen.getAllByText('13 件')).not.toHaveLength(0)
    const germany = internationalMap.querySelector('path[data-country="德国"]')
    expect(germany).toBeInTheDocument()
    fireEvent.mouseEnter(germany!, { clientX: 100, clientY: 100 })
    expect(screen.getByText('区域：欧洲')).toBeInTheDocument()
    expect(screen.getByText('库存量（在库+在途）：3 件')).toBeInTheDocument()
    expect(screen.getByText('占比：15.0%')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('CA-WH')).toBeInTheDocument())
    expect(screen.queryByText('CA-CANADA')).not.toBeInTheDocument()
  })

  it('结果页替换美国地图且保留欧洲地图', () => {
    render(<ResultsPage results={[]} addresses={addresses} manualQuotes={[]} history={history} siteInventory={[]} running={false} onRun={vi.fn()} onAddManualQuote={vi.fn()} onDeleteManualQuote={vi.fn()} onExport={vi.fn()}/>)

    expect(screen.getByRole('img', { name: '美国各州订单量分布图' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '欧洲英国与欧洲大陆需求分布图' })).toBeInTheDocument()
  })
})
