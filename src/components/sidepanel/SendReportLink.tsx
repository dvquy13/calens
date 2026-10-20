import { createContext, useContext } from 'react';

/** Opens the Diagnostics section (scrolled into view), optionally recording the error being reported. */
const DiagnosticsLauncherContext = createContext<(error?: string) => void>(() => {});

export const DiagnosticsLauncherProvider = DiagnosticsLauncherContext.Provider;

export function SendReportLink({ error }: { error?: string | null }) {
  const open = useContext(DiagnosticsLauncherContext);
  return (
    <button
      type="button"
      onClick={() => open(error ?? undefined)}
      className="text-xs underline hover:no-underline mt-1"
    >
      Send report
    </button>
  );
}
