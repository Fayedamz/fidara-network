import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { WalletBar } from "./components/WalletBar";
import { CreatePlan } from "./pages/CreatePlan";
import { LearnerDashboard } from "./pages/LearnerDashboard";
import { MentorPage } from "./pages/MentorPage";
import "./index.css";

function App() {
  return (
    <BrowserRouter>
      <header className="app-header">
        <span className="logo">Fidara Network</span>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>Create Plan</NavLink>
          <NavLink to="/learner">Learner</NavLink>
          <NavLink to="/mentor">Mentor</NavLink>
        </nav>
        <WalletBar />
      </header>
      <Routes>
        <Route path="/" element={<CreatePlan />} />
        <Route path="/learner" element={<LearnerDashboard />} />
        <Route path="/mentor" element={<MentorPage />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
