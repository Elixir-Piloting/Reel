import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type DownloadType = 'video' | 'audio';

interface OptionsState {
  downloadType: DownloadType;
  selectedQuality: string;
  startTime: number;
  endTime: number;
  encoding: string;
  premiereMode: boolean;
  filename: string;
  outputDir: string;

  setDownloadType: (t: DownloadType) => void;
  setSelectedQuality: (q: string) => void;
  setStartTime: (t: number) => void;
  setEndTime: (t: number) => void;
  setEncoding: (e: string) => void;
  setPremiereMode: (p: boolean) => void;
  setFilename: (f: string) => void;
  setOutputDir: (d: string) => void;
  resetOptions: () => void;
}

const initialState = {
  downloadType: 'video' as DownloadType,
  selectedQuality: '',
  startTime: 0,
  endTime: 0,
  encoding: 'mp4_h264',
  premiereMode: false,
  filename: '',
  outputDir: '',
};

export const useOptionsStore = create<OptionsState>()(
  persist(
    (set) => ({
  ...initialState,

  setDownloadType: (downloadType) => set({ downloadType }),
  setSelectedQuality: (selectedQuality) => set({ selectedQuality }),
  setStartTime: (startTime) => set({ startTime }),
  setEndTime: (endTime) => set({ endTime }),
  setEncoding: (encoding) => set({ encoding }),
  setPremiereMode: (premiereMode) => set({ premiereMode }),
  setFilename: (filename) => set({ filename }),
  setOutputDir: (outputDir) => set({ outputDir }),
  resetOptions: () => set(initialState),
}),
{
  name: 'options-store',
  storage: createJSONStorage(() => sessionStorage),
  partialize: (state) => ({
    downloadType: state.downloadType,
    selectedQuality: state.selectedQuality,
    startTime: state.startTime,
    endTime: state.endTime,
    encoding: state.encoding,
    premiereMode: state.premiereMode,
    filename: state.filename,
    outputDir: state.outputDir,
  }),
},
));
