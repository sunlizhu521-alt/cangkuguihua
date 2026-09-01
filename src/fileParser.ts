import * as XLSX from 'xlsx'
import { z } from 'zod'
import type {
  FeeCategory,
  FeeRule,
  FileSlotDefinition,
  ForecastRecord,
  DemandRegion,
  InventoryRecord,
  OutboundRecord,
  PackagingRecord,
  SiteRegion,
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
  const englishDate = String(value ?? '').trim().match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})(?:\s|$)/i)
  if (englishDate) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(englishDate[1].toLowerCase()) + 1
    return `${englishDate[3]}-${String(month).padStart(2, '0')}-${englishDate[2].padStart(2, '0')}`
  }
  const date = new Date(String(value ?? ''))
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

const HEADER_SCAN_ROW_LIMIT = 200
const HEADER_SCAN_COLUMN_LIMIT = 512

function lastPopulatedColumn(row: unknown[]): number {
  for (let column = row.length - 1; column >= 0; column -= 1) {
    if (String(row[column] ?? '').trim() !== '') return column
  }
  return -1
}

function uniqueHeaders(row: unknown[], columnCount = row.length): string[] {
  const counts = new Map<string, number>()
  return Array.from({ length: columnCount }, (_, column) => {
    const value = row[column]
    const base = String(value ?? '').trim() || `未命名列${column + 1}`
    const count = (counts.get(base) ?? 0) + 1
    counts.set(base, count)
    return count === 1 ? base : `${base}（${count}）`
  })
}

function pickHeaderRow(rows: unknown[][]): { headers: string[]; headerIndex: number } {
  const headerIndex = rows.findIndex((row) => row.filter((value) => String(value ?? '').trim() !== '').length >= 2)
  if (headerIndex < 0) return { headers: [], headerIndex: 0 }
  const widestColumn = rows.slice(headerIndex, Math.min(rows.length, headerIndex + 10)).reduce((maximum, row) => Math.max(maximum, lastPopulatedColumn(row)), -1)
  return { headers: uniqueHeaders(rows[headerIndex], widestColumn + 1), headerIndex }
}

function workbookFromData(data: ArrayBuffer, fileName: string, sheetRows?: number, dense = false) {
  const isCsv = fileName.toLowerCase().endsWith('.csv')
  if (!isCsv) return XLSX.read(data, { type: 'array', cellDates: true, sheetRows, dense })
  const bytes = new Uint8Array(data)
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  const csvText = utf8.includes('\uFFFD') ? new TextDecoder('gb18030').decode(bytes) : utf8
  return XLSX.read(csvText.replace(/^\uFEFF/, ''), { type: 'string', cellDates: true, dense })
}

function sheetBounds(sheet: XLSX.WorkSheet, includeFullRange = false) {
  const fullReference = (sheet as XLSX.WorkSheet & { '!fullref'?: string })['!fullref']
  const reference = includeFullRange ? fullReference ?? sheet['!ref'] : sheet['!ref']
  return reference ? XLSX.utils.decode_range(reference) : undefined
}

function headerSample(sheet: XLSX.WorkSheet) {
  const bounds = sheetBounds(sheet)
  if (!bounds) return []
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: true,
    range: { s: { r: 0, c: 0 }, e: { r: Math.min(HEADER_SCAN_ROW_LIMIT - 1, bounds.e.r), c: Math.min(HEADER_SCAN_COLUMN_LIMIT - 1, bounds.e.c) } },
  })
}

function selectDataSheet(workbook: XLSX.WorkBook) {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const sampledBounds = sheetBounds(sheet)
    const bounds = sheetBounds(sheet, true)
    if (!sampledBounds || !bounds) continue
    const { headers, headerIndex } = pickHeaderRow(headerSample(sheet))
    if (headers.length >= 2 && bounds.e.r > headerIndex) return { sheetName, sheet, bounds, headers, headerIndex }
  }
  return undefined
}

export async function inspectWorkbook(file: File, definition: FileSlotDefinition): Promise<StoredFile> {
  const data = await file.arrayBuffer()
  const workbook = workbookFromData(data, file.name, HEADER_SCAN_ROW_LIMIT + 10)
  if (!workbook.SheetNames.length) throw new Error('文件中没有可读取的工作表')
  const selectedSheet = selectDataSheet(workbook)
  if (!selectedSheet) throw new Error('所有工作表中都没有找到至少包含两列、且下方有数据的标题行')
  const { sheetName, sheet, bounds, headers, headerIndex } = selectedSheet
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
    sourceSheetName: sheetName,
    headers,
    previewRows,
    data,
    mapping: automaticMapping,
    validation: '待映射',
    missingFields: [],
  }
}

