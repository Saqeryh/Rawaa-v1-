import { Navigate, Route, Routes } from "react-router-dom";
import { RequireRole } from "./auth/session";
import Landing from "./pages/Landing";
import SignIn from "./pages/SignIn";
import DoctorApp from "./pages/doctor/DoctorApp";
import PatientApp from "./pages/patient/PatientApp";
import { SplashGate } from "./components/Splash";

export default function App() {
  return (
    <>
      <SplashGate />
      <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/doctor/login" element={<SignIn role="doctor" />} />
      <Route path="/patient/login" element={<SignIn role="patient" />} />
      <Route path="/doctor/*" element={<RequireRole role="doctor"><DoctorApp /></RequireRole>} />
      <Route path="/patient/*" element={<RequireRole role="patient"><PatientApp /></RequireRole>} />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
