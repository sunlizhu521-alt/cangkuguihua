import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseInventory } from '../fileParser'
import type { StoredFile } from '../types'

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
