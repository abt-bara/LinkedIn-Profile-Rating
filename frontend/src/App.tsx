import { Route, Routes, Link } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AnalysisHistoryPage } from './pages/AnalysisHistoryPage'
import { AuthPage } from './pages/AuthPage'
import { HomePage } from './pages/HomePage'
import { ProfileCheckPage } from './pages/ProfileCheckPage'
import './App.css'

function NotFound() {
  return (
    <main className="session-loading">
      <p>Page not found.</p>
      <Link to="/">Return to profile review</Link>
    </main>
  )
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<ProfileCheckPage />} />
          <Route path="/profile-check" element={<ProfileCheckPage />} />
          <Route path="/analysis-history" element={<AnalysisHistoryPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
