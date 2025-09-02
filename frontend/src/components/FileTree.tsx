import React, { useState } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  File, 
  Folder, 
  FolderOpen,
  FileJson,
  FileText,
  Settings,
  Image,
  FileCode,
  Database,
  Globe,
  Package,
  GitBranch,
  Terminal,
  Palette,
  FileImage,
  Play,
  MessageSquare,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSession } from '@/contexts/SessionContext';
import { apiService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';


interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileNode[];
  size?: number;
  language?: string;
}



// Convert API file tree to internal format
const convertApiTreeToFileNodes = (apiTree: any[]): FileNode[] => {
  const convertNode = (node: any, id: string): FileNode => ({
    id,
    name: node.name,
    type: node.type,
    path: node.path,
    children: node.children ? node.children.map((child: any, index: number) => 
      convertNode(child, `${id}-${index}`)
    ) : undefined,
    language: node.type === 'file' ? getFileLanguage(node.name) : undefined
  });

  return apiTree.map((node, index) => convertNode(node, index.toString()));
};

const getFileLanguage = (fileName: string): string => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'jsx': 'javascript',
    'tsx': 'typescript',
    'py': 'python',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'cs': 'csharp',
    'php': 'php',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'md': 'markdown',
    'txt': 'text'
  };
  return languageMap[extension || ''] || 'text';
};

