import type { AnalysisSettings, FileSlotDefinition, QuoteVersion, WarehouseAddress } from './types'

export const fileSlots: FileSlotDefinition[] = [
  { id: 'inventory', label: '库存数据', group: '事实表', requiredFields: ['仓库名称', '商品编码', '销售系列', '数量', '库存状态', '商品类型'], optionalFields: ['仓库编码', '入库日期', '库存存放天数', '预计到仓日期'] },
  { id: 'forecast', label: '销售预测', group: '事实表', requiredFields: ['销售系列', '预测数量', '预测期间天数'], optionalFields: ['商品编码', '预测开始日期', '预测结束日期'] },
  { id: 'sales', label: '销售数据', group: '事实表', requiredFields: ['商品编码', '销售系列', '日期', '数量'], optionalFields: ['渠道', '订单状态'] },
  { id: 'amazonOutbound', label: '亚马逊仓配出库数据', group: '事实表', requiredFields: ['商品编码', '销售系列', '出库日期', '邮编', '数量', '订单状态'], optionalFields: ['仓库名称'] },
  { id: 'merchantOutbound', label: '商家自发货出库数据', group: '事实表', requiredFields: ['商品编码', '销售系列', '出库日期', '邮编', '数量', '订单状态'], optionalFields: ['仓库名称'] },
  { id: 'product', label: '商品维度', group: '维度表', requiredFields: ['商品编码', '销售系列', '商品名称'], optionalFields: ['品类'] },
  { id: 'warehouse', label: '仓库维度', group: '维度表', requiredFields: ['仓库编码', '仓库名称'], optionalFields: ['州', '城市', '详细地址', '邮编', '所属区域'] },
  { id: 'packaging', label: '商品包装参数', group: '维度表', requiredFields: ['商品编码', '包装长（厘米）', '包装宽（厘米）', '包装高（厘米）', '毛重（千克）', '每箱件数'], optionalFields: [] },
  { id: 'listingMaterial', label: '领星商品编码匹配物料编码', group: '维度表', requiredFields: ['领星商品编码', '物料编码'], optionalFields: [] },
  { id: 'customerMaterial', label: '客户与物料对照表', group: '维度表', requiredFields: ['客户编码', '物料编码'], optionalFields: ['客户商品编码'] },
  { id: 'warehouseMaterial', label: '仓库与物料对照表', group: '维度表', requiredFields: ['仓库编码', '物料编码'], optionalFields: ['仓库商品编码'] },
]

export const defaultAnalysisSettings: AnalysisSettings = {
  baseDate: new Date().toISOString().slice(0, 10),
  analysisDays: 45,
  usdToCny: 7.2,
  minimumSavingsCny: 0,
  minimumSavingsRate: 0,
}

export const defaultAddresses: WarehouseAddress[] = [
  { code: 'CA', name: '加利福尼亚仓', state: 'CA', city: '', address: '', postalCode: '', suggestedRegion: '美西', confirmedRegion: '美西', confirmed: true },
  { code: 'GA', name: '佐治亚仓', state: 'GA', city: '', address: '', postalCode: '', suggestedRegion: '美中', confirmedRegion: '美中', confirmed: true },
  { code: 'NJ', name: '新泽西仓', state: 'NJ', city: '', address: '', postalCode: '', suggestedRegion: '美东', confirmedRegion: '美东', confirmed: true },
]

export const defaultQuoteSlots: QuoteVersion[] = [1, 2, 3, 4].map((slot) => ({
  slot: slot as 1 | 2 | 3 | 4,
  logisticsCompany: '',
  sourceFileName: '',
  version: '',
  effectiveDate: '',
  status: '未上传',
  draftRules: [],
  activeRules: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}))

export const stateRegions: Record<string, '美西' | '美中' | '美东'> = {
  AK: '美西', AZ: '美西', CA: '美西', CO: '美西', HI: '美西', ID: '美西', MT: '美西', NM: '美西', NV: '美西', OR: '美西', UT: '美西', WA: '美西', WY: '美西',
  AL: '美中', AR: '美中', GA: '美中', IA: '美中', IL: '美中', IN: '美中', KS: '美中', KY: '美中', LA: '美中', MI: '美中', MN: '美中', MO: '美中', MS: '美中', ND: '美中', NE: '美中', OK: '美中', SD: '美中', TN: '美中', TX: '美中', WI: '美中',
  CT: '美东', DC: '美东', DE: '美东', FL: '美东', MA: '美东', MD: '美东', ME: '美东', NC: '美东', NH: '美东', NJ: '美东', NY: '美东', OH: '美东', PA: '美东', RI: '美东', SC: '美东', VA: '美东', VT: '美东', WV: '美东',
}
