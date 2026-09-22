import React, { useState, useEffect } from 'react';
import {
  Github,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Info,
  Lock,
  Eye,
  EyeOff,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { apiService } from '@/services/api';
import { useSession } from '@/contexts/SessionContext';
import { useGithubAuth } from '@/hooks/useGithubAuth';

type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid' | 'processing';

interface ProcessingStep {
  name: string;
  status: 'pending' | 'active' | 'complete' | 'error';
}

export const GitHubCard = () => {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showTokenField, setShowTokenField] = useState(false);
  const [validationState, setValidationState] = useState<ValidationState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([
    { name: 'Cloning repository', status: 'pending' },
    { name: 'Reading files', status: 'pending' },
    { name: 'Processing code', status: 'pending' },
    { name: 'Building context', status: 'pending' },
  ]);
  const { toast } = useToast();
  const { setHasData, refreshFileTree } = useSession();
  const github = useGithubAuth();

  // Surface OAuth flash messages from useGithubAuth via toast
  useEffect(() => {
    if (!github.flash) return;
    toast({
      title: github.flash.type === 'success' ? 'GitHub' : 'GitHub error',
      description: github.flash.message,
      variant: github.flash.type === 'success' ? undefined : 'destructive',
    });
    github.dismissFlash();
  }, [github.flash, toast, github]);

  const validateGitHubUrl = (inputUrl: string): { isValid: boolean; error?: string } => {
    if (!inputUrl.trim()) {
      return { isValid: false, error: 'Please enter a GitHub URL' };
    }

    const githubUrlPattern = /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+))?(?:\/.*)?$/;
    const match = inputUrl.match(githubUrlPattern);

    if (!match) {
      return {
        isValid: false,
        error: 'Please enter a valid GitHub repository URL (e.g., https://github.com/owner/repo)',
      };
    }

    if (
      inputUrl.includes('/blob/') ||
      inputUrl.includes('/issues') ||
      inputUrl.includes('/pull/') ||
      inputUrl.includes('/wiki') ||
      inputUrl.includes('/releases')
    ) {
      return {
        isValid: false,
        error: 'Please use the main repository URL, not a specific file or section link',
      };
    }

    return { isValid: true };
  };

  useEffect(() => {
    if (!url) {
      setValidationState('idle');
      setErrorMessage('');
      return;
    }

    const debounce = setTimeout(() => {
      setValidationState('validating');
      setTimeout(() => {
        const validation = validateGitHubUrl(url);
        if (validation.isValid) {
          setValidationState('valid');
          setErrorMessage('');
        } else {
          setValidationState('invalid');
          setErrorMessage(validation.error || '');
        }
      }, 300);
    }, 250);

    return () => clearTimeout(debounce);
  }, [url]);

  const setStepStatus = (index: number, status: ProcessingStep['status']) => {
    setProcessingSteps(prev =>
      prev.map((step, i) => (i === index ? { ...step, status } : step))
    );
  };

  const processRepository = async () => {
    setIsProcessing(true);
    setValidationState('processing');
    setProcessingSteps(steps => steps.map(step => ({ ...step, status: 'pending' as const })));

    try {
      setStepStatus(0, 'active');
      await new Promise(r => setTimeout(r, 400));
      setStepStatus(0, 'complete');
      setStepStatus(1, 'active');

      // Send explicit PAT only if OAuth isn't connected and user typed one.
      // If OAuth is connected, the backend will use the session token.
      const sendToken = !github.connected && token.trim() ? token.trim() : undefined;

      const response = await apiService.uploadGitHub(url, { token: sendToken });

      setStepStatus(1, 'complete');
      setStepStatus(2, 'complete');
      setStepStatus(3, 'active');

      if (response.success) {
        setStepStatus(3, 'complete');
        setHasData(true);
        await refreshFileTree();

        // Only clear the manual PAT — leave OAuth session alone
        setToken('');

        toast({ title: 'Repository analyzed', description: response.message });
      } else {
        throw new Error(response.message || 'Failed to process repository');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process repository';

      setProcessingSteps(prev => {
        const activeIdx = prev.findIndex(s => s.status === 'active');
        if (activeIdx === -1) return prev;
        return prev.map((s, i) => (i === activeIdx ? { ...s, status: 'error' as const } : s));
      });

      if (/auth|token|private|not found/i.test(message) && !github.connected) {
        setShowTokenField(true);
      }

      toast({ title: 'Processing failed', description: message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      case 'active':
        return <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />;
      default:
        return <div className="w-4 h-4 border-2 border-muted rounded-full" />;
    }
  };

  const getInputBorderColor = () => {
    switch (validationState) {
      case 'valid':
        return 'border-success focus-visible:ring-success';
      case 'invalid':
        return 'border-destructive focus-visible:ring-destructive';
      case 'validating':
        return 'border-primary focus-visible:ring-primary';
      default:
        return '';
    }
  };

  return (
    <div className="glass rounded-2xl p-8 space-y-6 glow-on-hover interactive">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Github className="w-6 h-6" />
          <h3 className="text-2xl font-bold">GitHub Repository</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="w-4 h-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Analyze code directly from your GitHub repository</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-muted-foreground">
          Paste a public repo URL, or connect GitHub for private repos
        </p>
      </div>

      {/* GitHub OAuth status bar */}
      {github.configured && (
        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background-elevated/50">
          {github.connected ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-success" />
                <span>
                  Connected as{' '}
                  <span className="font-mono text-foreground">
                    @{github.user || 'unknown'}
                  </span>
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={github.disconnect}
                className="text-xs"
                aria-label="Disconnect GitHub"
              >
                <LogOut className="w-3 h-3 mr-1" />
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="w-4 h-4" />
                <span>For private repos, connect your GitHub account</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={github.connect}
                disabled={github.loading}
              >
                <Github className="w-3 h-3 mr-1" />
                Connect
              </Button>
            </>
          )}
        </div>
      )}

      {/* URL Input */}
      <div className="space-y-3">
        <div className="relative">
          <Input
            type="url"
            placeholder="https://github.com/owner/repository"
            value={url}
            onChange={e => setUrl(e.target.value)}
            className={`${getInputBorderColor()} pr-10`}
            disabled={isProcessing}
            aria-label="GitHub repository URL"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {validationState === 'validating' && (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
            {validationState === 'valid' && <CheckCircle className="w-4 h-4 text-success" />}
            {validationState === 'invalid' && <AlertCircle className="w-4 h-4 text-destructive" />}
          </div>
        </div>

        {errorMessage && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <div className="text-sm text-destructive">
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        {/* PAT fallback — only when OAuth isn't connected */}
        {!isProcessing && !github.connected && (
          <button
            type="button"
            onClick={() => setShowTokenField(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Lock className="w-3 h-3" />
            {showTokenField ? 'Hide token field' : 'Or paste a Personal Access Token'}
          </button>
        )}

        {showTokenField && !github.connected && (
          <div className="space-y-2 animate-fade-in-up">
            <div className="relative">
              <Input
                type={showToken ? 'text' : 'password'}
                placeholder="ghp_... (Personal Access Token)"
                value={token}
                onChange={e => setToken(e.target.value)}
                className="pr-10 font-mono text-sm"
                disabled={isProcessing}
                autoComplete="off"
                spellCheck={false}
                aria-label="GitHub Personal Access Token"
              />
              <button
                type="button"
                onClick={() => setShowToken(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showToken ? 'Hide token' : 'Show token'}
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Needs <code className="text-foreground">repo</code> scope. Used once, never stored.{' '}
              <a
                href="https://github.com/settings/tokens/new?scopes=repo&description=CodeChat%20AI"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                Create one <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>
        )}
      </div>

      {/* Processing Steps */}
      {isProcessing && (
        <div className="space-y-4">
          <div className="text-center">
            <h4 className="font-medium mb-2">Processing Repository</h4>
            <Progress
              value={
                (processingSteps.filter(s => s.status === 'complete').length /
                  processingSteps.length) *
                100
              }
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            {processingSteps.map((step, index) => (
              <div key={index} className="flex items-center gap-3 p-2">
                {getStatusIcon(step.status)}
                <span
                  className={`text-sm ${
                    step.status === 'complete'
                      ? 'text-success'
                      : step.status === 'active'
                      ? 'text-primary'
                      : step.status === 'error'
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                  }`}
                >
                  {step.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Button */}
      <Button
        className="w-full bg-gradient-primary hover:opacity-90 interactive"
        disabled={validationState !== 'valid' || isProcessing}
        onClick={processRepository}
      >
        {isProcessing ? 'Processing Repository...' : 'Analyze Repository'}
      </Button>

      {/* Helper info */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>• Public repos work out of the box</p>
        <p>
          • Private repos: {github.configured ? 'Connect GitHub above' : 'PAT support (OAuth not configured)'}
        </p>
        <p>• Shallow clone (latest commit only) for fast processing</p>
      </div>
    </div>
  );
};
