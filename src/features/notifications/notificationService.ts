import { toast } from 'sonner';

export const notify = {
  analysisComplete: (title: string) => toast.success('Analysis complete', { description: title }),
  playlistFound: (count: number) => toast.info('Playlist found', { description: `${count} items ready to download` }),
  downloadStarted: (title: string) => toast.loading('Download started', { description: title, id: 'download' }),
  downloadComplete: (title: string, onOpen: () => void) =>
    toast.success('Download complete', { description: title, action: { label: 'Open', onClick: onOpen } }),
  downloadFailed: (title: string, error: string, onRetry: () => void) =>
    toast.error('Download failed', { description: error, action: { label: 'Retry', onClick: onRetry } }),
};
