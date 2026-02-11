import { useState, useCallback } from 'react';
import { searchMessagesDetail, MessageOut } from '@/lib/api';

interface SearchResult {
  id: string;
  session_id: string;
  sender_id: string;
  content: string;
  translated_content?: string | null;
  created_at: string;
}

export const useConversationSearch = () => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const searchConversations = useCallback(async (query: string, _userId: string, _role: 'doctor' | 'patient') => {
    if (!query.trim()) {
      setResults([]);
      setSearchQuery('');
      return;
    }

    setSearching(true);
    setSearchQuery(query);

    try {
      // Use the server-side message search endpoint (single API call)
      const messages: MessageOut[] = await searchMessagesDetail(query);
      setResults(
        messages.map((msg) => ({
          id: msg.id,
          session_id: msg.session_id,
          sender_id: msg.sender_id,
          content: msg.content,
          translated_content: msg.translated_content,
          created_at: msg.created_at,
        })),
      );
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const clearSearch = useCallback(() => {
    setResults([]);
    setSearchQuery('');
  }, []);

  return {
    results,
    searching,
    searchQuery,
    searchConversations,
    clearSearch,
  };
};
