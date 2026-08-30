import Dexie, { type EntityTable } from 'dexie'
import type { AiSettings, AnalysisResult, AnalysisSettings, ManualTransferQuote, QuoteVersion, StoredFile, WarehouseAddress } from './types'

class WarehouseDatabase extends Dexie {
  files!: EntityTable<StoredFile, 'id'>
  quotes!: EntityTable<QuoteVersion, 'id'>
  warehouseAddresses!: EntityTable<WarehouseAddress, 'id'>
  manualTransferQuotes!: EntityTable<ManualTransferQuote, 'id'>
  settings!: EntityTable<{ key: string; value: unknown }, 'key'>
  results!: EntityTable<{ id: string; createdAt: string; rows: AnalysisResult[] }, 'id'>

  constructor() {
    super('仓库分布分析本地数据库')
    this.version(1).stores({
      files: '++id, &slotId, updatedAt',
      quotes: '++id, &slot, status, updatedAt',
      warehouseAddresses: '++id, &code, confirmedRegion',
      manualTransferQuotes: '++id, originWarehouse, destinationWarehouse, expiresAt',
      settings: '&key',
      results: '&id, createdAt',
    })
  }
}

export const db = new WarehouseDatabase()

export async function saveFile(file: StoredFile) {
  const existing = await db.files.where('slotId').equals(file.slotId).first()
  if (existing?.id) return db.files.put({ ...file, id: existing.id })
  return db.files.add(file)
}

export async function updateFileMapping(file: StoredFile) {
  const existing = await db.files.where('slotId').equals(file.slotId).first()
  if (!existing?.id) throw new Error('没有找到需要更新映射的文件')
  await db.files.update(existing.id, {
    mapping: file.mapping,
    missingFields: file.missingFields,
    validation: file.validation,
    updatedAt: file.updatedAt,
  })
  return existing.id
}

export async function saveQuote(quote: QuoteVersion) {
  const existing = await db.quotes.where('slot').equals(quote.slot).first()
  if (existing?.id) return db.quotes.put({ ...quote, id: existing.id })
  return db.quotes.add(quote)
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const found = await db.settings.get(key)
  return (found?.value as T | undefined) ?? fallback
}

export async function setSetting<T>(key: string, value: T) {
  await db.settings.put({ key, value })
}

export const settingKeys = {
  analysis: '分析设置',
  ai: '人工智能设置',
} as const

export type StoredAiSettings = AiSettings
export type StoredAnalysisSettings = AnalysisSettings
