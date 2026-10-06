import { useCallback, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

export function useWorkspaceMenu() {
  const location = useLocation()
  const [openLocation, setOpenLocation] = useState(null)
  const menuButton = useRef(null)
  const menuOpen = openLocation === location

  const closeMenu = useCallback(() => {
    setOpenLocation(null)
  }, [])

  return {
    location, menuButton, menuOpen, closeMenu,
    toggleMenu: () => setOpenLocation(menuOpen ? null : location),
  }
}
