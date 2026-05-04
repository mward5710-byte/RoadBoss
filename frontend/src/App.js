import React from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import Marketing from '@/pages/Marketing';
import Login from '@/pages/Login';
import PitchDeck from '@/pages/PitchDeck';
import TryPage from '@/pages/TryPage';
import ShareKit from '@/pages/ShareKit';
import UserGuide from '@/pages/UserGuide';
import RoiCalculator from '@/pages/RoiCalculator';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import GoogleCallback from '@/pages/GoogleCallback';
import AppShell from '@/pages/admin/AppShell';
import Overview from '@/pages/admin/Overview';
import Drivers from '@/pages/admin/Drivers';
import DriverDetail from '@/pages/admin/DriverDetail';
import Vehicles from '@/pages/admin/Vehicles';
import Trips from '@/pages/admin/Trips';
import Maintenance from '@/pages/admin/Maintenance';
import Alerts from '@/pages/admin/Alerts';
import DashcamPage from '@/pages/admin/DashcamPage';
import WaitlistAdmin from '@/pages/admin/WaitlistAdmin';
import Profile from '@/pages/admin/Profile';
import IFTA from '@/pages/admin/IFTA';
import Billing from '@/pages/admin/Billing';
import Inspections from '@/pages/admin/Inspections';
import InspectionDetail from '@/pages/admin/InspectionDetail';
import AdminRoadside from '@/pages/admin/AdminRoadside';
import CrashEvents from '@/pages/admin/CrashEvents';
import AdminNotifications from '@/pages/admin/AdminNotifications';
import AdminSettings from '@/pages/admin/AdminSettings';
import Pricing from '@/pages/Pricing';
import DriverShell from '@/pages/driver/DriverShell';
import DriverHome from '@/pages/driver/DriverHome';
import DriverTrips from '@/pages/driver/DriverTrips';
import DriverTripDetail from '@/pages/driver/DriverTripDetail';
import DriverVehicle from '@/pages/driver/DriverVehicle';
import DriverSettings from '@/pages/driver/DriverSettings';
import DriverProfile from '@/pages/driver/DriverProfile';
import Copilot from '@/pages/driver/Copilot';
import Inspection from '@/pages/driver/Inspection';
import Roadside from '@/pages/driver/Roadside';
import RoadsideDetail from '@/pages/driver/RoadsideDetail';
import WreckerShell from '@/pages/wrecker/WreckerShell';
import WreckerDashboard from '@/pages/wrecker/WreckerDashboard';
import WreckerJobNew from '@/pages/wrecker/WreckerJobNew';
import WreckerJobDetail from '@/pages/wrecker/WreckerJobDetail';
import WreckerImpound from '@/pages/wrecker/WreckerImpound';
import WreckerMotorClubs from '@/pages/wrecker/WreckerMotorClubs';
import WreckerFuel from '@/pages/wrecker/WreckerFuel';
import WreckerBilling from '@/pages/wrecker/WreckerBilling';
import { getUser } from '@/lib/api';

function RequireAuth({ roles, children }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role) && user.role !== 'super_admin') {
    const fallback = user.role === 'driver' ? '/driver' : user.role === 'wrecker_operator' ? '/wrecker' : '/app';
    return <Navigate to={fallback} replace />;
  }
  return children;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Toaster theme="dark" position="top-right" richColors closeButton />
        <Routes>
          <Route path="/" element={<Marketing />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/deck" element={<PitchDeck />} />
          <Route path="/try" element={<TryPage />} />
          <Route path="/share-kit" element={<ShareKit />} />
          <Route path="/guide" element={<UserGuide />} />
          <Route path="/help" element={<UserGuide />} />
          <Route path="/roi" element={<RoiCalculator />} />
          <Route path="/savings" element={<RoiCalculator />} />
          <Route path="/fleet" element={<RoiCalculator />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/google-callback" element={<GoogleCallback />} />

          <Route path="/app" element={<RequireAuth roles={['fleet_admin', 'dispatcher', 'super_admin']}><AppShell /></RequireAuth>}>
            <Route index element={<Overview />} />
            <Route path="drivers" element={<Drivers />} />
            <Route path="drivers/:id" element={<DriverDetail />} />
            <Route path="vehicles" element={<Vehicles />} />
            <Route path="trips" element={<Trips />} />
            <Route path="maintenance" element={<Maintenance />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="dashcam" element={<DashcamPage />} />
            <Route path="ifta" element={<IFTA />} />
            <Route path="billing" element={<Billing />} />
            <Route path="inspections" element={<Inspections />} />
            <Route path="inspections/:id" element={<InspectionDetail />} />
            <Route path="roadside" element={<AdminRoadside />} />
            <Route path="crash-events" element={<CrashEvents />} />
            <Route path="notifications" element={<AdminNotifications />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="waitlist" element={<WaitlistAdmin />} />
            <Route path="profile" element={<Profile />} />
          </Route>

          <Route path="/driver" element={<RequireAuth roles={['driver']}><DriverShell /></RequireAuth>}>
            <Route index element={<DriverHome />} />
            <Route path="copilot" element={<Copilot />} />
            <Route path="inspection/:id" element={<Inspection />} />
            <Route path="roadside" element={<Roadside />} />
            <Route path="roadside/:id" element={<RoadsideDetail />} />
            <Route path="trips" element={<DriverTrips />} />
            <Route path="trips/:id" element={<DriverTripDetail />} />
            <Route path="vehicle" element={<DriverVehicle />} />
            <Route path="settings" element={<DriverSettings />} />
            <Route path="profile" element={<DriverProfile />} />
          </Route>

          <Route path="/wrecker" element={<RequireAuth roles={['wrecker_operator', 'fleet_admin', 'dispatcher']}><WreckerShell /></RequireAuth>}>
            <Route index element={<WreckerDashboard />} />
            <Route path="jobs/new" element={<WreckerJobNew />} />
            <Route path="jobs/:id" element={<WreckerJobDetail />} />
            <Route path="impound" element={<WreckerImpound />} />
            <Route path="clubs" element={<WreckerMotorClubs />} />
            <Route path="fuel" element={<WreckerFuel />} />
            <Route path="billing" element={<WreckerBilling />} />
          </Route>
          {/* Wrecker hands-free voice page reuses the Co-Pilot UI but lives outside the shell so it can be full-screen */}
          <Route path="/wrecker/voice" element={<RequireAuth roles={['wrecker_operator', 'fleet_admin', 'dispatcher']}><Copilot /></RequireAuth>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
