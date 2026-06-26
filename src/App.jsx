import { Toaster } from "@/components/ui/toaster"
import { Toaster as HotToaster } from 'react-hot-toast'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop';
import Home from './pages/Home';
import Viewer from './pages/Viewer';
import { useEffect } from 'react';
import { initFileIntentBridge } from '@/lib/fileIntentBridge';

// Component con — nằm trong Router nên useNavigate hoạt động
function AppRoutes() {
  const navigate = useNavigate();

  useEffect(() => {
    return initFileIntentBridge(navigate);
  }, []);

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/viewer" element={<Viewer />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <AppRoutes />
      </Router>
      <Toaster />
      <HotToaster position="bottom-center" />
    </QueryClientProvider>
  )
}

export default App