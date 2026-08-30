import * as XLSX from 'xlsx'
import { z } from 'zod'
import { stateRegions } from './data'
import type {
  FeeCategory,
  FeeRule,
  FileSlotDefinition,
  ForecastRecord,
  InventoryRecord,
  OutboundRecord,
  PackagingRecord,
  StoredFile,
  WarehouseRegion,
  WarehouseRecord,
} from './types'

const dateFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })

export function normalizeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return 0
  const clean = value.replace(/[,$￥¥%\s]/g, '')
  const parsed = Number(clean)
  return Number.isFinite(parsed) ? parsed : 0
}

export function normalizeDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  const date = new Date(String(value ?? ''))
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function pickHeaderRow(rows: unknown[][]): { headers: string[]; headerIndex: number } {
  let best: { headers: string[]; headerIndex: number; score: number } = { headers: [], headerIndex: 0, score: -1 }
  rows.slice(0, 20).forEach((row, index) => {
    const headers = row.map((value, column) => String(value ?? '').trim() || `未命名列${column + 1}`)
    const score = headers.filter((value) => !value.startsWith('未命名列')).length
    if (score > best.score) best = { headers, headerIndex: index, score }
  })
  return best
}

export async function inspectWorkbook(file: File, definition: FileSlotDefinition): Promise<StoredFile> {
  const data = await file.arrayBuffer()
  const workbook = XLSX.read(data, { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '' })
  const { headers, headerIndex } = pickHeaderRow(matrix)
  const rows = matrix.slice(headerIndex + 1).filter((row) => row.some((value) => String(value ?? '').trim() !== ''))
  const previewRows = rows.slice(0, 8).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
  const automaticMapping: Record<string, string> = {}
  for (const standard of [...definition.requiredFields, ...definition.optionalFields]) {
    const direct = headers.find((header) => header === standard)
    const fuzzy = headers.find((header) => header.includes(standard) || standard.includes(header))
    if (direct || fuzzy) automaticMapping[standard] = direct ?? fuzzy!
  }
  const missingFields = definition.requiredFields.filter((field) => !automaticMapping[field])
  return {
    slotId: definition.id,
    fileName: file.name,
    updatedAt: new Date().toISOString(),
    rowCount: rows.length,
    sheetNames: workbook.SheetNames,
    headers,
    previewRows,
    data,
    mapping: automaticMapping,
    validation: missingFields.length ? '有缺失字段' : '校验通过',
    missingFields,
  }
}

