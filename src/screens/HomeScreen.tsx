// src/screens/HomeScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions, Linking, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../theme';

const { width } = Dimensions.get('window');

export default function HomeScreen({ navigation }: any) {
  const [showAbout, setShowAbout] = useState(false);
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const card1Slide = useRef(new Animated.Value(60)).current;
  const card2Slide = useRef(new Animated.Value(60)).current;
  const pulseAnim  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.stagger(120, [
        Animated.spring(card1Slide, { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
        Animated.spring(card2Slide, { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
      ]),
    ]).start();

    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.02, duration: 1500, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,    duration: 1500, useNativeDriver: true }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <SafeAreaView style={st.container}>
      {/* خلفية متوهجة */}
      <View style={st.glow1} />
      <View style={st.glow2} />

      <Animated.View style={[st.inner, { opacity: fadeAnim }]}>

        {/* Logo */}
        <View style={st.logoWrap}>
          <View style={st.logoBg}>
            {/* S مع سهم — يحاكي اللوقو */}
            <Text style={st.logoS}>S</Text>
            <Text style={st.logoArrow}>→</Text>
          </View>
          <Text style={st.logoTitle}>
            Share <Text style={{ color: Colors.brand.blue }}>Ur</Text> Screen
          </Text>
          <Text style={st.logoSub}>مشاركة الشاشة بسهولة وأمان</Text>
        </View>

        {/* Cards */}
        <View style={st.cardsWrap}>

          {/* مضيف */}
          <Animated.View style={{ transform: [{ translateY: card1Slide }, { scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[st.card, st.cardHost]}
              onPress={() => navigation.navigate('Host')}
              activeOpacity={0.85}
            >
              <View style={st.cardGlow} />
              <View style={st.cardIcon}>
                <Text style={st.cardIconTxt}>📡</Text>
              </View>
              <View style={st.cardContent}>
                <Text style={st.cardTitle}>ابدأ البث</Text>
                <Text style={st.cardDesc}>شارك شاشتك مع أصدقائك</Text>
              </View>
              <View style={st.liveBadge}>
                <View style={st.liveDot} />
                <Text style={st.liveTxt}>LIVE</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* مشاهد */}
          <Animated.View style={{ transform: [{ translateY: card2Slide }] }}>
            <TouchableOpacity
              style={[st.card, st.cardViewer]}
              onPress={() => navigation.navigate('Viewer')}
              activeOpacity={0.85}
            >
              <View style={st.cardIcon}>
                <Text style={st.cardIconTxt}>👁️</Text>
              </View>
              <View style={st.cardContent}>
                <Text style={st.cardTitle}>انضم للمشاهدة</Text>
                <Text style={st.cardDesc}>أدخل الكود وشاهد مباشرة</Text>
              </View>
              <View style={st.cardArrowWrap}>
                <Text style={{ color: Colors.brand.blue, fontSize: 18 }}>←</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

        </View>

        {/* Info */}
        <View style={st.infoRow}>
          {[
            { icon: '🔒', label: 'مشفّر' },
            { icon: '⚡', label: '60fps' },
            { icon: '🌐', label: 'P2P' },
            { icon: '🆓', label: 'مجاني' },
          ].map(item => (
            <View key={item.label} style={st.infoItem}>
              <Text style={st.infoIcon}>{item.icon}</Text>
              <Text style={st.infoLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        <TouchableOpacity onPress={() => setShowAbout(true)} activeOpacity={0.7}>
          <Text style={st.footer}>
            © جميع الحقوق محفوظة لـ <Text style={st.footerAccent}>x150ll</Text>
          </Text>
        </TouchableOpacity>

      </Animated.View>

      {/* Modal السوشيال */}
      <Modal visible={showAbout} transparent animationType="slide"
        onRequestClose={() => setShowAbout(false)}>
        <TouchableOpacity style={st.overlay} activeOpacity={1}
          onPress={() => setShowAbout(false)}>
          <View style={st.sheet} onStartShouldSetResponder={() => true}>

            <View style={st.sheetHandle} />

            <View style={st.sheetLogo}>
              <View style={st.sheetLogoBg}>
                <Text style={st.sheetLogoS}>S</Text>
              </View>
              <Text style={st.sheetTitle}>Share Ur Screen</Text>
              <Text style={st.sheetSub}>by x150ll</Text>
            </View>

            <View style={st.divider} />
            <Text style={st.sheetSectionTitle}>تواصل معنا</Text>

            <TouchableOpacity style={st.socialBtn} activeOpacity={0.85}
              onPress={() => Linking.openURL('https://t.me/x150ll').catch(() => {})}>
              <View style={[st.socialIcon, { backgroundColor: '#229ED920' }]}>
                <Text style={{ fontSize: 22 }}>✈️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.socialName}>Telegram</Text>
                <Text style={st.socialHandle}>@x150ll</Text>
              </View>
              <Text style={st.socialArrow}>←</Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.socialBtn} activeOpacity={0.85}
              onPress={() => Linking.openURL('https://www.tiktok.com/@x150ll').catch(() => {})}>
              <View style={[st.socialIcon, { backgroundColor: '#FF004F20' }]}>
                <Text style={{ fontSize: 22 }}>🎵</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.socialName}>TikTok</Text>
                <Text style={st.socialHandle}>@x150ll</Text>
              </View>
              <Text style={st.socialArrow}>←</Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.closeBtn} onPress={() => setShowAbout(false)}>
              <Text style={st.closeBtnTxt}>إغلاق</Text>
            </TouchableOpacity>

          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  glow1: { position: 'absolute', top: -80, left: width/2-160, width: 320, height: 320, borderRadius: 160, backgroundColor: Colors.brand.purple, opacity: 0.1 },
  glow2: { position: 'absolute', bottom: 80, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: Colors.brand.blue, opacity: 0.07 },
  inner: { flex: 1, paddingHorizontal: Spacing.lg, justifyContent: 'space-between', paddingTop: Spacing.xl, paddingBottom: Spacing.md },

  logoWrap: { alignItems: 'center', gap: Spacing.sm },
  logoBg: { width: 90, height: 90, borderRadius: 26, backgroundColor: Colors.brand.purple, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.brand.purple, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.6, shadowRadius: 24, elevation: 12, borderWidth: 1.5, borderColor: `${Colors.brand.blue}80`, position: 'relative' },
  logoS: { fontSize: 38, fontWeight: '900', color: '#FFF' },
  logoArrow: { position: 'absolute', bottom: 12, right: 8, fontSize: 16, color: Colors.brand.blue, fontWeight: '900' },
  logoTitle: { fontSize: Typography.sizes.xxl, fontWeight: Typography.weights.black, color: Colors.text.primary },
  logoSub: { fontSize: Typography.sizes.sm, color: Colors.text.muted },

  cardsWrap: { gap: Spacing.md },
  card: { borderRadius: Radius.xl, padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1.5, position: 'relative', overflow: 'hidden' },
  cardHost: { backgroundColor: Colors.bg.card, borderColor: `${Colors.brand.purple}70`, shadowColor: Colors.brand.purple, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 10 },
  cardViewer: { backgroundColor: Colors.bg.card, borderColor: `${Colors.brand.blue}40` },
  cardGlow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: Colors.brand.purple, opacity: 0.04 },
  cardIcon: { width: 54, height: 54, borderRadius: 16, backgroundColor: Colors.bg.elevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border.default },
  cardIconTxt: { fontSize: 26 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: Typography.sizes.lg, fontWeight: Typography.weights.bold, color: Colors.text.primary, marginBottom: 3 },
  cardDesc: { fontSize: Typography.sizes.sm, color: Colors.text.secondary },
  cardArrowWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bg.elevated, alignItems: 'center', justifyContent: 'center' },
  liveBadge: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${Colors.status.live}20`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.status.live}50` },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.status.live },
  liveTxt: { fontSize: 10, fontWeight: Typography.weights.bold, color: Colors.status.live, letterSpacing: 1 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: Colors.bg.card, borderRadius: Radius.lg, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.border.subtle },
  infoItem: { alignItems: 'center', gap: 4 },
  infoIcon: { fontSize: 20 },
  infoLabel: { fontSize: Typography.sizes.xs, color: Colors.text.muted, fontWeight: Typography.weights.medium },

  footer: { textAlign: 'center', fontSize: Typography.sizes.xs, color: Colors.text.muted, paddingBottom: 4 },
  footerAccent: { color: Colors.brand.purple, fontWeight: Typography.weights.bold },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bg.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: Spacing.xl, paddingBottom: 36, borderTopWidth: 1, borderColor: Colors.border.default },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border.default, alignSelf: 'center', marginBottom: Spacing.lg },
  sheetLogo: { alignItems: 'center', marginBottom: Spacing.lg },
  sheetLogoBg: { width: 64, height: 64, borderRadius: 18, backgroundColor: Colors.brand.purple, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm, shadowColor: Colors.brand.purple, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 8 },
  sheetLogoS: { fontSize: 28, fontWeight: '900', color: '#FFF' },
  sheetTitle: { fontSize: Typography.sizes.xl, fontWeight: Typography.weights.bold, color: Colors.text.primary },
  sheetSub: { fontSize: Typography.sizes.sm, color: Colors.text.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.border.subtle, marginBottom: Spacing.lg },
  sheetSectionTitle: { fontSize: Typography.sizes.sm, color: Colors.text.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: Spacing.md },
  socialBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bg.elevated, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border.subtle },
  socialIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  socialName: { fontSize: Typography.sizes.md, fontWeight: Typography.weights.semibold, color: Colors.text.primary },
  socialHandle: { fontSize: Typography.sizes.sm, color: Colors.text.muted },
  socialArrow: { fontSize: 18, color: Colors.text.muted },
  closeBtn: { height: 52, borderRadius: Radius.md, backgroundColor: Colors.bg.elevated, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.border.default },
  closeBtnTxt: { fontSize: Typography.sizes.md, color: Colors.text.secondary, fontWeight: Typography.weights.medium },
});
