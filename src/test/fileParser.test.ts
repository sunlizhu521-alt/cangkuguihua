import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { countryToSiteRegion, demandRegion, demandSiteRegion, inspectWorkbook, normalizeDate, parseInventory, parseOutbound, parseWarehouses, readProductDimensionRows, warehouseRegionFromSite } from '../fileParser'
import { fileSlots } from '../data'
import type { FileSlotId, StoredFile } from '../types'

function inventoryFile(rows: object[], mapping: Record<string, string> = { 仓库名称: '仓库', 商品编码: '货号', 数量: '总数', 在库量: '在库', 在途量: '在途' }): StoredFile {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), '库存')
  return {
    slotId: 'inventory',
    fileName: '库存测试.xlsx',
    updatedAt: new Date().toISOString(),
    rowCount: rows.length,
    sheetNames: ['库存'],
    headers: ['仓库', '货号', '总数', '在库', '在途'],
    previewRows: [],
    data: XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer,
    mapping,
    validation: '校验通过',
    missingFields: [],
  }
}

function mappedFile(slotId: FileSlotId, rows: object[], mapping: Record<string, string>): StoredFile {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, sheet, '数据')
  return {
    slotId,
    fileName: '出库测试.xlsx',
    updatedAt: new Date().toISOString(),
    rowCount: rows.length,
    sheetNames: ['数据'],
    headers: Object.keys(rows[0] ?? {}),
    previewRows: [],
    data: XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer,
    mapping,
    validation: '校验通过',
    missingFields: [],
  }
}

describe('库存字段解析', () => {
  it('将一行的在库量和在途量拆成两类库存', () => {
    const rows = parseInventory(inventoryFile([{ 仓库: '洛杉矶仓', 货号: '商品一', 总数: 99, 在库: 12, 在途: 5 }]))
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.inventoryStatus === '在库')?.quantity).toBe(12)
    expect(rows.find((row) => row.inventoryStatus === '在途')?.quantity).toBe(5)
    expect(rows.every((row) => row.productType === '成品')).toBe(true)
  })

  it('未选择在库量和在途量字段时可使用数量作为在库量', () => {
    const rows = parseInventory(inventoryFile(
      [{ 仓库: '洛杉矶仓', 货号: '商品一', 总数: 20, 在库: '', 在途: '' }],
      { 仓库名称: '仓库', 商品编码: '货号', 数量: '总数' },
    ))
    expect(rows).toHaveLength(1)
    expect(rows[0].inventoryStatus).toBe('在库')
    expect(rows[0].quantity).toBe(20)
  })

  it('已选择在库量或在途量后不再使用总数量补空值', () => {
    const rows = parseInventory(inventoryFile([{ 仓库: '洛杉矶仓', 货号: '商品一', 总数: 20, 在库: '', 在途: '' }]))
    expect(rows).toHaveLength(0)
  })
})

describe('商品维度字段解析', () => {
  it('型号未单独映射时按物料编码读取同名型号列', () => {
    const file = mappedFile('product', [{ 物料编码: 'MAT-001', 型号: 'MODEL-A', 销售产品线: '产品线甲' }], { 销售产品线: '销售产品线' })

    expect(readProductDimensionRows(file)).toEqual([{ 商品编码: 'MAT-001', 型号: 'MODEL-A', 销售产品线: '产品线甲' }])
  })
})

describe('销售需求区域识别', () => {
  it('识别英国邮编并容忍小写与前后空格', () => {
    expect(demandRegion('SW1A 1AA')).toBe('英国')
    expect(demandRegion('M1 1AE')).toBe('英国')
    expect(demandRegion('  sw1a 1aa  ')).toBe('英国')
  })

  it('识别加拿大邮编', () => {
    expect(demandRegion('K1A 0B1')).toBe('加拿大')
    expect(demandRegion('  k1a0b1  ')).toBe('加拿大')
  })

  it('识别美国三个区域及带后四位的邮编', () => {
    expect(demandRegion('90001')).toBe('美西')
    expect(demandRegion('60601')).toBe('美中')
    expect(demandRegion('10001')).toBe('美东')
    expect(demandRegion('90001-1234')).toBe('美西')
  })

  it('无法仅靠邮编识别的格式返回未识别', () => {
    expect(demandRegion('00-001')).toBeUndefined()
    expect(demandRegion('1234 AB')).toBeUndefined()
    expect(demandSiteRegion('00-001')).toBeUndefined()
    expect(demandSiteRegion('1234 AB')).toBeUndefined()
  })

  it('排除空值和明显脏值', () => {
    for (const code of ['', '   ', 'N/A', 'NA', 'NULL', 'NONE', 'UNKNOWN', '未知', '无', '不详', '-', '–', '—']) {
      expect(demandRegion(code)).toBeUndefined()
    }
  })

  it('站点区域邮编识别加拿大、英国、美国并取美国前5位', () => {
    expect(demandSiteRegion('K1A 0B1')).toBe('加拿大')
    expect(demandSiteRegion('SW1A 1AA')).toBe('英国')
    expect(demandSiteRegion('90001-1234')).toBe('美国')
  })

  it('国家和地区优先识别站点，并避免国家代码子串误判', () => {
    expect(countryToSiteRegion('加拿大')).toBe('加拿大')
    expect(countryToSiteRegion('CA')).toBe('加拿大')
    expect(countryToSiteRegion('America')).toBe('美国')
    expect(countryToSiteRegion('DE')).toBe('欧洲')
    expect(countryToSiteRegion('法国')).toBe('欧洲')
    expect(countryToSiteRegion('中国内地')).toBeUndefined()
    expect(countryToSiteRegion('美国本土外小岛屿')).toBeUndefined()
  })
})

