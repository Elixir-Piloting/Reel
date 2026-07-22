import { toast } from 'sonner';

export const notify = {
  analysisComplete: (title: string) => toast.success('Analysis complete', { description: title, duration: 3000 }),
  playlistFound: (count: number) => toast.info('Playlist found', { description: `${count} items ready to download`, duration: 3000 }),
  downloadStarted: (title: string) => toast.info('Download started', { description: title, duration: 3000 }),
  downloadComplete: (title: string, onOpen: () => void) =>
    toast.success('Download complete', { description: title, action: { label: 'Open', onClick: onOpen }, duration: 5000 }),
  downloadFailed: (title: string, error: string, onRetry: () => void) =>
    toast.error('Download failed', { description: error, action: { label: 'Retry', onClick: onRetry }, duration: 5000 }),
};
