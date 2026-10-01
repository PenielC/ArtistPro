import { Route, Routes } from 'react-router-dom'
import { AdminRoute } from './components/AdminRoute'
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
import { AdminAuditPage } from './pages/admin/AdminAuditPage'
import { AdminBusinessPage } from './pages/admin/AdminBusinessPage'
import { AdminBusinessesPage } from './pages/admin/AdminBusinessesPage'
import { AdminOverviewPage } from './pages/admin/AdminOverviewPage'
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage'
import { LoginPage } from './pages/auth/LoginPage'
import { AcceptInvitePage } from './pages/auth/AcceptInvitePage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage'
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage'
import { RegisterPage } from './pages/auth/RegisterPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
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
      <Route element={<AdminRoute />}>
        <Route path="/admin" element={<AdminOverviewPage />} />
        <Route path="/admin/businesses" element={<AdminBusinessesPage />} />
        <Route path="/admin/businesses/:id" element={<AdminBusinessPage />} />
        <Route path="/admin/settings" element={<AdminSettingsPage />} />
        <Route path="/admin/audit" element={<AdminAuditPage />} />
      </Route>
    </Routes>
  )
}

export default App