describe('工作簿标题行解析', () => {
  it('第一条有效行作为标题，数据中的额外列保留为未命名列', async () => {
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([
      ['商品编码', '数量'],
      ['商品一', 2, '额外数据'],
      ['商品二', 3, '额外数据'],
    ])
    XLSX.utils.book_append_sheet(workbook, sheet, '出库')
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const file = { name: '首行标题.xlsx', arrayBuffer: async () => data } as File
    const definition = fileSlots.find((slot) => slot.id === 'amazonOutbound')!

    const inspected = await inspectWorkbook(file, definition)

    expect(inspected.headers).toEqual(['商品编码', '数量', '未命名列3'])
    expect(inspected.rowCount).toBe(2)
    expect(inspected.previewRows[0]).toEqual({ 商品编码: '商品一', 数量: 2, 未命名列3: '额外数据' })
  })

  it('第一个工作表为空时自动读取后续含标题和数据的工作表', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), '说明')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['商品编码', '数量'],
      ['商品一', 2],
    ]), '销售出库')
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const file = { name: '多工作表.xlsx', arrayBuffer: async () => data } as File
    const definition = fileSlots.find((slot) => slot.id === 'merchantOutbound')!

    const inspected = await inspectWorkbook(file, definition)

    expect(inspected.sourceSheetName).toBe('销售出库')
    expect(inspected.headers).toEqual(['商品编码', '数量'])
  })

  it('标题行中有空标题时仍按数据实际宽度保留完整列', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['商品编码', '数量', ''],
      ['商品一', 2, '额外内容'],
    ]), '出库')
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const file = { name: '空标题列.xlsx', arrayBuffer: async () => data } as File
    const definition = fileSlots.find((slot) => slot.id === 'amazonOutbound')!

    const inspected = await inspectWorkbook(file, definition)

    expect(inspected.headers).toEqual(['商品编码', '数量', '未命名列3'])
    expect(inspected.previewRows[0]['未命名列3']).toBe('额外内容')
  })

  it('标题位于第20行之后时仍可以识别', async () => {
    const workbook = XLSX.utils.book_new()
    const rows = Array.from({ length: 25 }, () => [] as unknown[])
    rows.push(['商品编码', '数量'], ['商品一', 2])
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '出库')
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const file = { name: '标题靠后.xlsx', arrayBuffer: async () => data } as File
    const definition = fileSlots.find((slot) => slot.id === 'merchantOutbound')!

    const inspected = await inspectWorkbook(file, definition)

    expect(inspected.headers).toEqual(['商品编码', '数量'])
    expect(inspected.rowCount).toBe(1)
  })

  it('大文件预览只读取前段数据但保留完整数据行数', async () => {
    const workbook = XLSX.utils.book_new()
    const rows = [['商品编码', '数量'], ...Array.from({ length: 300 }, (_, index) => [`商品${index + 1}`, index + 1])]
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '出库')
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const file = { name: '大文件.xlsx', arrayBuffer: async () => data } as File
    const definition = fileSlots.find((slot) => slot.id === 'merchantOutbound')!

    const inspected = await inspectWorkbook(file, definition)

    expect(inspected.rowCount).toBe(300)
    expect(inspected.previewRows).toHaveLength(8)
  })

  it('较长的CSV文件同样保留完整数据行数', async () => {
    const csv = ['商品编码,数量', ...Array.from({ length: 300 }, (_, index) => `商品${index + 1},${index + 1}`)].join('\n')
    const data = new TextEncoder().encode(csv).buffer as ArrayBuffer
    const file = { name: '大文件.csv', arrayBuffer: async () => data } as File
    const definition = fileSlots.find((slot) => slot.id === 'merchantOutbound')!

    const inspected = await inspectWorkbook(file, definition)

    expect(inspected.rowCount).toBe(300)
    expect(inspected.headers).toEqual(['商品编码', '数量'])
  })
})

