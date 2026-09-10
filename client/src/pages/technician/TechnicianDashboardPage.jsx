import { Link } from 'react-router-dom'
import SessionActions from '../../auth/SessionActions'
function TechnicianDashboardPage() {
  return <main><h1 className="text-2xl font-bold">Technician Dashboard</h1><Link to="/profile" className="mt-4 inline-block rounded text-teal-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Profile</Link><SessionActions /></main>
}

export default TechnicianDashboardPage
