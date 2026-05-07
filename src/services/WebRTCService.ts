// src/services/WebRTCService.ts — النسخة النهائية المكتملة
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
import Constants from 'expo-constants';

function getTurnCredentials(): { username: string; credential: string } {
  const turn = Constants.expoConfig?.extra?.turn;
  return {
    username:   turn?.username   || '000000002092897688',
    credential: turn?.credential || 'rdGLI//QUO7PqrvIfeD/47q+EKg=',
  };
}

const { username: TURN_USER, credential: TURN_CRED } = getTurnCredentials();

const ICE_SERVERS = [
  // STUN مجاني من Google
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  // TURN رئيسي — ExpressTURN
  { urls: 'turn:relay1.expressturn.com:3478',              username: TURN_USER, credential: TURN_CRED },
  { urls: 'turn:relay1.expressturn.com:3478?transport=tcp', username: TURN_USER, credential: TURN_CRED },
  // TURN احتياطي مجاني — Open Relay
  { urls: 'turn:openrelay.metered.ca:80',                  username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',                 username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp',   username: 'openrelayproject', credential: 'openrelayproject' },
];

export type QualityPreset = '360p' | '480p' | '720p' | '1080p';
export type FPSPreset = 15 | 24 | 30 | 60;

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
// lazy loader للـ ScreenCapture — يتجنب module-level side effects
async function getScreenCapture() {
  try {
    const m = await import('../../modules/screen-capture');
    return m.ScreenCapture;
  } catch {
    return null;
  }
}

export class HostService {
  private pcs     = new Map<string, RTCPeerConnection>();
  private stream  : MediaStream | null = null;
  private code    = '';
  private unsubs  : Array<() => void> = [];
  private retries = new Map<string, ReturnType<typeof setTimeout>>();
  // عداد المحاولات لكل مشاهد — خارج connectViewer لتجنب closure bug
  private retryCounts = new Map<string, number>();
  private stopped = false;

  // ─── التقاط الشاشة مع الصوت الداخلي الاختياري ──────────────────────────
  async captureScreen(
    quality: QualityPreset,
    fps: FPSPreset,
    withInternalAudio = false,
  ): Promise<MediaStream> {
    const q = QUALITY_MAP[quality];

    // 1. التقاط الشاشة بـ constraints حقيقية
    const stream = await (mediaDevices as any).getDisplayMedia({
      video: {
        width:     { ideal: q.w, max: q.w },
        height:    { ideal: q.h, max: q.h },
        frameRate: { ideal: fps, max: fps },
      },
      audio: false,
    });

    if (!stream) throw new Error('لم يتم منح إذن الشاشة');

    // ضبط constraints على الـ track مباشرة
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack && typeof (videoTrack as any).applyConstraints === 'function') {
      await (videoTrack as any).applyConstraints({
        width:     { ideal: q.w },
        height:    { ideal: q.h },
        frameRate: { ideal: fps },
      }).catch(() => {});
    }

    // 2. إضافة الصوت الداخلي إذا طُلب وكان مدعوماً
    if (withInternalAudio) {
      const sc = await getScreenCapture();
      if (sc?.isSupported() && sc?.hasProjection()) {
        await sc.startInternalAudio().catch(() => {});
      }
    }

