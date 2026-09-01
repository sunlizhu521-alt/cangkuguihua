import { describe, expect, it } from 'vitest'
import { aggregateInventoryHeatmapDetails, aggregateSalesHeatmapDetails, buildProductMetadata } from '../heatmapDetails'
import type { InventoryRecord, OutboundRecord } from '../types'

function outbound(productCode: string, quantity: number): OutboundRecord {
  return { productCode, series: productCode, date: '2026-08-01', postalCode: '', quantity, status: '', channel: '商家自发货' }
}

function inventory(warehouseCode: string, productCode: string, quantity: number, inventoryStatus: InventoryRecord['inventoryStatus'], siteRegion: InventoryRecord['siteRegion']): InventoryRecord {
  return { warehouseCode, warehouseName: warehouseCode, productCode, series: productCode, quantity, inventoryStatus, productType: '成品', siteRegion }
}

describe('热力图SKU级明细聚合', () => {
  const metadata = buildProductMetadata([
    { '商品编码': 'MAT-1', SKU: 'sku-1', '销售系列': '系列甲', '销售产品线': '产品线甲' },
    { SKU: 'SKU-2', '销售系列': '系列乙', '销售产品线': '产品线乙' },
  ])

  it('商品维度同时使用SKU和商品编码匹配，且产品线与系列分开保留', () => {
    expect(metadata.get('SKU-1')).toEqual({ productLine: '产品线甲', series: '系列甲' })
    expect(metadata.get('MAT-1')).toEqual({ productLine: '产品线甲', series: '系列甲' })
    expect(metadata.get('SKU-2')).toEqual({ productLine: '产品线乙', series: '系列乙' })
  })

  it('销售明细按区域和SKU汇总，美国三区用全美分母，海外用全部有效订单分母', () => {
    const details = aggregateSalesHeatmapDetails([
      { row: outbound('sku-1', 60), region: '美东' },
      { row: outbound('MAT-1', 40), region: '美西' },
      { row: outbound('SKU-2', 20), region: '加拿大' },
      { row: outbound('UNKNOWN', 10), region: '欧洲' },
    ], metadata)

    expect(details.find((row) => row.sku === 'sku-1')).toMatchObject({ productLine: '产品线甲', series: '系列甲', ratio: 0.6 })
    expect(details.find((row) => row.sku === 'MAT-1')?.ratio).toBe(0.4)
    expect(details.find((row) => row.region === '加拿大')?.ratio).toBeCloseTo(20 / 130)
    expect(details.find((row) => row.sku === 'UNKNOWN')).toMatchObject({ productLine: '', series: '' })
  })

  it('库存明细将美国在库与在途都按已确认仓库州区域汇总', () => {
    const details = aggregateInventoryHeatmapDetails([
      inventory('CA-WH', 'MAT-1', 10, '在库', undefined),
      inventory('CA-WH', 'MAT-1', 5, '在途', undefined),
      inventory('NJ-WH', 'SKU-2', 5, '在途', '美国'),
      inventory('CA-CANADA', 'SKU-2', 3, '在库', '加拿大'),
      inventory('CA-CANADA', 'SKU-2', 2, '在途', '加拿大'),
      inventory('NO-ADDRESS', 'SKU-2', 99, '在途', '美国'),
    ], metadata, new Map([['CA-WH', '美西'], ['NJ-WH', '美东']]))

    expect(details[0].region).toBe('美东')
    expect(details.find((row) => row.region === '美西')).toMatchObject({ onHand: 10, inTransit: 5, total: 15, ratio: 0.75 })
    expect(details.find((row) => row.region === '美东')).toMatchObject({ onHand: 0, inTransit: 5, total: 5, ratio: 0.25 })
    expect(details.find((row) => row.region === '加拿大')).toMatchObject({ onHand: 3, inTransit: 2, total: 5, ratio: 0.2 })
    expect(details.some((row) => row.total === 99)).toBe(false)
  })
})
