interface Env { ALLOWED_ORIGIN: string }

const allowedHosts = new Set(['api.openai.com', 'api.deepseek.com'])
const categories = ['仓储费','尾程配送费','原仓出库费','目的仓入库费','中转运输费','其他附加费','未识别项目']
const schema = {
  type: 'object', additionalProperties: false, required: ['rules'], properties: { rules: { type: 'array', items: { type: 'object', additionalProperties: false,
    required: ['category','name','warehouseCode','routeFrom','routeTo','startDay','endDay','billingUnit','billingPeriod','rateUsd','percentage','minimumChargeUsd','transitDays','conditions','confidence','evidence','validationIssues'],
    properties: { category: { type: 'string', enum: categories }, name: { type: 'string' }, warehouseCode: { type: ['string','null'] }, routeFrom: { type: ['string','null'] }, routeTo: { type: ['string','null'] }, startDay: { type: ['number','null'] }, endDay: { type: ['number','null'] }, billingUnit: { type: 'string' }, billingPeriod: { type: ['string','null'] }, rateUsd: { type: ['number','null'] }, percentage: { type: ['number','null'] }, minimumChargeUsd: { type: ['number','null'] }, transitDays: { type: ['number','null'] }, conditions: { type: 'string' }, confidence: { type: 'string', enum: ['高','中','低'] }, evidence: { type: 'object', additionalProperties: false, required: ['sheetName','cellRange','rawText'], properties: { sheetName: { type: 'string' }, cellRange: { type: 'string' }, rawText: { type: 'string' } } }, validationIssues: { type: 'array', items: { type: 'string' } } }
  } } }
}

const cors = (origin: string) => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' })
const json = (body: unknown, status: number, origin: string) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin) } })

export default { async fetch(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin') ?? ''
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (origin !== env.ALLOWED_ORIGIN && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return json({ message: '来源地址不在允许范围内' }, 403, origin)
  if (request.method !== 'POST') return json({ message: '仅支持提交请求' }, 405, origin)
  const secret = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!secret) return json({ message: '缺少人工智能服务密钥' }, 401, origin)
  try {
    const body = await request.json() as { provider: 'OpenAI'|'DeepSeek'; baseUrl: string; model: string; payload?: unknown }
    const base = new URL(body.baseUrl)
    if (!allowedHosts.has(base.hostname)) return json({ message: '服务地址不在允许范围内' }, 400, origin)
    const prompt = request.url.endsWith('/api/ai/test') ? '只回复连接成功。' : `你是仓库报价解析员。将输入费用行转换为严格的中文费用结构。所有金额按美元；不确定的内容放入校验问题，不得猜测。输入：${JSON.stringify(body.payload).slice(0, 120000)}`
    let upstream: Response
    if (body.provider === 'OpenAI') {
      upstream = await fetch(`${body.baseUrl.replace(/\/$/, '')}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: body.model, input: prompt, text: request.url.endsWith('/api/quotes/parse') ? { format: { type: 'json_schema', name: 'warehouse_quote', strict: true, schema } } : undefined }) })
    } else {
      upstream = await fetch(`${body.baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: body.model, messages: [{ role: 'user', content: prompt }], response_format: request.url.endsWith('/api/quotes/parse') ? { type: 'json_object' } : undefined }) })
    }
    const result = await upstream.json() as Record<string, any>
    if (!upstream.ok) return json({ message: result.error?.message ?? '上游服务请求失败' }, upstream.status, origin)
    if (request.url.endsWith('/api/ai/test')) return json({ success: true, message: '连接成功' }, 200, origin)
    const text = body.provider === 'OpenAI' ? result.output?.flatMap((item: any) => item.content ?? []).find((item: any) => item.type === 'output_text')?.text : result.choices?.[0]?.message?.content
    if (!text) return json({ message: '上游服务未返回可解析内容' }, 502, origin)
    const parsed = JSON.parse(text) as { rules?: Array<Record<string, unknown>> }
    if (Array.isArray(parsed.rules)) parsed.rules = parsed.rules.map((rule) => Object.fromEntries(Object.entries(rule).filter(([, value]) => value !== null)))
    return json(parsed, 200, origin)
  } catch (error) { return json({ message: error instanceof Error ? error.message : '请求处理失败' }, 500, origin) }
} }
