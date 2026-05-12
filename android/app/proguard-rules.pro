# proguard-rules.pro

# ─── React Native ──────────────────────────────────────────
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.react.**
-keep class com.facebook.react.** { *; }

# ─── WebRTC ────────────────────────────────────────────────
-keep class com.oney.WebRTCModule.** { *; }
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**

# ─── Firebase ──────────────────────────────────────────────
-keep class io.invertase.firebase.** { *; }
-dontwarn io.invertase.firebase.**
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# ─── Notifee ───────────────────────────────────────────────
-keep class app.notifee.** { *; }
-dontwarn app.notifee.**

# ─── Clipboard ─────────────────────────────────────────────
-keep class com.reactnativecommunity.clipboard.** { *; }

# ─── SplashScreen ──────────────────────────────────────────
-keep class org.devio.rn.splashscreen.** { *; }

# ─── Keep Awake ────────────────────────────────────────────
-keep class com.corbt.keepawake.** { *; }

# ─── AsyncStorage ──────────────────────────────────────────
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# ─── Kotlin ────────────────────────────────────────────────
-keep class kotlin.** { *; }
-dontwarn kotlin.**
