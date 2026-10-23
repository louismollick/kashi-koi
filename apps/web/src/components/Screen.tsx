import { createContext, type ReactNode, useContext, useState } from 'react';

const ScrollContext = createContext<HTMLElement | null>(null);

/** The element a screen scrolls in, for virtualized lists. Null until the screen has mounted. */
export const useScrollElement = () => useContext(ScrollContext);

/**
 * One screen of the app: an optional header that stays put and a scrolling body. The shell gives it the space
 * between the top of the viewport (or column) and the tab bar.
 */
export function Screen({ header, children }: { header?: ReactNode; children: ReactNode }) {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      {header}
      <div ref={setScroller} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ScrollContext value={scroller}>{children}</ScrollContext>
      </div>
    </div>
  );
}
