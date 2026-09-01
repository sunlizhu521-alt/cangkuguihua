import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { HistoricalSummary } from '../pages/ResultsPage'
import type { SiteInventorySummary, StoredFile } from '../types'

const storageMock = vi.hoisted(() => {
  const values = new Map<string, unknown>()
  let files: unknown[] = []
  const table = () => ({
    clear: vi.fn(async () => undefined),
    count: vi.fn(async () => 1),
    bulkAdd: vi.fn(async () => undefined),
  })
  const filesTable = {
    ...table(),
    toArray: vi.fn(async () => files),
    where: vi.fn(() => ({ equals: vi.fn(() => ({ first: vi.fn(async () => undefined) })) })),
  }
  filesTable.clear.mockImplementation(async () => { files = [] })
  const quotes = {
    ...table(),
    orderBy: vi.fn(() => ({ toArray: vi.fn(async () => []) })),
  }
  const warehouseAddresses = {
    ...table(),
    toArray: vi.fn(async () => []),
    where: vi.fn(() => ({ equals: vi.fn(() => ({ first: vi.fn(async () => undefined) })) })),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  }
  const manualTransferQuotes = {
    ...table(),
    toArray: vi.fn(async () => []),
    add: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  }
  const results = {
    ...table(),
    orderBy: vi.fn(() => ({ last: vi.fn(async () => undefined) })),
    put: vi.fn(async () => undefined),
  }
  const settings = {
    delete: vi.fn(async (key: string) => { values.delete(key) }),
  }
  const getSetting = vi.fn(async (key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback)
  const setSetting = vi.fn(async (key: string, value: unknown) => { values.set(key, value) })
  const db = {
    files: filesTable,
    quotes,
    warehouseAddresses,
    manualTransferQuotes,
    results,
    settings,
    transaction: vi.fn(async (_mode: string, _tables: unknown[], callback: () => Promise<void>) => callback()),
  }
  return {
    db,
    getSetting,
    setSetting,
    values,
    setFiles(nextFiles: unknown[]) { files = nextFiles },
  }
})

vi.mock('../storage', () => ({
  db: storageMock.db,
  getSetting: storageMock.getSetting,
  setSetting: storageMock.setSetting,
  saveFile: vi.fn(),
  saveQuote: vi.fn(),
  updateFileMapping: vi.fn(),
  settingKeys: { analysis: '分析设置', ai: '人工智能设置', heatmapSnapshot: '热力图快照' },
}))

vi.mock('../analysis', () => ({ optimizeTransfers: vi.fn(() => []) }))

vi.mock('../stateAggregation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../stateAggregation')>()
  return { ...actual, aggregateStateInventory: vi.fn(() => ({ CA: 7 })) }
})

vi.mock('../fileParser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../fileParser')>()
  return {
    ...actual,
    parseInventory: vi.fn(() => [{ warehouseCode: 'CA-WH', warehouseName: '加州仓', productCode: '商品一', series: '商品一', quantity: 7, inventoryStatus: '在库', productType: '成品' }]),
    parseForecast: vi.fn(() => [{ series: '商品一', quantity: 7, periodDays: 45 }]),
    parseWarehouses: vi.fn(() => [{ code: 'CA-WH', name: '加州仓', region: '美西', site: '美国', siteRegion: '美国' }]),
  }
})

const history: HistoricalSummary = {
  channelAmazonShare: 0.5,
  channelMerchantShare: 0.5,
  postcodeCoverage: 1,
  regionDemand: { 美西: 0.4, 美中: 0.2, 美东: 0.2, 加拿大: 0.1, 英国: 0.05, 欧洲: 0.05 },
  regionDemandAmount: { 美西: 80, 美中: 40, 美东: 40, 加拿大: 20, 英国: 10, 欧洲: 10 },
  stateDemand: { CA: 100 },
  siteDailyDemand: { 美国: 10, 加拿大: 2, 英国: 1, 欧洲: 1 },
  commonDateRange: '2026-08-01 至 2026-08-31',
  messages: [],
}

const siteInventory: SiteInventorySummary[] = [
  { region: '美国', onHand: 20, inTransit: 6, dailyDemand: 1, safetyStock: 45, coverageDays: 26, status: '预警' },
  { region: '加拿大', onHand: 9, inTransit: 4, dailyDemand: 0, safetyStock: 0, coverageDays: Number.POSITIVE_INFINITY, status: '安全' },
]

function storedFile(slotId: StoredFile['slotId']): StoredFile {
  return { slotId, fileName: `${slotId}.xlsx`, updatedAt: '2026-09-01T00:00:00.000Z', rowCount: 1, sheetNames: ['数据'], headers: [], previewRows: [], data: new ArrayBuffer(0), mapping: {}, validation: '校验通过', missingFields: [] }
}

beforeEach(() => {
  vi.clearAllMocks()
  storageMock.values.clear()
  storageMock.setFiles([])
  Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: () => ({ x: 10, y: 20, width: 100, height: 60 }) })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(SVGElement.prototype, 'getBBox')
})

describe('热力图快照', () => {
  it('页面加载时恢复快照，清空文件后同步删除且不残留旧数据', async () => {
    storageMock.values.set('热力图快照', { history, siteInventory, stateInventory: { CA: 13 }, savedAt: '2026-09-01T00:00:00.000Z' })
    render(<App/>)

    await waitFor(() => expect(storageMock.getSetting).toHaveBeenCalledWith('热力图快照', null))
    fireEvent.click(screen.getByRole('button', { name: '销售热力图' }))
    expect(screen.getByText('40.0%')).toBeInTheDocument()
    expect(document.querySelector('path[data-state="CA"]')).not.toHaveAttribute('fill', '#eef1f5')

    fireEvent.click(screen.getByRole('button', { name: '文件库' }))
    fireEvent.click(screen.getByRole('button', { name: '清空本次分析' }))
    await waitFor(() => expect(storageMock.db.settings.delete).toHaveBeenCalledWith('热力图快照'))
    fireEvent.click(screen.getByRole('button', { name: '销售热力图' }))
    expect(await screen.findByText('请完成历史出库数据映射并运行分析')).toBeInTheDocument()
    expect(document.querySelector('path[data-state="CA"]')).toHaveAttribute('fill', '#eef1f5')
  })

  it('运行分析后保存历史需求、区域库存、州库存和保存时间', async () => {
    storageMock.setFiles([storedFile('inventory'), storedFile('forecast'), storedFile('warehouse')])
    render(<App/>)

    await waitFor(() => expect(screen.getByText('inventory.xlsx')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '分析结果' }))
    fireEvent.click(screen.getByRole('button', { name: '重新测算' }))

    await waitFor(() => expect(storageMock.setSetting).toHaveBeenCalledWith('热力图快照', expect.objectContaining({ stateInventory: { CA: 7 }, savedAt: expect.any(String) })))
    const saved = storageMock.values.get('热力图快照') as { history: HistoricalSummary; siteInventory: SiteInventorySummary[]; stateInventory: Record<string, number>; savedAt: string }
    expect(saved.history.messages).toContain('亚马逊仓配与商家自发货历史出库数据未同时通过校验，不生成正式地区建议')
    expect(saved.siteInventory.find((row) => row.region === '美国')?.onHand).toBe(7)
    expect(saved.stateInventory).toEqual({ CA: 7 })
    expect(Number.isNaN(Date.parse(saved.savedAt))).toBe(false)
  })
})
