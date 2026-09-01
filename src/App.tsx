import { useEffect, useState } from 'react'
import AppShell from './components/AppShell'
import FileLibraryPage from './pages/FileLibraryPage'
import InventoryAnalysisPage from './pages/InventoryAnalysisPage'
import InventoryHeatmapPage from './pages/InventoryHeatmapPage'
import MappingPage from './pages/MappingPage'
import QuotePage from './pages/QuotePage'
import ResultsPage, { type HistoricalSummary } from './pages/ResultsPage'
import SalesHeatmapPage from './pages/SalesHeatmapPage'
import SettingsPage from './pages/SettingsPage'
import { defaultAddresses, defaultAnalysisSettings, defaultQuoteSlots, stateRegions } from './data'
import { db, getSetting, saveFile, saveQuote, settingKeys, setSetting, updateFileMapping } from './storage'
import { countryToSiteRegion, demandSiteRegion, inspectWorkbook, localQuoteDraft, parseForecast, parseInventory, parseOutbound, parsePackaging, parseWarehouses, postalRegion, readMappedRows, readProductDimensionRows, warehouseRegionFromSite } from './fileParser'
import { optimizeTransfers } from './analysis'
import { aggregateInventoryHeatmapDetails, aggregateInventoryHeatmapLocationDetails, aggregateSalesHeatmapDetails, aggregateSalesHeatmapLocationDetails, buildListingMaterialMap, buildProductMetadata, type ResolvedOutboundRecord } from './heatmapDetails'
import { aggregateStateDemand, aggregateStateInventory, resolveOutboundDemandRegion } from './stateAggregation'
import { parseQuoteWithAi, testAiConnection } from './ai'
import { exportAnalysisWorkbook } from './exportExcel'
import type { AiSettings, AnalysisResult, AnalysisSettings, DemandRegion, FileSlotDefinition, InventoryHeatmapLocationDetail, InventoryHeatmapSkuDetail, InventoryRecord, ManualTransferQuote, OutboundRecord, PageId, QuoteVersion, SalesHeatmapLocationDetail, SalesHeatmapSkuDetail, SiteInventorySummary, SiteRegion, StoredFile, WarehouseAddress, WarehouseRecord, WarehouseRegion } from './types'
import './styles.css'
import './heatmapFilters.css'

const defaultAiSettings: AiSettings = {
  provider: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini', secret: '', workerUrl: '', connectionStatus: '未测试',
}

const HEATMAP_SNAPSHOT_VERSION = 2

type HeatmapSnapshot = {
  version?: number
  history: HistoricalSummary
  siteInventory: SiteInventorySummary[]
  regionInventory?: Record<DemandRegion, number>
  stateInventory: Record<string, number>
  salesDetails: SalesHeatmapSkuDetail[]
  inventoryDetails: InventoryHeatmapSkuDetail[]
  salesLocationDetails: SalesHeatmapLocationDetail[]
  inventoryLocationDetails: InventoryHeatmapLocationDetail[]
  savedAt: string
}

type HistoryBuildResult = {
  summary: HistoricalSummary
  resolvedRows: ResolvedOutboundRecord[]
}

type HeatmapComputeResult = {
  history: HistoricalSummary
  inventory: InventoryRecord[]
  warehouses: WarehouseRecord[]
  warnings: string[]
}

function warehouseKey(value: string) {
  return value.trim().replace(/\s+/g, '').toLocaleUpperCase()
}

let initializationPromise: Promise<void> | undefined

function initializeDatabase() {
  if (!initializationPromise) initializationPromise = db.transaction('rw', [db.quotes, db.warehouseAddresses], async () => {
    if ((await db.quotes.count()) === 0) await db.quotes.bulkAdd(defaultQuoteSlots)
    if ((await db.warehouseAddresses.count()) === 0) await db.warehouseAddresses.bulkAdd(defaultAddresses)
  })
  return initializationPromise
}