function readSourceRows(file: StoredFile): Array<{ source: Record<string, unknown>; mapped: Record<string, unknown> }> {
  const workbook = workbookFromData(file.data, file.fileName)
  const selectedSheet = file.sourceSheetName && workbook.Sheets[file.sourceSheetName]
    ? (() => {
        const sheet = workbook.Sheets[file.sourceSheetName!]
        const bounds = sheetBounds(sheet)
        const picked = pickHeaderRow(headerSample(sheet))
        return bounds && picked.headers.length ? { sheetName: file.sourceSheetName!, sheet, bounds, ...picked } : undefined
      })()
    : selectDataSheet(workbook)
  if (!selectedSheet) return []
  const { sheet, bounds, headers, headerIndex } = selectedSheet
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
      return {
        source,
        mapped: Object.fromEntries(Object.entries(file.mapping).map(([standard, sourceHeader]) => [standard, source[sourceHeader]])),
      }
    })
}

export function readMappedRows(file: StoredFile): Record<string, unknown>[] {
  return readSourceRows(file).map((row) => row.mapped)
}

export function readProductDimensionRows(file: StoredFile): Record<string, unknown>[] {
  return readSourceRows(file).map(({ source, mapped }) => ({
    ...mapped,
    商品编码: mapped['商品编码'] || source['物料编码'] || source['商品编码'] || '',
    型号: mapped['型号'] || source['型号'] || '',
  }))
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
  // 大型出库工作簿使用密集单元格数组，避免旧版 Chromium 在稀疏对象模式下耗尽内存后返回空数据。
  const workbook = workbookFromData(file.data, file.fileName, undefined, true)
  const selectedSheet = file.sourceSheetName && workbook.Sheets[file.sourceSheetName]
    ? (() => {
        const sheet = workbook.Sheets[file.sourceSheetName!]
        const bounds = sheetBounds(sheet)
        const picked = pickHeaderRow(headerSample(sheet))
        return bounds && picked.headers.length ? { sheet, bounds, ...picked } : undefined
      })()
    : selectDataSheet(workbook)
  if (!selectedSheet) return []
  const { sheet, bounds, headers, headerIndex } = selectedSheet
  const sourceColumns = new Map(headers.map((header, column) => [header, column]))
  const mappedColumn = (standardField: string) => {
    const sourceHeader = file.mapping[standardField]
    return sourceHeader ? sourceColumns.get(sourceHeader) : undefined
  }
  const columns = {
    productCode: mappedColumn('SKU'),
    date: mappedColumn('日期'),
    postalCode: mappedColumn('邮编'),
    quantity: mappedColumn('数量'),
    fulfillment: mappedColumn('履约方式'),
    country: mappedColumn('国家/地区'),
  }
  const denseSheet = sheet as unknown as Array<Array<XLSX.CellObject | undefined>>
  const cellValue = (row: number, column: number | undefined) => {
    if (column === undefined) return ''
    const cell = Array.isArray(sheet) ? denseSheet[row]?.[column] : sheet[XLSX.utils.encode_cell({ r: row, c: column })]
    return cell?.v ?? ''
  }
  const records: OutboundRecord[] = []
  for (let row = headerIndex + 1; row <= bounds.e.r; row += 1) {
    const productCode = String(cellValue(row, columns.productCode)).trim()
    const quantity = normalizeNumber(cellValue(row, columns.quantity))
    if (!productCode || quantity <= 0) continue
    // 亚马逊仓配只保留由 Amazon 履约的记录；未映射履约方式时不做过滤。
    if (channel === '亚马逊仓配' && columns.fulfillment !== undefined) {
      const fulfillment = String(cellValue(row, columns.fulfillment)).trim().toLowerCase()
      if (fulfillment !== 'amazon') continue
    }
    // 中国内地及美国本土外小岛屿不进入销售区域统计。
    const country = String(cellValue(row, columns.country)).trim()
    if (/中国|内地|本土外|小岛屿/i.test(country)) continue
    // 美国邮编只保留前5位，忽略连字符及其后内容。
    const postalCode = String(cellValue(row, columns.postalCode)).trim().split('-')[0].trim()
    records.push({
      productCode,
      series: productCode,
      date: normalizeDate(cellValue(row, columns.date)),
      postalCode,
      quantity,
      status: '',
      channel,
      country,
    })
  }
  return records
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
    const warehouse = String(row['仓库'] ?? '').trim()
    const warehouseName = String(row['仓库名称'] ?? '').trim()
    const site = String(row['站点'] ?? '').trim()
    const code = warehouse || warehouseName
    const name = warehouseName || warehouse
    return {
      code,
      name,
      region: warehouseRegionFromSite(site) ?? '美中',
      site,
      siteRegion: siteRegion(site),
    }
  }).filter((row) => row.code && row.name)
}

