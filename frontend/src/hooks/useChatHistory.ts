/**
 * Custom hook for managing chat history with localStorage persistence
 */
import { useState, useEffect, useCallback } from 'react';

import type { ChatResponse, ChatSource } from '@/services/api';

/** Kept as an alias so older imports keep resolving. */
export type MessageSource = ChatSource;

export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  codeBlocks?: { language: string; code: string }[];
  /** Mirrors the backend chat metadata so retrieval info survives a reload. */
  metadata?: ChatResponse['metadata'];
}

const STORAGE_KEY = 'codechat-messages';
const MAX_MESSAGES = 100; // Limit stored messages to prevent localStorage overflow

/**
 * Serialize messages for storage
 */
const serializeMessages = (messages: Message[]): string => {
  try {
    const serialized = messages.map(msg => ({
      ...msg,
      timestamp: msg.timestamp.toISOString() // Convert Date to string
    }));
    return JSON.stringify(serialized);
  } catch (error) {
    console.error('Failed to serialize messages:', error);
    return '[]';
  }
};

/**
 * Deserialize messages from storage
 */
const deserializeMessages = (data: string): Message[] => {
  try {
    // Timestamps round-trip as ISO strings, so revive them into Dates
    const parsed = JSON.parse(data) as Array<Omit<Message, 'timestamp'> & { timestamp: string }>;
    return parsed.map(msg => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    }));
  } catch (error) {
    console.error('Failed to deserialize messages:', error);
    return [];
  }
};

/**
 * Load messages from localStorage
 */
const loadMessages = (): Message[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return deserializeMessages(stored);
  } catch (error) {
    console.error('Failed to load messages from localStorage:', error);
    return [];
  }
};

/**
 * Save messages to localStorage
 */
const saveMessages = (messages: Message[]): void => {
  try {
    // Keep only the last MAX_MESSAGES
    const messagesToSave = messages.slice(-MAX_MESSAGES);
    const serialized = serializeMessages(messagesToSave);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    console.error('Failed to save messages to localStorage:', error);
  }
};

/**
 * Clear messages from localStorage
 */
const clearStoredMessages = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear messages from localStorage:', error);
  }
};

export const useChatHistory = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load messages on mount
  useEffect(() => {
    const loaded = loadMessages();
    setMessages(loaded);
    setIsLoaded(true);
  }, []);

  // Save messages whenever they change (debounced through useEffect)
  useEffect(() => {
    if (isLoaded && messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages, isLoaded]);

  /**
   * Add a new message to the chat
   */
  const addMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  /**
   * Add multiple messages at once
   */
  const addMessages = useCallback((newMessages: Message[]) => {
    setMessages(prev => [...prev, ...newMessages]);
  }, []);

  /**
   * Clear all messages
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
    clearStoredMessages();
  }, []);

  /**
   * Remove a specific message by id
   */
  const removeMessage = useCallback((messageId: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== messageId));
  }, []);

  /**
   * Update a message by id
   */
  const updateMessage = useCallback((messageId: string, updates: Partial<Message>) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, ...updates } : msg
    ));
  }, []);

  /**
   * Get the last N messages
   */
  const getLastMessages = useCallback((count: number): Message[] => {
    return messages.slice(-count);
  }, [messages]);

  return {
    messages,
    isLoaded,
    addMessage,
    addMessages,
    clearMessages,
    removeMessage,
    updateMessage,
    getLastMessages,
  };
};
