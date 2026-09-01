export type PageId = 'files' | 'quotes' | 'mapping' | 'settings' | 'results' | 'salesHeatmap' | 'inventoryHeatmap' | 'inventoryAnalysis'

export type FileSlotId =
  | 'inventory'
  | 'forecast'
  | 'sales'
  | 'amazonOutbound'
  | 'merchantOutbound'
  | 'product'
  | 'warehouse'
  | 'packaging'
  | 'listingMaterial'
  | 'customerMaterial'
  | 'warehouseMaterial'

export type FileGroup = '事实表' | '维度表'

export interface FileSlotDefinition {
  id: FileSlotId
  label: string
  group: FileGroup
  requiredFields: string[]
  optionalFields: string[]
}

export interface StoredFile {
  id?: number
  slotId: FileSlotId
  fileName: string
  updatedAt: string
  rowCount: number
  sheetNames: string[]
  sourceSheetName?: string
  headers: string[]
  previewRows: Record<string, unknown>[]
  data: ArrayBuffer
  mapping: Record<string, string>
  validation: '待映射' | '校验通过' | '有缺失字段'
  missingFields: string[]
}

export type WarehouseRegion = '美西' | '美中' | '美东'
export type DemandRegion = '美西' | '美中' | '美东' | '英国' | '加拿大' | '欧洲'
export type SiteRegion = '美国' | '加拿大' | '英国' | '欧洲'

export interface HeatmapSkuDetailBase {
  region: DemandRegion
  productLine: string
  series: string
  sku: string
  ratio: number
}

export interface SalesHeatmapSkuDetail extends HeatmapSkuDetailBase {
  orderQuantity: number
}

export interface InventoryHeatmapSkuDetail extends HeatmapSkuDetailBase {
  onHand: number
  inTransit: number
  total: number
}

export interface WarehouseAddress {
  id?: number
  code: string
  name: string
  state: string
  city: string
  address: string
  postalCode: string
  suggestedRegion: WarehouseRegion
  confirmedRegion?: WarehouseRegion
  confirmed: boolean
}

export type FeeCategory =
  | '仓储费'
  | '尾程配送费'
  | '原仓出库费'
  | '目的仓入库费'
  | '中转运输费'
  | '其他附加费'
  | '未识别项目'

export interface SourceEvidence {
  sheetName: string
  cellRange: string
  rawText: string
}

export interface FeeRule {
  id: string
  category: FeeCategory
  name: string
  warehouseCode?: string
  routeFrom?: string
  routeTo?: string
  startDay?: number
  endDay?: number
  billingUnit: string
  billingPeriod?: string
  rateUsd?: number
  percentage?: number
  minimumChargeUsd?: number
  transitDays?: number
  conditions: string
  confidence: '高' | '中' | '低'
  evidence: SourceEvidence
  validationIssues: string[]
  excluded?: boolean
}

export interface QuoteVersion {
  id?: number
  slot: 1 | 2 | 3 | 4
  logisticsCompany: string
  sourceFileName: string
  version: string
  effectiveDate: string
  expiresAt?: string
  status: '未上传' | '解析中' | '待确认' | '已应用' | '解析失败'
  draftRules: FeeRule[]
  activeRules: FeeRule[]
  createdAt: string
  updatedAt: string
}

export interface AiSettings {
  provider: 'OpenAI' | 'DeepSeek'
  baseUrl: string
  model: string
  secret: string
  workerUrl: string
  connectionStatus: '未测试' | '测试中' | '连接成功' | '连接失败'
  connectionMessage?: string
}

export interface AnalysisSettings {
  baseDate: string
  analysisDays: number
  usdToCny: number
  minimumSavingsCny: number
  minimumSavingsRate: number
  safetyStockDays: number
}

export interface InventoryRecord {
  warehouseCode: string
  warehouseName: string
  siteRegion?: SiteRegion
  region?: WarehouseRegion
  productCode: string
  series: string
  quantity: number
  inventoryStatus: '在库' | '在途'
  productType: '成品' | '退货' | '配件'
  inboundDate?: string
  ageDays?: number
  expectedArrivalDate?: string
}

export interface ForecastRecord {
  productCode?: string
  series: string
  quantity: number
  periodDays: number
}

export interface OutboundRecord {
  productCode: string
  series: string
  date: string
  postalCode: string
  quantity: number
  status: string
  channel: '亚马逊仓配' | '商家自发货'
  country?: string
}

export interface PackagingRecord {
  productCode: string
  lengthCm: number
  widthCm: number
  heightCm: number
  weightKg: number
  unitsPerCarton: number
}

export interface WarehouseRecord {
  code: string
  name: string
  region: WarehouseRegion
  site?: string
  siteRegion?: SiteRegion
}

export interface ManualTransferQuote {
  id?: number
  carrier: string
  originWarehouse: string
  destinationWarehouse: string
  quantity: number
  volumeCubicMeters: number
  priceMode: '总价' | '每立方米单价'
  price: number
  currency: '人民币' | '美元'
  transitDays: number
  scope: '仅运输费' | '全包价'
  quoteDate: string
  expiresAt: string
  notes: string
}

export interface CostBreakdown {
  storage: number
  delivery: number
  outbound: number
  inbound: number
  transfer: number
  surcharge: number
  total: number
}

export interface AnalysisResult {
  id: string
  series: string
  originWarehouse: string
  destinationWarehouse: string
  region: WarehouseRegion
  initialQuantity: number
  transferQuantity: number
  transferRatio: number
  cartonCount?: number
  volumeCubicMeters: number
  weightKg: number
  noTransferCost: CostBreakdown
  transferCost: CostBreakdown
  savings: number
  savingsRate: number
  decision: '不调拨' | '建议调拨' | '待补数据'
  transferResource: string
  transitDays: number
  expectedArrivalDate?: string
  endingQuantity: number
  coverageDays: number
  riskMessages: string[]
  dataQualityMessages: string[]
}

export interface SiteInventorySummary {
  region: SiteRegion
  onHand: number
  inTransit: number
  dailyDemand: number
  safetyStock: number
  coverageDays: number
  status: '安全' | '预警' | '缺货'
}
