import TechnicianManagementPage from '../pages/admin/TechnicianManagementPage'
import { Route, Routes } from 'react-router-dom'
import LoginPage from '../pages/auth/LoginPage'
import CreateTicketPage from '../pages/employee/CreateTicketPage'
import MyTicketsPage from '../pages/employee/MyTicketsPage'
import NotificationsPage from '../pages/employee/NotificationsPage'
import KnowledgeBasePage from '../pages/employee/KnowledgeBasePage'
import KnowledgeBaseArticlePage from '../pages/employee/KnowledgeBaseArticlePage'
import TicketDetailsPage from '../pages/employee/TicketDetailsPage'
import { Navigate } from 'react-router-dom'
import EmployeeLayout from '../layouts/EmployeeLayout'
import { employeeNavigation } from '../layouts/employeeNavigation'
import EmployeePlaceholderPage from '../pages/employee/EmployeePlaceholderPage'
import EmployeeDashboardPage from '../pages/employee/EmployeeDashboardPage'
import TechnicianDashboardPage from '../pages/technician/TechnicianDashboardPage'
import TechnicianWorkloadPage from '../pages/technician/TechnicianWorkloadPage'
import MyAssignedTicketsPage from '../pages/technician/MyAssignedTicketsPage'
import TechnicianTicketDetailsPage from '../pages/technician/TechnicianTicketDetailsPage'
import UnassignedTicketsPage from '../pages/technician/UnassignedTicketsPage'
import TechnicianLayout from '../layouts/TechnicianLayout'
import SharedNotificationsPage from '../pages/shared/NotificationsPage'
import AdminDashboardPage from '../pages/admin/AdminDashboardPage'
import UserManagementPage from '../pages/admin/UserManagementPage'
import CreateUserPage from '../pages/admin/CreateUserPage'
import AdminLayout from '../layouts/AdminLayout'
import { adminNavigation } from '../layouts/adminNavigation'
import AdminPlaceholderPage from '../pages/admin/AdminPlaceholderPage'
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
          <Route path="/employee" element={<EmployeeLayout />}>
            <Route index element={<EmployeeDashboardPage />} />
            <Route path="profile" element={<ProfilePage embedded />} />
            <Route path="tickets/new" element={<CreateTicketPage />} />
            <Route path="tickets" element={<MyTicketsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="knowledge-base" element={<KnowledgeBasePage />} />
            <Route path="knowledge-base/:articleId" element={<KnowledgeBaseArticlePage />} />
            <Route path="tickets/:ticketId" element={<TicketDetailsPage />} />
            <Route path="dashboard" element={<Navigate to="/employee" replace />} />
            {employeeNavigation.filter(item => item.phase).map(item => (
              <Route key={item.path} path={item.path.slice('/employee/'.length)} element={<EmployeePlaceholderPage title={item.title} phase={item.phase} />} />
            ))}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
        <Route element={<RoleRoute role={ROLES.TECHNICIAN} />}>
          <Route path="/technician" element={<TechnicianLayout />}>
            <Route index element={<TechnicianDashboardPage />} />
            <Route path="workload" element={<TechnicianWorkloadPage />} />
            <Route path="tickets/assigned" element={<MyAssignedTicketsPage />} />
            <Route path="tickets/:ticketId" element={<TechnicianTicketDetailsPage />} />
            <Route path="tickets/unassigned" element={<UnassignedTicketsPage />} />
            <Route path="notifications" element={<SharedNotificationsPage />} />
            <Route path="profile" element={<ProfilePage embedded />} />
            <Route path="dashboard" element={<Navigate to="/technician" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
        <Route element={<RoleRoute role={ROLES.ADMIN} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="technicians" element={<TechnicianManagementPage />} />
            <Route path="users" element={<UserManagementPage />} />
            <Route path="users/new" element={<CreateUserPage />} />
            {adminNavigation.filter(item => item.phase && !['/admin', '/admin/users', '/admin/technicians'].includes(item.path)).map(item => <Route key={item.path} path={item.path.slice('/admin/'.length)} element={<AdminPlaceholderPage title={item.title} phase={item.phase} />} />)}
            <Route path="profile" element={<ProfilePage embedded />} />
            <Route path="dashboard" element={<Navigate to="/admin" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default AppRoutes
