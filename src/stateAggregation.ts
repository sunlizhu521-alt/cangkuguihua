import { stateRegions } from './data'
import zip3State from './data/zip3State.json'
import { countryToSiteRegion, demandRegion } from './fileParser'
import type { DemandRegion, InventoryRecord, OutboundRecord, WarehouseAddress } from './types'

const zip3States = zip3State as Record<string, string>

export function stateFromPostalCode(postalCode: string) {
  const normalized = postalCode.trim().split('-')[0]
  if (!/^\d{5}$/.test(normalized)) return undefined
  const state = zip3States[normalized.slice(0, 3)]?.replace(/\*$/, '').toUpperCase()
  return state && stateRegions[state] ? state : undefined
}

export function resolveOutboundDemandRegion(row: OutboundRecord): DemandRegion | undefined {
  const postalRegion = demandRegion(row.postalCode)
  if (postalRegion === '美东' || postalRegion === '美西' || postalRegion === '美中') {
    const state = stateFromPostalCode(row.postalCode)
    return state ? stateRegions[state] : postalRegion
  }
  if (postalRegion === '加拿大' || postalRegion === '英国') return postalRegion
  return countryToSiteRegion(row.country ?? '') === '欧洲' ? '欧洲' : undefined
}

export function aggregateStateDemand(rows: OutboundRecord[]): Record<string, number> {
  const stateDemand: Record<string, number> = {}
  for (const row of rows) {
    const state = stateFromPostalCode(row.postalCode)
    if (!state) continue
    stateDemand[state] = (stateDemand[state] ?? 0) + row.quantity
  }
  return stateDemand
}

export function aggregateStateInventory(rows: InventoryRecord[], addresses: WarehouseAddress[]): Record<string, number> {
  const stateByWarehouseCode = new Map(addresses.flatMap((address) => {
    const state = address.state.trim().toUpperCase()
    if (!address.confirmed || !stateRegions[state]) return []
    return [[address.code.trim().toUpperCase(), state] as const]
  }))
  const stateInventory: Record<string, number> = {}
  for (const row of rows) {
    if (row.inventoryStatus !== '在库') continue
    const state = stateByWarehouseCode.get(row.warehouseCode.trim().toUpperCase())
    if (!state) continue
    stateInventory[state] = (stateInventory[state] ?? 0) + row.quantity
  }
  return stateInventory
}
