import { useEffect, useRef, useState } from 'react'
import { Bot, Check, FileSearch, KeyRound, RotateCw, ShieldCheck, Upload } from 'lucide-react'
import type { AiSettings, FeeRule, QuoteVersion } from '../types'
import { PageHeader, StatusTag } from '../components/Common'

export default function QuotePage({ quotes, aiSettings, busySlot, onUpload, onApply, onSaveAi, onTestAi }: {
  quotes: QuoteVersion[]
  aiSettings: AiSettings
  busySlot?: number
  onUpload: (slot: 1 | 2 | 3 | 4, file: File, company: string, version: string, effectiveDate: string, useAi: boolean) => void
  onApply: (quote: QuoteVersion, rules: FeeRule[]) => void
  onSaveAi: (settings: AiSettings) => void
  onTestAi: (settings: AiSettings) => void
}) {
  const [selectedSlot, setSelectedSlot] = useState<1 | 2 | 3 | 4>(1)
  const quote = quotes.find((item) => item.slot === selectedSlot)!
  return <div className="page">
    <PageHeader title="仓库报价" description="报价先解析为可追溯草稿，审核确认后才替换当前生效版本" />
    <div className="quote-slot-tabs">{quotes.map((item) => <button key={item.slot} className={selectedSlot === item.slot ? 'active' : ''} onClick={() => setSelectedSlot(item.slot)}><span>仓库报价{item.slot}</span><StatusTag tone={item.status === '已应用' ? 'success' : item.status === '待确认' ? 'warning' : item.status === '解析失败' ? 'danger' : 'neutral'}>{item.status}</StatusTag></button>)}</div>
    <div className="quote-layout">
      <QuoteUploadCard key={quote.slot} quote={quote} busy={busySlot === selectedSlot} onUpload={onUpload}/>
      <AiSettingsCard settings={aiSettings} onSave={onSaveAi} onTest={onTestAi}/>
    </div>
    <QuoteReview key={`${quote.slot}-${quote.updatedAt}`} quote={quote} onApply={onApply}/>
  </div>
}

function QuoteUploadCard({ quote, busy, onUpload }: { quote: QuoteVersion; busy: boolean; onUpload: Parameters<typeof QuotePage>[0]['onUpload'] }) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File>()
  const [company, setCompany] = useState(quote.logisticsCompany)
  const [version, setVersion] = useState(quote.version)
  const [effectiveDate, setEffectiveDate] = useState(quote.effectiveDate)
  const [useAi, setUseAi] = useState(true)
  return <section className="setting-card quote-upload-card"><h2><Upload size={19}/>上传物流公司报价</h2>
    <input ref={input} hidden type="file" accept=".xlsx,.xls,.csv" onChange={(event) => setFile(event.target.files?.[0])}/>
    <button className="upload-drop" onClick={() => input.current?.click()}><FileSearch size={28}/><strong>{file?.name ?? '选择电子表格报价文件'}</strong><span>支持 .xlsx、.xls、.csv</span></button>
    <div className="form-grid two"><label>物流公司<input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="例如：美通物流"/></label><label>报价版本<input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="例如：2026年8月版"/></label><label>生效日期<input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)}/></label><label className="check-label"><input type="checkbox" checked={useAi} onChange={(event) => setUseAi(event.target.checked)}/>优先使用人工智能解析</label></div>
    <button disabled={!file || !company || busy} className="button primary" onClick={() => file && onUpload(quote.slot, file, company, version, effectiveDate, useAi)}>{busy ? <RotateCw className="spin" size={17}/> : <Bot size={17}/>} {busy ? '解析中…' : '解析为审核草稿'}</button>
    {quote.activeRules.length > 0 ? <p className="form-hint">新草稿确认前，当前生效的 {quote.activeRules.length} 项费用规则继续参与计算。</p> : null}
  </section>
}

