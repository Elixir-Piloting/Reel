import { useState, useCallback } from 'react';

const STORAGE_KEY = 'reel-url-history';
const MAX_HISTORY = 20;

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const trackingParams = ['si', 'feature', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    trackingParams.forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch {
    return url;
  }
}

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
    const normalized = normalizeUrl(url);
    setHistory((prev) => {
      const filtered = prev.filter((e) => normalizeUrl(e.url) !== normalized);
      const next = [{ url, title, timestamp: Date.now() }, ...filtered].slice(0, MAX_HISTORY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { history, addEntry };
}
