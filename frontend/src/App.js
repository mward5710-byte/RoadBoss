import React from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import Marketing from '@/pages/Marketing';
import Login from '@/pages/Login';
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
import { getUser } from '@/lib/api';

function RequireAuth({ roles, children }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role) && user.role !== 'super_admin') {
    return <Navigate to={user.role === 'driver' ? '/driver' : '/app'} replace />;
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
            <Route path="waitlist" element={<WaitlistAdmin />} />
            <Route path="profile" element={<Profile />} />
          </Route>

          <Route path="/driver" element={<RequireAuth roles={['driver']}><DriverShell /></RequireAuth>}>
            <Route index element={<DriverHome />} />
            <Route path="copilot" element={<Copilot />} />
            <Route path="inspection/:id" element={<Inspection />} />
            <Route path="trips" element={<DriverTrips />} />
            <Route path="trips/:id" element={<DriverTripDetail />} />
            <Route path="vehicle" element={<DriverVehicle />} />
            <Route path="settings" element={<DriverSettings />} />
            <Route path="profile" element={<DriverProfile />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
