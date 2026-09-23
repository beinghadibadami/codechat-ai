import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { apiService, SessionInfo, FileTreeNode, SourceType } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

interface SessionContextType {
  sessionInfo: SessionInfo | null;
  fileTree: FileTreeNode[];
  isLoading: boolean;
  hasData: boolean;
  /** Convenience accessors derived from sessionInfo */
  sourceType: SourceType | null;
  repoName: string | null;
  repoUrl: string | null;
  isIndexing: boolean;
  refreshSession: () => Promise<void>;
  resetSession: () => Promise<void>;
  refreshFileTree: () => Promise<void>;
  setHasData: (hasData: boolean) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};

/** How often to re-check session state while an index job is running. */
const INDEXING_POLL_MS = 2500;

export const SessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const { toast } = useToast();

  // Avoids overlapping polls if a refresh is already in flight
  const inFlight = useRef(false);

  const refreshFileTree = useCallback(async () => {
    try {
      const response = await apiService.getFileTree();
      if (response.success) {
        setFileTree(response.tree);
        if (response.tree?.length) setHasData(true);
      } else {
        setFileTree([]);
      }
    } catch (error) {
      console.error('Failed to refresh file tree:', error);
      setFileTree([]);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const info = await apiService.getSessionInfo();
      setSessionInfo(info);
      setHasData(info.has_data);
      if (info.has_data) {
        await refreshFileTree();
      } else {
        setFileTree([]);
      }
    } catch (error) {
      console.error('Failed to refresh session:', error);
      setSessionInfo(null);
      setHasData(false);
      setFileTree([]);
    } finally {
      inFlight.current = false;
      setIsLoading(false);
    }
  }, [refreshFileTree]);

  const resetSession = useCallback(async () => {
    try {
      setIsLoading(true);
      await apiService.resetSession();
      setFileTree([]);
      setHasData(false);
      await refreshSession();
      toast({ title: 'Codebase disconnected' });
    } catch (error) {
      console.error('Failed to reset session:', error);
      toast({
        title: 'Reset failed',
        description: 'Could not disconnect the codebase.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [refreshSession, toast]);

  // Initial load
  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Keep polling while the backend reports an active index job so the
  // status pill and nav unlock without the user refreshing.
  useEffect(() => {
    if (!sessionInfo?.indexing) return;
    const id = window.setInterval(refreshSession, INDEXING_POLL_MS);
    return () => window.clearInterval(id);
  }, [sessionInfo?.indexing, refreshSession]);

  const value: SessionContextType = {
    sessionInfo,
    fileTree,
    isLoading,
    hasData,
    sourceType: sessionInfo?.source_type ?? null,
    repoName: sessionInfo?.repo_name ?? null,
    repoUrl: sessionInfo?.repo_url ?? null,
    isIndexing: sessionInfo?.indexing ?? false,
    refreshSession,
    resetSession,
    refreshFileTree,
    setHasData,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};