export default function App() {
  const [page, setPage] = useState<PageId>('files')
  const [selectedFile, setSelectedFile] = useState<StoredFile>()
  const [uploading, setUploading] = useState<string>()
  const [busySlot, setBusySlot] = useState<number>()
  const [running, setRunning] = useState(false)
  const [heatmapLoading, setHeatmapLoading] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger' | 'info'; text: string }>()
  const [analysisSettings, setAnalysisSettingsState] = useState<AnalysisSettings>(defaultAnalysisSettings)
  const [aiSettings, setAiSettingsState] = useState<AiSettings>(defaultAiSettings)
  const [files, setFiles] = useState<StoredFile[]>([])
  const [quotes, setQuotes] = useState<QuoteVersion[]>(defaultQuoteSlots)
  const [addresses, setAddresses] = useState<WarehouseAddress[]>([])
  const [manualQuotes, setManualQuotes] = useState<ManualTransferQuote[]>([])
  const [results, setResults] = useState<AnalysisResult[]>([])
  const [history, setHistory] = useState<HistoricalSummary>(() => emptyHistoricalSummary())
  const [siteInventory, setSiteInventory] = useState<SiteInventorySummary[]>([])
  const [regionInventory, setRegionInventory] = useState<Record<DemandRegion, number>>({ 美西: 0, 美中: 0, 美东: 0, 加拿大: 0, 英国: 0, 欧洲: 0 })
  const [stateInventory, setStateInventory] = useState<Record<string, number>>({})
  const [salesDetails, setSalesDetails] = useState<SalesHeatmapSkuDetail[]>([])
  const [inventoryDetails, setInventoryDetails] = useState<InventoryHeatmapSkuDetail[]>([])
  const [salesLocationDetails, setSalesLocationDetails] = useState<SalesHeatmapLocationDetail[]>([])
  const [inventoryLocationDetails, setInventoryLocationDetails] = useState<InventoryHeatmapLocationDetail[]>([])

  const refreshData = async () => {
    const [nextFiles, nextQuotes, nextAddresses, nextManual, savedResults] = await Promise.all([db.files.toArray(), db.quotes.orderBy('slot').toArray(), db.warehouseAddresses.toArray(), db.manualTransferQuotes.toArray(), db.results.orderBy('createdAt').last()])
    setFiles(nextFiles)
    setQuotes(nextQuotes.length ? nextQuotes : defaultQuoteSlots)
    setAddresses(nextAddresses)
    setManualQuotes(nextManual)
    setResults(savedResults?.rows ?? [])
    const snapshot = await getSetting<HeatmapSnapshot | null>(settingKeys.heatmapSnapshot, null)
    if (snapshot?.version === HEATMAP_SNAPSHOT_VERSION) {
      const restoredRegionInventory = snapshot.regionInventory ?? (() => {
        const totals: Record<DemandRegion, number> = { 美西: 0, 美中: 0, 美东: 0, 加拿大: 0, 英国: 0, 欧洲: 0 }
        Object.entries(snapshot.stateInventory).forEach(([state, quantity]) => {
          const region = stateRegions[state]
          if (region) totals[region] += quantity
        })
        return totals
      })()
      setHistory(snapshot.history)
      setSiteInventory(snapshot.siteInventory)
      setRegionInventory(restoredRegionInventory)
      setStateInventory(snapshot.stateInventory)
      setSalesDetails(snapshot.salesDetails ?? [])
      setInventoryDetails(snapshot.inventoryDetails ?? [])
      setSalesLocationDetails(snapshot.salesLocationDetails ?? [])
      setInventoryLocationDetails(snapshot.inventoryLocationDetails ?? [])
    } else if (snapshot) {
      await db.settings.delete(settingKeys.heatmapSnapshot)
    }
  }

  useEffect(() => {
    void (async () => {
      const storedAnalysis = await getSetting(settingKeys.analysis, defaultAnalysisSettings)
      const storedAi = await getSetting(settingKeys.ai, defaultAiSettings)
      setAnalysisSettingsState({ ...defaultAnalysisSettings, ...storedAnalysis })
      setAiSettingsState(storedAi)
      await initializeDatabase()
      await refreshData()
    })()
  }, [])

  const notify = (text: string, tone: 'success' | 'danger' | 'info' = 'success') => {
    setMessage({ text, tone })
    window.setTimeout(() => setMessage(undefined), 4200)
  }

  const handleUpload = async (definition: FileSlotDefinition, file: File) => {
    setUploading(definition.id)
    try {
      const inspected = await inspectWorkbook(file, definition)
      const savedId = await saveFile(inspected)
      const stored = { ...inspected, id: typeof savedId === 'number' ? savedId : undefined }
      setFiles((current) => [...current.filter((item) => item.slotId !== stored.slotId), stored])
      setSelectedFile(stored)
      setPage('mapping')
      notify(`已读取“${inspected.sourceSheetName ?? inspected.sheetNames[0] ?? '未识别工作表'}”：${inspected.headers.length} 列、${inspected.rowCount.toLocaleString('zh-CN')} 行，请选择需要映射的字段`, 'info')
    } catch (error) { notify(error instanceof Error ? error.message : '文件读取失败', 'danger') }
    finally { setUploading(undefined) }
  }

  const saveMapping = async (file: StoredFile, mapping: Record<string, string>) => {
    const selectedMapping = Object.fromEntries(Object.entries(mapping).filter(([, source]) => source && file.headers.includes(source)))
    const selectedCount = Object.keys(selectedMapping).length
    const next = { ...file, mapping: selectedMapping, missingFields: [], validation: selectedCount ? '校验通过' as const : '待映射' as const, updatedAt: new Date().toISOString() }
    const id = await updateFileMapping(next)
    const stored = { ...next, id }
    setFiles((current) => current.map((item) => item.slotId === stored.slotId ? stored : item))
    setSelectedFile(stored)
    notify(selectedCount ? `已保存 ${selectedCount} 个字段映射` : '已保存为空映射；后续可随时重新选择', selectedCount ? 'success' : 'info')
  }

  const uploadQuote = async (slot: 1 | 2 | 3 | 4, file: File, company: string, version: string, effectiveDate: string, useAi: boolean) => {
    setBusySlot(slot)
    const current = quotes.find((item) => item.slot === slot) ?? defaultQuoteSlots[slot - 1]
    try {
      const data = await file.arrayBuffer()
      const localDraft = localQuoteDraft(data)
      let draft = localDraft
      if (useAi) {
        try { draft = await parseQuoteWithAi(aiSettings, { fileName: file.name, extractedRows: localDraft }) }
        catch (error) { notify(`人工智能解析未完成，已保留本机初步解析草稿：${error instanceof Error ? error.message : '未知原因'}`, 'info') }
      }
      await saveQuote({ ...current, logisticsCompany: company, sourceFileName: file.name, version, effectiveDate, status: '待确认', draftRules: draft, updatedAt: new Date().toISOString() })
      await refreshData()
      notify('报价已解析为审核草稿，确认前原报价继续生效')
    } catch (error) {
      await saveQuote({ ...current, status: '解析失败', updatedAt: new Date().toISOString() })
      await refreshData()
      notify(error instanceof Error ? error.message : '报价解析失败', 'danger')
    } finally { setBusySlot(undefined) }
  }

  const applyQuote = async (quote: QuoteVersion, rules: QuoteVersion['draftRules']) => {
    await saveQuote({ ...quote, draftRules: rules, activeRules: rules.filter((rule) => !rule.excluded), status: '已应用', updatedAt: new Date().toISOString() })
    await refreshData()
    notify(`仓库报价${quote.slot}已应用；后续测算将按该物流公司的完整报价参与比较`)
  }

  const saveAnalysisSettings = async (value: AnalysisSettings) => {
    await setSetting(settingKeys.analysis, value); setAnalysisSettingsState(value); notify('分析设置已保存')
  }
  const saveAiSettings = async (value: AiSettings) => {
    const next = { ...value, connectionStatus: value.secret === aiSettings.secret ? value.connectionStatus : '未测试' as const }
    await setSetting(settingKeys.ai, next); setAiSettingsState(next); notify('人工智能服务设置已保存到本机浏览器')
  }
  const testAi = async (value: AiSettings) => {
    const testing = { ...value, connectionStatus: '测试中' as const, connectionMessage: '正在测试连接' }; setAiSettingsState(testing)
    try { const text = await testAiConnection(testing); const next = { ...testing, connectionStatus: '连接成功' as const, connectionMessage: text }; await setSetting(settingKeys.ai, next); setAiSettingsState(next); notify(text) }
    catch (error) { const text = error instanceof Error ? error.message : '连接失败'; const next = { ...testing, connectionStatus: '连接失败' as const, connectionMessage: text }; await setSetting(settingKeys.ai, next); setAiSettingsState(next); notify(text, 'danger') }
  }

  const saveAddress = async (address: WarehouseAddress) => {
    const suggestedRegion = stateRegions[address.state.toUpperCase()] ?? postalRegion(address.postalCode) ?? address.suggestedRegion
    const next = { ...address, suggestedRegion, confirmedRegion: address.confirmedRegion ?? suggestedRegion }
    if (!next.code || !next.name) { notify('仓库编码和仓库名称不能为空', 'danger'); return }
    const existing = await db.warehouseAddresses.where('code').equals(next.code).first()
    await db.warehouseAddresses.put(existing?.id ? { ...next, id: existing.id } : next)
    await refreshData()
    notify(`仓库区域已确认：${next.confirmedRegion}`)
  }

  const computeHeatmapData = async (sourceFiles: StoredFile[], sourceAddresses: WarehouseAddress[], settings: AnalysisSettings): Promise<HeatmapComputeResult> => {
    const valid = (slotId: StoredFile['slotId']) => sourceFiles.find((file) => file.slotId === slotId && file.validation === '校验通过')
    const warnings: string[] = []
    const amazonFile = valid('amazonOutbound')
    const merchantFile = valid('merchantOutbound')
    let historyBuild: HistoryBuildResult
    if (!amazonFile || !merchantFile) {
      const missing = [!amazonFile ? '亚马逊仓配出库数据' : '', !merchantFile ? '商家自发货出库数据' : ''].filter(Boolean).join('、')
      warnings.push(`缺少${missing}，销售热力图为空`)
    }
    try {
      historyBuild = buildHistory(sourceFiles)
    } catch (error) {
      const text = error instanceof Error ? error.message : '未知原因'
      warnings.push(`历史出库数据解析失败，销售热力图为空：${text}`)
      historyBuild = { summary: { ...emptyHistoricalSummary(), messages: [`历史出库数据解析失败：${text}`] }, resolvedRows: [] }
    }
    const historic = historyBuild.summary

    let productRows: Record<string, unknown>[] = []
    const productFile = valid('product')
    if (!productFile) warnings.push('缺少商品维度文件，销售产品线、销售系列和型号留空')
    else {
      try { productRows = readProductDimensionRows(productFile) }
      catch (error) { warnings.push(`商品维度解析失败，销售产品线、销售系列和型号留空：${error instanceof Error ? error.message : '未知原因'}`) }
    }
    const productMetadata = buildProductMetadata(productRows)
    let listingMaterialRows: Record<string, unknown>[] = []
    const listingMaterialFile = valid('listingMaterial')
    if (!listingMaterialFile) warnings.push('缺少领星商品编码匹配物料编码文件，销售产品线、销售系列和型号留空')
    else {
      try { listingMaterialRows = readMappedRows(listingMaterialFile) }
      catch (error) { warnings.push(`领星商品编码匹配物料编码文件解析失败，销售产品线、销售系列和型号留空：${error instanceof Error ? error.message : '未知原因'}`) }
    }
    const listingMap = buildListingMaterialMap(listingMaterialRows)
    const seriesByProduct = new Map(productRows.flatMap((row) => {
      const series = String(row['销售系列'] ?? '').trim()
      if (!series) return []
      const keys = new Set([String(row['商品编码'] ?? '').trim(), String(row['SKU'] ?? '').trim()])
      keys.delete('')
      return [...keys].map((key) => [key, series] as const)
    }))

    let inventory: InventoryRecord[] = []
    let warehouses: WarehouseRecord[] = []
    const inventoryFile = valid('inventory')
    const warehouseFile = valid('warehouse')
    if (!inventoryFile || !warehouseFile) {
      const missing = [!inventoryFile ? '库存数据' : '', !warehouseFile ? '仓库维度文件' : ''].filter(Boolean).join('、')
      warnings.push(`缺少${missing}，库存热力图为空`)
    } else {
      try {
        const addressRegion = new Map<string, WarehouseRegion>()
        sourceAddresses.filter((row) => row.confirmed && row.confirmedRegion).forEach((row) => {
          if (row.code) addressRegion.set(warehouseKey(row.code), row.confirmedRegion!)
          if (row.name) addressRegion.set(warehouseKey(row.name), row.confirmedRegion!)
        })
        warehouses = parseWarehouses(warehouseFile).map((row) => ({ ...row, region: warehouseRegionFromSite(row.site ?? '') ?? addressRegion.get(warehouseKey(row.code)) ?? addressRegion.get(warehouseKey(row.name)) ?? row.region }))
        const warehouseByKey = new Map<string, WarehouseRecord>()
        warehouses.forEach((row) => {
          warehouseByKey.set(warehouseKey(row.code), row)
          warehouseByKey.set(warehouseKey(row.name), row)
        })
        inventory = parseInventory(inventoryFile).map((row) => {
          const warehouse = warehouseByKey.get(warehouseKey(row.warehouseName))
          return {
            ...row,
            warehouseCode: warehouse?.code ?? row.warehouseName,
            series: seriesByProduct.get(row.productCode) || row.productCode,
            siteRegion: warehouse?.siteRegion,
            region: warehouse ? warehouseRegionFromSite(warehouse.site ?? '') ?? addressRegion.get(warehouseKey(warehouse.code)) ?? addressRegion.get(warehouseKey(warehouse.name)) : undefined,
          }
        })
      } catch (error) {
        warnings.push(`库存数据或仓库维度解析失败，库存热力图为空：${error instanceof Error ? error.message : '未知原因'}`)
        inventory = []
        warehouses = []
      }
    }

    const stateByAddressKey = new Map<string, string>()
    sourceAddresses.forEach((address) => {
      const state = address.confirmed ? address.state.trim().toUpperCase() : ''
      if (!stateRegions[state]) return
      if (address.code) stateByAddressKey.set(warehouseKey(address.code), state)
      if (address.name) stateByAddressKey.set(warehouseKey(address.name), state)
    })
    const stateByWarehouseCode = new Map<string, string>()
    warehouses.forEach((warehouse) => {
      const state = stateByAddressKey.get(warehouseKey(warehouse.code)) ?? stateByAddressKey.get(warehouseKey(warehouse.name))
      if (state) stateByWarehouseCode.set(warehouse.code.trim().toLocaleUpperCase(), state)
    })
    const usRegionByWarehouseCode = new Map([...stateByWarehouseCode].map(([code, state]) => [code, stateRegions[state]] as [string, WarehouseRegion]))
    const nextSalesDetails = aggregateSalesHeatmapDetails(historyBuild.resolvedRows, productMetadata, listingMap)
    const nextInventoryDetails = aggregateInventoryHeatmapDetails(inventory, productMetadata, usRegionByWarehouseCode)
    const nextSalesLocationDetails = aggregateSalesHeatmapLocationDetails(historyBuild.resolvedRows, productMetadata, listingMap)
    const nextInventoryLocationDetails = aggregateInventoryHeatmapLocationDetails(inventory, productMetadata, stateByWarehouseCode)
    const siteRegionOrder: SiteRegion[] = ['美国', '加拿大', '英国', '欧洲']
    const nextSiteInventory: SiteInventorySummary[] = inventory.length ? siteRegionOrder.map((region) => {
      const rows = inventory.filter((row) => row.siteRegion === region)
      const onHand = rows.filter((row) => row.inventoryStatus === '在库').reduce((sum, row) => sum + row.quantity, 0)
      const inTransit = rows.filter((row) => row.inventoryStatus === '在途').reduce((sum, row) => sum + row.quantity, 0)
      const dailyDemand = historic.siteDailyDemand[region] ?? 0
      const safetyStock = dailyDemand * settings.safetyStockDays
      const total = onHand + inTransit
      const coverageDays = dailyDemand > 0 ? total / dailyDemand : Number.POSITIVE_INFINITY
      const status: SiteInventorySummary['status'] = total <= 0 ? '缺货' : coverageDays < settings.safetyStockDays ? '预警' : '安全'
      return { region, onHand, inTransit, dailyDemand, safetyStock, coverageDays, status }
    }) : []
    const nextRegionInventory: Record<DemandRegion, number> = { 美西: 0, 美中: 0, 美东: 0, 加拿大: 0, 英国: 0, 欧洲: 0 }
    for (const row of inventory) {
      if (row.inventoryStatus !== '在库') continue
      let region: DemandRegion | undefined
      if (row.siteRegion === '美国') region = row.region
      else if (row.siteRegion === '加拿大') region = '加拿大'
      else if (row.siteRegion === '英国') region = '英国'
      else if (row.siteRegion === '欧洲') region = '欧洲'
      if (region) nextRegionInventory[region] += row.quantity
    }
    const unspecifiedUsInventory = inventory.filter((row) => row.siteRegion === '美国' && !row.region && row.inventoryStatus === '在库').reduce((sum, row) => sum + row.quantity, 0)
    if (unspecifiedUsInventory > 0) warnings.push(`有 ${unspecifiedUsInventory.toLocaleString('zh-CN')} 件美国在库的站点仅标记为“美国”，无法细分到美东、美西或美中`)
    const nextStateInventory = aggregateStateInventory(inventory, sourceAddresses, warehouses)

    setHistory(historic)
    setSiteInventory(nextSiteInventory)
    setRegionInventory(nextRegionInventory)
    setStateInventory(nextStateInventory)
    setSalesDetails(nextSalesDetails)
    setInventoryDetails(nextInventoryDetails)
    setSalesLocationDetails(nextSalesLocationDetails)
    setInventoryLocationDetails(nextInventoryLocationDetails)
    await setSetting(settingKeys.heatmapSnapshot, { version: HEATMAP_SNAPSHOT_VERSION, history: historic, siteInventory: nextSiteInventory, regionInventory: nextRegionInventory, stateInventory: nextStateInventory, salesDetails: nextSalesDetails, inventoryDetails: nextInventoryDetails, salesLocationDetails: nextSalesLocationDetails, inventoryLocationDetails: nextInventoryLocationDetails, savedAt: new Date().toISOString() })
    return { history: historic, inventory, warehouses, warnings }
  }

  const loadHeatmapData = async () => {
    if (heatmapLoading) return
    setHeatmapLoading(true)
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    try {
      const { warnings } = await computeHeatmapData(files, addresses, analysisSettings)
      notify(warnings.length ? `热力图数据已加载；${warnings.join('；')}` : '热力图数据已加载', warnings.length ? 'info' : 'success')
    } catch (error) { notify(error instanceof Error ? error.message : '热力图数据加载失败', 'danger') }
    finally { setHeatmapLoading(false) }
  }

  const runAnalysis = async () => {
    setRunning(true)
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    try {
      const latestManualQuotes = await db.manualTransferQuotes.toArray()
      const valid = (slotId: StoredFile['slotId']) => files.find((file) => file.slotId === slotId && file.validation === '校验通过')
      const inventoryFile = valid('inventory'), forecastFile = valid('forecast'), warehouseFile = valid('warehouse')
      if (!inventoryFile || !forecastFile || !warehouseFile) throw new Error('库存数据、销售预测和仓库维度必须上传、映射并通过校验')
      const forecast = parseForecast(forecastFile)
      const packaging = valid('packaging') ? parsePackaging(valid('packaging')!) : []
      const heatmapData = await computeHeatmapData(files, addresses, analysisSettings)
      const { inventory, warehouses, history: historic } = heatmapData
      const activePackages = quotes.filter((quote) => quote.status === '已应用' && quote.activeRules.length)
      const packages = activePackages.length ? activePackages : [{ ...defaultQuoteSlots[0], logisticsCompany: '未配置物流商报价' }]
      const candidates = packages.flatMap((quote) => optimizeTransfers({ inventory, forecast, packaging, warehouses, activeRules: quote.activeRules, manualQuotes: latestManualQuotes, settings: analysisSettings, merchantDemandShare: historic.commonDateRange ? historic.channelMerchantShare : 1 }).map((row) => ({ ...row, transferResource: row.transferResource === '物流商中转' ? `${quote.logisticsCompany}中转` : row.transferResource, decision: historic.commonDateRange ? row.decision : '待补数据' as const, transferQuantity: historic.commonDateRange ? row.transferQuantity : 0, transferRatio: historic.commonDateRange ? row.transferRatio : 0, dataQualityMessages: [...row.dataQualityMessages, ...(quote.activeRules.length ? [] : ['尚未应用仓库报价，费用结果仅供数据检查']), ...(historic.commonDateRange ? [] : ['历史出库共同区间不足，不生成正式调拨建议'])] })))
      const bestByGroup = new Map<string, AnalysisResult>()
      for (const row of candidates) {
        const key = `${row.originWarehouse}::${row.series}`
        const current = bestByGroup.get(key)
        if (!current || row.transferCost.total < current.transferCost.total) bestByGroup.set(key, row)
      }
      const rows = [...bestByGroup.values()]
      await db.results.put({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), rows })
      setResults(rows)
      setPage('results'); notify(`测算完成，共生成 ${rows.length} 条结果${heatmapData.warnings.length ? `；${heatmapData.warnings.join('；')}` : ''}`, heatmapData.warnings.length ? 'info' : 'success')
    } catch (error) { notify(error instanceof Error ? error.message : '测算失败', 'danger') }
    finally { setRunning(false) }
  }

  const pageContent = page === 'files' ? <FileLibraryPage files={files} uploading={uploading} onUpload={handleUpload} onMap={(file) => { setSelectedFile(file); setPage('mapping') }} onClear={async () => { await db.transaction('rw', [db.files, db.results, db.manualTransferQuotes], async () => { await db.files.clear(); await db.results.clear(); await db.manualTransferQuotes.clear() }); await db.settings.delete(settingKeys.heatmapSnapshot); setHistory(emptyHistoricalSummary()); setSiteInventory([]); setRegionInventory({ 美西: 0, 美中: 0, 美东: 0, 加拿大: 0, 英国: 0, 欧洲: 0 }); setStateInventory({}); setSalesDetails([]); setInventoryDetails([]); setSalesLocationDetails([]); setInventoryLocationDetails([]); await refreshData(); setSelectedFile(undefined); notify('本次分析文件、结果和自行询价已清空') }}/>
    : page === 'mapping' ? <MappingPage files={files} selected={selectedFile ?? files[0]} uploading={uploading} onSelect={setSelectedFile} onUpload={handleUpload} onSave={saveMapping}/>
    : page === 'quotes' ? <QuotePage quotes={quotes} aiSettings={aiSettings} busySlot={busySlot} onUpload={uploadQuote} onApply={applyQuote} onSaveAi={saveAiSettings} onTestAi={testAi}/>
    : page === 'settings' ? <SettingsPage settings={analysisSettings} addresses={addresses} onSaveSettings={saveAnalysisSettings} onSaveAddress={saveAddress} onDeleteAddress={async (id) => { if (id) await db.warehouseAddresses.delete(id); await refreshData() }}/>
    : page === 'salesHeatmap' ? <SalesHeatmapPage history={history} addresses={addresses} details={salesDetails} locationDetails={salesLocationDetails} loading={heatmapLoading} onLoad={loadHeatmapData}/>
    : page === 'inventoryHeatmap' ? <InventoryHeatmapPage siteInventory={siteInventory} regionInventory={regionInventory} stateInventory={stateInventory} addresses={addresses} details={inventoryDetails} locationDetails={inventoryLocationDetails} loading={heatmapLoading} onLoad={loadHeatmapData}/>
    : page === 'inventoryAnalysis' ? <InventoryAnalysisPage/>
    : <ResultsPage results={results} addresses={addresses} manualQuotes={manualQuotes} history={history} siteInventory={siteInventory} running={running} onRun={runAnalysis} onAddManualQuote={async (quote) => { await db.manualTransferQuotes.add(quote); await refreshData(); notify('自行寻找的中转报价已保存，正在重新测算'); await runAnalysis() }} onDeleteManualQuote={async (id) => { if (id) await db.manualTransferQuotes.delete(id); await refreshData(); notify('自行询价已删除') }} onExport={() => exportAnalysisWorkbook(results, analysisSettings, files, quotes, manualQuotes)}/>

  return <AppShell page={page} onNavigate={setPage}>{message ? <div className={`toast ${message.tone}`}>{message.text}</div> : null}{pageContent}</AppShell>
}

