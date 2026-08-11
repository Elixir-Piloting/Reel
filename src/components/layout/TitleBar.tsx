import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MinusIcon, SquareIcon, ArrowsInSimpleIcon, XIcon } from "@phosphor-icons/react";
import reelLogo from "@/assets/reel-logo.png";

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  return (
    <div className="h-10 flex items-center justify-between shrink-0" data-tauri-drag-region>
      <div className="flex items-center gap-2 pl-3">
        <img src={reelLogo} alt="Reel" className="size-6 rounded" />
        <span className="text-sm font-semibold text-foreground">Reel</span>
      </div>
      <div className="flex items-center">
        <button
          onClick={() => appWindow.minimize()}
          className="flex items-center justify-center w-11 h-10 text-muted-foreground hover:bg-overlay hover:text-foreground transition-colors"
          title="Minimize"
        >
          <MinusIcon size={18} />
        </button>
        <button
          onClick={async () => { await appWindow.toggleMaximize(); setMaximized(await appWindow.isMaximized()); }}
          className="flex items-center justify-center w-11 h-10 text-muted-foreground hover:bg-overlay hover:text-foreground transition-colors"
          title={maximized ? "Restore" : "Maximize"}
        >
          {maximized ? <ArrowsInSimpleIcon size={18} /> : <SquareIcon size={18} />}
        </button>
        <button
          onClick={() => appWindow.close()}
          className="flex items-center justify-center w-11 h-10 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
          title="Close"
        >
          <XIcon size={18} />
        </button>
      </div>
    </div>
  );
}
