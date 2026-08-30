import type {
  AnalysisResult,
  AnalysisSettings,
  CostBreakdown,
  FeeRule,
  ForecastRecord,
  InventoryRecord,
  ManualTransferQuote,
  PackagingRecord,
  WarehouseRecord,
} from './types'

export interface OptimizationInput {
  inventory: InventoryRecord[]
  forecast: ForecastRecord[]
  packaging: PackagingRecord[]
  warehouses: WarehouseRecord[]
  activeRules: FeeRule[]
  manualQuotes: ManualTransferQuote[]
  settings: AnalysisSettings
  merchantDemandShare?: number
}

const emptyCost = (): CostBreakdown => ({ storage: 0, delivery: 0, outbound: 0, inbound: 0, transfer: 0, surcharge: 0, total: 0 })

function totalCost(cost: CostBreakdown) {
  return cost.storage + cost.delivery + cost.outbound + cost.inbound + cost.transfer + cost.surcharge
}

function findRate(rules: FeeRule[], category: FeeRule['category'], warehouseCode?: string) {
  const applicable = rules.filter((rule) => !rule.excluded && rule.category === category && (!warehouseCode || !rule.warehouseCode || rule.warehouseCode === warehouseCode))
  return applicable.reduce((lowest, rule) => Math.min(lowest, rule.rateUsd ?? Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY)
}

function ruleCharge(rule: FeeRule, quantity: number, volume: number, weight: number, cartons: number, settings: AnalysisSettings) {
  const unit = rule.billingUnit
  const measure = unit.includes('立方米') ? volume : unit.includes('千克') || unit.includes('公斤') ? weight : unit.includes('箱') ? cartons : unit.includes('票') || unit.includes('次') || unit.includes('托盘') ? (quantity > 0 ? 1 : 0) : quantity
  const rate = rule.rateUsd ?? 0
  const subtotal = rule.percentage !== undefined ? rate * measure * rule.percentage / 100 : rate * measure
  return Math.max(subtotal, rule.minimumChargeUsd ?? 0) * settings.usdToCny
}

function lowestCategoryCharge(rules: FeeRule[], category: FeeRule['category'], quantity: number, volume: number, weight: number, cartons: number, settings: AnalysisSettings, warehouseCode?: string, origin?: string, destination?: string) {
  const charges = rules.filter((rule) => !rule.excluded && rule.category === category && (warehouseCode ? !rule.warehouseCode || rule.warehouseCode === warehouseCode : !rule.warehouseCode) && (origin ? !rule.routeFrom || rule.routeFrom === origin : !rule.routeFrom) && (destination ? !rule.routeTo || rule.routeTo === destination : !rule.routeTo) && rule.rateUsd !== undefined).map((rule) => ({ rule, amount: ruleCharge(rule, quantity, volume, weight, cartons, settings) }))
  return charges.reduce<(typeof charges)[number] | undefined>((best, item) => !best || item.amount < best.amount ? item : best, undefined)
}

function surchargeCharge(rules: FeeRule[], quantity: number, volume: number, weight: number, cartons: number, settings: AnalysisSettings, warehouseCode?: string, origin?: string, destination?: string) {
  return rules.filter((rule) => !rule.excluded && rule.category === '其他附加费' && (warehouseCode ? !rule.warehouseCode || rule.warehouseCode === warehouseCode : !rule.warehouseCode) && (origin ? !rule.routeFrom || rule.routeFrom === origin : !rule.routeFrom) && (destination ? !rule.routeTo || rule.routeTo === destination : !rule.routeTo) && rule.rateUsd !== undefined).reduce((sum, rule) => sum + ruleCharge(rule, quantity, volume, weight, cartons, settings), 0)
}

interface Batch { warehouseCode: string; quantity: number; ageDays?: number; arrivalDay: number }

function knownAge(record: InventoryRecord, baseDate: string) {
  if (record.ageDays !== undefined) return Math.max(0, record.ageDays)
  if (!record.inboundDate) return undefined
  return Math.max(0, Math.floor((new Date(baseDate).getTime() - new Date(record.inboundDate).getTime()) / 86_400_000))
}

function storageRule(rules: FeeRule[], warehouseCode: string, ageDays: number) {
  const match = rules.find((rule) => !rule.excluded && rule.category === '仓储费' && (!rule.warehouseCode || rule.warehouseCode === warehouseCode) && (rule.startDay ?? 0) <= ageDays && (rule.endDay ?? Infinity) >= ageDays)
  return match?.rateUsd === undefined ? undefined : match
}

function singleOrderRate(rules: FeeRule[], warehouseCode: string) {
  const outbound = findRate(rules, '原仓出库费', warehouseCode)
  const delivery = findRate(rules, '尾程配送费', warehouseCode)
  const surcharge = findRate(rules, '其他附加费', warehouseCode)
  return (Number.isFinite(outbound) ? outbound : 0) + (Number.isFinite(delivery) ? delivery : 0) + (Number.isFinite(surcharge) ? surcharge : 0)
}

function simulatePlan(initial: InventoryRecord[], transferQuantity: number, origin: string, destination: string, transitDays: number, dailyForecast: number, rules: FeeRule[], settings: AnalysisSettings, merchantShare: number, volumePerUnit: number, weightPerUnit: number, unitsPerCarton: number) {
  const quality = new Set<string>()
  const batches: Batch[] = initial.map((row) => ({ warehouseCode: row.warehouseCode, quantity: row.quantity, ageDays: row.inventoryStatus === '在途' ? 0 : knownAge(row, settings.baseDate), arrivalDay: row.inventoryStatus === '在途' ? row.expectedArrivalDate ? Math.max(0, Math.ceil((new Date(row.expectedArrivalDate).getTime() - new Date(settings.baseDate).getTime()) / 86_400_000)) : settings.analysisDays + 1 : 0 }))
  if (initial.some((row) => row.inventoryStatus === '在途' && !row.expectedArrivalDate)) quality.add('在途量不参与调拨，当前按分析期内不可用库存处理')
  batches.filter((batch) => batch.arrivalDay === 0 && batch.ageDays === undefined).forEach(() => quality.add('缺少批次日期或库存存放天数，无法判断对应仓储阶梯'))
  if (transferQuantity > 0) {
    let remaining = transferQuantity
    const originBatches = batches.filter((batch) => batch.warehouseCode === origin && batch.arrivalDay === 0).sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1))
    for (const batch of originBatches) {
      const moved = Math.min(batch.quantity, remaining)
      batch.quantity -= moved
      remaining -= moved
      if (remaining <= 0) break
    }
    batches.push({ warehouseCode: destination, quantity: transferQuantity - remaining, ageDays: 0, arrivalDay: transitDays })
  }
  const cost = emptyCost()
  let cumulativeDemand = 0, consumedDemand = 0, shortage = 0
  const consume = (quantity: number, merchant: boolean) => {
    let remaining = quantity
    const warehouses = [...new Set(batches.filter((batch) => batch.arrivalDay <= 0 && batch.quantity > 0).map((batch) => batch.warehouseCode))]
      .sort((a, b) => merchant ? singleOrderRate(rules, a) - singleOrderRate(rules, b) : 0)
    for (const warehouse of warehouses) {
      const queue = batches.filter((batch) => batch.warehouseCode === warehouse && batch.arrivalDay <= 0 && batch.quantity > 0).sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1))
      for (const batch of queue) {
        const used = Math.min(batch.quantity, remaining)
        batch.quantity -= used
        remaining -= used
        if (merchant && used > 0) {
          const cartons = used / Math.max(1, unitsPerCarton)
          const delivery = lowestCategoryCharge(rules, '尾程配送费', used, used * volumePerUnit, used * weightPerUnit, cartons, settings, warehouse)
          if (delivery) cost.delivery += delivery.amount
          cost.surcharge += surchargeCharge(rules, used, used * volumePerUnit, used * weightPerUnit, cartons, settings, warehouse)
        }
        if (remaining <= 0) break
      }
      if (remaining <= 0) break
    }
    shortage += remaining
  }
  for (let day = 0; day < settings.analysisDays; day += 1) {
    batches.forEach((batch) => { if (batch.arrivalDay > 0) batch.arrivalDay -= 1 })
    cumulativeDemand += dailyForecast
    const todayDemand = Math.floor(cumulativeDemand + 1e-9) - consumedDemand
    consumedDemand += todayDemand
    const merchant = todayDemand * merchantShare
    consume(todayDemand - merchant, false)
    consume(merchant, true)
    for (const batch of batches.filter((item) => item.arrivalDay <= 0 && item.quantity > 0)) {
      if (batch.ageDays === undefined) continue
      const rule = storageRule(rules, batch.warehouseCode, batch.ageDays)
      if (!rule) quality.add(`仓库${batch.warehouseCode}缺少适用的仓储阶梯`)
      else {
        const dailyRule = rule.billingPeriod === '每月' ? { ...rule, rateUsd: (rule.rateUsd ?? 0) / 30, minimumChargeUsd: rule.minimumChargeUsd !== undefined ? rule.minimumChargeUsd / 30 : undefined } : rule
        cost.storage += ruleCharge(dailyRule, batch.quantity, batch.quantity * volumePerUnit, batch.quantity * weightPerUnit, batch.quantity / Math.max(1, unitsPerCarton), settings)
      }
      batch.ageDays += 1
    }
  }
  cost.total = totalCost(cost)
  return { cost, endingQuantity: batches.reduce((sum, batch) => sum + batch.quantity, 0), shortage, quality: [...quality] }
}

