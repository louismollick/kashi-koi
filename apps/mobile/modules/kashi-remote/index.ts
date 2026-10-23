import { requireNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

type RemoteModule = {
  enable(): void;
  disable(): void;
  addListener(event: 'onNext' | 'onPrevious', listener: () => void): EventSubscription;
};

/** Lock screen and headphone next/previous track buttons. Only app entry points import this wrapper. */
export default requireNativeModule<RemoteModule>('KashiRemote');
