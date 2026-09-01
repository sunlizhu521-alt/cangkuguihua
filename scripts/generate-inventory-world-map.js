import * as topojson from 'topojson-client'
import * as d3 from 'd3-geo'
import fs from 'node:fs'

const world = JSON.parse(fs.readFileSync('/tmp/countries-50m.json', 'utf8'))
const countries = topojson.feature(world, world.objects.countries).features
const admin1 = JSON.parse(fs.readFileSync('/tmp/ne_50m_admin_1_states_provinces.geojson', 'utf8'))

const countryNames = {
  'United Kingdom': '英国', 'Germany': '德国', 'France': '法国', 'Italy': '意大利', 'Spain': '西班牙',
  'Netherlands': '荷兰', 'Belgium': '比利时', 'Sweden': '瑞典', 'Denmark': '丹麦', 'Portugal': '葡萄牙',
  'Austria': '奥地利', 'Greece': '希腊', 'Ireland': '爱尔兰', 'Luxembourg': '卢森堡', 'Czechia': '捷克',
  'Malta': '马耳他', 'Latvia': '拉脱维亚', 'Finland': '芬兰', 'Poland': '波兰', 'Estonia': '爱沙尼亚',
  'Croatia': '克罗地亚', 'Slovakia': '斯洛伐克', 'Hungary': '匈牙利', 'Romania': '罗马尼亚', 'Slovenia': '斯洛文尼亚',
  'Lithuania': '立陶宛', 'Bulgaria': '保加利亚', 'Monaco': '摩纳哥',
}

const stateFeatures = admin1.features.filter((feature) => feature.properties.adm0_a3 === 'USA')
const canadaFeature = countries.find((feature) => feature.properties.name === 'Canada')
const europeFeatures = countries.filter((feature) => countryNames[feature.properties.name])

if (stateFeatures.length !== 51) throw new Error(`美国州级要素应为51个，实际为${stateFeatures.length}个`)
if (!canadaFeature) throw new Error('world-atlas 中未找到加拿大轮廓')
if (europeFeatures.length !== 28) throw new Error(`欧洲国家要素应为28个，实际为${europeFeatures.length}个`)

const displayedFeatures = { type: 'FeatureCollection', features: [...stateFeatures, canadaFeature, ...europeFeatures] }
const projection = d3.geoMercator().fitExtent([[20, 48], [1380, 612]], displayedFeatures)
const path = d3.geoPath(projection)

const projectFeature = (feature, extra = {}) => {
  const projectedPath = path(feature)
  const center = path.centroid(feature)
  const bounds = path.bounds(feature)
  if (!projectedPath || !center.every(Number.isFinite) || !bounds.flat().every(Number.isFinite)) throw new Error(`轮廓投影失败：${feature.properties.name}`)
  return { ...extra, path: projectedPath, center, bounds }
}

const usStates = stateFeatures
  .map((feature) => projectFeature(feature, { id: feature.properties.postal, name: feature.properties.name }))
  .sort((a, b) => a.id.localeCompare(b.id))
const canada = projectFeature(canadaFeature, { id: 'Canada', name: '加拿大' })
const europeCountries = europeFeatures.map((feature) => projectFeature(feature, { id: feature.properties.name, name: countryNames[feature.properties.name] }))
const uk = europeCountries.find((country) => country.id === 'United Kingdom')
const continentalEurope = { type: 'FeatureCollection', features: europeFeatures.filter((feature) => feature.properties.name !== 'United Kingdom') }
const europeCenter = path.centroid(continentalEurope)
if (!uk || !europeCenter.every(Number.isFinite)) throw new Error('英国或欧洲标签位置生成失败')

const content = `export interface ProjectedMapRegion {\n  id: string\n  name: string\n  path: string\n  center: [number, number]\n  bounds: [[number, number], [number, number]]\n}\n\nexport const inventoryWorldViewBox = '0 0 1400 640'\n\nexport const inventoryUsStates: ProjectedMapRegion[] = ${JSON.stringify(usStates)}\n\nexport const inventoryCanada: ProjectedMapRegion = ${JSON.stringify(canada)}\n\nexport const inventoryEuropeCountries: ProjectedMapRegion[] = ${JSON.stringify(europeCountries)}\n\nexport const inventoryMapLabels = ${JSON.stringify({ canada: canada.center, uk: uk.center, europe: europeCenter })} as const\n`

fs.writeFileSync('src/data/inventoryWorldMap.ts', content)
console.log('统一投影生成完成：美国州', usStates.length, '加拿大', 1, '欧洲国家', europeCountries.length, '总字符', content.length)
