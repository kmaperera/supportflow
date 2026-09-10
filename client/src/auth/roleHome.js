import { ROLES } from './roles'
const ROLE_HOMES = new Map([
  [ROLES.EMPLOYEE, '/employee'],
  [ROLES.TECHNICIAN, '/technician'],
  [ROLES.ADMIN, '/admin'],
])
export function getRoleHome(role) { return ROLE_HOMES.get(role) ?? null }
