import { describe, expect, it } from 'vitest'
import { aggregateStateDemand, aggregateStateInventory, resolveOutboundDemandRegion } from '../stateAggregation'
import type { InventoryRecord, OutboundRecord, WarehouseAddress } from '../types'

function outbound(postalCode: string, quantity: number, country?: string): OutboundRecord {
  return { productCode: '商品', series: '系列', date: '2026-08-01', postalCode, quantity, status: '', channel: '商家自发货', country }
}

function inventory(warehouseCode: string, quantity: number, inventoryStatus: InventoryRecord['inventoryStatus'] = '在库'): InventoryRecord {
  return { warehouseCode, warehouseName: warehouseCode, productCode: '商品', series: '系列', quantity, inventoryStatus, productType: '成品' }
}

function address(code: string, state: string, confirmed = true): WarehouseAddress {
  return { code, name: code, state, city: '', address: '', postalCode: '', suggestedRegion: '美西', confirmedRegion: '美西', confirmed }
}

describe('美国州级热力聚合', () => {
  it('销售区域优先按邮编精确定州，查不到州时按邮编首位兜底', () => {
    expect(resolveOutboundDemandRegion(outbound('90001', 1, '美国'))).toBe('美西')
    expect(resolveOutboundDemandRegion(outbound('07030', 1, 'USA'))).toBe('美东')
    expect(resolveOutboundDemandRegion(outbound('75001', 1, '法国'))).toBe('美中')
    expect(resolveOutboundDemandRegion(outbound('00000', 1, '美国'))).toBe('美东')
    expect(resolveOutboundDemandRegion(outbound('90001', 1, '加拿大'))).toBe('美西')
  })

  it('加拿大和英国按邮编识别，邮编无法识别时仅用国家字段兜底欧洲', () => {
    expect(resolveOutboundDemandRegion(outbound('K1A 0B1', 1, '美国'))).toBe('加拿大')
    expect(resolveOutboundDemandRegion(outbound('SW1A 1AA', 1, '法国'))).toBe('英国')
    expect(resolveOutboundDemandRegion(outbound('FR-75001', 1, '法国'))).toBe('欧洲')
    expect(resolveOutboundDemandRegion(outbound('未知', 1, '加拿大'))).toBeUndefined()
  })

  it('州级需求只按美国邮编前3位聚合，海外和异常邮编安全跳过', () => {
    const result = aggregateStateDemand([
      outbound('90001', 10, '美国'),
      outbound('07030-1234', 5, 'USA'),
      outbound('A1A 1A1', 7, '加拿大'),
      outbound('75001', 11, '法国'),
      outbound('未知', 13),
      outbound('00000', 17),
    ])

    expect(result).toEqual({ CA: 10, NJ: 5, TX: 11 })
  })

  it('库存只汇总已确认且有有效美国州地址的在库量', () => {
    const result = aggregateStateInventory([
      inventory('CA-WH', 10),
      inventory('GA-WH', 5),
      inventory('NJ-WH', 8, '在途'),
      inventory('CA-UNCONFIRMED', 9),
      inventory('CA-WITHOUT-STATE', 12),
      inventory('CA-CANADA', 14),
    ], [
      address('CA-WH', 'CA'),
      address('GA-WH', 'GA'),
      address('NJ-WH', 'NJ'),
      address('CA-UNCONFIRMED', 'CA', false),
      address('CA-WITHOUT-STATE', ''),
      address('CA-CANADA', 'ON'),
    ])

    expect(result).toEqual({ CA: 10, GA: 5 })
  })
})
