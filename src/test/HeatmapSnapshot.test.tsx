import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { HistoricalSummary } from '../pages/ResultsPage'
import type { InventoryHeatmapSkuDetail, SalesHeatmapSkuDetail, SiteInventorySummary, StoredFile } from '../types'

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
    toArray: vi.fn(async () => [{ code: 'CA-WH', name: '加州仓', state: 'CA', city: '', address: '', postalCode: '90001', suggestedRegion: '美西', confirmedRegion: '美西', confirmed: true }]),
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
  return { ...actual, aggregateStateInventory: vi.fn((inventory: unknown[]) => inventory.length ? { CA: 7 } : {}) }
})

vi.mock('../fileParser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../fileParser')>()
  return {
    ...actual,
    parseInventory: vi.fn(() => [{ warehouseCode: 'CA-WH', warehouseName: '加州仓', productCode: '商品一', series: '商品一', quantity: 7, inventoryStatus: '在库', productType: '成品' }]),
    parseForecast: vi.fn(() => [{ series: '商品一', quantity: 7, periodDays: 45 }]),
    parseOutbound: vi.fn((_file, channel: '亚马逊仓配' | '商家自发货') => [{ productCode: '热力商品', series: '热力商品', date: '2026-08-01', postalCode: '90001', quantity: channel === '亚马逊仓配' ? 5 : 3, status: '', channel }]),
    parseWarehouses: vi.fn(() => [{ code: 'CA-WH', name: '加州仓', region: '美西', site: '美国', siteRegion: '美国' }]),
    readMappedRows: vi.fn((file: StoredFile) => file.slotId === 'product'
      ? [{ '商品编码': 'MAT-HEAT', SKU: '备用编码', '销售产品线': '热力产品线', '销售系列': '热力系列', '型号': '热力型号' }]
      : file.slotId === 'listingMaterial' ? [{ '领星商品编码': '热力商品', '物料编码': 'MAT-HEAT' }] : []),
    readProductDimensionRows: vi.fn(() => [{ '商品编码': 'MAT-HEAT', SKU: '备用编码', '销售产品线': '热力产品线', '销售系列': '热力系列', '型号': '热力型号' }]),
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

const salesDetails: SalesHeatmapSkuDetail[] = [
  { region: '美西', productLine: '产品线甲', series: '系列甲', sku: 'SNAPSHOT-SKU', amazonQuantity: 50, merchantQuantity: 30, orderQuantity: 80, ratio: 0.4 },
]

const inventoryDetails: InventoryHeatmapSkuDetail[] = [
  { region: '美西', productLine: '产品线甲', series: '系列甲', sku: 'SNAPSHOT-SKU', onHand: 13, inTransit: 2, total: 15, ratio: 1 },
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
  it('兼容恢复尚未包含SKU明细的旧快照', async () => {
    storageMock.values.set('热力图快照', { history, siteInventory, stateInventory: { CA: 13 }, savedAt: '2026-09-01T00:00:00.000Z' })
    render(<App/>)

    await waitFor(() => expect(storageMock.getSetting).toHaveBeenCalledWith('热力图快照', null))
    fireEvent.click(screen.getByRole('button', { name: '销售热力图' }))
    expect(screen.getByText('请运行分析生成SKU级明细')).toBeInTheDocument()
  })

  it('页面加载时恢复快照，清空文件后同步删除且不残留旧数据', async () => {
    storageMock.values.set('热力图快照', { history, siteInventory, stateInventory: { CA: 13 }, salesDetails, inventoryDetails, savedAt: '2026-09-01T00:00:00.000Z' })
    render(<App/>)

    await waitFor(() => expect(storageMock.getSetting).toHaveBeenCalledWith('热力图快照', null))
    fireEvent.click(screen.getByRole('button', { name: '销售热力图' }))
    expect(screen.getAllByText('40.0%').length).toBeGreaterThan(0)
    expect(screen.getByText('SNAPSHOT-SKU')).toBeInTheDocument()
    expect(document.querySelector('path[data-state="CA"]')).not.toHaveAttribute('fill', '#eef1f5')

    fireEvent.click(screen.getByRole('button', { name: '文件库' }))
    fireEvent.click(screen.getByRole('button', { name: '清空本次分析' }))
    await waitFor(() => expect(storageMock.db.settings.delete).toHaveBeenCalledWith('热力图快照'))
    fireEvent.click(screen.getByRole('button', { name: '销售热力图' }))
    expect(await screen.findByText('请完成历史出库数据映射并运行分析')).toBeInTheDocument()
    expect(screen.queryByText('SNAPSHOT-SKU')).not.toBeInTheDocument()
    expect(document.querySelector('path[data-state="CA"]')).toHaveAttribute('fill', '#eef1f5')
  })

  it('运行分析后保存历史需求、区域库存、州库存和保存时间', async () => {
    storageMock.setFiles([storedFile('inventory'), storedFile('forecast'), storedFile('warehouse')])
    render(<App/>)

    await waitFor(() => expect(screen.getByText('inventory.xlsx')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '分析结果' }))
    fireEvent.click(screen.getByRole('button', { name: '重新测算' }))

    await waitFor(() => expect(storageMock.setSetting).toHaveBeenCalledWith('热力图快照', expect.objectContaining({ stateInventory: { CA: 7 }, savedAt: expect.any(String) })))
    const saved = storageMock.values.get('热力图快照') as { history: HistoricalSummary; siteInventory: SiteInventorySummary[]; stateInventory: Record<string, number>; salesDetails: SalesHeatmapSkuDetail[]; inventoryDetails: InventoryHeatmapSkuDetail[]; salesLocationDetails: unknown[]; inventoryLocationDetails: unknown[]; savedAt: string }
    expect(saved.history.messages).toContain('亚马逊仓配与商家自发货历史出库数据未同时通过校验，不生成正式地区建议')
    expect(saved.siteInventory.find((row) => row.region === '美国')?.onHand).toBe(7)
    expect(saved.stateInventory).toEqual({ CA: 7 })
    expect(saved.salesDetails).toEqual([])
    expect(saved.inventoryDetails[0]).toMatchObject({ region: '美西', sku: '商品一', onHand: 7, inTransit: 0, total: 7 })
    expect(saved.inventoryLocationDetails).toEqual([expect.objectContaining({ region: '美西', state: 'CA', sku: '商品一', onHand: 7, total: 7 })])
    expect(Number.isNaN(Date.parse(saved.savedAt))).toBe(false)
  })

  it('热力图页面不依赖销售预测即可重新计算库存并保存快照', async () => {
    storageMock.setFiles([storedFile('inventory'), storedFile('warehouse')])
    render(<App/>)

    await waitFor(() => expect(screen.getByText('inventory.xlsx')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '库存热力图' }))
    fireEvent.click(screen.getByRole('button', { name: '加载计算' }))

    await waitFor(() => expect(storageMock.setSetting).toHaveBeenCalledWith('热力图快照', expect.objectContaining({ stateInventory: { CA: 7 }, inventoryDetails: [expect.objectContaining({ region: '美西', sku: '商品一', total: 7 })] })))
    expect(screen.getByText('商品一')).toBeInTheDocument()
    expect(screen.getByText(/热力图数据已加载/)).toBeInTheDocument()
    expect(screen.getByText(/缺少亚马逊仓配出库数据、商家自发货出库数据，销售热力图为空/)).toBeInTheDocument()
    expect(screen.getByText(/缺少领星商品编码匹配物料编码文件，销售产品线、销售系列和型号留空/)).toBeInTheDocument()
  })

  it('缺少库存和仓库文件时仍保留可计算的销售热力图', async () => {
    storageMock.setFiles([storedFile('amazonOutbound'), storedFile('merchantOutbound'), storedFile('product'), storedFile('listingMaterial')])
    render(<App/>)

    await waitFor(() => expect(screen.getByText('amazonOutbound.xlsx')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '销售热力图' }))
    fireEvent.click(screen.getByRole('button', { name: '加载计算' }))

    await waitFor(() => expect(storageMock.setSetting).toHaveBeenCalledWith('热力图快照', expect.objectContaining({ stateInventory: {}, inventoryDetails: [], salesDetails: [expect.objectContaining({ region: '美西', sku: '热力商品', productLine: '热力产品线', series: '热力系列', model: '热力型号', amazonQuantity: 5, merchantQuantity: 3, orderQuantity: 8 })], salesLocationDetails: [expect.objectContaining({ region: '美西', state: 'CA', sku: '热力商品', model: '热力型号', orderQuantity: 8 })] })))
    expect(screen.getByText('热力商品')).toBeInTheDocument()
    expect(screen.getAllByText('热力产品线').length).toBeGreaterThan(0)
    expect(screen.getAllByText('热力系列').length).toBeGreaterThan(0)
    expect(screen.getAllByText('热力型号').length).toBeGreaterThan(0)
    expect(screen.getByText(/缺少库存数据、仓库维度文件，库存热力图为空/)).toBeInTheDocument()
    expect(screen.queryByText(/缺少领星商品编码匹配物料编码文件/)).not.toBeInTheDocument()
  })
})