function buildHistory(files: StoredFile[]): HistoryBuildResult {
  const amazonFile = files.find((file) => file.slotId === 'amazonOutbound' && file.validation === '校验通过')
  const merchantFile = files.find((file) => file.slotId === 'merchantOutbound' && file.validation === '校验通过')
  if (!amazonFile || !merchantFile) return { summary: { channelAmazonShare: 0, channelMerchantShare: 0, postcodeCoverage: 0, regionDemand: { 美西: 0, 美中: 0, 美东: 0, 英国: 0, 加拿大: 0, 欧洲: 0 }, regionDemandAmount: { 美西: 0, 美中: 0, 美东: 0, 英国: 0, 加拿大: 0, 欧洲: 0 }, stateDemand: {}, siteDailyDemand: { 美国: 0, 加拿大: 0, 英国: 0, 欧洲: 0 }, messages: ['亚马逊仓配与商家自发货历史出库数据未同时通过校验，不生成正式地区建议'] }, resolvedRows: [] }
  const amazon = parseOutbound(amazonFile, '亚马逊仓配'), merchant = parseOutbound(merchantFile, '商家自发货')
  const datesA = amazon.map((row) => row.date).filter(Boolean).sort(), datesM = merchant.map((row) => row.date).filter(Boolean).sort()
  const start = [datesA[0], datesM[0]].filter(Boolean).sort().at(-1), end = [datesA.at(-1), datesM.at(-1)].filter(Boolean).sort()[0]
  if (!start || !end || start > end) {
    const dataBytes = (file: StoredFile) => Number((file.data as ArrayBuffer | ArrayBufferView | undefined)?.byteLength ?? 0)
    const dateSummary = (label: string, file: StoredFile, rows: OutboundRecord[], dates: string[]) => `${label}文件${dataBytes(file).toLocaleString('zh-CN')}字节、解析${rows.length.toLocaleString('zh-CN')}条、有效日期${dates.length.toLocaleString('zh-CN')}条${dates.length ? `（${dates[0]}至${dates.at(-1)}）` : ''}`
    const detail = `${dateSummary('亚马逊仓配', amazonFile, amazon, datesA)}；${dateSummary('商家自发货', merchantFile, merchant, datesM)}`
    return { summary: { channelAmazonShare: 0, channelMerchantShare: 0, postcodeCoverage: 0, regionDemand: { 美西: 0, 美中: 0, 美东: 0, 英国: 0, 加拿大: 0, 欧洲: 0 }, regionDemandAmount: { 美西: 0, 美中: 0, 美东: 0, 英国: 0, 加拿大: 0, 欧洲: 0 }, stateDemand: {}, siteDailyDemand: { 美国: 0, 加拿大: 0, 英国: 0, 欧洲: 0 }, messages: [`两类历史出库没有共同覆盖日期区间，不生成正式地区建议；${detail}`] }, resolvedRows: [] }
  }
  const a = amazon.filter((row) => row.date >= start && row.date <= end), m = merchant.filter((row) => row.date >= start && row.date <= end), all = [...a, ...m]
  const stateDemand = aggregateStateDemand(all)
  const amountA = a.reduce((sum, row) => sum + row.quantity, 0), amountM = m.reduce((sum, row) => sum + row.quantity, 0), total = amountA + amountM
  const resolvedRows = all.flatMap((row) => { const region = resolveOutboundDemandRegion(row); return region ? [{ row, region }] : [] })
  const valid = resolvedRows.map((item) => item.row), validAmount = valid.reduce((sum, row) => sum + row.quantity, 0)
  const regions: Record<DemandRegion, number> = { 美西: 0, 美中: 0, 美东: 0, 英国: 0, 加拿大: 0, 欧洲: 0 }
  resolvedRows.forEach(({ row, region }) => { regions[region] += row.quantity })
  const regionDemandAmount = { ...regions }
  ;(Object.keys(regions) as DemandRegion[]).forEach((region) => { regions[region] = validAmount ? regions[region] / validAmount : 0 })
  const messages = []
  if (all.length < 30) messages.push('共同日期区间内历史记录少于30条，受影响部分仅作提示')
  if (total && validAmount / total < .8) messages.push('有效邮编覆盖率低于80%，地区热力需谨慎使用')
  const totalDays = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1
  const siteAmount: Record<SiteRegion, number> = { 美国: 0, 加拿大: 0, 英国: 0, 欧洲: 0 }
  all.forEach((row) => { const region = countryToSiteRegion(row.country ?? '') ?? demandSiteRegion(row.postalCode); if (region) siteAmount[region] += row.quantity })
  const siteDailyDemand: Record<SiteRegion, number> = { 美国: 0, 加拿大: 0, 英国: 0, 欧洲: 0 }
  ;(Object.keys(siteDailyDemand) as SiteRegion[]).forEach((region) => { siteDailyDemand[region] = totalDays > 0 ? siteAmount[region] / totalDays : 0 })
  return { summary: { channelAmazonShare: total ? amountA / total : 0, channelMerchantShare: total ? amountM / total : 0, postcodeCoverage: total ? validAmount / total : 0, regionDemand: regions, regionDemandAmount, stateDemand, siteDailyDemand, commonDateRange: `${start} 至 ${end}`, messages }, resolvedRows }
}

function emptyHistoricalSummary(): HistoricalSummary {
  return { channelAmazonShare: 0, channelMerchantShare: 0, postcodeCoverage: 0, regionDemand: { 美西: 0, 美中: 0, 美东: 0, 英国: 0, 加拿大: 0, 欧洲: 0 }, regionDemandAmount: { 美西: 0, 美中: 0, 美东: 0, 英国: 0, 加拿大: 0, 欧洲: 0 }, stateDemand: {}, siteDailyDemand: { 美国: 0, 加拿大: 0, 英国: 0, 欧洲: 0 }, messages: ['请完成历史出库数据映射并运行分析'] }
}
