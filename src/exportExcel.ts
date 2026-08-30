import * as XLSX from 'xlsx'
import type { AnalysisResult, AnalysisSettings, ManualTransferQuote, QuoteVersion, StoredFile } from './types'
import { fileSlots } from './data'
import { readMappedRows } from './fileParser'

const money = (value: number) => Math.round(value * 100) / 100

export function exportAnalysisWorkbook(
  results: AnalysisResult[],
  settings: AnalysisSettings,
  files: StoredFile[],
  quotes: QuoteVersion[],
  manualQuotes: ManualTransferQuote[],
) {
  const workbook = XLSX.utils.book_new()
  const summary = results.map((row) => ({
    销售系列: row.series,
    原仓: row.originWarehouse,
    目的仓: row.destinationWarehouse,
    区域: row.region,
    判断结果: row.decision,
    期初在库成品: row.initialQuantity,
    建议调拨件数: row.transferQuantity,
    调拨比例: row.transferRatio,
    '体积（立方米）': row.volumeCubicMeters,
    '总重量（千克）': row.weightKg,
    '不调拨费用（人民币）': money(row.noTransferCost.total),
    '调拨费用（人民币）': money(row.transferCost.total),
    '节省金额（人民币）': money(row.savings),
    节省比例: row.savingsRate,
    采用中转资源: row.transferResource,
    运输天数: row.transitDays,
    预计到仓日期: row.expectedArrivalDate ?? '',
    库存覆盖天数: money(row.coverageDays),
    风险提示: row.riskMessages.join('；'),
    数据质量提示: row.dataQualityMessages.join('；'),
  }))
  const detail = results.flatMap((row) => [
    { 销售系列: row.series, 方案: '不调拨', 仓储费: money(row.noTransferCost.storage), 配送费: money(row.noTransferCost.delivery), 出库费: 0, 入库费: 0, 中转运输费: 0, 附加费: money(row.noTransferCost.surcharge), 总费用: money(row.noTransferCost.total) },
    { 销售系列: row.series, 方案: `调拨${row.transferQuantity}件`, 仓储费: money(row.transferCost.storage), 配送费: money(row.transferCost.delivery), 出库费: money(row.transferCost.outbound), 入库费: money(row.transferCost.inbound), 中转运输费: money(row.transferCost.transfer), 附加费: money(row.transferCost.surcharge), 总费用: money(row.transferCost.total) },
  ])
  const sources = files.map((file) => ({ 文件槽位: fileSlots.find((slot) => slot.id === file.slotId)?.label ?? file.slotId, 文件名: file.fileName, 更新时间: file.updatedAt, 数据行数: file.rowCount, 映射状态: file.validation, 缺失字段: file.missingFields.join('、') }))
  const quoteAudit = quotes.flatMap((quote) => quote.activeRules.map((rule) => ({ 报价槽位: `仓库报价${quote.slot}`, 物流公司: quote.logisticsCompany, 报价版本: quote.version, 费用分类: rule.category, 收费名称: rule.name, 计费单位: rule.billingUnit, 美元单价: rule.rateUsd ?? '', 适用条件: rule.conditions, 来源工作表: rule.evidence.sheetName, 来源单元格: rule.evidence.cellRange, 原始文字: rule.evidence.rawText })))
  const manual = manualQuotes.map((quote) => ({ 承运商: quote.carrier, 原仓: quote.originWarehouse, 目的仓: quote.destinationWarehouse, 报价件数: quote.quantity, '报价体积（立方米）': quote.volumeCubicMeters, 报价方式: quote.priceMode, 报价金额: quote.price, 币种: quote.currency, 运输天数: quote.transitDays, 报价口径: quote.scope, 报价日期: quote.quoteDate, 有效期至: quote.expiresAt, 备注: quote.notes }))
  const candidateQuantities = results.map((row) => ({ 销售系列: row.series, 原仓: row.originWarehouse, 目的仓: row.destinationWarehouse, 最大可调件数: row.initialQuantity, 最优候选件数: row.transferQuantity, 调拨比例: row.transferRatio, 整箱数量: row.cartonCount ?? '', '体积（立方米）': row.volumeCubicMeters, '总重量（千克）': row.weightKg, 采用中转资源: row.transferResource, 判断结果: row.decision }))
  const audit = [
    { 项目: '分析基准日', 取值: settings.baseDate },
    { 项目: '分析天数', 取值: settings.analysisDays },
    { 项目: '一美元兑换人民币', 取值: settings.usdToCny },
    { 项目: '最低节省金额（人民币）', 取值: settings.minimumSavingsCny },
    { 项目: '最低节省比例', 取值: settings.minimumSavingsRate / 100 },
    { 项目: '库存消耗规则', 取值: '先入库的批次先出库' },
    { 项目: '调拨范围', 取值: '仅允许同一区域仓库之间调拨' },
  ]
  const sheets: Array<[string, object[]]> = [['分析结果', summary], ['费用明细', detail], ['候选调拨数量', candidateQuantities], ['数据来源', sources], ['生效报价审计', quoteAudit], ['自行询价', manual], ['计算说明', audit]]
  for (const file of files.filter((item) => item.validation === '校验通过')) {
    const name = fileSlots.find((slot) => slot.id === file.slotId)?.label ?? file.slotId
    try { sheets.push([`来源-${name}`.slice(0, 31), readMappedRows(file)]) } catch { /* 损坏来源文件已经在数据来源页留痕 */ }
  }
  sheets.forEach(([name, data]) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), name))
  XLSX.writeFile(workbook, `仓库分布分析_${settings.baseDate}.xlsx`)
}
