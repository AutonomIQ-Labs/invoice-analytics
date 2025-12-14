import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AdminRoute } from './components/auth/AdminRoute';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Invoices } from './pages/Invoices';
import { Import } from './pages/Import';
import { Aging } from './pages/Aging';
import { Outliers } from './pages/Outliers';
import { Admin } from './pages/Admin';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProtectedRoute>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/aging" element={<Aging />} />
              <Route path="/outliers" element={<Outliers />} />
              <Route path="/import" element={<Import />} />
              <Route path="/admin" element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              } />
            </Routes>
          </Layout>
        </ProtectedRoute>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
