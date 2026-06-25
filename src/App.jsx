import { Toaster } from "@/components/ui/toaster"
import { Toaster as HotToaster } from 'react-hot-toast'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop';
import Home from './pages/Home';
import Viewer from './pages/Viewer';

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/viewer" element={<Viewer />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Router>
      <Toaster />
      <HotToaster position="bottom-center" />
    </QueryClientProvider>
  )
}

export default App
