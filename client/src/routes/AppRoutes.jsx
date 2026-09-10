import { Route, Routes } from 'react-router-dom'
import LoginPage from '../pages/auth/LoginPage'
import EmployeeDashboardPage from '../pages/employee/EmployeeDashboardPage'
import TechnicianDashboardPage from '../pages/technician/TechnicianDashboardPage'
import AdminDashboardPage from '../pages/admin/AdminDashboardPage'
import NotFoundPage from '../pages/shared/NotFoundPage'
import ProtectedRoute from './ProtectedRoute'
import RoleRoute from './RoleRoute'
import LoginRoute from './LoginRoute'
import RoleHomeRedirect from './RoleHomeRedirect'
import ChangePasswordRoute from './ChangePasswordRoute'
import ChangePasswordPage from '../pages/auth/ChangePasswordPage'
import { ROLES } from '../auth/roles'
import ProfileRoute from './ProfileRoute'
import ProfilePage from '../pages/auth/ProfilePage'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RoleHomeRedirect />} />
      <Route element={<LoginRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<ProfileRoute />}>
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
        <Route element={<ChangePasswordRoute />}>
          <Route path="/change-password" element={<ChangePasswordPage />} />
        </Route>
        <Route element={<RoleRoute role={ROLES.EMPLOYEE} />}>
          <Route path="/employee" element={<EmployeeDashboardPage />} />
          <Route path="/employee/dashboard" element={<EmployeeDashboardPage />} />
        </Route>
        <Route element={<RoleRoute role={ROLES.TECHNICIAN} />}>
          <Route path="/technician" element={<TechnicianDashboardPage />} />
          <Route path="/technician/dashboard" element={<TechnicianDashboardPage />} />
        </Route>
        <Route element={<RoleRoute role={ROLES.ADMIN} />}>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default AppRoutes
