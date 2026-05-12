// src/services/WebRTCService.ts — النسخة النهائية المكتملة
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — Firebase + WebRTC callback types require bypass
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
  mediaDevices,
} from 'react-native-webrtc';
import database from '@react-native-firebase/database';

// ─────────────────────────────────────────────────────────────────────────────
// ICE SERVERS
// ⚠️  ضع credentials في ملف .env (انظر .env.example)
//     أو مباشرة في EAS Secrets: eas secret:create
// ─────────────────────────────────────────────────────────────────────────────
import { TURN_USERNAME, TURN_CREDENTIAL } from '../config';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'turn:relay1.expressturn.com:3478',               username: TURN_USERNAME, credential: TURN_CREDENTIAL },
  { urls: 'turn:relay1.expressturn.com:3478?transport=tcp', username: TURN_USERNAME, credential: TURN_CREDENTIAL },
  { urls: 'turn:openrelay.metered.ca:80',                   username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',                  username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp',    username: 'openrelayproject', credential: 'openrelayproject' },
];

export type QualityPreset = '360p' | '480p' | '720p' | '1080p';
export type FPSPreset = 15 | 24 | 30 | 60;
export type AudioMode =
  | 'none'      // بدون صوت
  | 'internal'  // صوت داخلي فقط (صوت التطبيقات)
  | 'mic'       // مايكروفون فقط
  | 'both';     // داخلي + مايكروفون

// ─── الحد الأقصى للمشاهدين (P2P mesh — كل مشاهد يستهلك upload منفصل) ───────
export const MAX_VIEWERS = 10;

const QUALITY_MAP: Record<QualityPreset, { w: number; h: number; br: number }> = {
  '360p':  { w: 640,  h: 360,  br: 800_000  },
  '480p':  { w: 854,  h: 480,  br: 1_500_000 },
  '720p':  { w: 1280, h: 720,  br: 3_000_000 },
  '1080p': { w: 1920, h: 1080, br: 8_000_000 },
};

// مهلة الاتصال — إذا لم يتصل المشاهد خلال 30 ثانية نُغلق الاتصال
const CONNECTION_TIMEOUT_MS = 30_000;

// ─── HOST SERVICE ──────────────────────────────────
export class HostService {
  private pcs     = new Map<string, RTCPeerConnection>();
  private stream  : MediaStream | null = null;
  private code    = '';
  private unsubs  : Array<() => void> = [];
  private retries = new Map<string, ReturnType<typeof setTimeout>>();
  // عداد المحاولات لكل مشاهد — خارج connectViewer لتجنب closure bug
  private retryCounts = new Map<string, number>();
  private stopped = false;

  // ─── التقاط الشاشة مع خيارات الصوت ──────────────────────────────────────
  async captureScreen(
    quality: QualityPreset,
    fps: FPSPreset,
    audioMode: AudioMode = 'none',
  ): Promise<MediaStream> {
    const q = QUALITY_MAP[quality];
    let stream: MediaStream | null = null;

    const needInternal = audioMode === 'internal' || audioMode === 'both';
    const needMic      = audioMode === 'mic'      || audioMode === 'both';

    // ── الخطوة 1: التقاط الشاشة ─────────────────────────────────────────────
    if (needInternal) {
      // نحاول مع audio:true أولاً (يلتقط الصوت الداخلي على Android 10+)
      try {
        stream = await (mediaDevices as any).getDisplayMedia({
          video: {
            width:     { ideal: q.w, max: q.w },
            height:    { ideal: q.h, max: q.h },
            frameRate: { ideal: fps, max: fps },
          },
          audio: true,
        });
      } catch {
        stream = null;
      }
    }

    // إذا لم ينجح أو لم يُطلب الداخلي — التقاط بدون صوت
    if (!stream) {
      stream = await (mediaDevices as any).getDisplayMedia({
        video: {
          width:     { ideal: q.w, max: q.w },
          height:    { ideal: q.h, max: q.h },
          frameRate: { ideal: fps, max: fps },
        },
        audio: false,
      });
    }

    if (!stream) throw new Error('لم يتم منح إذن الشاشة');

    // ── الخطوة 2: إضافة المايكروفون إذا طُلب ────────────────────────────────
    if (needMic) {
      try {
        const micStream = await (mediaDevices as any).getUserMedia({
          audio: {
            echoCancellation: audioMode === 'mic', // إلغاء صدى فقط عند الميكروفون وحده
            noiseSuppression: audioMode === 'mic',
            autoGainControl:  audioMode === 'mic',
          },
          video: false,
        });
        const micTrack = micStream.getAudioTracks()[0];
        if (micTrack) stream.addTrack(micTrack);
      } catch {
        // المستخدم رفض — نكمل بدون ميكروفون
      }
    }

    // ── الخطوة 3: ضبط video constraints ──────────────────────────────────────
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack && typeof (videoTrack as any).applyConstraints === 'function') {
      await (videoTrack as any).applyConstraints({
        width:     { ideal: q.w },
        height:    { ideal: q.h },
        frameRate: { ideal: fps },
      }).catch(() => {});
    }

