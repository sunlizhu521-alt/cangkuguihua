import { describe, expect, it } from 'vitest'
import { aggregateInventoryHeatmapDetails, aggregateSalesHeatmapDetails, buildListingMaterialMap, buildProductMetadata } from '../heatmapDetails'
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
  const listingMap = buildListingMaterialMap([
    { '领星商品编码': ' listing-1 ', '物料编码': ' MAT-1 ' },
    { '领星商品编码': '', '物料编码': 'MAT-EMPTY' },
  ])

  it('领星商品编码去空格并转大写后映射到物料编码，空键不进入映射', () => {
    expect(listingMap.get('LISTING-1')).toBe('MAT-1')
    expect(listingMap.has('')).toBe(false)
  })

  it('商品维度以商品编码为主键、SKU为备用键，且产品线与系列分开保留', () => {
    expect(metadata.get('SKU-1')).toEqual({ productLine: '产品线甲', series: '系列甲' })
    expect(metadata.get('MAT-1')).toEqual({ productLine: '产品线甲', series: '系列甲' })
    expect(metadata.get('SKU-2')).toEqual({ productLine: '产品线乙', series: '系列乙' })
    const collision = buildProductMetadata([
      { '商品编码': 'MAT-PRIMARY', SKU: 'SKU-A', '销售系列': '主系列', '销售产品线': '主产品线' },
      { '商品编码': 'MAT-OTHER', SKU: 'MAT-PRIMARY', '销售系列': '备用系列', '销售产品线': '备用产品线' },
    ])
    expect(collision.get('MAT-PRIMARY')).toEqual({ productLine: '主产品线', series: '主系列' })
  })

  it('销售明细先通过领星编码映射物料编码，未映射时保留原SKU直查兜底', () => {
    const details = aggregateSalesHeatmapDetails([
      { row: outbound('listing-1', 60), region: '美东' },
      { row: outbound('MAT-1', 40), region: '美西' },
      { row: outbound('SKU-2', 20), region: '加拿大' },
      { row: outbound('UNKNOWN', 10), region: '欧洲' },
    ], metadata, listingMap)

    expect(details.find((row) => row.sku === 'listing-1')).toMatchObject({ productLine: '产品线甲', series: '系列甲', ratio: 0.6 })
    expect(details.find((row) => row.sku === 'MAT-1')?.ratio).toBe(0.4)
    expect(details.find((row) => row.sku === 'MAT-1')).toMatchObject({ productLine: '产品线甲', series: '系列甲' })
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
