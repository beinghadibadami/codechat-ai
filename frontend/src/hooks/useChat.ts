/**
 * useChat — owns the send/stream/stop/retry lifecycle for the chat workspace.
 *
 * Streaming is preferred (first token lands in well under a second); if the
 * stream fails before producing any text we fall back to the blocking /chat
 * endpoint so a proxy that buffers SSE doesn't break the product.
 */
import { useCallback, useRef, useState } from 'react';
import { apiService, QueryRequest, ChatResponse } from '@/services/api';
import { useChatHistory, Message } from '@/hooks/useChatHistory';

const newId = () => Math.random().toString(36).slice(2, 10);

/** Turn an error into something a user can act on. */
const friendlyError = (raw: unknown): string => {
  const msg = raw instanceof Error ? raw.message : String(raw ?? '');
  if (/no code repository/i.test(msg)) return 'Connect a codebase before asking questions.';
  if (/network|fetch|load failed/i.test(msg)) return 'Network problem — check your connection and retry.';
  if (/timeout|timed out/i.test(msg)) return 'That took too long. Try a narrower question.';
  if (/429|rate limit/i.test(msg)) return 'Rate limited upstream. Give it a moment and retry.';
  if (/^HTTP 5/.test(msg)) return 'The server hit an error. Retrying often clears it.';
  return msg || 'Something went wrong generating that answer.';
};

/** How many prior turns to send as context. Backend caps at 20. */
const HISTORY_TURNS = 8;

export const useChat = () => {
  const { messages, addMessage, updateMessage, clearMessages, isLoaded } = useChatHistory();

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<(() => void) | null>(null);
  /** The last user message, so Retry can resend it. */
  const lastSentRef = useRef<string | null>(null);

  const buildHistory = useCallback(
    () =>
      messages
        .filter(m => !m.id.startsWith('welcome'))
        .slice(-HISTORY_TURNS)
        .map(m => ({ role: m.type as 'user' | 'assistant', content: m.content })),
    [messages]
  );

  const stop = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      setError(null);
      lastSentRef.current = trimmed;

      addMessage({
        id: newId(),
        type: 'user',
        content: trimmed,
        timestamp: new Date(),
      });
      setInput('');

      const history = buildHistory();
      const request: QueryRequest = {
        message: trimmed,
        history: history.length ? history : undefined,
      };

      // Placeholder we append tokens into
      const assistantId = newId();
      addMessage({
        id: assistantId,
        type: 'assistant',
        content: '',
        timestamp: new Date(),
      });

      setStreaming(true);

      let received = '';
      let sawMetadata = false;
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        setStreaming(false);
        abortRef.current = null;
      };

      /** Blocking fallback — only used if streaming produced nothing. */
      const fallbackToBlocking = async () => {
        try {
          const res: ChatResponse = await apiService.chat(request);
          updateMessage(assistantId, {
            content: res.response,
            metadata: res.metadata as Message['metadata'],
          });
          if (!res.success) setError(friendlyError(res.response));
        } catch (e) {
          updateMessage(assistantId, {
            content: '',
            metadata: undefined,
          });
          setError(friendlyError(e));
        } finally {
          finish();
        }
      };

      abortRef.current = apiService.streamChat(request, {
        onMetadata: meta => {
          sawMetadata = true;
          updateMessage(assistantId, { metadata: meta as Message['metadata'] });
        },
        onToken: chunk => {
          received += chunk;
          updateMessage(assistantId, { content: received });
        },
        onDone: () => {
          if (settled) return;
          // Stream ended with no content and no metadata → treat as a failure
          // and try the blocking endpoint instead of leaving an empty bubble.
          if (!received && !sawMetadata) {
            void fallbackToBlocking();
            return;
          }
          finish();
        },
        onError: message => {
          if (settled) return;
          if (!received) {
            void fallbackToBlocking();
            return;
          }
          // Partial answer already on screen — keep it, surface the error.
          setError(friendlyError(message));
          finish();
        },
      });
    },
    [streaming, addMessage, updateMessage, buildHistory]
  );

  const submit = useCallback(() => {
    void send(input);
  }, [send, input]);

  const retry = useCallback(() => {
    const last = lastSentRef.current;
    if (!last) return;
    setError(null);
    void send(last);
  }, [send]);

  /** Used by the file explorer's "explain this file" action. */
  const explainFile = useCallback(
    async (path: string) => {
      if (streaming) return;
      setError(null);

      addMessage({
        id: newId(),
        type: 'user',
        content: `Explain ${path}`,
        timestamp: new Date(),
      });

      const assistantId = newId();
      addMessage({ id: assistantId, type: 'assistant', content: '', timestamp: new Date() });
      setStreaming(true);

      try {
        const res = await apiService.explainFile(path);
        updateMessage(assistantId, {
          content: res.response,
          metadata: {
            chunks_found: res.metadata.chunks_used ?? 0,
            files_involved: 1,
            sources: [
              {
                file_name: res.metadata.file_name,
                file_path: path,
                language: null,
                line_start: null,
                line_end: null,
                score: null,
              },
            ],
          } as Message['metadata'],
        });
        if (!res.success) setError(friendlyError(res.response));
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setStreaming(false);
      }
    },
    [streaming, addMessage, updateMessage]
  );

  return {
    messages,
    isLoaded,
    input,
    setInput,
    streaming,
    error,
    setError,
    submit,
    send,
    stop,
    retry,
    explainFile,
    clearMessages,
  };
};
