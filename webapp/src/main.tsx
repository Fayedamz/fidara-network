import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { WalletBar } from "./components/WalletBar";
import { CreatePlan } from "./pages/CreatePlan";
import { LearnerDashboard } from "./pages/LearnerDashboard";
import { MentorPage } from "./pages/MentorPage";
import "./index.css";

// ---------------------------------------------------------------------------
// Testnet guard — the app refuses to run on any other network.
// CONTRACT_ID is a Soroban testnet address; if someone mis-deploys on mainnet
// the constant will be wrong, but we also check the Freighter network in WalletBar.
// ---------------------------------------------------------------------------
const CONTRACT_NETWORK = import.meta.env.VITE_NETWORK ?? "testnet";
if (CONTRACT_NETWORK !== "testnet") {
  // Surface a hard error rather than silently proceeding on the wrong network.
  document.getElementById("root")!.innerHTML =
    `<p style="color:red;padding:2rem">
      This app only runs on Stellar <strong>Testnet</strong>.
      Current VITE_NETWORK="${CONTRACT_NETWORK}".
    </p>`;
  throw new Error(`Refusing to start: VITE_NETWORK="${CONTRACT_NETWORK}" is not testnet`);
}

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
