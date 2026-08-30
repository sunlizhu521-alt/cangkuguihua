import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { inspectWorkbook, normalizeDate, parseInventory, parseOutbound, parseWarehouses } from '../fileParser'
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
    const file = mappedFile('amazonOutbound', [{ sku: '商品一', date: '2026-08-01', quantity: 2, postal: '34986' }], { SKU: 'sku', 日期: 'date', 数量: 'quantity', 邮编: 'postal' })
    const rows = parseOutbound(file, '亚马逊仓配')
    expect(rows).toHaveLength(1)
    expect(rows[0].productCode).toBe('商品一')
    expect(rows[0].series).toBe('商品一')
    expect(rows[0].date).toBe('2026-08-01')
    expect(rows[0].status).toBe('')
  })

  it('商家自发货使用日期和SKU映射', () => {
    const file = mappedFile('merchantOutbound', [{ sku: '商品二', date: '2026-08-02', quantity: 1, postal: '90001' }], { SKU: 'sku', 日期: 'date', 数量: 'quantity', 邮编: 'postal' })
    expect(parseOutbound(file, '商家自发货')).toHaveLength(1)
  })

  it('两类出库数据只提供新的中文映射字段且保持非必填', () => {
    for (const id of ['amazonOutbound', 'merchantOutbound'] as const) {
      const definition = fileSlots.find((slot) => slot.id === id)
      expect(definition?.requiredFields).toEqual([])
      expect(definition?.optionalFields).toEqual(['日期', 'SKU', '邮编', '数量', '仓库名称'])
      expect(definition?.optionalFields).not.toEqual(expect.arrayContaining(['商品编码', '销售系列', '出库日期', '订单状态']))
    }
  })

  it('Excel日期对象和日期时间文本不会因时区提前一天', () => {
    expect(normalizeDate(new Date(2026, 7, 28, 3, 11, 16))).toBe('2026-08-28')
    expect(normalizeDate('2026-08-28 03:11:16')).toBe('2026-08-28')
  })
})

describe('对照表映射字段', () => {
  it('使用事业部、名称和物料编码字段', () => {
    expect(fileSlots.find((slot) => slot.id === 'customerMaterial')?.optionalFields).toEqual(['事业部', '客户名称', '物料编码'])
    expect(fileSlots.find((slot) => slot.id === 'warehouseMaterial')?.optionalFields).toEqual(['事业部', '仓库名称', '物料编码'])
  })

  it('仓库维度使用组织、仓库和一级仓库分类，不再使用仓库编码', () => {
    const fields = fileSlots.find((slot) => slot.id === 'warehouse')?.optionalFields
    expect(fields).toEqual(['使用组织', '仓库', '一级仓库分类', '州', '城市', '详细地址', '邮编', '所属区域'])
    expect(fields).not.toContain('仓库编码')
    const file = mappedFile('warehouse', [{ 仓库原值: '洛杉矶仓', 州原值: 'CA' }], { 仓库: '仓库原值', 州: '州原值' })
    expect(parseWarehouses(file)).toEqual([{ code: '洛杉矶仓', name: '洛杉矶仓', region: '美西' }])
  })
})
