import { useToast } from '@/hooks/use-toast';

// Prefer an env-configured API base (set VITE_API_URL in .env.local for
// local dev against `python main.py` on :8000). Falls back to the deployed
// backend so production builds keep working without extra config.
const API_BASE_URL = import.meta.env.VITE_API_URL || "https://codechat-backend-cb3v.onrender.com";

export type SourceType = 'github' | 'upload';

export interface SessionInfo {
  namespace: string;
  has_data: boolean;
  files_processed: number;
  /** Where the active codebase came from */
  source_type: SourceType | null;
  repo_url: string | null;
  /** "owner/repo" for GitHub, "N local files" for uploads */
  repo_name: string | null;
  /** True while a clone/upload is still being indexed */
  indexing: boolean;
  github_user: string | null;
  features: {
    hosted_embeddings: boolean;
    reranking: boolean;
    dynamic_topk: boolean;
    token_management: boolean;
  };
}

// ---------- Pull requests ----------

export interface PullSummary {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  author: string | null;
  head: string | null;
  base: string | null;
  created_at: string | null;
  updated_at: string | null;
  url: string | null;
}

export interface PullFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  previous_filename: string | null;
  patch: string;
  patch_omitted: boolean;
}

export interface PullComment {
  author: string | null;
  body: string;
  path: string | null;
  line: number | null;
  created_at: string | null;
}

