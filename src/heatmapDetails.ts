import type { DemandRegion, InventoryHeatmapSkuDetail, InventoryRecord, OutboundRecord, SalesHeatmapSkuDetail, WarehouseRegion } from './types'

export const heatmapDetailRegionOrder: DemandRegion[] = ['美东', '美西', '美中', '加拿大', '欧洲', '英国']

export interface ProductMetadata {
  productLine: string
  series: string
}

export interface ResolvedOutboundRecord {
  row: OutboundRecord
  region: DemandRegion
}

function productKey(value: unknown) {
  return String(value ?? '').trim().toLocaleUpperCase()
}

export function buildListingMaterialMap(rows: Record<string, unknown>[]): Map<string, string> {
  const listingMap = new Map<string, string>()
  for (const row of rows) {
    const listingCode = productKey(row['领星商品编码'])
    const materialCode = String(row['物料编码'] ?? '').trim()
    if (listingCode && materialCode) listingMap.set(listingCode, materialCode)
  }
  return listingMap
}

export function buildProductMetadata(rows: Record<string, unknown>[]): Map<string, ProductMetadata> {
  const metadata = new Map<string, ProductMetadata>()
  const normalized = rows.map((row) => ({
    productCode: productKey(row['商品编码']),
    sku: productKey(row['SKU']),
    value: {
      productLine: String(row['销售产品线'] ?? '').trim(),
      series: String(row['销售系列'] ?? '').trim(),
    },
  }))
  normalized.forEach(({ sku, value }) => { if (sku && !metadata.has(sku)) metadata.set(sku, value) })
  normalized.forEach(({ productCode, value }) => { if (productCode) metadata.set(productCode, value) })
  return metadata
}

function productInfo(metadata: Map<string, ProductMetadata>, sku: string): ProductMetadata {
  return metadata.get(productKey(sku)) ?? { productLine: '', series: '' }
}

function salesProductInfo(metadata: Map<string, ProductMetadata>, listingMap: Map<string, string>, sku: string): ProductMetadata {
  const skuKey = productKey(sku)
  const materialCode = listingMap.get(skuKey)
  return (materialCode ? metadata.get(productKey(materialCode)) : undefined) ?? metadata.get(skuKey) ?? { productLine: '', series: '' }
}

function detailRatio(region: DemandRegion, quantity: number, usTotal: number, allTotal: number) {
  return ['美东', '美西', '美中'].includes(region) ? (usTotal ? quantity / usTotal : 0) : (allTotal ? quantity / allTotal : 0)
}

export function aggregateSalesHeatmapDetails(rows: ResolvedOutboundRecord[], metadata: Map<string, ProductMetadata>, listingMap: Map<string, string>): SalesHeatmapSkuDetail[] {
  const quantities = new Map<string, { region: DemandRegion; sku: string; orderQuantity: number }>()
  for (const { row, region } of rows) {
    if (!row.productCode || row.quantity <= 0) continue
    const key = `${region}\u0000${productKey(row.productCode)}`
    const current = quantities.get(key)
    if (current) current.orderQuantity += row.quantity
    else quantities.set(key, { region, sku: row.productCode, orderQuantity: row.quantity })
  }
  const allTotal = [...quantities.values()].reduce((sum, row) => sum + row.orderQuantity, 0)
  const usTotal = [...quantities.values()].filter((row) => ['美东', '美西', '美中'].includes(row.region)).reduce((sum, row) => sum + row.orderQuantity, 0)
  return [...quantities.values()].map((row) => ({
    ...row,
    ...salesProductInfo(metadata, listingMap, row.sku),
    ratio: detailRatio(row.region, row.orderQuantity, usTotal, allTotal),
  })).sort(detailSort((row) => row.orderQuantity))
}

export function aggregateInventoryHeatmapDetails(rows: InventoryRecord[], metadata: Map<string, ProductMetadata>, usRegionByWarehouseCode: Map<string, WarehouseRegion>): InventoryHeatmapSkuDetail[] {
  const quantities = new Map<string, { region: DemandRegion; sku: string; onHand: number; inTransit: number }>()
  for (const row of rows) {
    if (row.productType !== '成品' || row.quantity <= 0) continue
    let region: DemandRegion | undefined = usRegionByWarehouseCode.get(row.warehouseCode.trim().toLocaleUpperCase())
    if (!region) {
      if (row.siteRegion === '加拿大') region = '加拿大'
      else if (row.siteRegion === '英国') region = '英国'
      else if (row.siteRegion === '欧洲') region = '欧洲'
    }
    if (!region) continue
    const key = `${region}\u0000${productKey(row.productCode)}`
    const current = quantities.get(key) ?? { region, sku: row.productCode, onHand: 0, inTransit: 0 }
    if (row.inventoryStatus === '在库') current.onHand += row.quantity
    else current.inTransit += row.quantity
    quantities.set(key, current)
  }
  const totals = [...quantities.values()].map((row) => ({ ...row, total: row.onHand + row.inTransit }))
  const allTotal = totals.reduce((sum, row) => sum + row.total, 0)
  const usTotal = totals.filter((row) => ['美东', '美西', '美中'].includes(row.region)).reduce((sum, row) => sum + row.total, 0)
  return totals.map((row) => ({
    ...row,
    ...productInfo(metadata, row.sku),
    ratio: detailRatio(row.region, row.total, usTotal, allTotal),
  })).sort(detailSort((row) => row.total))
}

function detailSort<T extends { region: DemandRegion }>(quantity: (row: T) => number) {
  return (a: T, b: T) => heatmapDetailRegionOrder.indexOf(a.region) - heatmapDetailRegionOrder.indexOf(b.region) || quantity(b) - quantity(a) || a.region.localeCompare(b.region, 'zh-CN')
}