export function warehouseRegionFromSite(site: string): WarehouseRegion | undefined {
  const value = site.trim()
  if (/美西|美国西部/i.test(value)) return '美西'
  if (/美中|美国中部/i.test(value)) return '美中'
  if (/美东|美国东部/i.test(value)) return '美东'
  return undefined
}

export function postalRegion(postalCode: string): WarehouseRegion | undefined {
  const first = postalCode.trim()[0]
  if (!first) return undefined
  if (['8', '9'].includes(first)) return '美西'
  if (['4', '5', '6', '7'].includes(first)) return '美中'
  if (['0', '1', '2', '3'].includes(first)) return '美东'
  return undefined
}

export function demandRegion(postalCode: string): DemandRegion | undefined {
  const code = postalCode.trim()
  if (!code || /^(?:N\/?A|NULL|NONE|UNKNOWN|未知|无|不详|[-–—]+)$/i.test(code)) return undefined
  // 加拿大邮编：A1A 1A1
  if (/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(code)) return '加拿大'
  // 英国邮编：字母开头
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(code)) return '英国'
  // 美国邮编：取前5位（连字符及其后内容忽略）
  const five = code.split('-')[0].trim()
  if (/^\d{5}$/.test(five)) {
    const first = five[0]
    if (['8', '9'].includes(first)) return '美西'
    if (['4', '5', '6', '7'].includes(first)) return '美中'
    return '美东'
  }
  return undefined
}

export function demandSiteRegion(postalCode: string): SiteRegion | undefined {
  const code = postalCode.trim()
  if (!code || /^(?:N\/?A|NULL|NONE|UNKNOWN|未知|无|不详|[-–—]+)$/i.test(code)) return undefined
  if (/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(code)) return '加拿大'
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(code)) return '英国'
  const five = code.split('-')[0].trim()
  if (/^\d{5}$/.test(five)) return '美国'
  return undefined
}

const europeanCountryPattern = /德国|法国|意大利|西班牙|荷兰|比利时|瑞典|丹麦|葡萄牙|奥地利|希腊|爱尔兰|卢森堡|捷克|马耳他|拉脱维亚|芬兰|波兰|爱沙尼亚|克罗地亚|斯洛伐克|匈牙利|罗马尼亚|斯洛文尼亚|立陶宛|保加利亚|摩纳哥|欧洲|^(?:DE|FR|IT|ES|NL|BE|SE|DK|PT|AT|GR|IE|LU|CZ|MT|LV|FI|PL|EE|HR|SK|HU|RO|SI|LT|BG|MC|EU)$/i

export function countryToSiteRegion(country: string): SiteRegion | undefined {
  const c = country.trim()
  if (!c || /中国|内地|本土外|小岛屿/i.test(c)) return undefined
  if (/加拿大|Canada/i.test(c) || c === '加' || /^CA$/i.test(c)) return '加拿大'
  if (/英国|United Kingdom/i.test(c) || c === '英' || /^(?:UK|GB)$/i.test(c)) return '英国'
  if (/美国|United States|America/i.test(c) || c === '美' || /^(?:US|USA)$/i.test(c)) return '美国'
  if (europeanCountryPattern.test(c)) return '欧洲'
  return undefined
}

export function siteRegion(site: string): SiteRegion | undefined {
  const value = site.trim()
  if (!value) return undefined
  if (/美国|美|US|USA/i.test(value)) return '美国'
  if (/加拿大|加|Canada|CA/i.test(value)) return '加拿大'
  if (/英国|英|UK|GB/i.test(value)) return '英国'
  if (/德国|法国|意大利|西班牙|波兰|荷兰|欧洲|DE|FR|IT|ES|PL|NL|EU/i.test(value)) return '欧洲'
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