export interface PullDetail extends PullSummary {
  body: string;
  merged: boolean;
  additions: number;
  deletions: number;
  changed_files: number;
  files: PullFile[];
  comments: PullComment[];
  owner: string;
  repo: string;
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

export interface ChatSource {
  file_name: string | null;
  file_path: string | null;
  language: string | null;
  line_start: number | null;
  line_end: number | null;
  score: number | null;
}

export interface ChatResponse {
  success: boolean;
  response: string;
  metadata: {
    chunks_found: number;
    files_involved?: number;
    file_summary?: Record<string, { count: number; language: string }>;
    retrieval_reranked?: boolean;
    /** Retrieved chunks, used to validate and resolve inline citations */
    sources?: ChatSource[];
    /** Present when the question referenced a PR and we attached its diff */
    pull_request?: {
      number: number;
      title: string | null;
      changed_files: number;
      additions: number;
      deletions: number;
      url: string | null;
    };
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

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface QueryRequest {
  message: string;
  history?: ChatHistoryMessage[];
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

  // GitHub upload — optional PAT for private repos.
  // The token is sent once with the upload request and never stored.
  async uploadGitHub(
    repoUrl: string,
    options: {
      token?: string;
      chunkSize?: number;
      chunkOverlap?: number;
    } = {}
  ): Promise<GitHubUploadResponse> {
    const { token, chunkSize = 800, chunkOverlap = 100 } = options;

    const formData = new FormData();
    formData.append('repo_url', repoUrl);
    formData.append('chunk_size', chunkSize.toString());
    formData.append('chunk_overlap', chunkOverlap.toString());
    if (token) {
      formData.append('token', token);
    }

    const url = `${API_BASE_URL}/upload-github`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        // Surface the backend's error message (FastAPI puts it in .detail)
        let detail = `HTTP ${response.status}`;
        try {
          const err = await response.json();
          if (err?.detail) detail = err.detail;
        } catch {
          // Response body wasn't JSON; keep the status-based message
        }
        throw new Error(detail);
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

  // Architecture diagram (Mermaid)
  async getArchitecture(maxNodes: number = 50): Promise<{
    success: boolean;
    mermaid: string;
    nodes: Array<{
      id: string;
      label: string;
      path: string;
      language: string;
      in_degree: number;
      out_degree: number;
    }>;
    edges: Array<{ from: string; to: string }>;
    stats: {
      files_scanned: number;
      internal_edges: number;
      kept_nodes: number;
      kept_edges: number;
      external_deps: Array<{ name: string; count: number }>;
    };
  }> {
    return this.request(`/architecture?max_nodes=${maxNodes}`);
  }

  // Raw file content — used by the citation viewer
  async getFileContent(path: string): Promise<{
    success: boolean;
    file_name: string;
    file_path: string;
    content: string;
    total_lines: number;
    returned_lines: number;
    truncated: boolean;
  }> {
    const q = new URLSearchParams({ path }).toString();
    return this.request(`/file-content?${q}`);
  }

  // ---------- GitHub OAuth ----------

  /**
   * Server-side URL that starts the OAuth flow.
   * The frontend sets window.location to this URL — it can't be fetched,
   * because it responds with a redirect to github.com.
   */
  getGithubLoginUrl(): string {
    return `${API_BASE_URL}/auth/github/login`;
  }

  async getGithubStatus(): Promise<{
    configured: boolean;
    connected: boolean;
    user: string | null;
  }> {
    return this.request('/auth/github/status');
  }

  async githubLogout(): Promise<{ success: boolean; revoked: boolean }> {
    return this.request('/auth/github/logout', { method: 'POST' });
  }

  // ---------- Shareable sessions ----------

  async createShare(payload: {
    repo_url?: string;
    repo_name?: string;
    messages: Array<{
      role: 'user' | 'assistant';
      content: string;
      metadata?: ChatResponse['metadata'];
    }>;
  }): Promise<{ success: boolean; share_id: string }> {
    return this.request('/share/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getShare(shareId: string): Promise<{
    success: boolean;
    id: string;
    repo_url: string | null;
    repo_name: string | null;
    file_tree: FileTreeNode[];
    total_files: number;
    messages: Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      metadata?: ChatResponse['metadata'];
      position: number;
      created_at: string;
    }>;
    view_count: number;
    created_at: string;
  }> {
    return this.request(`/share/${encodeURIComponent(shareId)}`);
  }

  async chatOnShare(
    shareId: string,
    message: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<ChatResponse> {
    return this.request(`/share/${encodeURIComponent(shareId)}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    });
  }

  // ---------- Pull requests ----------

  async listPulls(state: 'open' | 'closed' | 'all' = 'open'): Promise<{
    success: boolean;
    owner: string;
    repo: string;
    state: string;
    authenticated: boolean;
    pulls: PullSummary[];
  }> {
    return this.request(`/pulls?state=${state}`);
  }

  async getPull(number: number): Promise<{ success: boolean } & PullDetail> {
    return this.request(`/pulls/${number}`);
  }

  async resolvePullUrl(url: string): Promise<{
    success: boolean;
    owner: string;
    repo: string;
    number: number;
  }> {
    return this.request('/pulls/resolve', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  async chatAboutPull(
    number: number,
    message: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<ChatResponse> {
    return this.request(`/pulls/${number}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    });
  }

  async reviewPull(number: number): Promise<{
    success: boolean;
    response: string;
    metadata: Record<string, unknown>;
  }> {
    return this.request(`/pulls/${number}/review`, { method: 'POST' });
  }

  // ---------- Streaming chat ----------

  /**
   * Stream a chat response over SSE.
   *
   * Uses fetch + ReadableStream rather than EventSource because EventSource
   * cannot issue POST requests. Calls the supplied handlers as frames arrive.
   * Returns an abort function so the caller can implement a stop button.
   */
  streamChat(
    request: QueryRequest,
    handlers: {
      onMetadata?: (meta: ChatResponse['metadata']) => void;
      onToken?: (text: string) => void;
      onDone?: () => void;
      onError?: (message: string) => void;
    }
  ): () => void {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          handlers.onError?.(`HTTP ${res.status}`);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            for (const line of frame.split('\n')) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                const raw = line.slice(6);
                let payload: Record<string, unknown> = {};
                try {
                  payload = JSON.parse(raw);
                } catch {
                  continue;
                }
                if (currentEvent === 'metadata') {
                  handlers.onMetadata?.(payload as ChatResponse['metadata']);
                } else if (currentEvent === 'token') {
                  handlers.onToken?.(String(payload.text ?? ''));
                } else if (currentEvent === 'done') {
                  handlers.onDone?.();
                } else if (currentEvent === 'error') {
                  handlers.onError?.(String(payload.message ?? 'Stream error'));
                }
              }
            }
          }
        }
        handlers.onDone?.();
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          handlers.onError?.((e as Error).message || 'Stream failed');
        }
      }
    })();

    return () => controller.abort();
  }
}

export const apiService = new ApiService();
