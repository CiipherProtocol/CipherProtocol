import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { WalletProvider } from './context/WalletContext';
import { PriceProvider } from './context/PriceContext';
import Layout from './components/layout/Layout';
import HomePage from './pages/HomePage';
import SwapPage from './pages/SwapPage';
import OrdersPage from './pages/OrdersPage';
import DocsPage from './pages/DocsPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <WalletProvider>
      <PriceProvider>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/swap" element={<SwapPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/docs" element={<DocsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Layout>
        </Router>
      </PriceProvider>
    </WalletProvider>
  );
}
