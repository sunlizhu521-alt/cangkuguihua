import { useState } from 'react'
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
    <PageHeader title="字段映射" description="所有字段均由你自由选择；文件可以按任意顺序上传和映射" />
    <div className="mapping-layout">
      <aside className="file-selector">
        {fileSlots.map((slot) => {
          const file = files.find((item) => item.slotId === slot.id)
          return <button key={slot.id} disabled={!file} onClick={() => file && onSelect(file)} className={selected?.slotId === slot.id ? 'selected' : ''}><span>{slot.label}</span>{file ? <StatusTag tone={file.validation === '校验通过' ? 'success' : 'warning'}>{file.validation}</StatusTag> : <span className="muted">未上传</span>}</button>
        })}
      </aside>
      <section className="mapping-panel">
        {!selected || !definition ? <EmptyState title="选择一个已上传文件" description="左侧会显示可映射的文件槽位，上传顺序不影响映射。"/> : <MappingEditor key={selected.slotId + selected.updatedAt} file={selected} fields={fields} onSave={onSave}/>}
      </section>
    </div>
  </div>
}

function MappingEditor({ file, fields, onSave }: { file: StoredFile; fields: string[]; onSave: (file: StoredFile, mapping: Record<string, string>) => void }) {
  const [mapping, setMapping] = useState<Record<string, string>>({ ...file.mapping })
  const selectedCount = Object.values(mapping).filter(Boolean).length
  return <div>
    <div className="mapping-title"><div><h2>{file.fileName}</h2><p>来源工作表：{file.sheetNames.join('、')}</p></div><StatusTag tone={file.validation === '校验通过' ? 'success' : 'warning'}>{file.validation}</StatusTag></div>
    <div className="info-banner"><ShieldCheck size={18}/>没有必填项，也不会自动替你选择来源列；你可以只映射本次要使用的字段。</div>
    <div className="mapping-grid header"><span>系统标准字段</span><span>来源文件列</span><span>状态</span></div>
    {fields.map((field) => <div className="mapping-grid" key={field}>
      <label>{field}</label>
      <select value={mapping[field] ?? ''} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}><option value="">不映射</option>{file.headers.map((header) => <option key={header}>{header}</option>)}</select>
      <StatusTag tone={mapping[field] ? 'success' : 'neutral'}>{mapping[field] ? '已选择' : '未选择'}</StatusTag>
    </div>)}
    <div className="mapping-actions"><span className="muted">已选择 {selectedCount} 个字段</span><button className="button primary" onClick={() => onSave(file, mapping)}><Save size={17}/>保存映射</button></div>
    <h3 className="preview-title">数据预览（前5行）</h3>
    <div className="table-frame preview-table"><table><thead><tr>{file.headers.slice(0, 8).map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{file.previewRows.slice(0, 5).map((row, index) => <tr key={index}>{file.headers.slice(0, 8).map((header) => <td key={header}>{String(row[header] ?? '')}</td>)}</tr>)}</tbody></table></div>
  </div>
}
