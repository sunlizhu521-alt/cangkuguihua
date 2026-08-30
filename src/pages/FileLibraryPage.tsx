import { useRef } from 'react'
import { CloudUpload, Eye, FileUp, Trash2 } from 'lucide-react'
import { fileSlots } from '../data'
import type { FileSlotDefinition, StoredFile } from '../types'
import { PageHeader, StatusTag } from '../components/Common'

export default function FileLibraryPage({ files, uploading, onUpload, onMap, onClear }: {
  files: StoredFile[]
  uploading?: string
  onUpload: (definition: FileSlotDefinition, file: File) => void
  onMap: (file: StoredFile) => void
  onClear: () => void
}) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  return <div className="page">
    <PageHeader title="文件库" description="每个槽位仅保留最新文件，业务数据只保存在本机浏览器" actions={<><button className="button secondary" onClick={onClear}><Trash2 size={17}/>清空本次分析</button></>} />
    {(['事实表', '维度表'] as const).map((group) => <section className="section" key={group}>
      <h2>{group}</h2>
      <div className="table-frame">
        <table>
          <thead><tr><th>文件槽位</th><th>最新文件</th><th>更新时间</th><th>数据行数</th><th>映射状态</th><th>校验结果</th><th>操作</th></tr></thead>
          <tbody>{fileSlots.filter((slot) => slot.group === group).map((slot) => {
            const file = files.find((item) => item.slotId === slot.id)
            return <tr key={slot.id} className={file?.validation === '有缺失字段' ? 'row-warning' : ''}>
              <td className="strong">{slot.label}</td>
              <td>{file ? <span className="file-name"><FileUp size={15}/>{file.fileName}</span> : <span className="muted">未上传</span>}</td>
              <td>{file ? new Date(file.updatedAt).toLocaleString('zh-CN') : '—'}</td>
              <td>{file ? file.rowCount.toLocaleString('zh-CN') : '—'}</td>
              <td>{file ? <StatusTag tone={file.validation === '校验通过' ? 'success' : 'warning'}>{file.validation === '校验通过' ? '已映射' : '待映射'}</StatusTag> : <StatusTag tone="neutral">待上传</StatusTag>}</td>
              <td>{file ? <StatusTag tone={file.validation === '校验通过' ? 'success' : 'danger'}>{file.validation}</StatusTag> : '—'}</td>
              <td className="actions-cell">
                <input ref={(node) => { inputRefs.current[slot.id] = node }} hidden type="file" accept=".xlsx,.xls,.csv" onChange={(event) => { const next = event.target.files?.[0]; if (next) onUpload(slot, next); event.target.value = '' }} />
                <button className="link-button" onClick={() => inputRefs.current[slot.id]?.click()}>{uploading === slot.id ? '读取中…' : file ? '替换文件' : '上传文件'}</button>
                {file ? <button className="link-button" onClick={() => onMap(file)}><Eye size={14}/>查看映射</button> : null}
              </td>
            </tr>
          })}</tbody>
        </table>
      </div>
    </section>)}
    <div className="privacy-note"><CloudUpload size={17}/><span>文件不会上传到业务服务器。仅在人工智能解析仓库报价时，经过筛选的报价行会发送到所选服务。</span></div>
  </div>
}
