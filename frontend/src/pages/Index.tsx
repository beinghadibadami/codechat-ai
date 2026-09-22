import React, { useState } from 'react';
import { Hero } from '@/components/Hero';
import { UploadCard } from '@/components/UploadCard';
import { GitHubCard } from '@/components/GitHubCard';
import { ChatInterface } from '@/components/ChatInterface';
import { SEOContent } from '@/components/SEOContent';
import { useSession } from '@/contexts/SessionContext';

const Index = () => {
  const [showChat, setShowChat] = useState(false);
  const { hasData } = useSession();

  // Auto-show chat when data becomes available
  React.useEffect(() => {
    if (hasData) {
      setShowChat(true);
    }
  }, [hasData]);

  // Handle demo chat
  const handleDemoChat = () => {
    setShowChat(true);
  };

  if (showChat) {
    return <ChatInterface />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Background effects */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-glow opacity-20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-glow opacity-15 rounded-full blur-3xl animate-float delay-1000" />
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Hero section */}
        <Hero />

        {/* Main cards */}
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-8 mt-16">
          <UploadCard />
          <GitHubCard />
        </div>

        {/* SEO landing page copy — real indexable content */}
        <SEOContent />
      </div>

      {/* Demo button */}
      <div className="fixed bottom-4 right-4 z-40">
        <button
          onClick={handleDemoChat}
          className="bg-gradient-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg hover:opacity-90 transition-opacity text-sm"
          aria-label="Try demo chat"
        >
          Demo Chat →
        </button>
      </div>
    </div>
  );
};

export default Index;
