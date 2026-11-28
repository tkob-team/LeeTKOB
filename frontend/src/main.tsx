import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AuthProvider } from './app/AuthProvider';
import { routes } from './app/routes';
import { applyStoredTheme } from './app/theme';
import { ToastProvider } from './components/ui';
import './styles/tokens.css';
import './styles/ui.css';
import './components/ui/ui-extra.css';
import './styles/base.css';
import './app/shell.css';

applyStoredTheme();

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={createBrowserRouter(routes)} />
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
);
