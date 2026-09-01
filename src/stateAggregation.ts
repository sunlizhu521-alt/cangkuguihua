import { stateRegions } from './data'
import zip3State from './data/zip3State.json'
import { countryToSiteRegion, demandRegion } from './fileParser'
import type { DemandRegion, InventoryRecord, OutboundRecord, WarehouseAddress, WarehouseRecord } from './types'

const zip3States = zip3State as Record<string, string>

export function stateFromPostalCode(postalCode: string) {
  const normalized = postalCode.trim().split('-')[0]
  if (!/^\d{5}$/.test(normalized)) return undefined
  const state = zip3States[normalized.slice(0, 3)]?.replace(/\*$/, '').toUpperCase()
  return state && stateRegions[state] ? state : undefined
}

export function resolveOutboundDemandRegion(row: OutboundRecord): DemandRegion | undefined {
  const countryRegion = countryToSiteRegion(row.country ?? '')
  // 有明确国家/地区时先确定海外区域，避免法德意西等5位邮编被误当成美国邮编。
  if (countryRegion === '欧洲' || countryRegion === '英国' || countryRegion === '加拿大') return countryRegion
  const postalRegion = demandRegion(row.postalCode)
  if (countryRegion === '美国') {
    if (postalRegion === '美东' || postalRegion === '美西' || postalRegion === '美中') {
      const state = stateFromPostalCode(row.postalCode)
      return state ? stateRegions[state] : postalRegion
    }
    return undefined
  }
  if (postalRegion === '美东' || postalRegion === '美西' || postalRegion === '美中') {
    const state = stateFromPostalCode(row.postalCode)
    return state ? stateRegions[state] : postalRegion
  }
  if (postalRegion === '加拿大' || postalRegion === '英国') return postalRegion
  return undefined
}

export function aggregateStateDemand(rows: OutboundRecord[]): Record<string, number> {
  const stateDemand: Record<string, number> = {}
  for (const row of rows) {
    const region = resolveOutboundDemandRegion(row)
    if (region !== '美东' && region !== '美中' && region !== '美西') continue
    const state = stateFromPostalCode(row.postalCode)
    if (!state) continue
    stateDemand[state] = (stateDemand[state] ?? 0) + row.quantity
  }
  return stateDemand
}

function warehouseKey(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase()
}

export function aggregateStateInventory(rows: InventoryRecord[], addresses: WarehouseAddress[], warehouses: WarehouseRecord[] = []): Record<string, number> {
  const stateByWarehouseKey = new Map(addresses.flatMap((address) => {
    const state = address.state.trim().toUpperCase()
    if (!address.confirmed || !stateRegions[state]) return []
    return [address.code, address.name].filter(Boolean).map((value) => [warehouseKey(value), state] as const)
  }))
  for (const warehouse of warehouses) {
    const state = stateByWarehouseKey.get(warehouseKey(warehouse.code)) ?? stateByWarehouseKey.get(warehouseKey(warehouse.name))
    if (!state) continue
    stateByWarehouseKey.set(warehouseKey(warehouse.code), state)
    stateByWarehouseKey.set(warehouseKey(warehouse.name), state)
  }
  const stateInventory: Record<string, number> = {}
  for (const row of rows) {
    if (row.inventoryStatus !== '在库') continue
    const state = stateByWarehouseKey.get(warehouseKey(row.warehouseCode)) ?? stateByWarehouseKey.get(warehouseKey(row.warehouseName))
    if (!state) continue
    stateInventory[state] = (stateInventory[state] ?? 0) + row.quantity
  }
  return stateInventory
}
