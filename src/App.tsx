/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import ClassRecord from './components/ClassRecord';
import Settings from './components/Settings';

function RosterWrapper() {
  const { rosterId } = useParams();
  return <ClassRecord key={rosterId} />;
}

export default function App() {
  useEffect(() => {
    if (localStorage.getItem('darkMode') === 'true') {
      document.documentElement.classList.add('dark');
    }
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/roster/:rosterId" element={<RosterWrapper />} />
        <Route path="/roster/:rosterId/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
