import { BarChart3, Boxes, Database, FileSpreadsheet, Flame, PanelLeftClose, Settings2, SlidersHorizontal, TrendingUp } from 'lucide-react'
import type { PageId } from '../types'

const navItems: Array<{ id: PageId; label: string; icon: typeof Database }> = [
  { id: 'files', label: '文件库', icon: Database },
  { id: 'quotes', label: '仓库报价', icon: FileSpreadsheet },
  { id: 'mapping', label: '字段映射', icon: SlidersHorizontal },
  { id: 'settings', label: '分析设置', icon: Settings2 },
  { id: 'salesHeatmap', label: '销售热力图', icon: Flame },
  { id: 'inventoryHeatmap', label: '库存热力图', icon: Boxes },
  { id: 'inventoryAnalysis', label: '库存分析', icon: TrendingUp },
  { id: 'results', label: '分析结果', icon: BarChart3 },
]

export default function AppShell({ page, onNavigate, children }: { page: PageId; onNavigate: (page: PageId) => void; children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">仓</span><span>仓库分布分析</span></div>
        <nav aria-label="主要导航">
          {navItems.map((item) => {
            const Icon = item.icon
            return <button key={item.id} aria-label={item.label} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => onNavigate(item.id)}><Icon size={19} /><span>{item.label}</span></button>
          })}
        </nav>
        <div className="sidebar-spacer" />
        <button className="nav-item"><PanelLeftClose size={18} /><span>收起菜单</span></button>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
