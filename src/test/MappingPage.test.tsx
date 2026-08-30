import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    render(<MappingPage files={[inventory]} selected={inventory} onSelect={vi.fn()} onUpload={vi.fn()} onSave={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /销售预测.*点击上传/ }))

    expect(inputClick).toHaveBeenCalledOnce()
  })

  it('库存映射后仍可切换到另一个已上传文件', () => {
    const inventory = { ...storedFile('inventory', '库存.xlsx'), validation: '校验通过' as const, mapping: { 仓库名称: '来源列' } }
    const forecast = storedFile('forecast', '预测.xlsx')
    const onSelect = vi.fn()
    render(<MappingPage files={[inventory, forecast]} selected={inventory} onSelect={onSelect} onUpload={vi.fn()} onSave={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /销售预测.*待映射/ }))

    expect(onSelect).toHaveBeenCalledWith(forecast)
  })
})