    this.stream  = stream;
    this.stopped = false;
    return stream;
  }

  // الاستماع على المشاهدين الجدد مع فحص الحد الأقصى
  startListening(code: string): void {
    this.code = code;
    const ref = database().ref(`sessions/${code}/viewers`);
    const h = (ref as any).on('child_added', (snap: any) => {
      if (!snap.key || this.stopped) return true;

      // فحص الحد الأقصى — إذا امتلأ نطرد المشاهد الجديد فوراً
      if (this.pcs.size >= MAX_VIEWERS) {
        database()
          .ref(`sessions/${code}/signals/${snap.key}/kicked`)
          .set(true)
          .catch(() => {});
        return;
      }

      this.connectViewer(snap.key);
    });
    this.unsubs.push(() => (ref as any).off('child_added', h));
  }

  private async connectViewer(vid: string): Promise<void> {
    if (this.pcs.has(vid) || !this.stream || this.stopped) return;

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
    });
    this.pcs.set(vid, pc);

    // مهلة الاتصال — إذا لم يصل لـ connected خلال 30 ثانية نُنظّف
    const timeoutId = setTimeout(() => {
      if ((pc as any).connectionState !== 'connected' && !this.stopped) {
        this.pcs.delete(vid);
        try { pc.close(); } catch {}
        // حذف بيانات المشاهد من Firebase
        database().ref(`sessions/${this.code}/signals/${vid}`).remove().catch(() => {});
        database().ref(`sessions/${this.code}/viewers/${vid}`).remove().catch(() => {});
      }
    }, CONNECTION_TIMEOUT_MS);

    // إضافة video track
    this.stream.getTracks().forEach(t => pc.addTrack(t, this.stream!));

    // ICE candidates
    (pc as any).onicecandidate = async (e: any) => {
      if (!e.candidate || this.stopped) return;
      try {
        await database()
          .ref(`sessions/${this.code}/signals/${vid}/hostCandidates`)
          .push({
            candidate: e.candidate.candidate,
            sdpMid: e.candidate.sdpMid,
            sdpMLineIndex: e.candidate.sdpMLineIndex,
            ts: Date.now(),
          });
      } catch {}
    };

    // مراقبة حالة الاتصال مع إعادة المحاولة الذكية
    const MAX_RETRIES = 3;

    (pc as any).onconnectionstatechange = () => {
      if (this.stopped) return;
      const st = (pc as any).connectionState;

      if (st === 'connected') {
        clearTimeout(timeoutId);
        const t = this.retries.get(vid);
        if (t) { clearTimeout(t); this.retries.delete(vid); }
        this.retryCounts.delete(vid); // إعادة تعيين العداد عند النجاح

      } else if (st === 'failed' || st === 'disconnected') {
        clearTimeout(timeoutId);
        this.pcs.delete(vid);
        try { pc.close(); } catch {}

        const current = this.retryCounts.get(vid) ?? 0;
        if (current < MAX_RETRIES) {
          this.retryCounts.set(vid, current + 1);
          const delay = Math.pow(2, current + 1) * 1000; // 2s, 4s, 8s
          const t = setTimeout(() => {
            this.retries.delete(vid);
            if (!this.stopped) this.connectViewer(vid);
          }, delay);
          this.retries.set(vid, t);
        } else {
          // استنفدنا المحاولات — طرد المشاهد وتنظيف العداد
          this.retryCounts.delete(vid);
          database()
            .ref(`sessions/${this.code}/signals/${vid}/kicked`)
            .set(true)
            .catch(() => {});
        }
      }
    };

    // مراقبة ICE state (مكمّلة لـ connectionState)
    (pc as any).oniceconnectionstatechange = () => {
      if (this.stopped) return;
      const ist = (pc as any).iceConnectionState;
      if (ist === 'failed') {
        // محاولة restart ICE قبل الاستسلام
        try { (pc as any).restartIce?.(); } catch {}
      }
    };

    // إنشاء وإرسال Offer
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);
      await database()
        .ref(`sessions/${this.code}/signals/${vid}/offer`)
        .set({ type: 'offer', sdp: (offer as any).sdp, ts: Date.now() });
    } catch {
      this.pcs.delete(vid);
      pc.close();
      return;
    }

    // استقبال Answer
    const aRef = database().ref(`sessions/${this.code}/signals/${vid}/answer`);
    const aH = (aRef as any).on('value', async (s: any) => {
      if (!s.exists() || this.stopped) return true;
      if ((pc as any).signalingState !== 'have-local-offer') return true;
      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp: s.val().sdp })
        );
      } catch {}
    });
    this.unsubs.push(() => (aRef as any).off('value', aH));

    // استقبال ICE من المشاهد
    const iRef = database().ref(`sessions/${this.code}/signals/${vid}/viewerCandidates`);
    const iH = (iRef as any).on('child_added', async (s: any) => {
      if (!s.exists() || this.stopped) return true;
      const c = s.val();
      try {
        await pc.addIceCandidate(new RTCIceCandidate({
          candidate: c.candidate,
          sdpMid: c.sdpMid,
          sdpMLineIndex: c.sdpMLineIndex,
        }));
      } catch {}
      return true;
    });
    this.unsubs.push(() => (iRef as any).off('child_added', iH));

    // استقبال طلب جودة من المشاهد
    const qRef = database().ref(`sessions/${this.code}/signals/${vid}/requestedQuality`);
    const qH = (qRef as any).on('value', async (s: any) => {
      if (!s.exists() || this.stopped) return;
      const { quality } = s.val() as { quality: QualityPreset };
      if (!quality || !QUALITY_MAP[quality]) return;
      const q = QUALITY_MAP[quality];
      const sender = (pc as any).getSenders().find((s: any) => s.track?.kind === 'video');
      if (!sender) return;
      try {
        const p = sender.getParameters();
        if (!p.encodings) p.encodings = [{}];
        if (!p.encodings[0]) p.encodings[0] = {};
        p.encodings[0].maxBitrate = q.br;
        await sender.setParameters(p);
      } catch {}
    });
    this.unsubs.push(() => (qRef as any).off('value', qH));
  }

  // تغيير الجودة فوراً لكل المشاهدين
  async setQuality(quality: QualityPreset, fps: FPSPreset): Promise<void> {
    const q = QUALITY_MAP[quality];
    for (const pc of this.pcs.values()) {
      for (const sender of (pc as any).getSenders()) {
        if (sender.track?.kind === 'video') {
          try {
            const p = sender.getParameters();
            if (!p.encodings) p.encodings = [{}];
            if (!p.encodings[0]) p.encodings[0] = {};
            p.encodings[0].maxBitrate = q.br;
            p.encodings[0].maxFramerate = fps;
            await sender.setParameters(p);
          } catch {}
        }
      }
    }
  }

  // إحصائيات — delta bytes لكل PC منفصل
  private _statsCache = new Map<string, { bytes: number; ts: number }>();

  async getStats(): Promise<{ fps: number; bitrate: number; latency: number }> {
    let fps = 0, totalBitrate = 0, latency = 0, pcCount = 0;

    for (const [vid, pc] of this.pcs.entries()) {
      try {
        const stats = await (pc as any).getStats();
        const now = Date.now();
        const prev = this._statsCache.get(vid) ?? { bytes: 0, ts: 0 };

        (stats as any).forEach((r: any) => {
          if (r.type === 'outbound-rtp' && r.kind === 'video') {
            fps = r.framesPerSecond || fps;
            const bytes = r.bytesSent || 0;
            if (prev.ts > 0 && now > prev.ts) {
              const delta = bytes - prev.bytes;
              const secs  = (now - prev.ts) / 1000;
              totalBitrate += Math.max(0, (delta * 8) / secs / 1000);
            }
            this._statsCache.set(vid, { bytes, ts: now });
            pcCount++;
          }
          if (r.type === 'candidate-pair' && r.nominated && r.currentRoundTripTime) {
            latency = Math.max(latency, r.currentRoundTripTime * 1000);
          }
        });
      } catch {}
    }

    // تنظيف cache للمشاهدين المنفصلين
    for (const vid of this._statsCache.keys()) {
      if (!this.pcs.has(vid)) this._statsCache.delete(vid);
    }

    return {
      fps:     Math.round(fps),
      bitrate: Math.round(totalBitrate), // مجموع كل الـ PCs
      latency: Math.round(latency),
    };
  }

  // إيقاف كل شيء
  stop(): void {
    this.stopped = true;
    this.retries.forEach(t => clearTimeout(t));
    this.retries.clear();
    this.retryCounts.clear();
    this._statsCache.clear();
    this.pcs.forEach(pc => { try { pc.close(); } catch {} });
    this.pcs.clear();
    try { this.stream?.getTracks().forEach(t => t.stop()); } catch {}
    this.stream = null;
    this.unsubs.forEach(f => { try { f(); } catch {} });
    this.unsubs = [];
    this.code = '';
  }
}

