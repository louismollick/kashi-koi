import { requireNativeModule } from 'expo';
import type { Translator } from '../../src/japanese/translate';

/** Only app entry points import this wrapper; stores and Node tests use injection. */
export default requireNativeModule<Translator>('KashiJapanese');