describe('出库数据解析', () => {
  it('亚马逊仓配使用日期和SKU映射，内部销售系列使用SKU', () => {
    const file = mappedFile('amazonOutbound', [{ sku: '商品一', date: 'Aug 1, 2026 12:03:57 AM PDT', quantity: 2, postal: '34986' }], { SKU: 'sku', 日期: 'date', 数量: 'quantity', 邮编: 'postal' })
    const rows = parseOutbound(file, '亚马逊仓配')
    expect(rows).toHaveLength(1)
    expect(rows[0].productCode).toBe('商品一')
    expect(rows[0].series).toBe('商品一')
    expect(rows[0].date).toBe('2026-08-01')
    expect(rows[0].postalCode).toBe('34986')
    expect(rows[0].status).toBe('')
  })

  it('亚马逊仓配映射履约方式后只保留Amazon记录', () => {
    const file = mappedFile('amazonOutbound', [
      { sku: '商品一', date: '2026-08-01', quantity: 2, postal: '34986-1234', fulfillment: 'Amazon' },
      { sku: '商品二', date: '2026-08-01', quantity: 3, postal: '90001', fulfillment: 'Merchant' },
    ], { SKU: 'sku', 日期: 'date', 数量: 'quantity', 邮编: 'postal', 履约方式: 'fulfillment' })
    const rows = parseOutbound(file, '亚马逊仓配')
    expect(rows).toHaveLength(1)
    expect(rows[0].productCode).toBe('商品一')
    expect(rows[0].postalCode).toBe('34986')
  })

  it('亚马逊仓配结算导出存在type列时只统计订单并排除退款', () => {
    const file = mappedFile('amazonOutbound', [
      { type: 'Order', sku: '商品一', date: '2026-08-01', quantity: 2, postal: '34986', fulfillment: 'Amazon' },
      { type: 'Refund', sku: '商品一', date: '2026-08-02', quantity: 2, postal: '34986', fulfillment: 'Amazon' },
    ], { SKU: 'sku', 日期: 'date', 数量: 'quantity', 邮编: 'postal', 履约方式: 'fulfillment' })

    expect(parseOutbound(file, '亚马逊仓配')).toMatchObject([
      { productCode: '商品一', date: '2026-08-01', quantity: 2 },
    ])
  })

  it('商家自发货使用日期和SKU映射', () => {
    const file = mappedFile('merchantOutbound', [{ sku: '商品二', date: '2026-08-02', quantity: 1, postal: '90001' }], { SKU: 'sku', 日期: 'date', 数量: 'quantity', 邮编: 'postal' })
    expect(parseOutbound(file, '商家自发货')).toHaveLength(1)
  })

  it('商家自发货保留国家地区、过滤排除地区并截取邮编前5位', () => {
    const file = mappedFile('merchantOutbound', [
      { sku: '商品一', date: '2026-08-02', quantity: 1, postal: '90001-1234', country: '美国' },
      { sku: '商品二', date: '2026-08-02', quantity: 1, postal: '10001', country: '中国内地' },
      { sku: '商品三', date: '2026-08-02', quantity: 1, postal: '20000', country: '美国本土外小岛屿' },
    ], { SKU: 'sku', 日期: 'date', 数量: 'quantity', 邮编: 'postal', '国家/地区': 'country' })
    const rows = parseOutbound(file, '商家自发货')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ productCode: '商品一', postalCode: '90001', country: '美国' })
  })

  it('两类出库数据提供各自新增映射字段且保持非必填', () => {
    const amazon = fileSlots.find((slot) => slot.id === 'amazonOutbound')
    const merchant = fileSlots.find((slot) => slot.id === 'merchantOutbound')
    expect(amazon?.requiredFields).toEqual([])
    expect(merchant?.requiredFields).toEqual([])
    expect(amazon?.optionalFields).toEqual(['日期', 'SKU', '邮编', '数量', '仓库名称', '履约方式'])
    expect(merchant?.optionalFields).toEqual(['日期', 'SKU', '邮编', '数量', '仓库名称', '国家/地区'])
    expect(amazon?.optionalFields).not.toEqual(expect.arrayContaining(['商品编码', '销售系列', '出库日期', '订单状态']))
    expect(merchant?.optionalFields).not.toEqual(expect.arrayContaining(['商品编码', '销售系列', '出库日期', '订单状态']))
  })

  it('Excel日期对象和日期时间文本不会因时区提前一天', () => {
    expect(normalizeDate(new Date(2026, 7, 28, 3, 11, 16))).toBe('2026-08-28')
    expect(normalizeDate('2026-08-28 03:11:16')).toBe('2026-08-28')
    expect(normalizeDate('Aug 1, 2026 12:03:57 AM PDT')).toBe('2026-08-01')
  })
})

