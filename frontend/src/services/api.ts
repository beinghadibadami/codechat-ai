import { useToast } from '@/hooks/use-toast';

// Prefer env-configured API base in production builds
const API_BASE_URL = "https://codechat-backend-cb3v.onrender.com" ;

export interface SessionInfo {
  namespace: string;
  has_data: boolean;
  files_processed: number;
  features: {
    hosted_embeddings: boolean;
    reranking: boolean;
    dynamic_topk: boolean;
    token_management: boolean;
  };
}

export interface FileTreeResponse {
  success: boolean;
  tree: FileTreeNode[];
  root_path?: string;
  total_files?: number;
  message?: string;
  error?: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children?: FileTreeNode[];
}

export interface UploadResponse {
  success: boolean;
  message: string;
  namespace: string;
  config: {
    chunk_size: number;
    chunk_overlap: number;
  };
}

export interface GitHubUploadResponse {
  success: boolean;
  message: string;
  namespace: string;
}

export interface ChatResponse {
  success: boolean;
  response: string;
  metadata: {
    chunks_found: number;
    files_involved: number;
    file_summary: Record<string, { count: number; language: string }>;
    retrieval_reranked: boolean;
  };
}

export interface FileExplanationResponse {
  success: boolean;
  response: string;
  metadata: {
    source: string;
    file_name: string;
    chunks_used?: number;
    file_size_kb?: number;
    was_truncated?: boolean;
    method: string;
  };
}

export interface QueryRequest {
  message: string;
  max_tokens?: number;
}

export interface ConfigRequest {
  chunk_size?: number;
  chunk_overlap?: number;
}

class ApiService {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  // Health check
  async healthCheck() {
    return this.request<{ status: string; message: string; features: string[] }>('/');
  }

  // Session management
  async resetSession(): Promise<{ success: boolean; message: string; namespace: string }> {
    return this.request('/reset-session', { method: 'POST' });
  }

  async getSessionInfo(): Promise<SessionInfo> {
    return this.request('/session-info');
  }

  // File tree
  async getFileTree(): Promise<FileTreeResponse> {
    return this.request('/file-tree');
  }

  // File upload
  async uploadFiles(
    files: File[],
    config?: ConfigRequest
  ): Promise<UploadResponse> {
    const formData = new FormData();
    
    files.forEach(file => {
      formData.append('files', file);
    });

    if (config) {
      formData.append('config', JSON.stringify(config));
    }

    const url = `${API_BASE_URL}/upload-file`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('File upload failed:', error);
      throw error;
    }
  }

  // GitHub upload
  async uploadGitHub(
    repoUrl: string,
    chunkSize: number = 800,
    chunkOverlap: number = 100
  ): Promise<GitHubUploadResponse> {
    const formData = new FormData();
    formData.append('repo_url', repoUrl);
    formData.append('chunk_size', chunkSize.toString());
    formData.append('chunk_overlap', chunkOverlap.toString());

    const url = `${API_BASE_URL}/upload-github`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('GitHub upload failed:', error);
      throw error;
    }
  }
  // Chat
  async chat(request: QueryRequest): Promise<ChatResponse> {
    return this.request('/chat', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // File explanation
  async explainFile(filePath: string): Promise<FileExplanationResponse> {
    return this.request('/explain-file', {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath }),
    });
  }
}

export const apiService = new ApiService();