    this.stream  = stream;
    this.stopped = false;
    return stream;
  }

  // الاستماع على المشاهدين الجدد مع فحص الحد الأقصى
  startListening(code: string): void {
    this.code = code;
    const ref = database().ref(`sessions/${code}/viewers`);
    const h = ref.on('child_added', (snap: any) => {
      if (!snap.key || this.stopped) return;

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
    this.unsubs.push(() => ref.off('child_added', h));
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
    const aH = aRef.on('value', async (s: any) => {
      if (!s.exists() || this.stopped) return;
      if ((pc as any).signalingState !== 'have-local-offer') return;
      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp: s.val().sdp })
        );
      } catch {}
    });
    this.unsubs.push(() => aRef.off('value', aH));

    // استقبال ICE من المشاهد
    const iRef = database().ref(`sessions/${this.code}/signals/${vid}/viewerCandidates`);
    const iH = iRef.on('child_added', async (s: any) => {
      if (!s.exists() || this.stopped) return;
      const c = s.val();
      try {
        await pc.addIceCandidate(new RTCIceCandidate({
          candidate: c.candidate,
          sdpMid: c.sdpMid,
          sdpMLineIndex: c.sdpMLineIndex,
        }));
      } catch {}
    });
    this.unsubs.push(() => iRef.off('child_added', iH));

    // استقبال طلب جودة من المشاهد
    const qRef = database().ref(`sessions/${this.code}/signals/${vid}/requestedQuality`);
    const qH = qRef.on('value', async (s: any) => {
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
    this.unsubs.push(() => qRef.off('value', qH));
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

  // إحصائيات — مع حساب bitrate صحيح (delta لا total)
  private _prevBytes   = 0;
  private _prevBytesTs = 0;

  async getStats(): Promise<{ fps: number; bitrate: number; latency: number }> {
    let fps = 0, bitrate = 0, latency = 0;
    for (const pc of this.pcs.values()) {
      try {
        const stats = await (pc as any).getStats();
        (stats as any).forEach((r: any) => {
          if (r.type === 'outbound-rtp' && r.kind === 'video') {
            fps = r.framesPerSecond || fps;
            // معدل البيانات الفعلي (Kbps) بدلاً من الإجمالي
            const now   = Date.now();
            const bytes = r.bytesSent || 0;
            if (this._prevBytesTs > 0 && now > this._prevBytesTs) {
              const deltaBytes = bytes - this._prevBytes;
              const deltaSec   = (now - this._prevBytesTs) / 1000;
              bitrate = Math.max(0, (deltaBytes * 8) / deltaSec / 1000); // Kbps
            }
            this._prevBytes   = bytes;
            this._prevBytesTs = now;
          }
          if (r.type === 'candidate-pair' && r.nominated) {
            latency = r.currentRoundTripTime ? r.currentRoundTripTime * 1000 : latency;
          }
        });
      } catch {}
    }
    return { fps: Math.round(fps), bitrate: Math.round(bitrate), latency: Math.round(latency) };
  }

  // إيقاف كل شيء
  stop(): void {
    this.stopped = true;
    this.retries.forEach(t => clearTimeout(t));
    this.retries.clear();
    this.retryCounts.clear();
    this.pcs.forEach(pc => { try { pc.close(); } catch {} });
    this.pcs.clear();
    try { this.stream?.getTracks().forEach(t => t.stop()); } catch {}
    this.stream = null;
    this.unsubs.forEach(f => { try { f(); } catch {} });
    this.unsubs = [];
    this.code = '';

    // إيقاف الصوت الداخلي — lazy
    getScreenCapture().then(sc => {
      if (sc?.isCapturing()) sc.stopInternalAudio().catch(() => {});
    }).catch(() => {});
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

    // مراقبة الاتصال
    (pc as any).onconnectionstatechange = () => {
      if (this.done) return;
      const st = (pc as any).connectionState;
      if (st === 'failed' || st === 'disconnected' || st === 'closed') {
        onDisconnect();
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
    const oH = oRef.on('value', async (s: any) => {
      if (!s.exists() || this.done) return;
      const data = s.val();
      if (!data?.sdp) return;
      const st = (pc as any).signalingState;
      if (st !== 'stable' && st !== 'have-remote-offer') return;
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
    this.unsubs.push(() => oRef.off('value', oH));

    // ICE من المضيف
    const iRef = database().ref(`sessions/${code}/signals/${viewerId}/hostCandidates`);
    const iH = iRef.on('child_added', async (s: any) => {
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
    this.unsubs.push(() => iRef.off('child_added', iH));

    // الطرد
    const kRef = database().ref(`sessions/${code}/signals/${viewerId}/kicked`);
    const kH = kRef.on('value', (s: any) => {
      if (s.val() === true && !this.done) onDisconnect();
    });
    this.unsubs.push(() => kRef.off('value', kH));

    // انتهاء الجلسة
    const sRef = database().ref(`sessions/${code}/status`);
    const sH = sRef.on('value', (s: any) => {
      if (s.val() === 'ended' && !this.done) onDisconnect();
    });
    this.unsubs.push(() => sRef.off('value', sH));
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
    this.pc = null;
    this.got = false;

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
