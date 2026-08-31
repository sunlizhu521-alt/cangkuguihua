import { Check, MapPin, Plus, Save, Trash2 } from 'lucide-react'
import type { AnalysisSettings, WarehouseAddress, WarehouseRegion } from '../types'
import { PageHeader, StatusTag } from '../components/Common'

export default function SettingsPage({ settings, addresses, onSaveSettings, onSaveAddress, onDeleteAddress }: {
  settings: AnalysisSettings
  addresses: WarehouseAddress[]
  onSaveSettings: (settings: AnalysisSettings) => void
  onSaveAddress: (address: WarehouseAddress) => void
  onDeleteAddress: (id?: number) => void
}) {
  return <div className="page">
    <PageHeader title="分析设置" description="统一设置分析天数、费用判断标准、汇率和仓库物理位置" />
    <div className="settings-grid">
      <AnalysisForm settings={settings} onSave={onSaveSettings}/>
      <div className="setting-card explanation-card"><h2>计算口径</h2><ul><li>调拨只允许同一区域仓库之间进行。</li><li>库存不足分析天数只作提醒，不限制调拨。</li><li>只有在库成品进入调拨比例。</li><li>销售预测统一换算为日均预测。</li><li>节省金额和节省比例必须同时达标。</li></ul></div>
    </div>
    <section className="section address-section"><div className="section-heading"><div><h2>仓库地址与区域</h2><p>输入州和邮编后自动建议区域，确认后才参与调拨分析。</p></div><button className="button secondary" onClick={() => onSaveAddress({ code: '', name: '', state: '', city: '', address: '', postalCode: '', suggestedRegion: '美中', confirmed: false })}><Plus size={17}/>新增仓库</button></div>
      <div className="address-list">{addresses.map((address) => <AddressRow key={address.id ?? address.code} address={address} onSave={onSaveAddress} onDelete={onDeleteAddress}/>)}</div>
    </section>
  </div>
}

function AnalysisForm({ settings, onSave }: { settings: AnalysisSettings; onSave: (settings: AnalysisSettings) => void }) {
  const draft = { ...settings }
  return <div className="setting-card"><h2>基础参数</h2><div className="form-grid two">
    <label>分析基准日<input type="date" defaultValue={draft.baseDate} onChange={(event) => { draft.baseDate = event.target.value }}/></label>
    <label>分析天数<input type="number" min="1" max="365" defaultValue={draft.analysisDays} onChange={(event) => { draft.analysisDays = Number(event.target.value) }}/><small>默认45天，可修改</small></label>
    <label>安全库存天数<input type="number" min="1" max="365" defaultValue={draft.safetyStockDays} onChange={(event) => { draft.safetyStockDays = Number(event.target.value) }}/><small>默认45天，可修改</small></label>
    <label>一美元兑换人民币<input type="number" min="0.01" step="0.0001" defaultValue={draft.usdToCny} onChange={(event) => { draft.usdToCny = Number(event.target.value) }}/></label>
    <label>最低节省金额（人民币）<input type="number" min="0" defaultValue={draft.minimumSavingsCny} onChange={(event) => { draft.minimumSavingsCny = Number(event.target.value) }}/></label>
    <label>最低节省比例（百分比）<input type="number" min="0" max="100" step="0.1" defaultValue={draft.minimumSavingsRate} onChange={(event) => { draft.minimumSavingsRate = Number(event.target.value) }}/></label>
  </div><button className="button primary" onClick={() => onSave({ ...draft })}><Save size={17}/>保存设置</button></div>
}

function AddressRow({ address, onSave, onDelete }: { address: WarehouseAddress; onSave: (value: WarehouseAddress) => void; onDelete: (id?: number) => void }) {
  const draft = { ...address }
  return <div className="address-row">
    <div className="address-inputs">
      <input placeholder="仓库编码" defaultValue={address.code} onChange={(event) => { draft.code = event.target.value }}/>
      <input placeholder="仓库名称" defaultValue={address.name} onChange={(event) => { draft.name = event.target.value }}/>
      <input placeholder="州，如 CA" defaultValue={address.state} onChange={(event) => { draft.state = event.target.value.toUpperCase() }}/>
      <input placeholder="城市" defaultValue={address.city} onChange={(event) => { draft.city = event.target.value }}/>
      <input className="wide" placeholder="详细地址" defaultValue={address.address} onChange={(event) => { draft.address = event.target.value }}/>
      <input placeholder="邮编" defaultValue={address.postalCode} onChange={(event) => { draft.postalCode = event.target.value }}/>
      <select defaultValue={address.confirmedRegion ?? address.suggestedRegion} onChange={(event) => { draft.confirmedRegion = event.target.value as WarehouseRegion }}><option>美西</option><option>美中</option><option>美东</option></select>
    </div>
    <div className="address-actions">{address.confirmed ? <StatusTag tone="success"><MapPin size={13}/>已确认{address.confirmedRegion}</StatusTag> : <StatusTag tone="warning">待确认</StatusTag>}<button title="保存并确认" className="icon-button success" onClick={() => onSave({ ...draft, confirmed: true, confirmedRegion: draft.confirmedRegion ?? draft.suggestedRegion })}><Check size={17}/></button><button title="删除" className="icon-button danger" onClick={() => onDelete(address.id)}><Trash2 size={17}/></button></div>
  </div>
}
