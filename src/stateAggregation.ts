import { stateRegions } from './data'
import zip3State from './data/zip3State.json'
import { countryToSiteRegion } from './fileParser'
import type { InventoryRecord, OutboundRecord, WarehouseAddress } from './types'

const zip3States = zip3State as Record<string, string>

export function aggregateStateDemand(rows: OutboundRecord[]): Record<string, number> {
  const stateDemand: Record<string, number> = {}
  for (const row of rows) {
    const siteRegion = countryToSiteRegion(row.country ?? '')
    if (siteRegion && siteRegion !== '美国') continue
    const postalCode = row.postalCode.trim().split('-')[0]
    if (!/^\d{5}$/.test(postalCode)) continue
    const state = zip3States[postalCode.slice(0, 3)]?.replace(/\*$/, '').toUpperCase()
    if (!state || !stateRegions[state]) continue
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
