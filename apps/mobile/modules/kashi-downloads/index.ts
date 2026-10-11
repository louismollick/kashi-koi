import { requireNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

type DownloadsModule = {
  begin(title: string, subtitle: string, total: number): Promise<boolean>;
  isActive(): boolean;
  setProgress(completed: number, total: number, subtitle: string): void;
  end(success: boolean): void;
  excludeFromBackup(uri: string): Promise<void>;
  addListener(event: 'onExpired', listener: () => void): EventSubscription;
};

/** Native imports stay behind the queue's injectable runtime. */
export default requireNativeModule<DownloadsModule>('KashiDownloads');
