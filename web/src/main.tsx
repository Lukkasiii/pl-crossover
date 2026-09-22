import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthContext'
import { LocaleProvider } from './i18n/LocaleContext'
import { ReplayParamsProvider } from './state/ReplayParamsContext'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* import.meta.env.BASE_URL is '/pl-crossover/' for the GitHub Pages
        demo build, '/' otherwise (see vite.config.ts) -- basename keeps
        every route link correct under either. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <AuthProvider>
            <ReplayParamsProvider>
              <App />
            </ReplayParamsProvider>
          </AuthProvider>
        </LocaleProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
