// src/services/SignalingService.ts
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — Firebase callback types incompatible with strict TypeScript
import database from '@react-native-firebase/database';

// التحقق من صحة الكود محلياً قبل إرساله لـ Firebase
const VALID_CODE_RE = /^[A-HJ-NP-Za-hj-np-z2-9]{12}$/;
function isValidCode(code: string): boolean {
  return VALID_CODE_RE.test(code);
}

export interface SessionInfo {
  hostId:      string;
  code:        string;
  hasPassword: boolean;
  createdAt:   number;
  status:      'waiting' | 'live' | 'ended';
  viewerCount: number;
  expiresAt:   number;
}

// ─── Rate Limiter ──────────────────────────────────────────────────────────
class RateLimiter {
  private attempts = new Map<string, number[]>();
  private readonly MAX:    number;
  private readonly WINDOW: number;

  constructor(max = 10, windowMs = 60_000) {
    this.MAX    = max;
    this.WINDOW = windowMs;
  }

  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const now  = Date.now();
    const list = (this.attempts.get(key) || []).filter(t => now - t < this.WINDOW);
    if (list.length >= this.MAX) {
      return { allowed: false, retryAfterMs: this.WINDOW - (now - list[0]) };
    }
    list.push(now);
    this.attempts.set(key, list);
    return { allowed: true, retryAfterMs: 0 };
  }

  reset(key: string): void { this.attempts.delete(key); }
}

const joinLimiter = new RateLimiter(10, 60_000);

// ─── SignalingService ──────────────────────────────────────────────────────
class SignalingService {

  async createSession(code: string, hostId: string, hasPassword: boolean): Promise<void> {
    await database().ref(`sessions/${code}`).set({
      hostId,
      code,
      hasPassword,
      createdAt:   Date.now(),
      expiresAt:   Date.now() + 86_400_000,
      status:      'live',
      viewerCount: 0,
    });
  }

  async getSession(code: string): Promise<SessionInfo | null> {
    if (!isValidCode(code)) return null;

    const rl = joinLimiter.check(`getSession:${code}`);
    if (!rl.allowed) {
      const secs = Math.ceil(rl.retryAfterMs / 1000);
      throw new Error(`محاولات كثيرة — انتظر ${secs} ثانية`);
    }

    try {
      const snap = await database().ref(`sessions/${code}`).once('value');
      if (!snap.exists()) return null;
      const data = snap.val();
      if (data.expiresAt && Date.now() > data.expiresAt) {
        await this.endSession(code).catch(() => {});
        return null;
      }
      return data as SessionInfo;
    } catch (e: any) {
      if (e?.message?.includes('محاولات كثيرة')) throw e;
      return null;
    }
  }

  async updateSessionStatus(code: string, status: 'waiting' | 'live' | 'ended'): Promise<void> {
    await database().ref(`sessions/${code}/status`).set(status);
  }

  async endSession(code: string): Promise<void> {
    try {
      await database().ref(`sessions/${code}/status`).set('ended');
      joinLimiter.reset(`getSession:${code}`);
      setTimeout(() => {
        database().ref(`sessions/${code}`).remove().catch(() => {});
      }, 3000);
    } catch {}
  }

  async getViewerCount(code: string): Promise<number> {
    try {
      const snap = await database().ref(`sessions/${code}/viewerCount`).once('value');
      return snap.val() || 0;
    } catch { return 0; }
  }

  async reconnectSession(code: string): Promise<void> {
    await database().ref(`sessions/${code}`).update({
      status:        'live',
      reconnectedAt: Date.now(),
    });
  }

  async kickViewer(code: string, viewerId: string): Promise<void> {
    try {
      await database().ref(`sessions/${code}/signals/${viewerId}/kicked`).set(true);
      await database().ref(`sessions/${code}/viewers/${viewerId}`).remove();
      await database()
        .ref(`sessions/${code}/viewerCount`)
        .transaction((c: any) => Math.max(0, (c || 1) - 1));
    } catch {}
  }

  async cleanupExpiredSessions(): Promise<void> {
    try {
      const now = Date.now();
      const snap = await database()
        .ref('sessions')
        .orderByChild('expiresAt')
        .endAt(now)
        .once('value');

      const batch: Promise<void>[] = [];
      if (snap.exists()) {
        snap.forEach((child: any) => {
          batch.push(database().ref(`sessions/${child.key}`).remove().catch(() => {}));
        });
      }

      const endedSnap = await database()
        .ref('sessions')
        .orderByChild('status')
        .equalTo('ended')
        .once('value');

      if (endedSnap.exists()) {
        endedSnap.forEach((child: any) => {
          batch.push(database().ref(`sessions/${child.key}`).remove().catch(() => {}));
        });
      }

      await Promise.allSettled(batch);
    } catch {}
  }

  // ─── Listeners ──────────────────────────────────────────────────────────
  onViewerJoined(code: string, cb: (id: string) => void): () => void {
    const ref = database().ref(`sessions/${code}/viewers`);
    // نستخدم any لتجنب type mismatch مع Firebase callback signature
    const h = (ref as any).on('child_added', (snap: any) => {
      if (snap.key) cb(snap.key);
    });
    return () => (ref as any).off('child_added', h);
  }

  onViewerCountChanged(code: string, cb: (count: number) => void): () => void {
    const ref = database().ref(`sessions/${code}/viewerCount`);
    const h = (ref as any).on('value', (snap: any) => {
      cb(snap.val() || 0);
    });
    return () => (ref as any).off('value', h);
  }

  onSessionStatusChanged(code: string, cb: (status: string) => void): () => void {
    const ref = database().ref(`sessions/${code}/status`);
    const h = (ref as any).on('value', (snap: any) => {
      if (snap.exists()) cb(snap.val());
    });
    return () => (ref as any).off('value', h);
  }

  onHostReconnected(code: string, cb: () => void): () => void {
    const ref = database().ref(`sessions/${code}/reconnectedAt`);
    let first = true;
    const h = (ref as any).on('value', (snap: any) => {
      if (first) { first = false; return; }
      if (snap.exists()) cb();
    });
    return () => (ref as any).off('value', h);
  }
}

export default new SignalingService();
