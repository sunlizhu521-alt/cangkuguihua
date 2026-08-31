import * as topojson from 'topojson-client'
import * as d3 from 'd3-geo'
import fs from 'node:fs'

const world = JSON.parse(fs.readFileSync('/tmp/countries-50m.json', 'utf8'))
const features = topojson.feature(world, world.objects.countries).features

const nameMap = {
  'United Kingdom': '英国', 'Germany': '德国', 'France': '法国', 'Italy': '意大利', 'Spain': '西班牙',
  'Netherlands': '荷兰', 'Belgium': '比利时', 'Sweden': '瑞典', 'Denmark': '丹麦', 'Portugal': '葡萄牙',
  'Austria': '奥地利', 'Greece': '希腊', 'Ireland': '爱尔兰', 'Luxembourg': '卢森堡', 'Czechia': '捷克',
  'Malta': '马耳他', 'Latvia': '拉脱维亚', 'Finland': '芬兰', 'Poland': '波兰', 'Estonia': '爱沙尼亚',
  'Croatia': '克罗地亚', 'Slovakia': '斯洛伐克', 'Hungary': '匈牙利', 'Romania': '罗马尼亚', 'Slovenia': '斯洛文尼亚',
  'Lithuania': '立陶宛', 'Bulgaria': '保加利亚', 'Monaco': '摩纳哥',
}

const selected = features.filter((f) => nameMap[f.properties.name])
const projection = d3.geoMercator().fitExtent(
  [[10, 10], [790, 590]],
  { type: 'MultiPoint', coordinates: [[-12, 35], [33, 71]] },
)
const path = d3.geoPath(projection)
const result = selected.map((f) => ({ id: f.properties.name, name: nameMap[f.properties.name], path: path(f) }))

const content = `export interface EuropeCountry {\n  id: string\n  name: string\n  path: string\n}\n\nexport const europeCountries: EuropeCountry[] = ${JSON.stringify(result)}\n`
fs.writeFileSync('src/data/europeCountries.ts', content)
console.log('生成国家数:', result.length, '总字符:', result.reduce((s, r) => s + r.path.length, 0))
