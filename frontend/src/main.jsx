import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import Landing from './pages/Landing.jsx';
import Reception from './pages/Reception.jsx';
import PatientQueue from './pages/PatientQueue.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/c/:slug/reception" element={<Reception />} />
        <Route path="/c/:slug/queue" element={<PatientQueue />} />

        {/* Backward compatible: the original single-clinic links from
            before multi-clinic support keep working, pointed at the
            zero-config "default" clinic. */}
        <Route path="/reception" element={<Navigate to="/c/default/reception" replace />} />
        <Route path="/queue" element={<Navigate to="/c/default/queue" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
