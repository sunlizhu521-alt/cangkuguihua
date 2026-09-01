import { describe, expect, it } from 'vitest'
import { inventoryCanada, inventoryEuropeCountries, inventoryMapLabels, inventoryUsStates } from '../data/inventoryWorldMap'

describe('库存地图统一世界投影数据', () => {
  it('包含美国51个州级区域、加拿大和欧洲28国', () => {
    expect(inventoryUsStates).toHaveLength(51)
    expect(new Set(inventoryUsStates.map((state) => state.id)).size).toBe(51)
    expect(inventoryCanada.name).toBe('加拿大')
    expect(inventoryEuropeCountries).toHaveLength(28)
  })

  it('保持加拿大在美国上方、英国在欧洲大陆旁边的地理关系', () => {
    const california = inventoryUsStates.find((state) => state.id === 'CA')
    expect(california).toBeDefined()
    expect(inventoryCanada.center[1]).toBeLessThan(california!.center[1])
    expect(Math.abs(inventoryMapLabels.uk[0] - inventoryMapLabels.europe[0])).toBeLessThan(150)
    expect(Math.abs(inventoryMapLabels.uk[1] - inventoryMapLabels.europe[1])).toBeLessThan(50)
  })

  it('加拿大北部和欧洲北部均完整落在地图视窗内', () => {
    const allRegions = [...inventoryUsStates, inventoryCanada, ...inventoryEuropeCountries]
    allRegions.forEach((region) => {
      expect(region.bounds[0][0]).toBeGreaterThanOrEqual(19.99)
      expect(region.bounds[0][1]).toBeGreaterThanOrEqual(47.99)
      expect(region.bounds[1][0]).toBeLessThanOrEqual(1380.01)
      expect(region.bounds[1][1]).toBeLessThanOrEqual(612.01)
    })
    const finland = inventoryEuropeCountries.find((country) => country.name === '芬兰')
    expect(finland).toBeDefined()
    expect(inventoryCanada.bounds[0][1]).toBeGreaterThanOrEqual(47.99)
    expect(finland!.bounds[0][1]).toBeGreaterThanOrEqual(47.99)
  })
})
