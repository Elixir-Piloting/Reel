import { useState, useCallback } from 'react';

const STORAGE_KEY = 'reel-url-history';
const MAX_HISTORY = 20;

export interface UrlHistoryEntry {
  url: string;
  title: string;
  timestamp: number;
}

export function useUrlHistory() {
  const [history, setHistory] = useState<UrlHistoryEntry[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  });

  const addEntry = useCallback((url: string, title: string) => {
    setHistory((prev) => {
      const filtered = prev.filter((e) => e.url !== url);
      const next = [{ url, title, timestamp: Date.now() }, ...filtered].slice(0, MAX_HISTORY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { history, addEntry };
}
