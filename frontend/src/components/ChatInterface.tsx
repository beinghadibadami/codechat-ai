import React, { useState, useRef, useEffect } from 'react';
import { Send, Copy, Menu, X, MessageSquare, RotateCcw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ActionChips } from './ActionChips';
import { FileTree } from './FileTree';
import { MessageFormatter } from './MessageFormatter';
import { useToast } from '@/hooks/use-toast';
import { apiService, QueryRequest } from '@/services/api';
import { useSession } from '@/contexts/SessionContext';


interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  codeBlocks?: { language: string; code: string }[];
  metadata?: {
    chunks_found: number;
    files_involved: number;
    file_summary: Record<string, { count: number; language: string }>;
    retrieval_reranked: boolean;
  };
}

interface ActionChip {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
}

export const ChatInterface = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const { sessionInfo, hasData, resetSession } = useSession();
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getDemoResponse = (message: string): string => {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('architecture') || lowerMessage.includes('structure')) {
      return `## Architecture Overview

This React TypeScript app follows a modern, scalable architecture:

### Frontend Structure
- **Components**: Modular React components with TypeScript
- **State Management**: Zustand for global state
- **Styling**: Tailwind CSS for responsive design
- **Build**: Vite for fast development and optimized builds

### Key Features
- **Type Safety**: Full TypeScript implementation
- **Performance**: Code splitting and lazy loading
- **Testing**: Jest + React Testing Library
- **Development**: Hot module replacement with Vite

Here's a sample component structure:

\`\`\`typescript
// Example component
interface Props {
  title: string;
  children: React.ReactNode;
}

export const Card: React.FC<Props> = ({ title, children }) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold mb-4">{title}</h2>
      {children}
    </div>
  );
};
\`\`\`

The app uses a component-based architecture with clear separation of concerns.`;
    }
    
    if (lowerMessage.includes('bug') || lowerMessage.includes('issue')) {
      return `## Potential Issues Found

I've identified a few areas that could be improved:

### Code Quality Issues
- **Missing Error Boundaries**: Consider adding error boundaries for better error handling
- **Unused Imports**: Some components have unused imports that should be cleaned up
- **Type Safety**: A few types could be replaced with proper TypeScript interfaces

### Performance Considerations
- **Bundle Size**: Consider code splitting for larger components
- **Re-renders**: Some components might benefit from React.memo optimization

### Security Notes
- **API Keys**: Ensure environment variables are properly configured
- **Input Validation**: Add client-side validation for user inputs

Here's an example of how to fix a common issue:

\`\`\`typescript
// Before: Missing error boundary
const App = () => {
  return <SomeComponent />;
};

// After: With error boundary
const App = () => {
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <SomeComponent />
    </ErrorBoundary>
  );
};
\`\`\`

These are common issues in React applications and can be addressed incrementally.`;
    }
    
    if (lowerMessage.includes('improve') || lowerMessage.includes('better')) {
      return `## Improvement Suggestions

Here are some recommendations to enhance your codebase:

### Code Organization
- **Folder Structure**: Consider organizing components by feature rather than type
- **Custom Hooks**: Extract reusable logic into custom hooks
- **Constants**: Move magic numbers and strings to constants files

### Performance Optimizations
- **Lazy Loading**: Implement route-based code splitting
- **Memoization**: Use React.memo for expensive components
- **Bundle Analysis**: Regular bundle size monitoring

### Developer Experience
- **ESLint Rules**: Add stricter linting rules
- **Pre-commit Hooks**: Implement automated code quality checks
- **Documentation**: Add JSDoc comments for complex functions

### Testing Strategy
- **Unit Tests**: Increase test coverage for utility functions
- **Integration Tests**: Add tests for component interactions
- **E2E Tests**: Consider adding end-to-end testing

These improvements will make your codebase more maintainable and scalable.`;
    }
    
    // Handle file explanation requests
    if (lowerMessage.includes('explain') && lowerMessage.includes('file')) {
      const fileMatch = message.match(/file:\s*(.+)/i);
      const fileName = fileMatch ? fileMatch[1] : 'the requested file';
      
      return `## File Explanation: ${fileName}

Here's a detailed analysis of \`${fileName}\`:

### Overview
This file appears to be part of a well-structured codebase with clear separation of concerns.

### Key Components
- **Main Functions**: Core functionality is implemented through well-defined functions
- **Error Handling**: Proper error handling mechanisms are in place
- **Code Organization**: Clean structure with logical grouping of related functionality

### Code Quality
- **Readability**: Code is well-commented and follows consistent naming conventions
- **Maintainability**: Functions are appropriately sized and focused
- **Performance**: Efficient algorithms and data structures are used

### Example Code Structure:
\`\`\`typescript
// Example of what the file might contain
export class FileHandler {
  private config: Config;
  
  constructor(config: Config) {
    this.config = config;
  }
  
  async processFile(path: string): Promise<Result> {
    try {
      // File processing logic
      return await this.executeProcessing(path);
    } catch (error) {
      throw new ProcessingError(\`Failed to process \${path}\`, error);
    }
  }
}
\`\`\`

### Recommendations
- Consider adding more comprehensive error handling
- Unit tests would improve code reliability
- Documentation could be enhanced with more examples

*This is a demo response. Upload your actual code to get real file analysis!*`;
    }
    
    // Default response for other questions
    return `"${message}". 

In a real analysis of your codebase, I would:

1. **Analyze the specific code** related to your question
2. **Provide detailed explanations** with code examples
3. **Suggest improvements** based on best practices
4. **Identify potential issues** and how to fix them

Since this is demo mode, I'm showing you how I would respond to real questions about your code. Upload your actual code repository to get personalized analysis and recommendations!

Try asking about:
- Specific functions or components
- Code patterns and architecture
- Performance optimizations
- Security considerations
- Testing strategies`;
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Math.random().toString(36).substring(7),
      type: 'user',
      content: currentMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const messageToSend = currentMessage;
    setCurrentMessage('');
    setIsLoading(true);

    try {
      if (isDemoMode) {
        // In demo mode, use demo responses
        const demoResponse = getDemoResponse(messageToSend);
        const assistantMessage: Message = {
          id: Math.random().toString(36).substring(7),
          type: 'assistant',
          content: demoResponse,
          timestamp: new Date()
        };
        
        setTimeout(() => {
          setMessages(prev => [...prev, assistantMessage]);
          setIsLoading(false);
        }, 1000); // Simulate AI thinking time
        return;
      }

      // Real API call for actual data
      if (!hasData) {
        throw new Error('No code repository loaded');
      }

      const request: QueryRequest = {
        message: messageToSend
      };

      console.log('Sending chat request:', request);
      const response = await apiService.chat(request);
      console.log('Chat response received:', response);

      if (response.success) {
        const assistantMessage: Message = {
          id: Math.random().toString(36).substring(7),
          type: 'assistant',
          content: response.response,
          timestamp: new Date(),
          metadata: response.metadata
        };
        
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error(response.response || 'Chat request failed');
      }
    } catch (error) {
      console.error('Chat failed:', error);
      
      const errorMessage: Message = {
        id: Math.random().toString(36).substring(7),
        type: 'assistant',
        content: "I'm sorry, I encountered an error while processing your request. Please try again or check if your code repository is properly loaded.",
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: "Chat Error",
        description: "Failed to get response from AI",
        variant: "destructive"
      });
    } finally {
      if (!isDemoMode) {
        setIsLoading(false);
      }
    }
  };

  const handleUploadAgain = async () => {
    try {
      await resetSession();
      // Redirect to home page
      window.location.href = '/';
    } catch (error) {
      console.error('Failed to reset session:', error);
      toast({
        title: "Reset Error",
        description: "Failed to reset session",
        variant: "destructive"
      });
    }
  };

  const handleExplainFile = async (filePath: string) => {
    const explainMessage = `Please explain the file: ${filePath}`;
    
    // Add user message to chat
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: explainMessage,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    
    try {
      if (isDemoMode) {
        const demoResponse = getDemoResponse(explainMessage);
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: demoResponse,
          timestamp: new Date(),
        };
        setTimeout(() => {
          setMessages(prev => [...prev, assistantMessage]);
          setIsLoading(false);
        }, 1000);
        return;
      }
      
      // Use the dedicated explain-file endpoint
      const response = await apiService.explainFile(filePath);
      
      if (response.success) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: response.response,
          timestamp: new Date(),
          metadata: {
            chunks_found: response.metadata.chunks_used || 0,
            files_involved: 1,
            file_summary: { [response.metadata.file_name]: { count: 1, language: 'unknown' } },
            retrieval_reranked: false
          }
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error(response.response || 'Failed to explain file');
      }
    } catch (error) {
      console.error('File explanation failed:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'Sorry, I encountered an error while explaining the file. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      toast({ title: "File Explanation Error", description: "Failed to explain file", variant: "destructive" });
    } finally {
      if (!isDemoMode) {
        setIsLoading(false);
      }
    }
  };

  // Add welcome message when component mounts and has data
  useEffect(() => {
    // Check if we're in demo mode (no actual data but user wants to see demo)
    if (!hasData && messages.length === 0) {
      setIsDemoMode(true);
      const demoMessage: Message = {
        id: 'demo-welcome',
        type: 'assistant',
        content: `👋 Welcome to CodeChat AI Demo!

This is a demonstration of how I can help you analyze and understand code repositories. In this demo mode, I'll show you sample conversations about a fictional React TypeScript project.

## What I Can Do:
- **Code Analysis**: Review code structure and identify patterns
- **Bug Detection**: Find potential issues and suggest fixes
- **Architecture Review**: Analyze design patterns and suggest improvements
- **Documentation**: Help explain complex code sections
- **Best Practices**: Suggest modern development practices

## Demo Project: React TypeScript App
- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **State Management**: Zustand
- **Build Tool**: Vite
- **Testing**: Jest + React Testing Library

Try asking me questions like:
- "What's the main architecture of this app?"
- "Can you find any potential bugs?"
- "How would you improve this codebase?"
- "Explain the authentication flow"

Note: This is demo data. Upload your own code to get real analysis!`,
        timestamp: new Date()
      };
      setMessages([demoMessage]);
    } else if (hasData && messages.length === 0 && sessionInfo) {
      setIsDemoMode(false);
      const welcomeMessage: Message = {
        id: 'welcome',
        type: 'assistant',
        content: `Hello! I've analyzed your code files:

You can ask me to analyze specific aspects, find bugs, suggest improvements, or explain any part of your codebase. What would you like to explore?`,
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  }, [hasData, sessionInfo, messages.length]);

  const handleActionChipSelect = (action: ActionChip) => {
    const actionPrompts = {
      'summarize': 'Please provide a comprehensive summary of this codebase.',
      'tech-stack': 'What technologies and frameworks are used in this project?',
      'find-bugs': 'Can you identify any potential bugs or issues in the code?',
      'analysis': 'Perform a detailed code analysis with metrics and insights.',
      'improvements': 'What improvements would you suggest for this codebase?'
    };

    const prompt = actionPrompts[action.id as keyof typeof actionPrompts];
    setCurrentMessage(prompt);
    
    // Auto-send the message
    setTimeout(() => {
      handleSendMessage();
    }, 100);
  };

  const copyCodeBlock = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: "Code copied",
      description: "Code block copied to clipboard",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  const renderMessage = (message: Message) => {
    const isUser = message.type === 'user';
    
    return (
      <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
        <div className={`message-bubble max-w-[80%] ${isUser ? 'user' : 'assistant'}`}>
          {isUser ? (
            <div className="text-gray-100 whitespace-pre-wrap break-words">
              {message.content}
            </div>
          ) : (
            <MessageFormatter content={message.content} />
          )}
          
          {message.codeBlocks?.map((block, index) => (
            <div key={index} className="code-block mt-4 relative group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  {block.language}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyCodeBlock(block.code)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <pre className="text-code overflow-x-auto">
                <code>{block.code}</code>
              </pre>
            </div>
          ))}
          
          <div className="text-xs text-muted-foreground mt-2 opacity-70">
            {formatTimestamp(message.timestamp)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <div className={`
        fixed lg:relative z-50 h-full w-80 bg-background-elevated border-r border-border
        transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center justify-between p-4 border-b border-border lg:hidden">
          <h2 className="font-semibold">Navigation</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        <FileTree onExplainFile={handleExplainFile} />
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-background-elevated/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden"
            >
              <Menu className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUploadAgain}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Upload Again
            </Button>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              <h1 className="font-semibold">CodeChat AI</h1>
            </div>
          </div>
          

        </div>

        {/* Action chips */}
        <div className="p-4 border-b border-border bg-background-elevated/30">
          <ActionChips onActionSelect={handleActionChipSelect} disabled={isLoading} />
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-6 max-w-4xl mx-auto">
            {messages.map(renderMessage)}
            
            {isLoading && (
              <div className="flex justify-start animate-fade-in-up">
                <div className="message-bubble assistant">
                  <div className="flex items-center gap-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-100" />
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-200" />
                    </div>
                    <span className="text-sm text-muted-foreground">Analyzing...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input area */}
        <div className="p-4 border-t border-border bg-background-elevated/50 backdrop-blur-sm">
          <div className="flex gap-2 max-w-4xl mx-auto">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your code... (Ctrl+Enter to send)"
                className="min-h-[44px] max-h-32 resize-none pr-12 focus-ring"
                disabled={isLoading}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!currentMessage.trim() || isLoading}
                className="absolute right-2 top-2 h-8 w-8 p-0 bg-gradient-primary hover:opacity-90 interactive"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};