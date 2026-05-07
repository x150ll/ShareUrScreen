// src/screens/OnboardingScreen.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import notifee from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography, Spacing, Radius } from '../theme';

const ONBOARDING_KEY = 'onboarding_done_v1';

const steps = [
  {
    id: 'notifications',
    icon: '🔔',
    title: 'الإشعارات',
    description: 'لإبقاء البث نشطاً في الخلفية وإعلامك بانضمام المشاهدين',
    why: 'بدون هذا الإذن قد ينقطع البث عند إغلاق التطبيق',
    required: true,
  },
  {
    id: 'battery',
    icon: '⚡',
    title: 'استثناء البطارية',
    description: 'لضمان استمرار البث حتى في وضع توفير البطارية',
    why: 'أندرويد يوقف التطبيقات تلقائياً — هذا يمنعه أثناء البث',
    required: false,
  },
  {
    id: 'overlay',
    icon: '🖥️',
    title: 'العرض فوق التطبيقات',
    description: 'لعرض شريط تحكم عائم أثناء البث من أي شاشة',
    why: 'يتيح لك التحكم بالبث دون العودة للتطبيق',
    required: false,
  },
  {
    id: 'audio',
    icon: '🎵',
    title: 'الصوت الداخلي',
    description: 'لبث صوت جهازك للمشاهدين — الألعاب والموسيقى والتطبيقات',
    why: 'أندرويد يشترط إذن الصوت للتقاط الصوت الداخلي (ليس المايك)',
    required: false,
  },
];

export default function OnboardingScreen({ navigation }: any) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [currentStep]);

  const handleAction = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    const step = steps[currentStep];

    if (step.id === 'notifications') {
      await notifee.requestPermission();
    } else if (step.id === 'battery') {
      Alert.alert(
        'استثناء البطارية',
        'افتح الإعدادات وابحث عن "Share Ur Screen" ثم ضع الخيار على "بدون قيود"',
        [
          { text: 'فتح الإعدادات', onPress: () => Linking.openSettings() },
          { text: 'تخطي', style: 'cancel' },
        ]
      );
    }

    setIsProcessing(false);
    goNext();
  };

  const goNext = async () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      navigation.replace('Home');
    }
  };

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logoTitle}>
          Share <Text style={{ color: Colors.brand.blue }}>Ur</Text> Screen
        </Text>
        <Text style={styles.headerSub}>إعداد الأذونات</Text>
      </View>

      {/* Progress */}
      <View style={styles.progressRow}>
        {steps.map((s, i) => (
          <View
            key={s.id}
            style={[
              styles.dot,
              i === currentStep && styles.dotActive,
              i < currentStep && styles.dotDone,
            ]}
          />
        ))}
        <Text style={styles.progressText}>{currentStep + 1}/{steps.length}</Text>
      </View>

      {/* Card */}
      <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <Text style={styles.icon}>{step.icon}</Text>
        <View style={step.required ? styles.requiredBadge : styles.optionalBadge}>
          <Text style={step.required ? styles.requiredText : styles.optionalText}>
            {step.required ? 'مطلوب' : 'اختياري'}
          </Text>
        </View>
        <Text style={styles.stepTitle}>{step.title}</Text>
        <Text style={styles.stepDesc}>{step.description}</Text>
        <View style={styles.whyBox}>
          <Text style={styles.whyLabel}>💡 لماذا نحتاجه؟</Text>
          <Text style={styles.whyText}>{step.why}</Text>
        </View>
      </Animated.View>

      {/* Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btnPrimary, isProcessing && { opacity: 0.6 }]}
          onPress={handleAction}
          disabled={isProcessing}
          activeOpacity={0.85}
        >
          <Text style={styles.btnPrimaryText}>
            {isProcessing ? 'جارٍ التفعيل...' : isLast ? '🚀 ابدأ الاستخدام' : 'السماح'}
          </Text>
        </TouchableOpacity>
        {!step.required && (
          <TouchableOpacity style={styles.btnSkip} onPress={goNext}>
            <Text style={styles.btnSkipText}>تخطي</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary, paddingHorizontal: Spacing.lg },
  header: { alignItems: 'center', paddingTop: Spacing.xl, paddingBottom: Spacing.lg },
  logoTitle: { fontSize: Typography.sizes.xxl, fontWeight: Typography.weights.black, color: Colors.text.primary },
  headerSub: { fontSize: Typography.sizes.sm, color: Colors.text.muted, marginTop: 4, letterSpacing: 1 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: Spacing.xl },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.bg.elevated },
  dotActive: { width: 24, backgroundColor: Colors.brand.purple },
  dotDone: { backgroundColor: Colors.status.success },
  progressText: { fontSize: Typography.sizes.xs, color: Colors.text.muted, marginLeft: 8 },
  card: {
    flex: 1, backgroundColor: Colors.bg.card, borderRadius: Radius.xl,
    padding: Spacing.xl, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border.default,
  },
  icon: { fontSize: 72, marginBottom: Spacing.md },
  requiredBadge: {
    backgroundColor: `${Colors.brand.purple}20`, paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.brand.purple}60`, marginBottom: Spacing.md,
  },
  requiredText: { fontSize: Typography.sizes.xs, color: Colors.brand.purple, fontWeight: Typography.weights.semibold },
  optionalBadge: {
    backgroundColor: Colors.bg.elevated, paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border.default, marginBottom: Spacing.md,
  },
  optionalText: { fontSize: Typography.sizes.xs, color: Colors.text.muted },
  stepTitle: { fontSize: Typography.sizes.xxl, fontWeight: Typography.weights.bold, color: Colors.text.primary, marginBottom: Spacing.sm, textAlign: 'center' },
  stepDesc: { fontSize: Typography.sizes.md, color: Colors.text.secondary, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.lg },
  whyBox: { backgroundColor: Colors.bg.elevated, borderRadius: Radius.md, padding: Spacing.md, width: '100%', borderLeftWidth: 3, borderLeftColor: Colors.brand.blue },
  whyLabel: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold, color: Colors.brand.blue, marginBottom: 6 },
  whyText: { fontSize: Typography.sizes.sm, color: Colors.text.secondary, lineHeight: 20 },
  actions: { paddingBottom: Spacing.md, gap: Spacing.sm },
  btnPrimary: { height: 56, borderRadius: Radius.md, backgroundColor: Colors.brand.purple, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { fontSize: Typography.sizes.lg, fontWeight: Typography.weights.semibold, color: '#FFF' },
  btnSkip: { height: 44, alignItems: 'center', justifyContent: 'center' },
  btnSkipText: { fontSize: Typography.sizes.md, color: Colors.text.muted },
});
