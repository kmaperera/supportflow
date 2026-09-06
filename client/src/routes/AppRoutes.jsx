import { Route, Routes } from 'react-router-dom'
import LoginPage from '../pages/auth/LoginPage'
import EmployeeDashboardPage from '../pages/employee/EmployeeDashboardPage'
import TechnicianDashboardPage from '../pages/technician/TechnicianDashboardPage'
import AdminDashboardPage from '../pages/admin/AdminDashboardPage'
import NotFoundPage from '../pages/shared/NotFoundPage'
import ProtectedRoute from './ProtectedRoute'
import RoleRoute from './RoleRoute'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<RoleRoute />}>
          <Route path="/employee/dashboard" element={<EmployeeDashboardPage />} />
          <Route path="/technician/dashboard" element={<TechnicianDashboardPage />} />
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default AppRoutes
