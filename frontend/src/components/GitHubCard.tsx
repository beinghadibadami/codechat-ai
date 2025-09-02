import React, { useState, useEffect } from 'react';
import { Github, AlertCircle, CheckCircle, ExternalLink, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { apiService } from '@/services/api';
import { useSession } from '@/contexts/SessionContext';


type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid' | 'processing';

interface ProcessingStep {
  name: string;
  status: 'pending' | 'active' | 'complete' | 'error';
}

export const GitHubCard = () => {
  const [url, setUrl] = useState('');
  const [validationState, setValidationState] = useState<ValidationState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([
    { name: 'Cloning repository', status: 'pending' },
    { name: 'Reading files', status: 'pending' },
    { name: 'Processing code', status: 'pending' },
    { name: 'Building context', status: 'pending' }
  ]);
  const { toast } = useToast();
  const { setHasData, refreshFileTree } = useSession();

  const validateGitHubUrl = (inputUrl: string): { isValid: boolean; error?: string } => {
    if (!inputUrl.trim()) {
      return { isValid: false, error: 'Please enter a GitHub URL' };
    }

    const githubUrlPattern = /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+))?(?:\/.*)?$/;
    const match = inputUrl.match(githubUrlPattern);

    if (!match) {
      return { 
        isValid: false, 
        error: 'Please enter a valid GitHub repository URL (e.g., https://github.com/owner/repo)' 
      };
    }

    const [, owner, repo, branch] = match;

    // Check for invalid URL patterns
    if (inputUrl.includes('/blob/') || inputUrl.includes('/issues') || 
        inputUrl.includes('/pull/') || inputUrl.includes('/wiki') || 
        inputUrl.includes('/releases')) {
      return { 
        isValid: false, 
        error: 'Please use the main repository URL, not a specific file or section link' 
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

    const timeoutId = setTimeout(() => {
      setValidationState('validating');
      
      // Simulate validation delay
      setTimeout(() => {
        const validation = validateGitHubUrl(url);
        if (validation.isValid) {
          setValidationState('valid');
          setErrorMessage('');
        } else {
          setValidationState('invalid');
          setErrorMessage(validation.error || '');
        }
      }, 500);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [url]);

  const processRepository = async () => {
    setIsProcessing(true);
    setValidationState('processing');
    
    try {
      // Reset all steps to pending
      setProcessingSteps(steps => 
        steps.map(step => ({ ...step, status: 'pending' as const }))
      );

      // Step 1: Cloning repository
      setProcessingSteps(prev => 
        prev.map((step, index) => ({
          ...step,
          status: index === 0 ? 'active' as const : 'pending' as const
        }))
      );

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 2: Reading files
      setProcessingSteps(prev => 
        prev.map((step, index) => ({
          ...step,
          status: index <= 1 ? (index === 1 ? 'active' as const : 'complete' as const) : 'pending' as const
        }))
      );

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 3: Processing code
      setProcessingSteps(prev => 
        prev.map((step, index) => ({
          ...step,
          status: index <= 2 ? (index === 2 ? 'active' as const : 'complete' as const) : 'pending' as const
        }))
      );

      // Upload to backend
      const response = await apiService.uploadGitHub(url);

      if (response.success) {
        // Step 4: Building context
        setProcessingSteps(prev => 
          prev.map((step, index) => ({
            ...step,
            status: index <= 3 ? 'complete' as const : step.status
          }))
        );

        console.log('GitHub upload successful, setting hasData to true');
        setHasData(true);
        console.log('Refreshing file tree...');
        await refreshFileTree();

        toast({
          title: "Repository analyzed",
          description: response.message,
        });
      } else {
        throw new Error(response.message || 'Failed to process repository');
      }
    } catch (error) {
      console.error('Repository processing failed:', error);
      
      // Mark current step as error
      const currentStepIndex = processingSteps.findIndex(step => step.status === 'active');
      if (currentStepIndex !== -1) {
        setProcessingSteps(prev => 
          prev.map((step, index) => ({
            ...step,
            status: index === currentStepIndex ? 'error' as const : step.status
          }))
        );
      }

      toast({
        title: "Processing failed",
        description: error instanceof Error ? error.message : 'Failed to process repository',
        variant: "destructive"
      });
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
          Enter a GitHub repository URL to analyze the codebase
        </p>
      </div>

      {/* URL Input */}
      <div className="space-y-3">
        <div className="relative">
          <Input
            type="url"
            placeholder="https://github.com/owner/repository"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={`${getInputBorderColor()} pr-10`}
            disabled={isProcessing}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {validationState === 'validating' && (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
            {validationState === 'valid' && (
              <CheckCircle className="w-4 h-4 text-success" />
            )}
            {validationState === 'invalid' && (
              <AlertCircle className="w-4 h-4 text-destructive" />
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <div className="text-sm text-destructive">
              <p>{errorMessage}</p>
              {errorMessage.includes('specific file') && (
                <p className="mt-1 text-xs opacity-80">
                  Example: https://github.com/facebook/react
                </p>
              )}
            </div>
          </div>
        )}

        {validationState === 'valid' && !isProcessing && (
          <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-lg">
            <CheckCircle className="w-4 h-4 text-success" />
            <span className="text-sm text-success">Valid repository URL</span>
          </div>
        )}
      </div>

      {/* Processing Steps */}
      {isProcessing && (
        <div className="space-y-4">
          <div className="text-center">
            <h4 className="font-medium mb-2">Processing Repository</h4>
            <Progress 
              value={(processingSteps.filter(s => s.status === 'complete').length / processingSteps.length) * 100} 
              className="w-full"
            />
          </div>
          
          <div className="space-y-2">
            {processingSteps.map((step, index) => (
              <div key={index} className="flex items-center gap-3 p-2">
                {getStatusIcon(step.status)}
                <span className={`text-sm ${
                  step.status === 'complete' ? 'text-success' :
                  step.status === 'active' ? 'text-primary' :
                  step.status === 'error' ? 'text-destructive' :
                  'text-muted-foreground'
                }`}>
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

      {/* Helper Information */}
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Supports public repositories and private repos with access</p>
          <p>• Branch-specific URLs supported (e.g., /tree/main)</p>
          <p>• Analysis includes all code files in the repository</p>
        </div>

        {url && validationState === 'invalid' && errorMessage.includes('private') && (
          <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg">
            <Info className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-warning">Private Repository?</p>
              <p className="text-muted-foreground mt-1">
                For private repositories, you'll need to provide a Personal Access Token (PAT) 
                with repository access.
              </p>
              <Button variant="outline" size="sm" className="mt-2">
                <ExternalLink className="w-3 h-3 mr-1" />
                Learn about PATs
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};