import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import UsStatesMap from '../components/UsStatesMap'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(SVGElement.prototype, 'getBBox')
})

describe('美国各州地图', () => {
  it('渲染州级热力、悬停信息，并用真实边界定位仓库', async () => {
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value: () => ({ x: 10, y: 20, width: 100, height: 60 }),
    })
    const { container } = render(<UsStatesMap stateValues={{ CA: 100, TX: 50 }} warehouses={[{ code: 'WH-CA', state: 'CA' }, { code: 'WH-PR', state: 'PR' }]} />)

    expect(screen.getByRole('img', { name: '美国各州订单分布图' })).toBeInTheDocument()
    expect(container.querySelectorAll('path[data-state]')).toHaveLength(51)
    await waitFor(() => expect(screen.getByText('WH-CA').parentElement).toHaveAttribute('transform', 'translate(60 50)'))
    expect(screen.queryByText('WH-PR')).not.toBeInTheDocument()

    fireEvent.mouseEnter(container.querySelector('path[data-state="CA"]')!, { clientX: 20, clientY: 30 })

    expect(screen.getByText('加利福尼亚（CA）')).toBeInTheDocument()
    expect(screen.getByText('区域：美西')).toBeInTheDocument()
    expect(screen.getByText('订单量：100')).toBeInTheDocument()
    expect(screen.getByText('全国占比：66.7%')).toBeInTheDocument()
  })
})