function routeLogisticsCost(quantity: number, volume: number, weight: number, cartons: number, origin: string, destination: string, rules: FeeRule[], settings: AnalysisSettings) {
  const outbound = lowestCategoryCharge(rules, '原仓出库费', quantity, volume, weight, cartons, settings, origin)
  const inbound = lowestCategoryCharge(rules, '目的仓入库费', quantity, volume, weight, cartons, settings, destination)
  const transfer = lowestCategoryCharge(rules, '中转运输费', quantity, volume, weight, cartons, settings, undefined, origin, destination)
  if (!transfer) return undefined
  const cost = emptyCost()
  cost.outbound = outbound?.amount ?? 0
  cost.inbound = inbound?.amount ?? 0
  cost.transfer = transfer.amount
  cost.surcharge = surchargeCharge(rules, quantity, volume, weight, cartons, settings, undefined, origin, destination)
  cost.total = totalCost(cost)
  return { cost, resource: '物流商中转', transitDays: transfer.rule.transitDays ?? 0 }
}

function routeManualCost(quantity: number, volume: number, weight: number, cartons: number, origin: string, destination: string, rules: FeeRule[], manualQuotes: ManualTransferQuote[], settings: AnalysisSettings) {
  const valid = manualQuotes.filter((quote) => quote.originWarehouse === origin && quote.destinationWarehouse === destination && (!quote.expiresAt || quote.expiresAt >= settings.baseDate))
  const candidates = valid.flatMap((quote) => {
    if (quote.priceMode === '总价' && Math.abs(quote.volumeCubicMeters - volume) > 0.01) return []
    const priceCny = quote.price * (quote.currency === '美元' ? settings.usdToCny : 1)
    const transfer = quote.priceMode === '总价' ? priceCny : priceCny * volume
    const cost = emptyCost()
    const outbound = lowestCategoryCharge(rules, '原仓出库费', quantity, volume, weight, cartons, settings, origin)
    const inbound = lowestCategoryCharge(rules, '目的仓入库费', quantity, volume, weight, cartons, settings, destination)
    if (quote.scope === '仅运输费') {
      cost.outbound = outbound?.amount ?? 0
      cost.inbound = inbound?.amount ?? 0
      cost.surcharge = surchargeCharge(rules, quantity, volume, weight, cartons, settings, undefined, origin, destination)
    }
    cost.transfer = transfer
    cost.total = totalCost(cost)
    return [{ cost, resource: `自行寻找中转：${quote.carrier}`, transitDays: quote.transitDays }]
  })
  return candidates.reduce<(typeof candidates)[number] | undefined>((best, candidate) => !best || candidate.cost.total < best.cost.total ? candidate : best, undefined)
}

