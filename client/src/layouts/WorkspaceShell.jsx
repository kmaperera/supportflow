import { Outlet } from 'react-router-dom'
import SkipLink from './SkipLink'
import PageContainer from './PageContainer'
import WorkspaceHeader from './WorkspaceHeader'
import MobileNavigation from './MobileNavigation'
import NavigationLinks from './NavigationLinks'
import LogoutButton from '../auth/LogoutButton'
import { useWorkspaceMenu } from './useWorkspaceMenu'

export default function WorkspaceShell({ role, title, displayName, navigation }) {
  const { menuButton, menuOpen, closeMenu, toggleMenu } = useWorkspaceMenu()
  const employee = role === 'Employee', admin = role === 'Admin'
  const id = `${role.toLowerCase()}-navigation`
  return <div className={`${employee ? 'employee-ui' : 'workspace-ui'} min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]`}>
    <SkipLink />
    <aside className={`hidden border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 lg:sticky lg:top-0 lg:h-dvh ${employee ? 'lg:block lg:overflow-y-auto' : `lg:flex lg:flex-col ${admin ? 'lg:min-h-0' : 'lg:overflow-y-auto'}`}`}>
      <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-6"><div className="min-w-0"><p className="text-xl font-bold tracking-tight text-teal-800 dark:text-teal-300">SupportFlow</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{role} workspace</p></div></div>
      <div className={admin ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : `px-3 pb-6 ${employee ? '' : 'flex flex-1 flex-col'}`}>
        <nav aria-label={`${role} navigation`} className={admin ? 'min-h-0 flex-1 overflow-y-auto px-3 py-1' : undefined}><NavigationLinks items={navigation} /></nav>
        <div className={admin ? 'shrink-0 px-6 pb-6 pt-3' : employee ? 'mt-6 border-t border-slate-200 px-3 dark:border-slate-700' : 'mt-auto pt-6'}>
          {employee ? <LogoutButton /> : <div className={`border-t border-slate-200 dark:border-slate-700 ${admin ? '' : 'px-3'}`}><LogoutButton /></div>}
        </div>
      </div>
    </aside>
    <div className="min-w-0">
      <WorkspaceHeader title={title} displayName={displayName} role={role} menuButtonRef={menuButton} mobileNavigation={{ id, menuOpen, toggleMenu }} />
      <PageContainer id="main-content"><Outlet /></PageContainer>
    </div>
    <MobileNavigation id={id} role={role} displayName={displayName} items={navigation} open={menuOpen} onClose={closeMenu} trigger={menuButton} />
  </div>
}
