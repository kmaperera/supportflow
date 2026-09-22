import { useLocation } from 'react-router-dom'
import AuthFeedback from '../../auth/AuthFeedback'

export default function NotificationReadNotice() {
  const { state } = useLocation()
  return state?.notificationReadError === true
    ? <AuthFeedback>The ticket was opened, but its notification could not be marked as read. You can retry from Notifications.</AuthFeedback>
    : null
}
