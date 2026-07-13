import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export function AppShell({ children }: Props) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 h-12 flex items-center justify-between">
        <h1 className="font-semibold text-sm">YTMate</h1>
      </header>
      <main className="p-6 max-w-3xl mx-auto space-y-6">
        {children}
      </main>
    </div>
  );
}
