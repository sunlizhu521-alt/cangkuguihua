import type { AiSettings, FeeRule } from './types'
import { quoteResponseSchema } from './fileParser'

export async function testAiConnection(settings: AiSettings) {
  if (!settings.workerUrl || !settings.secret || !settings.model) throw new Error('请完整填写转发地址、模型名称和服务密钥')
  const response = await fetch(`${settings.workerUrl.replace(/\/$/, '')}/api/ai/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.secret}` },
    body: JSON.stringify({ provider: settings.provider, baseUrl: settings.baseUrl, model: settings.model }),
  })
  const result = await response.json() as { success?: boolean; message?: string }
  if (!response.ok || !result.success) throw new Error(result.message || '连接失败')
  return result.message || '连接成功'
}

export async function parseQuoteWithAi(settings: AiSettings, payload: unknown): Promise<FeeRule[]> {
  if (!settings.workerUrl || !settings.secret || !settings.model) throw new Error('人工智能服务尚未完整配置')
  const response = await fetch(`${settings.workerUrl.replace(/\/$/, '')}/api/quotes/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.secret}` },
    body: JSON.stringify({ provider: settings.provider, baseUrl: settings.baseUrl, model: settings.model, payload }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error((result as { message?: string }).message || '解析失败')
  const parsed = quoteResponseSchema.safeParse(result)
  if (!parsed.success) throw new Error('人工智能返回内容未通过费用结构校验')
  return parsed.data.rules.map((rule) => ({ ...rule, id: crypto.randomUUID() }))
}
