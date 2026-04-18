import React from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import QuoteHistory from './pages/QuoteHistory.jsx';
import QuoteBuilder from './pages/QuoteBuilder.jsx';
import Materials from './pages/Materials.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="name">JB Machine</div>
          <div className="subtitle">Quoting</div>
        </div>
        <nav>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/quotes/new">New Quote</NavLink>
          <NavLink to="/quotes" end>
            Quote History
          </NavLink>
          <NavLink to="/materials">Materials</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/quotes" element={<QuoteHistory />} />
          <Route path="/quotes/new" element={<QuoteBuilder />} />
          <Route path="/quotes/:id" element={<QuoteBuilder />} />
          <Route path="/materials" element={<Materials />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
