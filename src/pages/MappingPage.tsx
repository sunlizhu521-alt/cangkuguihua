import { Save, ShieldCheck } from 'lucide-react'
import { fileSlots } from '../data'
import type { StoredFile } from '../types'
import { EmptyState, PageHeader, StatusTag } from '../components/Common'

export default function MappingPage({ files, selected, onSelect, onSave }: {
  files: StoredFile[]
  selected?: StoredFile
  onSelect: (file: StoredFile) => void
  onSave: (file: StoredFile, mapping: Record<string, string>) => void
}) {
  const definition = selected ? fileSlots.find((slot) => slot.id === selected.slotId) : undefined
  const fields = definition ? [...definition.requiredFields, ...definition.optionalFields] : []
  return <div className="page mapping-page">
    <PageHeader title="字段映射" description="将来源列对应到系统中文标准字段，必填字段完整后才能正式计算" />
    <div className="mapping-layout">
      <aside className="file-selector">
        {fileSlots.map((slot) => {
          const file = files.find((item) => item.slotId === slot.id)
          return <button key={slot.id} disabled={!file} onClick={() => file && onSelect(file)} className={selected?.slotId === slot.id ? 'selected' : ''}><span>{slot.label}</span>{file ? <StatusTag tone={file.validation === '校验通过' ? 'success' : 'warning'}>{file.validation}</StatusTag> : <span className="muted">未上传</span>}</button>
        })}
      </aside>
      <section className="mapping-panel">
        {!selected || !definition ? <EmptyState title="选择一个已上传文件" description="左侧会显示可映射的文件槽位。"/> : <MappingEditor key={selected.slotId + selected.updatedAt} file={selected} fields={fields} required={definition.requiredFields} onSave={onSave}/>}
      </section>
    </div>
  </div>
}

function MappingEditor({ file, fields, required, onSave }: { file: StoredFile; fields: string[]; required: string[]; onSave: (file: StoredFile, mapping: Record<string, string>) => void }) {
  const mapping = { ...file.mapping }
  return <div>
    <div className="mapping-title"><div><h2>{file.fileName}</h2><p>来源工作表：{file.sheetNames.join('、')}</p></div><StatusTag tone={file.validation === '校验通过' ? 'success' : 'warning'}>{file.validation}</StatusTag></div>
    <div className="info-banner"><ShieldCheck size={18}/>带“必填”的字段缺失时，仅阻止受影响的计算，不会自动猜测。</div>
    <div className="mapping-grid header"><span>系统标准字段</span><span>来源文件列</span><span>状态</span></div>
    {fields.map((field) => <div className="mapping-grid" key={field}>
      <label>{field}{required.includes(field) ? <em>必填</em> : null}</label>
      <select defaultValue={mapping[field] ?? ''} onChange={(event) => { mapping[field] = event.target.value }}><option value="">不映射</option>{file.headers.map((header) => <option key={header}>{header}</option>)}</select>
      <StatusTag tone={mapping[field] ? 'success' : required.includes(field) ? 'danger' : 'neutral'}>{mapping[field] ? '已对应' : required.includes(field) ? '缺失' : '可选'}</StatusTag>
    </div>)}
    <div className="mapping-actions"><button className="button primary" onClick={() => onSave(file, mapping)}><Save size={17}/>保存并校验</button></div>
    <h3 className="preview-title">数据预览（前5行）</h3>
    <div className="table-frame preview-table"><table><thead><tr>{file.headers.slice(0, 8).map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{file.previewRows.slice(0, 5).map((row, index) => <tr key={index}>{file.headers.slice(0, 8).map((header) => <td key={header}>{String(row[header] ?? '')}</td>)}</tr>)}</tbody></table></div>
  </div>
}