function AiSettingsCard({ settings, onSave, onTest }: { settings: AiSettings; onSave: (value: AiSettings) => void; onTest: (value: AiSettings) => void }) {
  const [draft, setDraft] = useState(settings)
  useEffect(() => setDraft(settings), [settings])
  const update = (patch: Partial<AiSettings>) => setDraft((value) => ({ ...value, ...patch }))
  return <section className="setting-card"><h2><KeyRound size={19}/>人工智能服务设置</h2>
    <div className="form-grid two"><label>服务提供方<select value={draft.provider} onChange={(event) => update({ provider: event.target.value as AiSettings['provider'] })}><option>OpenAI</option><option>DeepSeek</option></select></label><label>模型名称<input value={draft.model} onChange={(event) => update({ model: event.target.value })}/></label><label className="wide-label">服务地址<input value={draft.baseUrl} onChange={(event) => update({ baseUrl: event.target.value })}/></label><label className="wide-label">Cloudflare转发地址<input value={draft.workerUrl} onChange={(event) => update({ workerUrl: event.target.value })} placeholder="https://你的转发服务地址"/></label><label className="wide-label">人工智能服务密钥<input type="password" value={draft.secret} onChange={(event) => update({ secret: event.target.value })} autoComplete="off"/></label></div>
    <div className="inline-actions"><button className="button secondary" onClick={() => onTest(draft)}>测试连接</button><button className="button primary" onClick={() => onSave(draft)}>保存到本机浏览器</button><button className="link-button danger-text" onClick={() => { const cleared = { ...draft, secret: '' }; setDraft(cleared); onSave(cleared) }}>清除密钥</button></div>
    <div className="security-note"><ShieldCheck size={17}/><span>密钥只保存在本机浏览器，不进入源代码、Git记录、运行日志或导出文件。</span><StatusTag tone={draft.connectionStatus === '连接成功' ? 'success' : draft.connectionStatus === '连接失败' ? 'danger' : 'neutral'}>{draft.connectionMessage ?? draft.connectionStatus}</StatusTag></div>
  </section>
}

function QuoteReview({ quote, onApply }: { quote: QuoteVersion; onApply: (quote: QuoteVersion, rules: FeeRule[]) => void }) {
  const [rules, setRules] = useState(quote.draftRules)
  if (!quote.draftRules.length) return <section className="section review-empty"><FileSearch size={32}/><h2>等待报价解析</h2><p>解析后将在这里逐项显示来源、收费单位、币种、适用条件和校验结果。</p></section>
  const update = (id: string, patch: Partial<FeeRule>) => setRules((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row))
  const hasBlocking = rules.some((rule) => !rule.excluded && (rule.category === '未识别项目' || rule.validationIssues.length > 0 || rule.rateUsd === undefined))
  return <section className="section quote-review" key={quote.updatedAt}><div className="section-heading"><div><h2>费用审核草稿</h2><p>按整家物流公司的完整报价应用；不会跨物流公司拆项拼接。</p></div><button disabled={hasBlocking} className="button primary" onClick={() => onApply(quote, rules)}><Check size={17}/>确认并应用到仓库报价{quote.slot}</button></div>
    {hasBlocking ? <div className="info-banner warning">存在未识别、缺少金额或待校验项目。请修正或明确排除后再应用。</div> : null}
    <div className="table-frame"><table className="quote-table"><thead><tr><th>采用</th><th>费用分类</th><th>收费名称</th><th>金额（美元）</th><th>计费单位</th><th>适用条件</th><th>来源</th><th>可信程度</th><th>校验结果</th></tr></thead><tbody>{rules.map((rule) => <tr key={rule.id} className={rule.excluded ? 'disabled-row' : ''}><td><input type="checkbox" checked={!rule.excluded} onChange={(event) => update(rule.id, { excluded: !event.target.checked })}/></td><td><select value={rule.category} onChange={(event) => update(rule.id, { category: event.target.value as FeeRule['category'], validationIssues: [] })}>{['仓储费','尾程配送费','原仓出库费','目的仓入库费','中转运输费','其他附加费','未识别项目'].map((item) => <option key={item}>{item}</option>)}</select></td><td><input value={rule.name} onChange={(event) => update(rule.id, { name: event.target.value })}/></td><td><input type="number" min="0" step="0.0001" value={rule.rateUsd ?? ''} onChange={(event) => update(rule.id, { rateUsd: event.target.value === '' ? undefined : Number(event.target.value), validationIssues: [] })}/></td><td><input value={rule.billingUnit} onChange={(event) => update(rule.id, { billingUnit: event.target.value })}/></td><td><input value={rule.conditions} onChange={(event) => update(rule.id, { conditions: event.target.value })}/></td><td className="evidence-cell"><strong>{rule.evidence.sheetName} {rule.evidence.cellRange}</strong><span title={rule.evidence.rawText}>{rule.evidence.rawText || '无原始文字'}</span></td><td><StatusTag tone={rule.confidence === '高' ? 'success' : rule.confidence === '中' ? 'warning' : 'danger'}>{rule.confidence}</StatusTag></td><td>{rule.validationIssues.length ? <StatusTag tone="danger">{rule.validationIssues.join('；')}</StatusTag> : <StatusTag tone="success">通过</StatusTag>}</td></tr>)}</tbody></table></div>
  </section>
}
