// modules/screen-capture/index.ts
import { requireNativeModule, EventEmitter } from 'expo-modules-core';
import type { Subscription } from 'expo-modules-core';

// ─── النوع الخام للـ module ───────────────────────────────────────────────
type ScreenCaptureNativeModule = {
  requestScreenCapturePermission(): Promise<boolean>;
  setMediaProjectionResult(resultCode: number, data: Record<string, unknown>): Promise<boolean>;
  startInternalAudioCapture(): Promise<boolean>;
  stopInternalAudioCapture(): Promise<boolean>;
  stopProjection(): Promise<boolean>;
  isInternalAudioSupported(): boolean;
  isCapturing(): boolean;
  hasProjection(): boolean;
};

export type AudioDataEvent = {
  data: string;        // base64 encoded PCM
  size: number;
  sampleRate: number;
  channels: number;
  encoding: 'PCM_16BIT';
};

export type ScreenCaptureErrorEvent = {
  message: string;
};

// ─── تحميل الـ Native Module ──────────────────────────────────────────────
let _native: ScreenCaptureNativeModule | null = null;

function getNative(): ScreenCaptureNativeModule {
  if (!_native) {
    try {
      _native = requireNativeModule<ScreenCaptureNativeModule>('ScreenCapture');
    } catch {
      // على iOS أو في Expo Go — نُرجع stub آمن
      _native = {
        requestScreenCapturePermission: () => Promise.resolve(false),
        setMediaProjectionResult: () => Promise.resolve(false),
        startInternalAudioCapture: () => Promise.resolve(false),
        stopInternalAudioCapture: () => Promise.resolve(false),
        stopProjection: () => Promise.resolve(false),
        isInternalAudioSupported: () => false,
        isCapturing: () => false,
        hasProjection: () => false,
      };
    }
  }
  return _native!;
}

let _emitter: EventEmitter | null = null;
function getEmitter(): EventEmitter {
  if (!_emitter) {
    try {
      _emitter = new EventEmitter(getNative() as any);
    } catch {
      // stub emitter
      _emitter = {
        addListener: () => ({ remove: () => {} }) as Subscription,
        removeAllListeners: () => {},
        emit: () => {},
      } as unknown as EventEmitter;
    }
  }
  return _emitter!;
}

// ─── الـ API المُصدَّر ────────────────────────────────────────────────────
export const ScreenCapture = {
  // طلب إذن MediaProjection (يفتح نافذة Android الرسمية)
  requestPermission: (): Promise<boolean> =>
    getNative().requestScreenCapturePermission(),

  // تمرير نتيجة onActivityResult من MainActivity
  setMediaProjectionResult: (resultCode: number, data: Record<string, unknown>): Promise<boolean> =>
    getNative().setMediaProjectionResult(resultCode, data),

  // بدء التقاط الصوت الداخلي
  startInternalAudio: (): Promise<boolean> =>
    getNative().startInternalAudioCapture(),

  // إيقاف التقاط الصوت فقط
  stopInternalAudio: (): Promise<boolean> =>
    getNative().stopInternalAudioCapture(),

  // إيقاف MediaProjection كاملاً
  stopProjection: (): Promise<boolean> =>
    getNative().stopProjection(),

  // هل الجهاز يدعم الصوت الداخلي (Android 10+)
  isSupported: (): boolean =>
    getNative().isInternalAudioSupported(),

  // هل التقاط الصوت يعمل حالياً
  isCapturing: (): boolean =>
    getNative().isCapturing(),

  // هل لدينا MediaProjection نشط
  hasProjection: (): boolean =>
    getNative().hasProjection(),

  // ─── Listeners ──────────────────────────────────────────────────────────

  // توقف البث من نظام Android (status bar chip على Android 10+)
  addProjectionStoppedListener: (cb: () => void): Subscription =>
    getEmitter().addListener('onProjectionStopped', cb),

  // استقبال PCM chunks للدمج مع WebRTC
  addAudioDataListener: (cb: (event: AudioDataEvent) => void): Subscription =>
    getEmitter().addListener('onAudioData', cb),

  // أخطاء التقاط
  addErrorListener: (cb: (event: ScreenCaptureErrorEvent) => void): Subscription =>
    getEmitter().addListener('onError', cb),
};
