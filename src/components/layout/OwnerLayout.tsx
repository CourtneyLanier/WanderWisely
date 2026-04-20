import { Outlet } from 'react-router-dom'
import TabNav from './TabNav'

export default function OwnerLayout() {
  return (
    <div className="min-h-screen bg-cream pb-20">
      <Outlet />
      <TabNav />
    </div>
  )
}
