// src/services/SignalingService.ts
import database from '@react-native-firebase/database';

export interface SessionInfo {
  hostId:      string;
  code:        string;
  hasPassword: boolean;
  createdAt:   number;
  status:      'waiting' | 'live' | 'ended';
  viewerCount: number;
  expiresAt:   number;
}

// ─── Rate Limiter محلي — يمنع spam محاولات الانضمام ──────────────────────
class RateLimiter {
  private attempts = new Map<string, number[]>();
  private readonly MAX_ATTEMPTS: number;
  private readonly WINDOW_MS:    number;

  constructor(maxAttempts = 5, windowMs = 60_000) {
    this.MAX_ATTEMPTS = maxAttempts;
    this.WINDOW_MS    = windowMs;
  }

  // هل يُسمح بهذه المحاولة؟
  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const now  = Date.now();
    const list = (this.attempts.get(key) || []).filter(t => now - t < this.WINDOW_MS);

    if (list.length >= this.MAX_ATTEMPTS) {
      const oldest     = list[0];
      const retryAfter = this.WINDOW_MS - (now - oldest);
      return { allowed: false, retryAfterMs: retryAfter };
    }

    list.push(now);
    this.attempts.set(key, list);
    return { allowed: true, retryAfterMs: 0 };
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

// 5 محاولات انضمام لكل كود كل دقيقة
const joinLimiter = new RateLimiter(5, 60_000);

// ─── SignalingService ─────────────────────────────────────────────────────
class SignalingService {

  async createSession(code: string, hostId: string, hasPassword: boolean): Promise<void> {
    await database().ref(`sessions/${code}`).set({
      hostId,
      code,
      hasPassword,
      createdAt:   Date.now(),
      expiresAt:   Date.now() + 86_400_000, // 24 ساعة
      status:      'live',
      viewerCount: 0,
    });
  }

  async getSession(code: string): Promise<SessionInfo | null> {
    // rate limit على الاستعلام عن الجلسات
    const rl = joinLimiter.check(`getSession:${code}`);
    if (!rl.allowed) {
      const secs = Math.ceil(rl.retryAfterMs / 1000);
      throw new Error(`محاولات كثيرة جداً — انتظر ${secs} ثانية`);
    }

    try {
      const snap = await database().ref(`sessions/${code}`).once('value');
      if (!snap.exists()) return null;

      const data = snap.val();

      // حذف الجلسات المنتهية الصلاحية
      if (data.expiresAt && Date.now() > data.expiresAt) {
        await this.endSession(code).catch(() => {});
        return null;
      }

      return data as SessionInfo;
    } catch (e: any) {
      // لا نبتلع أخطاء rate limit
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
      joinLimiter.reset(`getSession:${code}`); // مسح الـ rate limit عند الإنهاء
      setTimeout(async () => {
        try { await database().ref(`sessions/${code}`).remove(); } catch {}
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

  // ─── تنظيف الجلسات المنتهية — تصفية من الخادم لا قراءة كل البيانات ─────────
  async cleanupExpiredSessions(): Promise<void> {
    try {
      const now = Date.now();
      // نقرأ فقط الجلسات منتهية الصلاحية — أرخص بكثير من قراءة كل شيء
      const snap = await database()
        .ref('sessions')
        .orderByChild('expiresAt')
        .endAt(now)
        .once('value');

      if (!snap.exists()) return;

      const batch: Promise<void>[] = [];
      snap.forEach((child: any) => {
        batch.push(
          database().ref(`sessions/${child.key}`).remove().catch(() => {})
        );
      });

      // أيضاً نحذف الجلسات بحالة 'ended' التي لم تُحذف
      const endedSnap = await database()
        .ref('sessions')
        .orderByChild('status')
        .equalTo('ended')
        .once('value');

      if (endedSnap.exists()) {
        endedSnap.forEach((child: any) => {
          batch.push(
            database().ref(`sessions/${child.key}`).remove().catch(() => {})
          );
        });
      }

      await Promise.allSettled(batch);
    } catch {}
  }

  // ─── Listeners ────────────────────────────────────────────────────────────
  onViewerJoined(code: string, cb: (id: string) => void): () => void {
    const ref = database().ref(`sessions/${code}/viewers`);
    const h   = ref.on('child_added', (snap: any) => { if (snap.key) cb(snap.key); });
    return () => ref.off('child_added', h);
  }

  onViewerCountChanged(code: string, cb: (count: number) => void): () => void {
    const ref = database().ref(`sessions/${code}/viewerCount`);
    const h   = ref.on('value', (snap: any) => cb(snap.val() || 0));
    return () => ref.off('value', h);
  }

  onSessionStatusChanged(code: string, cb: (status: string) => void): () => void {
    const ref = database().ref(`sessions/${code}/status`);
    const h   = ref.on('value', (snap: any) => { if (snap.exists()) cb(snap.val()); });
    return () => ref.off('value', h);
  }

  onHostReconnected(code: string, cb: () => void): () => void {
    const ref   = database().ref(`sessions/${code}/reconnectedAt`);
    let   first = true;
    const h     = ref.on('value', (snap: any) => {
      if (first) { first = false; return; }
      if (snap.exists()) cb();
    });
    return () => ref.off('value', h);
  }
}

export default new SignalingService();