describe('对照表映射字段', () => {
  it('使用事业部、名称和物料编码字段', () => {
    expect(fileSlots.find((slot) => slot.id === 'customerMaterial')?.optionalFields).toEqual(['事业部', '客户名称', '物料编码'])
    expect(fileSlots.find((slot) => slot.id === 'warehouseMaterial')?.optionalFields).toEqual(['事业部', '仓库名称', '物料编码'])
  })

  it('仓库维度使用组织、仓库、仓库名称、一级仓库分类和站点', () => {
    const fields = fileSlots.find((slot) => slot.id === 'warehouse')?.optionalFields
    expect(fields).toEqual(['使用组织', '仓库', '仓库名称', '一级仓库分类', '站点'])
    expect(fields).not.toEqual(expect.arrayContaining(['仓库编码', '州', '城市', '详细地址', '邮编', '所属区域']))
    const file = mappedFile('warehouse', [{ 仓库原值: 'WH-CA-01', 仓库名称原值: '洛杉矶仓' }], { 仓库: '仓库原值', 仓库名称: '仓库名称原值' })
    expect(parseWarehouses(file)).toMatchObject([{ code: 'WH-CA-01', name: '洛杉矶仓', region: '美中' }])
    const nameOnlyFile = mappedFile('warehouse', [{ 仓库名称原值: '新泽西仓', 其他列: '测试' }], { 仓库名称: '仓库名称原值' })
    expect(parseWarehouses(nameOnlyFile)).toMatchObject([{ code: '新泽西仓', name: '新泽西仓', region: '美中' }])
  })

  it('根据仓库站点识别站点区域', () => {
    const file = mappedFile('warehouse', [
      { 仓库原值: 'WH-US', 仓库名称原值: '美国仓', 站点原值: '美国' },
      { 仓库原值: 'WH-CA', 仓库名称原值: '加拿大仓', 站点原值: '加拿大' },
      { 仓库原值: 'WH-UK', 仓库名称原值: '英国仓', 站点原值: '英国' },
      { 仓库原值: 'WH-DE', 仓库名称原值: '德国仓', 站点原值: '德国' },
    ], { 仓库: '仓库原值', 仓库名称: '仓库名称原值', 站点: '站点原值' })

    expect(parseWarehouses(file)).toMatchObject([
      { site: '美国', siteRegion: '美国' },
      { site: '加拿大', siteRegion: '加拿大' },
      { site: '英国', siteRegion: '英国' },
      { site: '德国', siteRegion: '欧洲' },
    ])
  })

  it('库存仓库按金蝶名称关联后，使用站点细分美东、美西和美中', () => {
    const file = mappedFile('warehouse', [
      { 金蝶名称原值: '金蝶美东仓', 站点原值: '美东' },
      { 金蝶名称原值: '金蝶美西仓', 站点原值: '美西' },
      { 金蝶名称原值: '金蝶美中仓', 站点原值: '美中' },
      { 金蝶名称原值: '美国共享仓', 站点原值: '美国' },
    ], { 仓库名称: '金蝶名称原值', 站点: '站点原值' })

    expect(parseWarehouses(file)).toMatchObject([
      { name: '金蝶美东仓', site: '美东', siteRegion: '美国', region: '美东' },
      { name: '金蝶美西仓', site: '美西', siteRegion: '美国', region: '美西' },
      { name: '金蝶美中仓', site: '美中', siteRegion: '美国', region: '美中' },
      { name: '美国共享仓', site: '美国', siteRegion: '美国', region: '美中' },
    ])
    expect(warehouseRegionFromSite('美国')).toBeUndefined()
  })

  it('商品维度增加销售产品线、SKU和型号并移除品类', () => {
    const fields = fileSlots.find((slot) => slot.id === 'product')?.optionalFields
    expect(fields).toEqual(['商品编码', 'SKU', '商品名称', '型号', '销售系列', '销售产品线'])
    expect(fields).not.toContain('品类')
  })
})
