import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import ThemeProvider from './theme/ThemeProvider.jsx'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthProvider.jsx'
import ToastProvider from './components/ToastProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider><BrowserRouter>
      <ToastProvider><AuthProvider>
        <App />
      </AuthProvider></ToastProvider>
    </BrowserRouter></ThemeProvider>
  </StrictMode>,
)
