import { describe, expect, it } from 'vitest'
import { optimizeTransfers } from '../analysis'
import { demandSiteRegion } from '../fileParser'
import type { OptimizationInput } from '../analysis'

function input(overrides: Partial<OptimizationInput> = {}): OptimizationInput {
  return {
    inventory: [
      { warehouseCode: 'CA1', warehouseName: '加州一仓', productCode: '商品一', series: '系列甲', quantity: 100, inventoryStatus: '在库', productType: '成品', ageDays: 10 },
      { warehouseCode: 'CA1', warehouseName: '加州一仓', productCode: '商品一', series: '系列甲', quantity: 80, inventoryStatus: '在途', productType: '成品', expectedArrivalDate: '2026-09-05' },
      { warehouseCode: 'CA1', warehouseName: '加州一仓', productCode: '商品一', series: '系列甲', quantity: 30, inventoryStatus: '在库', productType: '退货' },
    ],
    forecast: [{ series: '系列甲', quantity: 90, periodDays: 45 }],
    packaging: [{ productCode: '商品一', lengthCm: 50, widthCm: 40, heightCm: 30, weightKg: 2, unitsPerCarton: 10 }],
    warehouses: [{ code: 'CA1', name: '加州一仓', region: '美西' }, { code: 'CA2', name: '加州二仓', region: '美西' }, { code: 'NJ1', name: '新泽西仓', region: '美东' }],
    activeRules: [
      { id: '一', category: '仓储费', name: '仓储', warehouseCode: 'CA1', startDay: 0, endDay: 999, billingUnit: '每件', billingPeriod: '每天', rateUsd: 1, conditions: '', confidence: '高', evidence: { sheetName: '报价', cellRange: 'A1', rawText: '仓储' }, validationIssues: [] },
      { id: '二', category: '仓储费', name: '仓储', warehouseCode: 'CA2', startDay: 0, endDay: 999, billingUnit: '每件', billingPeriod: '每天', rateUsd: 0.01, conditions: '', confidence: '高', evidence: { sheetName: '报价', cellRange: 'A2', rawText: '仓储' }, validationIssues: [] },
      { id: '三', category: '中转运输费', name: '运输', routeFrom: 'CA1', routeTo: 'CA2', billingUnit: '每件', rateUsd: 0.01, transitDays: 3, conditions: '', confidence: '高', evidence: { sheetName: '报价', cellRange: 'A3', rawText: '运输' }, validationIssues: [] },
    ],
    manualQuotes: [],
    settings: { baseDate: '2026-09-01', analysisDays: 45, usdToCny: 7, minimumSavingsCny: 1, minimumSavingsRate: 1, safetyStockDays: 45 },
    ...overrides,
  }
}

describe('调拨优化', () => {
  it('只有在库成品进入期初数量和调拨比例', () => {
    const row = optimizeTransfers(input())[0]
    expect(row.initialQuantity).toBe(100)
    expect(row.transferRatio).toBe(row.transferQuantity / 100)
  })

  it('目的仓只会从同一区域选择', () => {
    const row = optimizeTransfers(input())[0]
    expect(row.destinationWarehouse).not.toBe('NJ1')
  })

  it('包装参数完整时按整箱件数递增', () => {
    const row = optimizeTransfers(input())[0]
    expect(row.transferQuantity % 10).toBe(0)
  })

  it('自行寻找的全包价不重复计算出库和入库费', () => {
    const value = input({ manualQuotes: [{ carrier: '承运商甲', originWarehouse: 'CA1', destinationWarehouse: 'CA2', quantity: 100, volumeCubicMeters: 6, priceMode: '总价', price: 1, currency: '人民币', transitDays: 2, scope: '全包价', quoteDate: '2026-09-01', expiresAt: '2026-12-01', notes: '' }] })
    const row = optimizeTransfers(value)[0]
    if (row.transferResource.includes('承运商甲')) {
      expect(row.transferCost.outbound).toBe(0)
      expect(row.transferCost.inbound).toBe(0)
    }
  })

  it('总价不匹配实际体积时不自动缩放', () => {
    const value = input({ activeRules: [], manualQuotes: [{ carrier: '承运商甲', originWarehouse: 'CA1', destinationWarehouse: 'CA2', quantity: 50, volumeCubicMeters: 999, priceMode: '总价', price: 1, currency: '人民币', transitDays: 2, scope: '全包价', quoteDate: '2026-09-01', expiresAt: '2026-12-01', notes: '' }] })
    const row = optimizeTransfers(value)[0]
    expect(row.transferResource).not.toContain('承运商甲')
  })

  it('在途成品按预计日期加入库存消耗', () => {
    const row = optimizeTransfers(input({ warehouses: [{ code: 'CA1', name: '加州一仓', region: '美西' }] }))[0]
    expect(row.endingQuantity).toBeCloseTo(90, 5)
    expect(row.riskMessages.join('')).not.toContain('缺货')
  })

  it('节省金额和节省比例必须同时达到标准', () => {
    const value = input({ settings: { baseDate: '2026-09-01', analysisDays: 45, usdToCny: 7, minimumSavingsCny: 999999, minimumSavingsRate: 99, safetyStockDays: 45 } })
    const row = optimizeTransfers(value)[0]
    expect(row.decision).toBe('不调拨')
    expect(row.transferQuantity).toBe(0)
  })

  it('缺少批次日期和存放天数时提示补充，不猜测仓储阶梯', () => {
    const value = input({ inventory: [{ warehouseCode: 'CA1', warehouseName: '加州一仓', productCode: '商品一', series: '系列甲', quantity: 100, inventoryStatus: '在库', productType: '成品' }] })
    const row = optimizeTransfers(value)[0]
    expect(row.dataQualityMessages.join('')).toContain('缺少批次日期或库存存放天数')
  })

  it('每立方米中转单价按实际体积计算并可与物流商比较', () => {
    const value = input({ manualQuotes: [{ carrier: '低价承运商', originWarehouse: 'CA1', destinationWarehouse: 'CA2', quantity: 100, volumeCubicMeters: 6, priceMode: '每立方米单价', price: 0.01, currency: '人民币', transitDays: 2, scope: '全包价', quoteDate: '2026-09-01', expiresAt: '2026-12-01', notes: '' }] })
    const row = optimizeTransfers(value)[0]
    expect(row.transferResource).toContain('低价承运商')
  })
})

describe('站点需求区域识别', () => {
  it('识别加拿大、英国、美国、欧洲并排除明显脏值', () => {
    expect(demandSiteRegion('K1A 0B1')).toBe('加拿大')
    expect(demandSiteRegion('SW1A 1AA')).toBe('英国')
    expect(demandSiteRegion('90001-1234')).toBe('美国')
    expect(demandSiteRegion('00-001')).toBe('欧洲')
    expect(demandSiteRegion('N/A')).toBeUndefined()
    expect(demandSiteRegion('未知')).toBeUndefined()
    expect(demandSiteRegion('—')).toBeUndefined()
    expect(demandSiteRegion('   ')).toBeUndefined()
  })
})
