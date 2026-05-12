// src/screens/HostScreen.tsx — النسخة النهائية الكاملة
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  ScrollView, Alert, Vibration, Platform,
  PermissionsAndroid, Share, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import notifee, { EventType } from '@notifee/react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { generateSessionCode, formatCode } from '../utils/CodeGenerator';
import SignalingService from '../services/SignalingService';
import { HostService, QualityPreset, FPSPreset, MAX_VIEWERS, AudioMode } from '../services/WebRTCService';
import { ForegroundService } from '../services/ForegroundService';
import { promptAutoStartIfNeeded } from '../utils/AutoStartHelper';

type Phase = 'setup' | 'requesting' | 'live';
interface Viewer { id: string }

export default function HostScreen({ navigation }: any) {
  const [phase, setPhase] = useState<Phase>('setup');
  // كود جديد في كل مرة تُفتح شاشة المضيف
  const [code] = useState(() => generateSessionCode());
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [quality, setQuality] = useState<QualityPreset>('1080p');
  const [fps, setFps] = useState<FPSPreset>(60);
  const [audioMode, setAudioMode] = useState<AudioMode>('none');
  const [internalAudioSupported, setInternalAudioSupported] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [stats, setStats] = useState({ fps: 0, bitrate: 0, latency: 0 });
  const [showViewers, setShowViewers] = useState(false);

  const liveAnim  = useRef(new Animated.Value(1)).current;
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubsRef = useRef<Array<() => void>>([]);
  const hostRef   = useRef<HostService | null>(null);
  const phaseRef  = useRef<Phase>('setup');

  phaseRef.current = phase;

  // الصوت الداخلي مدعوم على Android 10+ عبر getDisplayMedia
  useEffect(() => {
    // Platform.Version على Android يكون رقماً مباشرة
    const v = typeof Platform.Version === 'number'
      ? Platform.Version
      : parseInt(String(Platform.Version) || '0', 10);
    setInternalAudioSupported(v >= 29);
  }, []);

  // زر الرجوع
  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phaseRef.current === 'live') { confirmStop(); return true; }
      return false;
    });
    return () => h.remove();
  }, []);

  // ref لـ doStop لتجنب استخدامه قبل تعريفه
  const doStopRef = useRef<(() => void) | null>(null);

  // إشعارات Notifee (زر إيقاف البث من الإشعار)
  useEffect(() => {
    const unsub = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'stop') {
        doStopRef.current?.();
      }
    });
    return () => { unsub(); };
  }, []);

  // نبضة LIVE + مؤقت + إحصائيات
  useEffect(() => {
    if (phase !== 'live') return;
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(liveAnim, { toValue: 0.2, duration: 700, useNativeDriver: true }),
      Animated.timing(liveAnim, { toValue: 1,   duration: 700, useNativeDriver: true }),
    ]));
    pulse.start();

    const start = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    statsRef.current = setInterval(async () => {
      const s = await hostRef.current?.getStats() ?? { fps: 0, bitrate: 0, latency: 0 };
      setStats(s);
    }, 3000);

    return () => {
      pulse.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (statsRef.current) clearInterval(statsRef.current);
    };
  }, [phase]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const doCleanup = useCallback((stopFg = true, endSess = false) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (statsRef.current) clearInterval(statsRef.current);
    unsubsRef.current.forEach(u => { try { u(); } catch {} });
    unsubsRef.current = [];
    hostRef.current?.stop();
    hostRef.current = null;
    if (stopFg) ForegroundService.stop().catch(() => {});
    if (endSess) SignalingService.endSession(code).catch(() => {});
  }, [code]);

  // تنظيف عند مغادرة الشاشة — بعد تعريف doCleanup
  useEffect(() => {
    return () => {
      const isLive = phaseRef.current === 'live';
      doCleanup(isLive, isLive);
    };
  }, [doCleanup]);

  const startBroadcast = async () => {
    setPhase('requesting');
    try {
      // 0. تنبيه AutoStart على أجهزة Xiaomi/Huawei/إلخ (مرة واحدة فقط)
      promptAutoStartIfNeeded().catch(() => {});

      // 1. طلب إذن الإشعارات (Android 13+)
      if (Platform.OS === 'android') {
        await notifee.requestPermission();
      }

      // 2. طلب إذن الصوت (للمايكروفون إذا اختار المستخدم)
      if (Platform.OS === 'android') {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'صلاحية الصوت',
            message: 'مطلوب للبث — حتى لو لم تختر المايكروفون',
            buttonPositive: 'السماح',
            buttonNegative: 'رفض',
          }
        ).catch(() => {});
      }

      // 3. تشغيل Foreground Service — إجباري قبل getDisplayMedia على Android 10+
      await ForegroundService.start();

      // 4. التقاط الشاشة — يُظهر نافذة Android الرسمية
      const host = new HostService();
      hostRef.current = host;
      await host.captureScreen(quality, fps, audioMode);

      // 5. إنشاء الجلسة في Firebase
      await SignalingService.createSession(code, `host-${Date.now()}`, false);

      // 6. الاستماع على المشاهدين الجدد وتوصيلهم P2P
      host.startListening(code);

      // 7. مستمعات الواجهة
      const u1 = SignalingService.onViewerJoined(code, (id) => {
        setViewers(prev => {
          if (prev.find(v => v.id === id)) return prev;
          const next = [...prev, { id }];
          // تحذير عند الاقتراب من الحد الأقصى
          if (next.length === MAX_VIEWERS) {
            Alert.alert(
              '⚠️ الحد الأقصى',
              `وصلت لـ ${MAX_VIEWERS} مشاهدين — الحد الأقصى المدعوم. لن يُقبل أي مشاهد جديد.`,
              [{ text: 'حسناً' }]
            );
          }
          return next;
        });
        Vibration.vibrate(50);
      });
      const u2 = SignalingService.onViewerCountChanged(code, (cnt) => {
        setViewerCount(cnt);
        ForegroundService.updateViewerCount(cnt).catch(() => {});
      });
      const u3 = SignalingService.onSessionStatusChanged(code, (st) => {
        if (st === 'ended') doStopRef.current?.();
      });
      unsubsRef.current.push(u1, u2, u3);

      setPhase('live');

    } catch (err: any) {
      setPhase('setup');
      hostRef.current = null;
      ForegroundService.stop().catch(() => {});
      const msg: string = err?.message || '';
      const cancelled = ['cancel','denied','dismiss','abort','user denied'].some(
        k => msg.toLowerCase().includes(k)
      );
      if (!cancelled) {
        Alert.alert('تعذّر بدء البث', msg || 'حاول مجدداً');
      }
    }
  };

  const doStop = useCallback(async () => {
    doCleanup(true, true);
    navigation.goBack();
  }, [doCleanup]);

  // تحديث الـ ref دائماً بأحدث نسخة من doStop
  useEffect(() => { doStopRef.current = doStop; }, [doStop]);

  const confirmStop = () => {
    const msg = viewerCount > 0
      ? `سيُبلَّغ ${viewerCount} مشاهد بانتهاء البث`
      : 'إيقاف البث المباشر؟';
    Alert.alert('إيقاف البث', msg, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'إيقاف', style: 'destructive', onPress: doStop },
    ]);
  };

  const shareCode = async () => {
    try {
      await Share.share({
        message: `📡 انضم لمشاهدة شاشتي عبر Share Ur Screen!\nالكود: ${formatCode(code)}`,
      });
    } catch {}
  };

  const handleCopy = async () => {
    try {
      Clipboard.setString(formatCode(code));
    } catch {
      await Share.share({ message: formatCode(code) }).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const kickViewer = (id: string) => {
    Alert.alert('طرد مشاهد', 'هل تريد طرد هذا المشاهد؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'طرد', style: 'destructive',
        onPress: async () => {
          await SignalingService.kickViewer(code, id).catch(() => {});
          setViewers(prev => prev.filter(v => v.id !== id));
        },
      },
    ]);
  };

  const handleQuality = async (q: QualityPreset, f: FPSPreset) => {
    setQuality(q); setFps(f);
    if (phase === 'live') await hostRef.current?.setQuality(q, f).catch(() => {});
  };

  return (
    <SafeAreaView style={st.container}>
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={st.header}>
          <TouchableOpacity style={st.backBtn}
            onPress={() => phase === 'live' ? confirmStop() : navigation.goBack()}>
            <Text style={st.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={st.headerTitle}>
            {phase === 'setup' ? 'إعداد البث'
             : phase === 'requesting' ? '⏳ جارٍ الإعداد...'
             : 'البث مباشر'}
          </Text>
          {phase === 'live' ? (
            <View style={st.liveTag}>
              <Animated.View style={[st.liveDot, { opacity: liveAnim }]} />
              <Text style={st.liveTxt}>LIVE</Text>
            </View>
          ) : <View style={{ width: 70 }} />}
        </View>

        {/* كود الجلسة */}
        <View style={st.codeCard}>
          <View style={st.codeBar} />
          <Text style={st.codeLabel}>كود الجلسة</Text>
          <Text style={st.codeValue} selectable>{formatCode(code)}</Text>
          <View style={st.codeActions}>
            <TouchableOpacity style={st.codeBtn} onPress={handleCopy} activeOpacity={0.8}>
              <Text style={st.codeBtnTxt}>{copied ? '✅ تم!' : '📋 نسخ'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.codeBtn, st.codeBtnBlue]} onPress={shareCode} activeOpacity={0.8}>
              <Text style={[st.codeBtnTxt, { color: Colors.brand.blue }]}>📤 مشاركة</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* إحصائيات أثناء البث */}
        {phase === 'live' && (
          <View style={st.statsRow}>
            {[
              { v: formatTime(elapsed),                             l: 'المدة' },
              { v: `${viewerCount}/${MAX_VIEWERS}`,                 l: 'مشاهدون' },
              { v: `${stats.bitrate > 0 ? stats.bitrate : '--'} K`, l: 'Kbps' },
              { v: stats.latency > 0 ? `${stats.latency}ms` : '--', l: 'تأخر' },
            ].map((s, i) => (
              <React.Fragment key={s.l}>
                {i > 0 && <View style={st.statDiv} />}
                <View style={st.statItem}>
                  <Text style={[
                    st.statVal,
                    s.l === 'مشاهدون' && viewerCount >= MAX_VIEWERS && { color: '#EF4444' }
                  ]}>{s.v}</Text>
                  <Text style={st.statLbl}>{s.l}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}

        {/* الجودة والـ FPS */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>الدقة</Text>
          <View style={st.row}>
            {(['360p','480p','720p','1080p'] as QualityPreset[]).map(q => (
              <TouchableOpacity key={q} activeOpacity={0.8}
                style={[st.optBtn, quality === q && st.optBtnPurple]}
                onPress={() => handleQuality(q, fps)}>
                <Text style={[st.optTxt, quality === q && st.optTxtPurple]}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[st.sectionTitle, { marginTop: 14 }]}>معدل الإطارات (FPS)</Text>
          <View style={st.row}>
            {([15, 24, 30, 60] as FPSPreset[]).map(f => (
              <TouchableOpacity key={f} activeOpacity={0.8}
                style={[st.optBtn, fps === f && st.optBtnBlue]}
                onPress={() => handleQuality(quality, f)}>
                <Text style={[st.optTxt, fps === f && st.optTxtBlue]}>{f}</Text>
                <Text style={[st.optSub, fps === f && { color: Colors.brand.blue }]}>fps</Text>
                {f === 60 && <Text style={st.star}>⭐</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* خيارات الصوت */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>🔊 الصوت</Text>
          <View style={st.audioGrid}>

            {/* بدون صوت */}
            <TouchableOpacity
              style={[st.audioBtn, audioMode === 'none' && st.audioBtnActive]}
              onPress={() => setAudioMode('none')}
              disabled={phase === 'live'}
              activeOpacity={0.8}
            >
              <Text style={st.audioBtnIcon}>🔇</Text>
              <Text style={[st.audioBtnTxt, audioMode === 'none' && st.audioBtnTxtActive]}>
                بدون صوت
              </Text>
            </TouchableOpacity>

            {/* مايكروفون فقط */}
            <TouchableOpacity
              style={[st.audioBtn, audioMode === 'mic' && st.audioBtnActive]}
              onPress={() => setAudioMode('mic')}
              disabled={phase === 'live'}
              activeOpacity={0.8}
            >
              <Text style={st.audioBtnIcon}>🎤</Text>
              <Text style={[st.audioBtnTxt, audioMode === 'mic' && st.audioBtnTxtActive]}>
                مايكروفون
              </Text>
            </TouchableOpacity>

            {/* صوت داخلي فقط — Android 10+ */}
            <TouchableOpacity
              style={[
                st.audioBtn,
                audioMode === 'internal' && st.audioBtnActive,
                !internalAudioSupported && st.audioBtnDisabled,
              ]}
              onPress={() => internalAudioSupported && setAudioMode('internal')}
              disabled={phase === 'live' || !internalAudioSupported}
              activeOpacity={0.8}
            >
              <Text style={st.audioBtnIcon}>🔊</Text>
              <Text style={[
                st.audioBtnTxt,
                audioMode === 'internal' && st.audioBtnTxtActive,
                !internalAudioSupported && st.audioBtnTxtDisabled,
              ]}>
                {internalAudioSupported ? 'داخلي' : 'داخلي\n(10+)'}
              </Text>
            </TouchableOpacity>

            {/* داخلي + مايك — Android 10+ */}
            <TouchableOpacity
              style={[
                st.audioBtn,
                audioMode === 'both' && st.audioBtnActive,
                !internalAudioSupported && st.audioBtnDisabled,
              ]}
              onPress={() => internalAudioSupported && setAudioMode('both')}
              disabled={phase === 'live' || !internalAudioSupported}
              activeOpacity={0.8}
            >
              <Text style={st.audioBtnIcon}>🎙️</Text>
              <Text style={[
                st.audioBtnTxt,
                audioMode === 'both' && st.audioBtnTxtActive,
                !internalAudioSupported && st.audioBtnTxtDisabled,
              ]}>
                {internalAudioSupported ? 'الكل' : 'الكل\n(10+)'}
              </Text>
            </TouchableOpacity>

          </View>
          {!internalAudioSupported && (
            <Text style={st.audioHint}>
              💡 الصوت الداخلي يحتاج Android 10 أو أحدث
            </Text>
          )}
        </View>

        {/* المشاهدون */}
        {viewers.length > 0 && phase === 'live' && (
          <View style={st.section}>
            <TouchableOpacity style={st.sectionRow}
              onPress={() => setShowViewers(!showViewers)}>
              <Text style={st.sectionTitle}>المشاهدون ({viewers.length})</Text>
              <Text style={st.toggle}>{showViewers ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showViewers && viewers.map((v, i) => (
              <View key={v.id} style={st.viewerRow}>
                <View style={st.viewerAvatar}>
                  <Text style={st.viewerNum}>{i + 1}</Text>
                </View>
                <Text style={st.viewerName}>مشاهد {i + 1}</Text>
                <TouchableOpacity style={st.kickBtn} onPress={() => kickViewer(v.id)}>
                  <Text style={st.kickTxt}>طرد</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* زر البث */}
        <View style={{ marginTop: 8 }}>
          {phase === 'setup' && (
            <TouchableOpacity style={st.startBtn} onPress={startBroadcast} activeOpacity={0.85}>
              <Text style={st.startBtnTxt}>📡  ابدأ البث</Text>
            </TouchableOpacity>
          )}
          {phase === 'requesting' && (
            <View style={[st.startBtn, { opacity: 0.6 }]}>
              <Text style={st.startBtnTxt}>⏳  جارٍ طلب الصلاحية...</Text>
            </View>
          )}
          {phase === 'live' && (
            <TouchableOpacity style={st.stopBtn} onPress={confirmStop} activeOpacity={0.85}>
              <Text style={st.stopBtnTxt}>⏹  إيقاف البث</Text>
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 60 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bg.card, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 18, color: Colors.text.secondary },
  headerTitle: { fontSize: Typography.sizes.lg, fontWeight: Typography.weights.bold, color: Colors.text.primary },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EF444420', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, borderColor: '#EF444450' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.status.live },
  liveTxt: { fontSize: 11, fontWeight: Typography.weights.bold, color: Colors.status.live, letterSpacing: 1 },
  codeCard: { backgroundColor: Colors.bg.card, borderRadius: Radius.xl, padding: Spacing.xl, alignItems: 'center', marginVertical: Spacing.md, borderWidth: 1.5, borderColor: `${Colors.brand.purple}60`, overflow: 'hidden', shadowColor: Colors.brand.purple, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  codeBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: Colors.brand.purple },
  codeLabel: { fontSize: 11, color: Colors.text.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  codeValue: { fontSize: 30, fontWeight: Typography.weights.black, color: Colors.text.primary, letterSpacing: 5, marginBottom: 12 },
  codeActions: { flexDirection: 'row', gap: 8 },
  codeBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: Radius.md, backgroundColor: Colors.bg.elevated, borderWidth: 1, borderColor: `${Colors.brand.purple}40` },
  codeBtnBlue: { borderColor: `${Colors.brand.blue}40` },
  codeBtnTxt: { fontSize: Typography.sizes.sm, color: Colors.brand.purple, fontWeight: Typography.weights.semibold },
  statsRow: { flexDirection: 'row', backgroundColor: Colors.bg.card, borderRadius: Radius.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border.subtle, overflow: 'hidden' },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statVal: { fontSize: Typography.sizes.md, fontWeight: Typography.weights.bold, color: Colors.text.primary },
  statLbl: { fontSize: 10, color: Colors.text.muted, marginTop: 2 },
  statDiv: { width: 1, backgroundColor: Colors.border.subtle, marginVertical: 8 },
  section: { backgroundColor: Colors.bg.card, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border.subtle },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: Typography.sizes.md, fontWeight: Typography.weights.semibold, color: Colors.text.primary, marginBottom: Spacing.sm },
  toggle: { fontSize: 12, color: Colors.text.muted },
  row: { flexDirection: 'row', gap: 8 },
  optBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: Colors.bg.elevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border.default, position: 'relative' },
  optBtnPurple: { backgroundColor: `${Colors.brand.purple}20`, borderColor: Colors.brand.purple },
  optBtnBlue: { backgroundColor: `${Colors.brand.blue}15`, borderColor: Colors.brand.blue },
  optTxt: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold, color: Colors.text.muted },
  optTxtPurple: { color: Colors.brand.purple },
  optTxtBlue: { color: Colors.brand.blue },
  optSub: { fontSize: 9, color: Colors.text.muted },
  star: { position: 'absolute', top: 2, right: 4, fontSize: 8 },
  audioGrid: { flexDirection: 'row', gap: 8 },
  audioBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.bg.elevated, borderWidth: 1.5, borderColor: Colors.border.default, gap: 4 },
  audioBtnActive: { backgroundColor: `${Colors.brand.purple}20`, borderColor: Colors.brand.purple },
  audioBtnDisabled: { opacity: 0.4 },
  audioBtnIcon: { fontSize: 20 },
  audioBtnTxt: { fontSize: 11, color: Colors.text.muted, fontWeight: Typography.weights.medium, textAlign: 'center' },
  audioBtnTxtActive: { color: Colors.brand.purple, fontWeight: Typography.weights.bold },
  audioBtnTxtDisabled: { color: Colors.text.muted },
  audioHint: { fontSize: 11, color: Colors.text.muted, marginTop: 8, textAlign: 'center' },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border.subtle },
  viewerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: `${Colors.brand.purple}30`, alignItems: 'center', justifyContent: 'center' },
  viewerNum: { fontSize: 13, fontWeight: Typography.weights.bold, color: Colors.brand.purple },
  viewerName: { flex: 1, fontSize: Typography.sizes.sm, color: Colors.text.secondary },
  kickBtn: { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: `${Colors.status.error}15`, borderRadius: Radius.sm, borderWidth: 1, borderColor: `${Colors.status.error}30` },
  kickTxt: { fontSize: 11, color: Colors.status.error, fontWeight: Typography.weights.semibold },
  startBtn: { height: 60, borderRadius: Radius.lg, backgroundColor: Colors.brand.purple, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.brand.purple, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 8 },
  startBtnTxt: { fontSize: Typography.sizes.xl, fontWeight: Typography.weights.bold, color: '#FFF' },
  stopBtn: { height: 60, borderRadius: Radius.lg, backgroundColor: `${Colors.status.error}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: `${Colors.status.error}60` },
  stopBtnTxt: { fontSize: Typography.sizes.xl, fontWeight: Typography.weights.bold, color: Colors.status.error },
});
