import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AiAssistantPage } from './pages/AiAssistantPage'
import { ArtistsPage } from './pages/ArtistsPage'
import { BookingsPage } from './pages/BookingsPage'
import { CalendarPage } from './pages/CalendarPage'
import { ClientsPage } from './pages/ClientsPage'
import { ContractsPage } from './pages/ContractsPage'
import { DashboardPage } from './pages/DashboardPage'
import { EpkEditorPage } from './pages/EpkEditorPage'
import { EpkListPage } from './pages/EpkListPage'
import { EpkPreviewPage } from './pages/EpkPreviewPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { LandingPage } from './pages/LandingPage'
import { PayInvoicePage } from './pages/PayInvoicePage'
import { PaymentsPage } from './pages/PaymentsPage'
import { PublicArtistPage } from './pages/PublicArtistPage'
import { PublicEpkPage } from './pages/PublicEpkPage'
import { QuotesPage } from './pages/QuotesPage'
import { SettingsPage } from './pages/SettingsPage'
import { TestCheckoutPage } from './pages/TestCheckoutPage'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/a/:slug" element={<PublicArtistPage />} />
      <Route path="/a/:slug/epk" element={<PublicEpkPage />} />
      <Route path="/pay/test-checkout/:attemptId" element={<TestCheckoutPage />} />
      <Route path="/pay/:token" element={<PayInvoicePage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/ai" element={<AiAssistantPage />} />
        <Route path="/artists" element={<ArtistsPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/quotes" element={<QuotesPage />} />
        <Route path="/contracts" element={<ContractsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/epk" element={<EpkListPage />} />
        <Route path="/epk/:artistId" element={<EpkEditorPage />} />
        <Route path="/epk/:artistId/preview" element={<EpkPreviewPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export default App