export function dailyForecastBySeries(records: ForecastRecord[]) {
  const map = new Map<string, { quantity: number; days: number }>()
  for (const record of records) {
    const current = map.get(record.series) ?? { quantity: 0, days: 0 }
    current.quantity += record.quantity
    current.days += record.periodDays
    map.set(record.series, current)
  }
  return new Map([...map].map(([series, value]) => [series, value.days > 0 ? value.quantity / value.days : 0]))
}

export function optimizeTransfers(input: OptimizationInput): AnalysisResult[] {
  const currentInventory = input.inventory.filter((row) => row.inventoryStatus === '在库' && row.productType === '成品' && row.quantity > 0)
  const forecastRates = dailyForecastBySeries(input.forecast)
  const packageMap = new Map(input.packaging.map((row) => [row.productCode, row]))
  const warehouseMap = new Map(input.warehouses.map((row) => [row.code, row]))
  const groups = new Map<string, InventoryRecord[]>()
  for (const item of currentInventory) {
    const key = `${item.warehouseCode}::${item.series}`
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  const results: AnalysisResult[] = []

  for (const [groupKey, items] of groups) {
    const [originWarehouse, series] = groupKey.split('::')
    const origin = warehouseMap.get(originWarehouse)
    const initialQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
    const dailyForecast = forecastRates.get(series) ?? 0
    const mainPackage = packageMap.get(items[0].productCode)
    const volumePerUnit = mainPackage ? mainPackage.lengthCm * mainPackage.widthCm * mainPackage.heightCm / 1_000_000 : 0
    const weightPerUnit = mainPackage?.weightKg ?? 0
    const unitsPerCarton = mainPackage?.unitsPerCarton ?? 1
    const planInventory = input.inventory.filter((row) => row.series === series && row.productType === '成品' && row.quantity > 0 && row.warehouseCode === originWarehouse)
    const noTransferPlan = simulatePlan(planInventory, 0, originWarehouse, '', 0, dailyForecast, input.activeRules, input.settings, input.merchantDemandShare ?? 1, volumePerUnit, weightPerUnit, unitsPerCarton)
    const noTransferCost = noTransferPlan.cost
    const candidates = input.warehouses.filter((warehouse) => warehouse.code !== originWarehouse && warehouse.region === origin?.region)

    if (!origin || candidates.length === 0 || dailyForecast <= 0) {
      results.push({
        id: crypto.randomUUID(), series, originWarehouse, destinationWarehouse: '', region: origin?.region ?? '美中', initialQuantity,
        transferQuantity: 0, transferRatio: 0, volumeCubicMeters: 0, weightKg: 0, noTransferCost, transferCost: noTransferCost,
        savings: 0, savingsRate: 0, decision: '待补数据', transferResource: '无有效同区域目的仓', transitDays: 0,
        endingQuantity: noTransferPlan.endingQuantity, coverageDays: dailyForecast > 0 ? initialQuantity / dailyForecast : 0,
        riskMessages: dailyForecast > 0 && initialQuantity / dailyForecast < input.settings.analysisDays ? [`库存仅覆盖${(initialQuantity / dailyForecast).toFixed(1)}天`] : [],
        dataQualityMessages: !origin ? ['仓库维度缺少原仓或未确认区域'] : dailyForecast <= 0 ? ['销售系列缺少有效预测'] : ['没有可用的同区域目的仓'],
      })
      continue
    }

    let best: AnalysisResult | undefined
    for (const destination of candidates) {
      const step = mainPackage?.unitsPerCarton ?? 1
      const candidateQuantities = new Set<number>([0, initialQuantity])
      for (let quantity = step; quantity < initialQuantity; quantity += step) candidateQuantities.add(quantity)
      for (const manual of input.manualQuotes.filter((quote) => quote.originWarehouse === originWarehouse && quote.destinationWarehouse === destination.code)) {
        if (manual.quantity > 0 && manual.quantity <= initialQuantity) candidateQuantities.add(manual.quantity)
      }

      for (const quantity of candidateQuantities) {
        const volume = quantity * volumePerUnit
        const weight = quantity * weightPerUnit
        const cartons = quantity / unitsPerCarton
        const logistics = quantity ? routeLogisticsCost(quantity, volume, weight, cartons, originWarehouse, destination.code, input.activeRules, input.settings) : undefined
        const manual = quantity ? routeManualCost(quantity, volume, weight, cartons, originWarehouse, destination.code, input.activeRules, input.manualQuotes, input.settings) : undefined
        const route = [logistics, manual].filter(Boolean).reduce<typeof logistics>((lowest, current) => !lowest || current!.cost.total < lowest.cost.total ? current : lowest, undefined)
        if (quantity > 0 && !route) continue

        const simulation = simulatePlan(planInventory, quantity, originWarehouse, destination.code, route?.transitDays ?? 0, dailyForecast, input.activeRules, input.settings, input.merchantDemandShare ?? 1, volumePerUnit, weightPerUnit, unitsPerCarton)
        const transferCost: CostBreakdown = {
          storage: simulation.cost.storage,
          delivery: simulation.cost.delivery,
          outbound: route?.cost.outbound ?? 0,
          inbound: route?.cost.inbound ?? 0,
          transfer: route?.cost.transfer ?? 0,
          surcharge: simulation.cost.surcharge + (route?.cost.surcharge ?? 0),
          total: 0,
        }
        transferCost.total = totalCost(transferCost)
        const savings = noTransferCost.total - transferCost.total
        const savingsRate = noTransferCost.total > 0 ? savings / noTransferCost.total : 0
        const meetsThreshold = savings >= input.settings.minimumSavingsCny && savingsRate >= input.settings.minimumSavingsRate / 100
        const result: AnalysisResult = {
          id: crypto.randomUUID(), series, originWarehouse, destinationWarehouse: quantity ? destination.code : '', region: origin.region,
          initialQuantity, transferQuantity: meetsThreshold ? quantity : 0, transferRatio: meetsThreshold ? quantity / initialQuantity : 0,
          cartonCount: mainPackage ? Math.ceil(quantity / mainPackage.unitsPerCarton) : undefined,
          volumeCubicMeters: volume, weightKg: quantity * weightPerUnit,
          noTransferCost, transferCost, savings, savingsRate,
          decision: meetsThreshold && quantity > 0 ? '建议调拨' : '不调拨', transferResource: route?.resource ?? '不使用中转资源', transitDays: route?.transitDays ?? 0,
          expectedArrivalDate: route?.transitDays ? new Date(new Date(input.settings.baseDate).getTime() + route.transitDays * 86_400_000).toISOString().slice(0, 10) : undefined,
          endingQuantity: simulation.endingQuantity, coverageDays: initialQuantity / dailyForecast,
          riskMessages: [...(initialQuantity / dailyForecast < input.settings.analysisDays ? [`库存仅覆盖${(initialQuantity / dailyForecast).toFixed(1)}天，低于分析天数`] : []), ...(simulation.shortage > 0 ? [`分析期预计缺货${simulation.shortage.toFixed(1)}件`] : [])],
          dataQualityMessages: [...simulation.quality, ...(mainPackage ? [] : ['缺少包装参数，按单件递增且无法计算准确体积和重量'])],
        }
        if (!best || result.transferCost.total < best.transferCost.total) best = result
      }
    }
    if (best) results.push(best)
  }
  return results
}