export function readMappedRows(file: StoredFile): Record<string, unknown>[] {
  const workbook = XLSX.read(file.data, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  const { headers, headerIndex } = pickHeaderRow(matrix)
  return matrix.slice(headerIndex + 1)
    .filter((row) => row.some((value) => String(value ?? '').trim() !== ''))
    .map((row) => {
      const source = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
      return Object.fromEntries(Object.entries(file.mapping).map(([standard, sourceHeader]) => [standard, source[sourceHeader]]))
    })
}

export function parseInventory(file: StoredFile): InventoryRecord[] {
  return readMappedRows(file).map((row) => ({
    warehouseCode: String(row['仓库编码'] ?? row['仓库名称'] ?? '').trim(),
    warehouseName: String(row['仓库名称'] ?? '').trim(),
    productCode: String(row['商品编码'] ?? '').trim(),
    series: String(row['销售系列'] ?? '').trim(),
    quantity: normalizeNumber(row['数量']),
    inventoryStatus: (String(row['库存状态']).includes('途') ? '在途' : '在库') as InventoryRecord['inventoryStatus'],
    productType: (String(row['商品类型']).includes('退') ? '退货' : String(row['商品类型']).includes('配') ? '配件' : '成品') as InventoryRecord['productType'],
    inboundDate: normalizeDate(row['入库日期']),
    ageDays: normalizeNumber(row['库存存放天数']) || undefined,
    expectedArrivalDate: normalizeDate(row['预计到仓日期']),
  })).filter((row) => row.warehouseName && row.productCode && row.quantity > 0)
}

export function parseForecast(file: StoredFile): ForecastRecord[] {
  return readMappedRows(file).map((row) => ({
    productCode: String(row['商品编码'] ?? '').trim() || undefined,
    series: String(row['销售系列'] ?? '').trim(),
    quantity: normalizeNumber(row['预测数量']),
    periodDays: Math.max(1, normalizeNumber(row['预测期间天数']) || 30),
  })).filter((row) => row.series && row.quantity > 0)
}

export function parseOutbound(file: StoredFile, channel: OutboundRecord['channel']): OutboundRecord[] {
  return readMappedRows(file).map((row) => ({
    productCode: String(row['商品编码'] ?? '').trim(),
    series: String(row['销售系列'] ?? '').trim(),
    date: normalizeDate(row['出库日期']),
    postalCode: String(row['邮编'] ?? '').trim(),
    quantity: normalizeNumber(row['数量']),
    status: String(row['订单状态'] ?? '').trim(),
    channel,
  })).filter((row) => row.productCode && row.series && row.quantity > 0 && /完成|已发|发货|shipped/i.test(row.status))
}

export function parsePackaging(file: StoredFile): PackagingRecord[] {
  return readMappedRows(file).map((row) => ({
    productCode: String(row['商品编码'] ?? '').trim(),
    lengthCm: normalizeNumber(row['包装长（厘米）']),
    widthCm: normalizeNumber(row['包装宽（厘米）']),
    heightCm: normalizeNumber(row['包装高（厘米）']),
    weightKg: normalizeNumber(row['毛重（千克）']),
    unitsPerCarton: Math.max(1, normalizeNumber(row['每箱件数']) || 1),
  })).filter((row) => row.productCode)
}

export function parseWarehouses(file: StoredFile): WarehouseRecord[] {
  return readMappedRows(file).map((row) => {
    const state = String(row['州'] ?? '').trim().toUpperCase()
    const region = String(row['所属区域'] ?? '') as WarehouseRegion
    return {
      code: String(row['仓库编码'] ?? '').trim(),
      name: String(row['仓库名称'] ?? '').trim(),
      region: ['美西', '美中', '美东'].includes(region) ? region : stateRegions[state] ?? '美中',
    }
  }).filter((row) => row.code && row.name)
}

export function postalRegion(postalCode: string): WarehouseRegion | undefined {
  const first = postalCode.trim()[0]
  if (!first) return undefined
  if (['8', '9'].includes(first)) return '美西'
  if (['4', '5', '6', '7'].includes(first)) return '美中'
  if (['0', '1', '2', '3'].includes(first)) return '美东'
  return undefined
}

const quoteRuleSchema = z.object({
  category: z.enum(['仓储费', '尾程配送费', '原仓出库费', '目的仓入库费', '中转运输费', '其他附加费', '未识别项目']),
  name: z.string().min(1),
  warehouseCode: z.string().optional(),
  routeFrom: z.string().optional(),
  routeTo: z.string().optional(),
  startDay: z.number().nonnegative().optional(),
  endDay: z.number().nonnegative().optional(),
  billingUnit: z.string().min(1),
  billingPeriod: z.string().optional(),
  rateUsd: z.number().nonnegative().optional(),
  percentage: z.number().nonnegative().optional(),
  minimumChargeUsd: z.number().nonnegative().optional(),
  transitDays: z.number().nonnegative().optional(),
  conditions: z.string().default(''),
  confidence: z.enum(['高', '中', '低']),
  evidence: z.object({ sheetName: z.string(), cellRange: z.string(), rawText: z.string() }),
  validationIssues: z.array(z.string()).default([]),
})

export const quoteResponseSchema = z.object({ rules: z.array(quoteRuleSchema) })

const categoryKeywords: Array<[FeeCategory, RegExp]> = [
  ['仓储费', /仓储|仓租|storage/i],
  ['尾程配送费', /尾程|派送|配送|last.?mile/i],
  ['原仓出库费', /出库|outbound|pick/i],
  ['目的仓入库费', /入库|inbound|receiv/i],
  ['中转运输费', /中转|调仓|转仓|运输|transfer|freight/i],
  ['其他附加费', /燃油|偏远|超尺寸|贴标|托盘|退货|附加|surcharge|fuel/i],
]

export function localQuoteDraft(data: ArrayBuffer): FeeRule[] {
  const workbook = XLSX.read(data, { type: 'array', cellDates: true })
  const rules: FeeRule[] = []
  for (const sheetName of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '' })
    matrix.forEach((row, rowIndex) => {
      const text = row.map((value) => String(value ?? '').trim()).filter(Boolean).join(' | ')
      if (!text) return
      const category = categoryKeywords.find(([, pattern]) => pattern.test(text))?.[0]
      if (!category) return
      const numericValues = row.map(normalizeNumber).filter((value) => value > 0)
      const rate = numericValues.at(-1)
      const issues: string[] = []
      if (rate === undefined) issues.push('未识别到有效金额')
      if (/月|month/i.test(text) && category === '仓储费') issues.push('月费将按30天折算，请确认')
      rules.push({
        id: crypto.randomUUID(),
        category,
        name: text.slice(0, 40),
        billingUnit: /立方|cube|cbm/i.test(text) ? '每立方米' : /千克|公斤|kg/i.test(text) ? '每千克' : '每件',
        billingPeriod: /月|month/i.test(text) ? '每月' : /天|day/i.test(text) ? '每天' : '每次',
        rateUsd: rate,
        transitDays: /时效|天到|transit/i.test(text) ? numericValues[0] : undefined,
        conditions: '',
        confidence: issues.length ? '中' : '高',
        evidence: { sheetName, cellRange: `A${rowIndex + 1}:${XLSX.utils.encode_col(Math.max(0, row.length - 1))}${rowIndex + 1}`, rawText: text },
        validationIssues: issues,
      })
    })
  }
  return rules.length ? rules : [{
    id: crypto.randomUUID(),
    category: '未识别项目',
    name: '未找到可自动识别的费用行',
    billingUnit: '待确认',
    conditions: '',
    confidence: '低',
    evidence: { sheetName: workbook.SheetNames[0] ?? '未知', cellRange: '', rawText: '' },
    validationIssues: ['请配置人工智能服务或手工新增费用规则'],
  }]
}

export function formatDateTime(value: string) {
  return dateFormatter.format(new Date(value))
}
