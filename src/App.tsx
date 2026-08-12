import { useState, useEffect } from "react";
import { createHashRouter, RouterProvider } from "react-router-dom";
import type { Update } from "@tauri-apps/plugin-updater";
import { RootLayout } from "@/components/layout/RootLayout";
import { DownloadPage } from "@/pages/DownloadPage";
import { DownloadsPage } from "@/pages/DownloadsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { UpdateDialog } from "@/features/updater/UpdateDialog";

const router = createHashRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <DownloadPage /> },
      { path: "/downloads", element: <DownloadsPage /> },
      { path: "/settings", element: <SettingsPage /> },
    ],
  },
]);

export default function App() {
  const [update, setUpdate] = useState<Update | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    void (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const result = await check();
        if (result) setUpdate(result);
      } catch (e) {
        console.error("[updater] check failed", e);
      }
    })();
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      <UpdateDialog update={update} onClose={() => setUpdate(null)} />
    </>
  );
}
