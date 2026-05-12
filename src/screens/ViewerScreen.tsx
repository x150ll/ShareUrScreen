// src/screens/ViewerScreen.tsx — النسخة النهائية الكاملة
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Animated, KeyboardAvoidingView, Platform,
  ActivityIndicator, StatusBar, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RTCView } from 'react-native-webrtc';
import KeepAwake from 'react-native-keep-awake';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { validateCode, cleanCode, formatCode } from '../utils/CodeGenerator';
import SignalingService from '../services/SignalingService';
import { ViewerService } from '../services/WebRTCService';

// تفعيل Keep Awake فقط أثناء المشاهدة الفعلية
function useConditionalKeepAwake(active: boolean) {
  useEffect(() => {
    if (active) {
      KeepAwake.activate();
    } else {
      KeepAwake.deactivate();
    }
    return () => KeepAwake.deactivate();
  }, [active]);
}

type Phase = 'input' | 'connecting' | 'connected' | 'disconnected';
type QualityPreset = '360p' | '480p' | '720p' | '1080p';

const STEPS = [
  '🔍 جارٍ البحث عن البث...',
  '🤝 جارٍ الاتصال بالمضيف...',
  '⚡ جارٍ تحسين جودة الاتصال...',
  '✅ متصل!',
];

export default function ViewerScreen({ navigation }: any) {
  const [phase, setPhase]               = useState<Phase>('input');
  const [input, setInput]               = useState('');
  const [inputError, setInputError]     = useState('');
  const [step, setStep]                 = useState(0);
  const [code, setCode]                 = useState('');
  const [streamURL, setStreamURL]       = useState('');
  const [fullscreen, setFullscreen]     = useState(false);
  const [viewerQuality, setViewerQuality] = useState<QualityPreset>('1080p');
  const [showControls, setShowControls] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState('');

  // تطبيق جودة المشاهد فعلياً عند تغييرها
  const handleQualityChange = useCallback(async (q: QualityPreset) => {
    setViewerQuality(q);
    await viewerSvc.current.setQuality(q).catch(() => {});
  }, []);

  // ID فريد لكل جلسة مشاهدة
  const [viewerId] = useState(
    () => 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
  );

  const viewerSvc     = useRef(new ViewerService());
  const fadeAnim      = useRef(new Animated.Value(0)).current;
  const controlsAnim  = useRef(new Animated.Value(1)).current;
  const ctrlTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef      = useRef<Phase>('input');
  phaseRef.current    = phase;

  // منع إطفاء الشاشة فقط أثناء المشاهدة الفعلية
  useConditionalKeepAwake(phase === 'connected');

  // أول تحميل
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    return () => {
      if (ctrlTimer.current) clearTimeout(ctrlTimer.current);
      viewerSvc.current.disconnect().catch(() => {});
    };
  }, []);

  // زر الرجوع
  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phaseRef.current !== 'input') {
        leave();
        return true;
      }
      return false;
    });
    return () => h.remove();
  }, []);

  // إظهار أزرار التحكم مؤقتاً
  const revealControls = useCallback(() => {
    if (!fullscreen) return;
    setShowControls(true);
    Animated.timing(controlsAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (ctrlTimer.current) clearTimeout(ctrlTimer.current);
    ctrlTimer.current = setTimeout(() => {
      Animated.timing(controlsAnim, { toValue: 0, duration: 500, useNativeDriver: true })
        .start(() => setShowControls(false));
    }, 3000);
  }, [fullscreen]);

  const handleInput = (text: string) => {
    // الكود حساس لحالة الأحرف — لا نغيّرها
    const raw = text.replace(/[-\s]/g, '');
    if (raw.length > 12) return;
    let fmt = raw;
    if (raw.length > 8) fmt = `${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8)}`;
    else if (raw.length > 4) fmt = `${raw.slice(0,4)}-${raw.slice(4)}`;
    setInput(fmt);
    setInputError('');
  };

  const join = async () => {
    const clean = cleanCode(input);
    if (!validateCode(clean)) {
      setInputError('الكود غير صحيح — تأكد من 12 خانة');
      return;
    }
    setCode(clean);
    setPhase('connecting');
    setStep(0);

    // مهلة الاتصال الكاملة: 35 ثانية
    const connectTimeout = setTimeout(() => {
      if (phaseRef.current === 'connecting') {
        viewerSvc.current.disconnect().catch(() => {});
        setPhase('input');
        setInputError('انتهت مهلة الاتصال — تأكد من أن المضيف في وضع البث');
      }
    }, 35_000);

    try {
      await new Promise(r => setTimeout(r, 400));
      setStep(1);

      const session = await SignalingService.getSession(clean);
      if (!session)                       throw new Error('البث غير موجود أو انتهت صلاحية الكود');
      if (session.status === 'ended')     throw new Error('هذا البث قد انتهى');
      if (session.status === 'waiting')   throw new Error('المضيف لم يبدأ البث بعد — انتظر قليلاً');

      setStep(2);

      // تنظيف الـ instance القديم أولاً ثم إنشاء جديد
      await viewerSvc.current.disconnect().catch(() => {});
      viewerSvc.current = new ViewerService();

      await viewerSvc.current.connect(
        clean,
        viewerId,
        (stream) => {
          clearTimeout(connectTimeout);
          setStreamURL(stream.toURL());
          setStep(3);
          setTimeout(() => setPhase('connected'), 300);
        },
        async () => {
          clearTimeout(connectTimeout);
          try {
            const currentSession = await SignalingService.getSession(clean);
            setDisconnectReason(
              !currentSession || currentSession.status === 'ended'
                ? 'أنهى المضيف البث'
                : 'فُقد الاتصال بالمضيف'
            );
          } catch {
            setDisconnectReason('فُقد الاتصال بالمضيف');
          }
          setPhase('disconnected');
        },
      );

    } catch (err: any) {
      clearTimeout(connectTimeout);
      setPhase('input');
      setInputError(err.message || 'فشل الاتصال، حاول مجدداً');
    }
  };

  const leave = async () => {
    if (ctrlTimer.current) clearTimeout(ctrlTimer.current);
    // تنظيف حتى لو كنا في مرحلة الاتصال
    await viewerSvc.current.disconnect().catch(() => {});
    setStreamURL('');
    setDisconnectReason('');
    setIsReconnecting(false);
    navigation.goBack();
  };

  // إعادة الاتصال بنفس الكود مع ID جديد لتجنب التكرار في Firebase
  const tryReconnect = async () => {
    if (isReconnecting) return;
    setIsReconnecting(true);
    setStreamURL('');
    // ID جديد لكل محاولة إعادة اتصال
    const freshId = 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    try {
      await viewerSvc.current.disconnect().catch(() => {});
      const session = await SignalingService.getSession(code);
      if (!session || session.status === 'ended') {
        setDisconnectReason('أنهى المضيف البث — لا يمكن إعادة الاتصال');
        setIsReconnecting(false);
        return;
      }
      setPhase('connecting');
      setStep(0);
      viewerSvc.current = new ViewerService();
      await viewerSvc.current.connect(
        code,
        freshId,
        (stream) => {
          setStreamURL(stream.toURL());
          setStep(3);
          setIsReconnecting(false);
          setTimeout(() => setPhase('connected'), 300);
        },
        async () => {
          try {
            const s = await SignalingService.getSession(code);
            setDisconnectReason(
              !s || s.status === 'ended' ? 'أنهى المضيف البث' : 'فُقد الاتصال'
            );
          } catch {
            setDisconnectReason('فُقد الاتصال');
          }
          setIsReconnecting(false);
          setPhase('disconnected');
        },
      );
    } catch {
      setDisconnectReason('فشلت إعادة الاتصال');
      setIsReconnecting(false);
      setPhase('disconnected');
    }
  };

  // ── إدخال الكود ────────────────────────────────
  if (phase === 'input') {
    return (
      <SafeAreaView style={s.container}>
        <KeyboardAvoidingView style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Animated.View style={[s.inputWrap, { opacity: fadeAnim }]}>

            <View style={s.header}>
              <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
                <Text style={s.backIcon}>←</Text>
              </TouchableOpacity>
              <Text style={s.headerTitle}>انضم للمشاهدة</Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={s.hero}>
              <View style={s.heroIconWrap}>
                <Text style={s.heroIcon}>👁️</Text>
              </View>
              <Text style={s.heroTitle}>أدخل كود البث</Text>
              <Text style={s.heroSub}>
                احصل على الكود من المضيف وابدأ المشاهدة فوراً
              </Text>
            </View>

            <View style={[s.inputBox, !!inputError && s.inputBoxErr]}>
              <TextInput
                style={s.codeInput}
                value={input}
                onChangeText={handleInput}
                placeholder="XXXX-XXXX-XXXX"
                placeholderTextColor={Colors.text.muted}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                maxLength={14}
                returnKeyType="go"
                onSubmitEditing={join}
              />
            </View>

            {inputError
              ? <Text style={s.errTxt}>⚠️  {inputError}</Text>
              : <Text style={s.hintTxt}>الكود مكوّن من 12 خانة — مثال: aBcD-eF3h-Xy8Z</Text>
            }

            <TouchableOpacity
              style={[s.joinBtn, cleanCode(input).length !== 12 && s.joinBtnOff]}
              disabled={cleanCode(input).length !== 12}
              onPress={join}
              activeOpacity={0.85}
            >
              <Text style={s.joinBtnTxt}>انضم الآن  👁️</Text>
            </TouchableOpacity>

          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── الاتصال ────────────────────────────────────
  if (phase === 'connecting') {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.brand.purple} />
          <Text style={s.stepTxt}>{STEPS[step]}</Text>
          <View style={s.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[
                s.dot,
                i <= step && s.dotActive,
                i < step && s.dotDone,
              ]} />
            ))}
          </View>
          <Text style={s.codeSmall}>{formatCode(code)}</Text>
          <TouchableOpacity style={s.cancelBtn} onPress={leave}>
            <Text style={s.cancelBtnTxt}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── انقطع البث ─────────────────────────────────
  if (phase === 'disconnected') {
    const canReconnect = !disconnectReason.includes('أنهى المضيف');
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}>
          <Text style={{ fontSize: 60 }}>📡</Text>
          <Text style={s.discTitle}>انقطع البث</Text>
          <Text style={s.discSub}>
            {disconnectReason || 'البث انتهى أو فُقد الاتصال'}
          </Text>

          {/* زر إعادة الاتصال — يظهر فقط إذا لم ينهِ المضيف البث */}
          {canReconnect && (
            <TouchableOpacity
              style={[s.reconnectBtn, isReconnecting && { opacity: 0.5 }]}
              onPress={tryReconnect}
              disabled={isReconnecting}
            >
              <Text style={s.reconnectBtnTxt}>
                {isReconnecting ? '⏳ جارٍ الاتصال...' : '🔄 إعادة الاتصال'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={s.leaveBtn} onPress={leave}>
            <Text style={s.leaveBtnTxt}>العودة للرئيسية</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── المشاهدة ───────────────────────────────────
  return (
    <View style={s.videoWrap}>
      <StatusBar hidden={fullscreen} backgroundColor="#000" translucent />

      {/* الفيديو */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={revealControls}
      >
        {streamURL ? (
          <RTCView
            streamURL={streamURL}
            style={StyleSheet.absoluteFill}
            objectFit={fullscreen ? 'cover' : 'contain'}
            mirror={false}
            zOrder={0}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, s.waiting]}>
            <ActivityIndicator size="large" color={Colors.brand.purple} />
            <Text style={s.waitingTxt}>في انتظار بدء البث...</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* أزرار التحكم */}
      {(!fullscreen || showControls) && (
        <Animated.View
          style={[
            s.controls,
            fullscreen && { opacity: controlsAnim },
            (fullscreen && !showControls) && { pointerEvents: 'none' } as any,
          ]}
        >
          {/* شريط علوي */}
          <View style={s.ctrlTop}>
            <TouchableOpacity style={s.ctrlBtn} onPress={leave}>
              <Text style={s.ctrlIco}>✕</Text>
            </TouchableOpacity>
            <View style={s.livePill}>
              <View style={s.livePillDot} />
              <Text style={s.livePillTxt}>LIVE</Text>
            </View>
            <TouchableOpacity style={s.ctrlBtn} onPress={() => {
              setFullscreen(f => !f);
              if (!fullscreen) revealControls();
            }}>
              <Text style={s.ctrlIco}>{fullscreen ? '⊡' : '⊞'}</Text>
            </TouchableOpacity>
          </View>

          {/* شريط سفلي — جودة المشاهد فقط */}
          <View style={s.ctrlBottom}>
            <Text style={s.qualLabel}>جودتي:</Text>
            {(['360p','480p','720p','1080p'] as QualityPreset[]).map(q => (
              <TouchableOpacity key={q}
                style={[s.qBtn, viewerQuality === q && s.qBtnActive]}
                onPress={() => handleQualityChange(q)}>
                <Text style={[s.qBtnTxt, viewerQuality === q && s.qBtnTxtActive]}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  inputWrap: { flex: 1, paddingHorizontal: Spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bg.card, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 18, color: Colors.text.secondary },
  headerTitle: { fontSize: Typography.sizes.lg, fontWeight: Typography.weights.bold, color: Colors.text.primary },
  hero: { alignItems: 'center', paddingVertical: 40 },
  heroIconWrap: { width: 100, height: 100, borderRadius: 30, backgroundColor: `${Colors.brand.blue}20`, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1.5, borderColor: `${Colors.brand.blue}40` },
  heroIcon: { fontSize: 50 },
  heroTitle: { fontSize: Typography.sizes.xxl, fontWeight: Typography.weights.black, color: Colors.text.primary, marginBottom: 6 },
  heroSub: { fontSize: Typography.sizes.md, color: Colors.text.secondary, textAlign: 'center', lineHeight: 22 },
  inputBox: { backgroundColor: Colors.bg.card, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border.default, marginBottom: 8 },
  inputBoxErr: { borderColor: Colors.status.error },
  codeInput: { padding: Spacing.lg, fontSize: 26, fontWeight: Typography.weights.bold, color: Colors.text.primary, textAlign: 'center', letterSpacing: 4 },
  errTxt: { fontSize: Typography.sizes.sm, color: Colors.status.error, textAlign: 'center', marginBottom: 16 },
  hintTxt: { fontSize: Typography.sizes.sm, color: Colors.text.muted, textAlign: 'center', marginBottom: 32 },
  joinBtn: { height: 58, borderRadius: Radius.lg, backgroundColor: Colors.brand.blue, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.brand.blue, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8 },
  joinBtnOff: { opacity: 0.3, shadowOpacity: 0 },
  joinBtnTxt: { fontSize: Typography.sizes.xl, fontWeight: Typography.weights.bold, color: '#FFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  stepTxt: { fontSize: Typography.sizes.lg, color: Colors.text.primary, fontWeight: Typography.weights.medium, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.bg.elevated },
  dotActive: { backgroundColor: Colors.brand.purple },
  dotDone: { backgroundColor: Colors.status.success },
  codeSmall: { fontSize: Typography.sizes.md, color: Colors.text.muted, letterSpacing: 3, fontWeight: Typography.weights.semibold },
  cancelBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 8, borderRadius: Radius.md, backgroundColor: Colors.bg.elevated, borderWidth: 1, borderColor: Colors.border.default },
  cancelBtnTxt: { color: Colors.text.muted, fontSize: Typography.sizes.sm },
  discTitle: { fontSize: Typography.sizes.xxl, fontWeight: Typography.weights.bold, color: Colors.text.primary },
  discSub: { fontSize: Typography.sizes.md, color: Colors.text.secondary },
  leaveBtn: { marginTop: 12, paddingHorizontal: 28, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: Colors.bg.elevated, borderWidth: 1, borderColor: Colors.border.default },
  leaveBtnTxt: { color: Colors.text.secondary, fontSize: Typography.sizes.md },
  reconnectBtn: { marginTop: 20, paddingHorizontal: 32, paddingVertical: 14, borderRadius: Radius.lg, backgroundColor: Colors.brand.purple, shadowColor: Colors.brand.purple, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  reconnectBtnTxt: { color: '#FFF', fontSize: Typography.sizes.lg, fontWeight: Typography.weights.bold },
  videoWrap: { flex: 1, backgroundColor: '#000' },
  waiting: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  waitingTxt: { color: Colors.text.muted, fontSize: Typography.sizes.md },
  controls: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  ctrlTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, paddingTop: 44, backgroundColor: 'rgba(0,0,0,0.55)' },
  ctrlBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  ctrlIco: { fontSize: 16, color: '#FFF' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(239,68,68,0.35)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99 },
  livePillDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.status.live },
  livePillTxt: { fontSize: 11, fontWeight: Typography.weights.bold, color: '#FFF', letterSpacing: 1 },
  ctrlBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.md, paddingBottom: 28, backgroundColor: 'rgba(0,0,0,0.55)', flexWrap: 'wrap' },
  qualLabel: { fontSize: Typography.sizes.sm, color: 'rgba(255,255,255,0.7)' },
  qBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.12)' },
  qBtnActive: { backgroundColor: Colors.brand.purple },
  qBtnTxt: { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: Typography.weights.medium },
  qBtnTxtActive: { color: '#FFF', fontWeight: Typography.weights.bold },
});