// ─── VIEWER SERVICE ────────────────────────────────
export class ViewerService {
  private pc     : RTCPeerConnection | null = null;
  private unsubs : Array<() => void> = [];
  private code   = '';
  private vid    = '';
  private got    = false;
  private done   = false;

  async connect(
    code: string,
    viewerId: string,
    onStream: (s: MediaStream) => void,
    onDisconnect: () => void,
  ): Promise<void> {
    this.code = code;
    this.vid = viewerId;
    this.done = false;
    this.got = false;

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
    });
    this.pc = pc;

    // استقبال stream
    (pc as any).ontrack = (e: any) => {
      if (e.streams?.[0] && !this.got && !this.done) {
        this.got = true;
        onStream(e.streams[0]);
      }
    };

    // مراقبة الاتصال — disconnected مؤقت، failed/closed نهائي
    let disconnectTimer: ReturnType<typeof setTimeout> | null = null;

    (pc as any).onconnectionstatechange = () => {
      if (this.done) return;
      const st = (pc as any).connectionState;

      if (st === 'connected') {
        // إلغاء أي timer معلق
        if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }

      } else if (st === 'disconnected') {
        // ننتظر 5 ثوانٍ — قد يعود الاتصال تلقائياً
        disconnectTimer = setTimeout(() => {
          if ((pc as any).connectionState === 'disconnected' && !this.done) {
            onDisconnect();
          }
        }, 5000);

      } else if (st === 'failed' || st === 'closed') {
        if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }
        if (!this.done) onDisconnect();
      }
    };

    // ICE candidates
    (pc as any).onicecandidate = async (e: any) => {
      if (!e.candidate || this.done) return;
      try {
        await database()
          .ref(`sessions/${code}/signals/${viewerId}/viewerCandidates`)
          .push({
            candidate: e.candidate.candidate,
            sdpMid: e.candidate.sdpMid,
            sdpMLineIndex: e.candidate.sdpMLineIndex,
            ts: Date.now(),
          });
      } catch {}
    };

    // تسجيل الانضمام
    try {
      await database()
        .ref(`sessions/${code}/viewers/${viewerId}`)
        .set({ joinedAt: Date.now() });
      await database()
        .ref(`sessions/${code}/viewerCount`)
        .transaction((c: any) => (c || 0) + 1);
    } catch {}

    // استقبال Offer
    const oRef = database().ref(`sessions/${code}/signals/${viewerId}/offer`);
    const oH = (oRef as any).on('value', async (s: any) => {
      if (!s.exists() || this.done) return true;
      const data = s.val();
      if (!data?.sdp) return true;
      const st = (pc as any).signalingState;
      if (st !== 'stable' && st !== 'have-remote-offer') return true;
      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'offer', sdp: data.sdp })
        );
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await database()
          .ref(`sessions/${code}/signals/${viewerId}/answer`)
          .set({ type: 'answer', sdp: (answer as any).sdp, ts: Date.now() });
      } catch {}
    });
    this.unsubs.push(() => (oRef as any).off('value', oH));

    // ICE من المضيف
    const iRef = database().ref(`sessions/${code}/signals/${viewerId}/hostCandidates`);
    const iH = (iRef as any).on('child_added', async (s: any) => {
      if (!s.exists() || this.done) return;
      const c = s.val();
      try {
        await pc.addIceCandidate(new RTCIceCandidate({
          candidate: c.candidate,
          sdpMid: c.sdpMid,
          sdpMLineIndex: c.sdpMLineIndex,
        }));
      } catch {}
    });
    this.unsubs.push(() => (iRef as any).off('child_added', iH));

    // الطرد — ينظف كل الـ listeners أولاً
    const kRef = database().ref(`sessions/${code}/signals/${viewerId}/kicked`);
    const kH = (kRef as any).on('value', (s: any) => {
      if (s.val() === true && !this.done) {
        this.unsubs.forEach(f => { try { f(); } catch {} });
        this.unsubs = [];
        onDisconnect();
      }
      return true;
    });
    this.unsubs.push(() => (kRef as any).off('value', kH));

    // انتهاء الجلسة — ينظف كل الـ listeners أولاً
    const sRef = database().ref(`sessions/${code}/status`);
    const sH = (sRef as any).on('value', (s: any) => {
      if (s.val() === 'ended' && !this.done) {
        this.unsubs.forEach(f => { try { f(); } catch {} });
        this.unsubs = [];
        onDisconnect();
      }
      return true;
    });
    this.unsubs.push(() => (sRef as any).off('value', sH));
  }

  // تعديل جودة الاستقبال — يُبلّغ المضيف عبر Firebase ليضبط الـ bitrate
  async setQuality(quality: QualityPreset): Promise<void> {
    if (!this.code || !this.vid || this.done) return;
    try {
      await database()
        .ref(`sessions/${this.code}/signals/${this.vid}/requestedQuality`)
        .set({ quality, ts: Date.now() });
    } catch {}
  }

  async disconnect(): Promise<void> {
    this.done = true;
    this.unsubs.forEach(f => { try { f(); } catch {} });
    this.unsubs = [];
    try { this.pc?.close(); } catch {}
    this.pc   = null;
    this.got  = false;

    if (this.code && this.vid) {
      try {
        await Promise.allSettled([
          database().ref(`sessions/${this.code}/viewers/${this.vid}`).remove(),
          database()
            .ref(`sessions/${this.code}/viewerCount`)
            .transaction((c: any) => Math.max(0, (c || 1) - 1)),
          database().ref(`sessions/${this.code}/signals/${this.vid}`).remove(),
        ]);
      } catch {}
    }
    this.code = '';
    this.vid = '';
  }
}
