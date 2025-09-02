import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiService, SessionInfo, FileTreeResponse, FileTreeNode } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

interface SessionContextType {
  sessionInfo: SessionInfo | null;
  fileTree: FileTreeNode[];
  isLoading: boolean;
  hasData: boolean;
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

interface SessionProviderProps {
  children: ReactNode;
}

export const SessionProvider: React.FC<SessionProviderProps> = ({ children }) => {
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const { toast } = useToast();

  const refreshSession = async () => {
    try {
      console.log('Refreshing session...');
      const info = await apiService.getSessionInfo();
      console.log('Session info received:', info);
      setSessionInfo(info);
      setHasData(info.has_data);
      
      // If session has data, also refresh the file tree to ensure consistency
      if (info.has_data) {
        console.log('Session has data, refreshing file tree...');
        await refreshFileTree();
      } else {
        console.log('Session has no data, clearing file tree');
        setFileTree([]);
      }
    } catch (error) {
      console.error('Failed to refresh session:', error);
      setSessionInfo(null);
      setHasData(false);
      setFileTree([]);
      toast({
        title: "Session Error",
        description: "Failed to get session information",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetSession = async () => {
    try {
      setIsLoading(true);
      await apiService.resetSession();
      await refreshSession();
      setFileTree([]);
      setHasData(false);
      toast({
        title: "Session Reset",
        description: "Session has been reset successfully",
      });
    } catch (error) {
      console.error('Failed to reset session:', error);
      toast({
        title: "Reset Error",
        description: "Failed to reset session",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const refreshFileTree = async () => {
    try {
      console.log('Refreshing file tree...');
      const response = await apiService.getFileTree();
      console.log('File tree response:', response);
      if (response.success) {
        setFileTree(response.tree);
        // If we get a successful response with files, ensure hasData is true
        if (response.tree && response.tree.length > 0) {
          console.log('Setting hasData to true, found files:', response.tree.length);
          setHasData(true);
        }
      } else {
        setFileTree([]);
        if (response.message !== "No files uploaded yet") {
          toast({
            title: "File Tree Error",
            description: response.message || "Failed to load file tree",
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      console.error('Failed to refresh file tree:', error);
      setFileTree([]);
      toast({
        title: "File Tree Error",
        description: "Failed to load file tree",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  // Remove this useEffect as we now call refreshFileTree directly from refreshSession
  // useEffect(() => {
  //   if (hasData) {
  //     refreshFileTree();
  //   }
  // }, [hasData]);

  const value: SessionContextType = {
    sessionInfo,
    fileTree,
    isLoading,
    hasData,
    refreshSession,
    resetSession,
    refreshFileTree,
    setHasData,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};
