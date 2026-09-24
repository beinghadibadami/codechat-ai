import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { SessionProvider } from '@/contexts/SessionContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';

import Landing from './pages/Landing';
import Workspace from './pages/Workspace';
import Chat from './pages/Chat';
import Pulls from './pages/Pulls';
import Shared from './pages/Shared';
import Settings from './pages/Settings';
import SharedSession from './pages/SharedSession';
import NotFound from './pages/NotFound';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Session/file data is cheap to refetch and changes rarely mid-view
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    {/*
      `:root` in index.css holds the dark palette and `.light` overrides it,
      so next-themes' class attribute is all that's needed to swap themes.
    */}
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <TooltipProvider delayDuration={300}>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                {/* Public marketing page — no app shell */}
                <Route path="/" element={<Landing />} />

                {/* Workspace areas — all render inside AppShell */}
                <Route path="/app" element={<Workspace />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/pulls" element={<Pulls />} />
                <Route path="/shared" element={<Shared />} />
                <Route path="/settings" element={<Settings />} />

                {/* Public read-only share — intentionally outside the shell */}
                <Route path="/s/:id" element={<SharedSession />} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
