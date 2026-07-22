import { createHashRouter, RouterProvider } from "react-router-dom";
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
  return <RouterProvider router={router} />;
}
