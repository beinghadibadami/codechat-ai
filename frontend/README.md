# CodeChat AI Frontend

A modern React-based frontend for the RAG Code Reviewer chatbot, built with TypeScript, Tailwind CSS, and shadcn/ui components.

## Features

### 🚀 **Core Functionality**
- **File Upload**: Drag & drop or browse to upload code files
- **GitHub Integration**: Connect directly to GitHub repositories
- **AI Chat Interface**: Interactive chat with your codebase
- **File Explorer**: Navigate through uploaded files with explanations
- **Session Management**: Maintain context across uploads

### ⚙️ **Configuration Options**
- **Chunk Size**: Configurable document chunking (100-2000 tokens)
- **Chunk Overlap**: Adjustable overlap between chunks (0-500 tokens)
- **Max Tokens**: Control response length (1000-16000 tokens)

### 🔧 **Technical Features**
- **Real-time Processing**: Live progress tracking for uploads
- **Smart Retrieval**: Enhanced search with reranking
- **File Explanations**: Get detailed explanations of individual files
- **Responsive Design**: Works on desktop and mobile devices

## API Integration

The frontend integrates with the following backend endpoints:

- `POST /upload-file` - Upload and process code files
- `POST /upload-github` - Clone and analyze GitHub repositories
- `POST /chat` - AI-powered code analysis and Q&A
- `POST /explain-file` - Get detailed file explanations
- `GET /file-tree` - Retrieve file structure
- `GET /session-info` - Get current session information
- `POST /reset-session` - Reset current session

## Getting Started

### Prerequisites
- Node.js 18+ 
- Backend server running on `http://localhost:8000`

### Installation
```bash
cd frontend
npm install
```

### Development
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Build
```bash
npm run build
```

## Usage

### 1. Upload Files
- Drag & drop code files or click to browse
- Configure chunk size and overlap for optimal processing
- Supported formats: JS, TS, Python, Java, C++, and more

### 2. Connect GitHub
- Enter a GitHub repository URL
- Configure processing parameters
- Monitor real-time processing steps

### 3. Chat with AI
- Ask questions about your codebase
- Get code analysis and suggestions
- Configure response length and complexity

### 4. Explore Files
- Navigate through uploaded files
- Get AI-powered explanations of individual files
- View file structure and relationships

## Architecture

### Components
- **UploadCard**: File upload interface with progress tracking
- **GitHubCard**: GitHub repository connection and processing
- **ChatInterface**: AI chat with code context
- **FileTree**: File navigation and explanations
- **SessionContext**: Global state management

### State Management
- **Session Context**: Manages application state and API calls
- **Real-time Updates**: Live progress tracking and status updates
- **Error Handling**: Comprehensive error handling with user feedback

### API Layer
- **RESTful Integration**: Full backend API integration
- **Type Safety**: TypeScript interfaces for all API responses
- **Error Handling**: Graceful fallbacks and user notifications

## Configuration

### Environment Variables
- `VITE_API_BASE_URL`: Backend API base URL (default: `http://localhost:8000`)

### Default Settings
- **Chunk Size**: 800 tokens
- **Chunk Overlap**: 100 tokens
- **Max Response Tokens**: 8000 tokens

## Troubleshooting

### Common Issues
1. **Backend Connection**: Ensure backend is running on port 8000
2. **File Uploads**: Check file size limits and supported formats
3. **GitHub Access**: Verify repository URLs and access permissions

### Error Handling
- Network errors show user-friendly messages
- File processing errors include detailed feedback
- Session errors trigger automatic recovery attempts

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

