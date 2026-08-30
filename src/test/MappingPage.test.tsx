import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MappingPage from '../pages/MappingPage'
import type { FileSlotId, StoredFile } from '../types'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function storedFile(slotId: FileSlotId, fileName: string): StoredFile {
  return {
    slotId,
    fileName,
    updatedAt: '2026-08-30T00:00:00.000Z',
    rowCount: 1,
    sheetNames: ['数据'],
    headers: ['来源列'],
    previewRows: [{ 来源列: '测试值' }],
    data: new ArrayBuffer(0),
    mapping: {},
    validation: '待映射',
    missingFields: [],
  }
}

describe('字段映射文件切换', () => {
  it('未上传的文件槽位可以直接点击选择文件', () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    const inventory = storedFile('inventory', '库存.xlsx')
    render(<MappingPage files={[inventory]} selected={inventory} onSelect={vi.fn()} onUpload={vi.fn().mockResolvedValue(undefined)} onSave={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /销售预测.*点击上传/ }))

    expect(inputClick).toHaveBeenCalledOnce()
  })

  it('库存映射后仍可切换到另一个已上传文件', () => {
    const inventory = { ...storedFile('inventory', '库存.xlsx'), validation: '校验通过' as const, mapping: { 仓库名称: '来源列' } }
    const forecast = storedFile('forecast', '预测.xlsx')
    const onSelect = vi.fn()
    render(<MappingPage files={[inventory, forecast]} selected={inventory} onSelect={onSelect} onUpload={vi.fn().mockResolvedValue(undefined)} onSave={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /销售预测.*待映射/ }))

    expect(onSelect).toHaveBeenCalledWith(forecast)
  })

  it('文件完整读取完成后才清空选择框', async () => {
    let finishUpload: (() => void) | undefined
    const onUpload = vi.fn(() => new Promise<void>((resolve) => { finishUpload = resolve }))
    const inventory = storedFile('inventory', '库存.xlsx')
    const { container } = render(<MappingPage files={[inventory]} selected={inventory} onSelect={vi.fn()} onUpload={onUpload} onSave={vi.fn()} />)
    const input = container.querySelector<HTMLInputElement>('input[aria-label="销售预测文件选择"]')!
    Object.defineProperty(input, 'value', { configurable: true, writable: true, value: '已选择文件' })
    const nextFile = new File(['测试'], '预测.xlsx')

    fireEvent.change(input, { target: { files: [nextFile] } })

    expect(onUpload).toHaveBeenCalledOnce()
    expect(input.value).toBe('已选择文件')
    finishUpload?.()
    await waitFor(() => expect(input.value).toBe(''))
  })

  it('字段调整后不统计或保存已经移除的旧映射', () => {
    const amazon = {
      ...storedFile('amazonOutbound', '亚马逊仓配.xlsx'),
      headers: ['date/time', 'sku'],
      mapping: { 商品编码: 'sku', 出库日期: 'date/time', 订单状态: 'type' },
    }
    const onSave = vi.fn()
    render(<MappingPage files={[amazon]} selected={amazon} onSelect={vi.fn()} onUpload={vi.fn().mockResolvedValue(undefined)} onSave={onSave} />)

    expect(screen.getByText('已选择 0 个字段')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存映射' }))
    expect(onSave).toHaveBeenCalledWith(amazon, {})
  })
})
