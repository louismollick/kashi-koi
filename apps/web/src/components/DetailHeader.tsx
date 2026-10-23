import type { ReactNode } from 'react';
import { useIsDesktop } from '@/hooks/useIsDesktop';

/**
 * Artwork, then the details and play buttons. Stacked and centered on a phone like iOS; side by side on the desktop,
 * where the browse column is wide.
 */
export function DetailHeader({ artwork, children }: { artwork: ReactNode; children: ReactNode }) {
  return useIsDesktop() ? (
    <div className="flex items-end gap-6">
      <div className="shrink-0">{artwork}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center">{artwork}</div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}
