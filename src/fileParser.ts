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
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  const calendarDate = String(value ?? '').trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (calendarDate) return `${calendarDate[1]}-${calendarDate[2].padStart(2, '0')}-${calendarDate[3].padStart(2, '0')}`
  const date = new Date(String(value ?? ''))
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function uniqueHeaders(row: unknown[]): string[] {
  const counts = new Map<string, number>()
  let lastNamedColumn = row.length - 1
  while (lastNamedColumn >= 0 && String(row[lastNamedColumn] ?? '').trim() === '') lastNamedColumn -= 1
  return row.slice(0, lastNamedColumn + 1).map((value, column) => {
    const base = String(value ?? '').trim() || `未命名列${column + 1}`
    const count = (counts.get(base) ?? 0) + 1
    counts.set(base, count)
    return count === 1 ? base : `${base}（${count}）`
  })
}

function pickHeaderRow(rows: unknown[][]): { headers: string[]; headerIndex: number } {
  const headerIndex = rows.findIndex((row) => row.some((value) => String(value ?? '').trim() !== ''))
  if (headerIndex < 0) return { headers: [], headerIndex: 0 }
  return { headers: uniqueHeaders(rows[headerIndex]), headerIndex }
}

function workbookFromData(data: ArrayBuffer, fileName: string) {
  const isCsv = fileName.toLowerCase().endsWith('.csv')
  if (!isCsv) return XLSX.read(data, { type: 'array', cellDates: true })
  const bytes = new Uint8Array(data)
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  const csvText = utf8.includes('\uFFFD') ? new TextDecoder('gb18030').decode(bytes) : utf8
  return XLSX.read(csvText.replace(/^\uFEFF/, ''), { type: 'string', cellDates: true })
}

function sheetBounds(sheet: XLSX.WorkSheet) {
  return XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1')
}

function headerSample(sheet: XLSX.WorkSheet) {
  const bounds = sheetBounds(sheet)
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    range: { s: { r: 0, c: 0 }, e: { r: Math.min(19, bounds.e.r), c: bounds.e.c } },
  })
}

export async function inspectWorkbook(file: File, definition: FileSlotDefinition): Promise<StoredFile> {
  const data = await file.arrayBuffer()
  const workbook = workbookFromData(data, file.name)
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('文件中没有可读取的工作表')
  const sheet = workbook.Sheets[sheetName]
  const bounds = sheetBounds(sheet)
  const { headers, headerIndex } = pickHeaderRow(headerSample(sheet))
  if (!headers.length) throw new Error('第一个工作表没有可读取的标题行')
  const previewMatrix = bounds.e.r > headerIndex ? XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    range: { s: { r: headerIndex + 1, c: 0 }, e: { r: Math.min(headerIndex + 8, bounds.e.r), c: bounds.e.c } },
  }) : []
  const previewRows = previewMatrix.filter((row) => row.some((value) => String(value ?? '').trim() !== '')).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
  const automaticMapping: Record<string, string> = {}
  return {
    slotId: definition.id,
    fileName: file.name,
    updatedAt: new Date().toISOString(),
    rowCount: Math.max(0, bounds.e.r - headerIndex),
    sheetNames: workbook.SheetNames,
    headers,
    previewRows,
    data,
    mapping: automaticMapping,
    validation: '待映射',
    missingFields: [],
  }
}

export function readMappedRows(file: StoredFile): Record<string, unknown>[] {
  const workbook = workbookFromData(file.data, file.fileName)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return []
  const bounds = sheetBounds(sheet)
  const { headers, headerIndex } = pickHeaderRow(headerSample(sheet))
  if (!headers.length || bounds.e.r <= headerIndex) return []
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    range: { s: { r: headerIndex + 1, c: 0 }, e: bounds.e },
  })
  return rows
    .filter((row) => row.some((value) => String(value ?? '').trim() !== ''))
    .map((row) => {
      const source = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
      return Object.fromEntries(Object.entries(file.mapping).map(([standard, sourceHeader]) => [standard, source[sourceHeader]]))
    })
}

export function parseInventory(file: StoredFile): InventoryRecord[] {
  const hasInStockMapping = Boolean(file.mapping['在库量'])
  const hasInTransitMapping = Boolean(file.mapping['在途量'])
  return readMappedRows(file).flatMap((row) => {
    const warehouseName = String(row['仓库名称'] ?? '').trim()
    const productCode = String(row['商品编码'] ?? '').trim()
    if (!warehouseName || !productCode) return []
    const inStockQuantity = hasInStockMapping || hasInTransitMapping ? normalizeNumber(row['在库量']) : normalizeNumber(row['数量'])
    const inTransitQuantity = normalizeNumber(row['在途量'])
    const shared = { warehouseCode: warehouseName, warehouseName, productCode, series: productCode, productType: '成品' as const }
    return [
      ...(inStockQuantity > 0 ? [{ ...shared, quantity: inStockQuantity, inventoryStatus: '在库' as const, ageDays: 0 }] : []),
      ...(inTransitQuantity > 0 ? [{ ...shared, quantity: inTransitQuantity, inventoryStatus: '在途' as const }] : []),
    ]
  })
}

export function parseForecast(file: StoredFile): ForecastRecord[] {
  return readMappedRows(file).flatMap((row) => {
    const productCode = String(row['商品编码'] ?? '').trim() || undefined
    const series = String(row['销售系列'] ?? '').trim()
    if (!series) return []
    const records: ForecastRecord[] = []
    const totalQuantity = normalizeNumber(row['预测数量'])
    const totalDays = normalizeNumber(row['预测期间天数'])
    if (totalQuantity > 0 && totalDays > 0) records.push({ productCode, series, quantity: totalQuantity, periodDays: totalDays })
    for (let period = 1; period <= 6; period += 1) {
      const quantity = normalizeNumber(row[`未来第${period}期预测数量`])
      const periodDays = normalizeNumber(row[`未来第${period}期天数`])
      if (quantity > 0 && periodDays > 0) records.push({ productCode, series, quantity, periodDays })
    }
    return records
  })
}

export function parseOutbound(file: StoredFile, channel: OutboundRecord['channel']): OutboundRecord[] {
  return readMappedRows(file).map((row) => {
    const productCode = String(row['商品编码'] ?? '').trim()
    const status = String(row['订单状态'] ?? '').trim()
    return {
      productCode,
      series: String(row['销售系列'] ?? '').trim() || productCode,
      date: normalizeDate(row['出库日期']),
      postalCode: String(row['邮编'] ?? '').trim(),
      quantity: normalizeNumber(row['数量']),
      status,
      channel,
    }
  }).filter((row) => row.productCode && row.quantity > 0 && (!row.status || /完成|已发|发货|shipped|completed|fulfilled|released|order/i.test(row.status)))
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
    const name = String(row['仓库'] ?? '').trim()
    return {
      code: name,
      name,
      region: ['美西', '美中', '美东'].includes(region) ? region : stateRegions[state] ?? '美中',
    }
  }).filter((row) => row.name)
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
