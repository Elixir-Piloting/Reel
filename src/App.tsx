import { useEffect } from "react";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { emit } from "@tauri-apps/api/event";
import { RootLayout } from "@/components/layout/RootLayout";
import { DownloadPage } from "@/pages/DownloadPage";
import { DownloadsPage } from "@/pages/DownloadsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";

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
  useEffect(() => {
    if (import.meta.env.DEV) return;
    void (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update) {
          await update.downloadAndInstall();
          emit("app:restart");
        }
      } catch (e) {
        console.error("[updater] check failed", e);
      }
    })();
  }, []);

  return <RouterProvider router={router} />;
}