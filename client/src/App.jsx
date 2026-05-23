import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Preloader from './components/Preloader';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import AutomatePage from './pages/AutomatePage';
import CredentialsPage from './pages/CredentialsPage';
import ResumePage from './pages/ResumePage';
import LogsPage from './pages/LogsPage';

const AppLayout = ({ children }) => (
  <div className="flex h-screen overflow-hidden">
    <Sidebar />
    <main className="flex-1 overflow-y-auto bg-surface app-main">
      {children}
    </main>
  </div>
);

const App = () => {
  const [preloaderDone, setPreloaderDone] = useState(false);
  const handlePreloaderDone = useCallback(() => setPreloaderDone(true), []);

  return (
    <>
      {!preloaderDone && <Preloader onDone={handlePreloaderDone} />}

      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <AppLayout><Dashboard /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/automate"
              element={
                <ProtectedRoute>
                  <AppLayout><AutomatePage /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/credentials"
              element={
                <ProtectedRoute>
                  <AppLayout><CredentialsPage /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/resume"
              element={
                <ProtectedRoute>
                  <AppLayout><ResumePage /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/logs"
              element={
                <ProtectedRoute>
                  <AppLayout><LogsPage /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </>
  );
};

export default App;
