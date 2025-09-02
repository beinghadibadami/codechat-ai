import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { Upload, FileText, Code, X, CheckCircle, AlertCircle, Settings, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiService, ConfigRequest } from '@/services/api';
import { useSession } from '@/contexts/SessionContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface FileWithProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  id: string;
}

export const UploadCard = () => {
  const [files, setFiles] = useState<FileWithProgress[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [config, setConfig] = useState<ConfigRequest>({ chunk_size: 800, chunk_overlap: 100 });
  const [showConfig, setShowConfig] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { setHasData, refreshFileTree } = useSession();

  const supportedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.php', '.rb', '.go', '.rs'];
  const maxFileSize = 10 * 1024 * 1024; // 10MB
  const maxFiles = 20;

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    processFiles(droppedFiles);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      processFiles(selectedFiles);
    }
  };

  const processFiles = (newFiles: File[]) => {
    const validFiles: FileWithProgress[] = [];
    
    newFiles.forEach(file => {
      if (files.length + validFiles.length >= maxFiles) {
        toast({
          title: "Too many files",
          description: `Maximum ${maxFiles} files allowed`,
          variant: "destructive"
        });
        return;
      }

      if (file.size > maxFileSize) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 10MB limit`,
          variant: "destructive"
        });
        return;
      }

      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!supportedExtensions.includes(extension)) {
        toast({
          title: "Unsupported file type",
          description: `${file.name} is not a supported code file`,
          variant: "destructive"
        });
        return;
      }

      validFiles.push({
        file,
        progress: 0,
        status: 'pending',
        id: Math.random().toString(36).substring(7)
      });
    });

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
      handleUpload(validFiles);
    }
  };

  const handleUpload = async (filesToUpload: FileWithProgress[]) => {
    setIsUploading(true);

    try {
      // Update all files to uploading status
      setFiles(prev => 
        prev.map(f => 
          filesToUpload.some(uploadFile => uploadFile.id === f.id)
            ? { ...f, status: 'uploading' as const, progress: 0 }
            : f
        )
      );

      // Simulate progress for each file
      for (let progress = 0; progress <= 100; progress += 20) {
        await new Promise(resolve => setTimeout(resolve, 200));
        setFiles(prev => 
          prev.map(f => 
            filesToUpload.some(uploadFile => uploadFile.id === f.id)
              ? { ...f, progress }
              : f
          )
        );
      }

      // Upload files to backend
      const fileList = filesToUpload.map(f => f.file);
      const response = await apiService.uploadFiles(fileList, config);

      if (response.success) {
        // Mark all files as complete
        setFiles(prev => 
          prev.map(f => 
            filesToUpload.some(uploadFile => uploadFile.id === f.id)
              ? { ...f, status: 'complete' as const, progress: 100 }
              : f
          )
        );

        console.log('File upload successful, setting hasData to true');
        setHasData(true);
        console.log('Refreshing file tree...');
        await refreshFileTree();

        toast({
          title: "Upload successful",
          description: response.message,
        });
      } else {
        throw new Error(response.message || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      
      // Mark files as error
      setFiles(prev => 
        prev.map(f => 
          filesToUpload.some(uploadFile => uploadFile.id === f.id)
            ? { ...f, status: 'error' as const }
            : f
        )
      );

      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : 'Failed to upload files',
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    return ['js', 'ts', 'jsx', 'tsx'].includes(extension || '') ? Code : FileText;
  };

  const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="glass rounded-2xl p-8 space-y-6 glow-on-hover interactive">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold">Upload Code Files</h3>
        <p className="text-muted-foreground">
          Drag & drop your code files or click to browse
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`dropzone min-h-48 flex flex-col items-center justify-center space-y-4 cursor-pointer ${
          isDragOver ? 'drag-over' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className={`w-12 h-12 ${isDragOver ? 'text-primary' : 'text-muted-foreground'} transition-colors`} />
        <div className="text-center">
          <p className="font-medium">Drop files here or click to browse</p>
          <p className="text-sm text-muted-foreground mt-1">
            Supports: JS, TS, Python, Java, C++, and more
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={supportedExtensions.join(',')}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Files ({files.length})</h4>
            <span className="text-sm text-muted-foreground">{formatSize(totalSize)}</span>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {files.map((fileWithProgress) => {
              const FileIcon = getFileIcon(fileWithProgress.file.name);
              return (
                <div
                  key={fileWithProgress.id}
                  className="flex items-center gap-3 p-3 bg-background-surface rounded-lg border border-border"
                >
                  <FileIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium truncate">{fileWithProgress.file.name}</p>
                      <div className="flex items-center gap-2">
                        {fileWithProgress.status === 'complete' && (
                          <CheckCircle className="w-4 h-4 text-success" />
                        )}
                        {fileWithProgress.status === 'error' && (
                          <AlertCircle className="w-4 h-4 text-destructive" />
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(fileWithProgress.id);
                          }}
                          className="text-muted-foreground hover:text-foreground transition-colors focus-ring rounded-sm"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatSize(fileWithProgress.file.size)}
                      </span>
                      {fileWithProgress.status === 'uploading' && (
                        <Progress value={fileWithProgress.progress} className="flex-1 h-2" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Dialog open={showConfig} onOpenChange={setShowConfig}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Config
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload Configuration</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="chunk-size">Chunk Size</Label>
                    <Input
                      id="chunk-size"
                      type="number"
                      value={config.chunk_size}
                      onChange={(e) => setConfig(prev => ({ ...prev, chunk_size: parseInt(e.target.value) || 800 }))}
                      min="100"
                      max="2000"
                      step="100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="chunk-overlap">Chunk Overlap</Label>
                    <Input
                      id="chunk-overlap"
                      type="number"
                      value={config.chunk_overlap}
                      onChange={(e) => setConfig(prev => ({ ...prev, chunk_overlap: parseInt(e.target.value) || 100 }))}
                      min="0"
                      max="500"
                      step="50"
                    />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            
            <Button 
              className="flex-1 bg-gradient-primary hover:opacity-90 interactive"
              disabled={isUploading || files.length === 0}
              onClick={() => handleUpload(files)}
            >
              {isUploading ? 'Processing...' : `Analyze ${files.length} File(s)`}
            </Button>
          </div>
        </div>
      )}

      {/* Helper text */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>• Supported: {supportedExtensions.slice(0, 6).join(', ')} and more</p>
        <p>• Maximum file size: 10MB per file</p>
        <p>• Maximum files: {maxFiles} files per upload</p>
      </div>
    </div>
  );
};