interface FileTreeProps {
  onFileSelect?: (file: FileNode) => void;
  selectedFileId?: string;
  onExplainFile?: (filePath: string) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({ onFileSelect, selectedFileId, onExplainFile }) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const { fileTree, hasData, isLoading } = useSession();
  const { toast } = useToast();

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(folderId)) {
        newExpanded.delete(folderId);
      } else {
        newExpanded.add(folderId);
      }
      return newExpanded;
    });
  };

  const handleFileClick = (file: FileNode) => {
    if (file.type === 'file' && onFileSelect) {
      onFileSelect(file);
    }
  };

  const handleExplainFile = (file: FileNode) => {
    if (file.type !== 'file') return;
    
    if (onExplainFile) {
      onExplainFile(file.path);
    } else {
      // Fallback to old behavior if no callback provided
      toast({
        title: "Feature Unavailable",
        description: "File explanation is not available in this context",
        variant: "destructive"
      });
    }
  };

  const getFileIcon = (file: FileNode) => {
    if (file.type === 'folder') {
      return expandedFolders.has(file.id) ? FolderOpen : Folder;
    }

    // Extract file extension
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    // Map extensions to specific icons
    const iconMap: Record<string, any> = {
      // JavaScript/TypeScript
      'js': FileCode,
      'jsx': FileCode,
      'ts': FileCode,
      'tsx': FileCode,
      'mjs': FileCode,
      'cjs': FileCode,
      
      // Python
      'py': Terminal,
      'pyx': Terminal,
      'pyc': Terminal,
      'pyo': Terminal,
      'pyw': Terminal,
      'pyz': Terminal,
      
      // Web files
      'html': Globe,
      'htm': Globe,
      'css': Palette,
      'scss': Palette,
      'sass': Palette,
      'less': Palette,
      'xml': FileCode,
      'svg': FileImage,
      
      // Config/Data files
      'json': FileJson,
      'yaml': Settings,
      'yml': Settings,
      'toml': Settings,
      'ini': Settings,
      'cfg': Settings,
      'conf': Settings,
      'config': Settings,
      'env': Settings,
      
      // Database
      'sql': Database,
      'db': Database,
      'sqlite': Database,
      'sqlite3': Database,
      
      // Images
      'png': FileImage,
      'jpg': FileImage,
      'jpeg': FileImage,
      'gif': FileImage,
      'webp': FileImage,
      'ico': FileImage,
      'bmp': FileImage,
      'tiff': FileImage,
      
      // Documents
      'md': FileText,
      'txt': FileText,
      'rtf': FileText,
      'doc': FileText,
      'docx': FileText,
      'pdf': FileText,
      
      // Package files
      'zip': Package,
      'tar': Package,
      'gz': Package,
      'rar': Package,
      '7z': Package,
      'deb': Package,
      'rpm': Package,
      
      // Git
      'gitignore': GitBranch,
      'gitattributes': GitBranch,
      'gitmodules': GitBranch,
      
      // Media
      'mp4': Play,
      'avi': Play,
      'mov': Play,
      'wmv': Play,
      'flv': Play,
      'webm': Play,
      'mp3': Play,
      'wav': Play,
      'flac': Play,
      'ogg': Play,
      
      // Other code files
      'php': FileCode,
      'rb': FileCode,
      'go': FileCode,
      'rust': FileCode,
      'rs': FileCode,
      'c': FileCode,
      'cpp': FileCode,
      'h': FileCode,
      'hpp': FileCode,
      'java': FileCode,
      'kt': FileCode,
      'swift': FileCode,
      'cs': FileCode,
      'vb': FileCode,
      'r': FileCode,
      'sh': Terminal,
      'bash': Terminal,
      'zsh': Terminal,
      'fish': Terminal,
      'ps1': Terminal,
      'bat': Terminal,
      'cmd': Terminal,
    };

    return iconMap[extension || ''] || File;
  };

  const getLanguageColor = (language?: string) => {
    const colors: Record<string, string> = {
      typescript: 'text-blue-400',
      javascript: 'text-yellow-400',
      json: 'text-green-400',
      html: 'text-orange-400',
      css: 'text-blue-300',
      markdown: 'text-gray-300',
      text: 'text-gray-400',
      binary: 'text-purple-400'
    };
    return colors[language || ''] || 'text-muted-foreground';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const renderFileNode = (node: FileNode, depth = 0) => {
    const isExpanded = expandedFolders.has(node.id);
    const isSelected = selectedFileId === node.id;
    const IconComponent = getFileIcon(node);
    const paddingLeft = `${depth * 1.5 + 0.5}rem`;

    return (
      <div key={node.id} className="select-none">
        <div
          className={`
            flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors group
            hover:bg-accent/50
            ${isSelected ? 'bg-accent text-accent-foreground' : ''}
          `}
          style={{ paddingLeft }}
          onClick={() => {
            if (node.type === 'folder') {
              toggleFolder(node.id);
            } else {
              handleFileClick(node);
            }
          }}
        >
          {node.type === 'folder' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0 hover:bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(node.id);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          )}
          
          {node.type === 'file' && <div className="w-4" />}
          
          <IconComponent className={`h-4 w-4 flex-shrink-0 ${
            node.type === 'file' ? getLanguageColor(node.language) : 'text-muted-foreground'
          }`} />
          
          <div className="flex-1 min-w-0 flex items-center justify-between">
            <span className={`text-sm truncate ${
              node.type === 'folder' ? 'font-medium' : ''
            }`}>
              {node.name}
            </span>
            
            <div className="flex items-center gap-1">
              {node.type === 'file' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExplainFile(node);
                  }}
                  title="Explain file"
                >
                  <MessageSquare className="h-3 w-3" />
                </Button>
              )}
              
              {node.type === 'file' && node.size && (
                <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                  {formatFileSize(node.size)}
                </span>
              )}
            </div>
          </div>
        </div>

        {node.type === 'folder' && isExpanded && node.children && (
          <div className="animate-fade-in-up">
            {node.children.map(child => renderFileNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold text-sm">File Explorer</h3>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {!hasData ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No files uploaded yet</p>
              <p className="text-sm">Upload files or connect a GitHub repository to get started</p>
            </div>
          ) : isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Loading files...</p>
            </div>
          ) : fileTree && fileTree.length > 0 ? (
            convertApiTreeToFileNodes(fileTree).map(node => renderFileNode(node))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No files found</p>
              <p className="text-sm">Try uploading files or connecting a repository</p>
            </div>
          )}
        </div>
      </ScrollArea>


    </div>
  );
};