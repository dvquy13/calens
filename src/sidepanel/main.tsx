import React from 'react';
import ReactDOM from 'react-dom/client';
import { Sidepanel } from './Sidepanel';
import { AuthProvider } from '../hooks/useAuth';
import { installPanelErrorCapture } from '../lib/diag-panel';
import '../index.css';

installPanelErrorCapture();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <Sidepanel />
    </AuthProvider>
  </React.StrictMode>,
);
