// plugins/withMediaProjection.js
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

// ─── نسخ أيقونة الإشعار لكل density ───────────────────────────────────────
function withNotificationIcon(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const densities = {
        mdpi:    'drawable-mdpi',
        hdpi:    'drawable-hdpi',
        xhdpi:   'drawable-xhdpi',
        xxhdpi:  'drawable-xxhdpi',
        xxxhdpi: 'drawable-xxxhdpi',
      };

      const srcBase = path.join(
        config.modRequest.projectRoot,
        'assets',
        'notification_icons'
      );
      const resBase = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'res'
      );

      for (const [density, folder] of Object.entries(densities)) {
        const src = path.join(srcBase, density, 'ic_notification.png');
        const destDir = path.join(resBase, folder);
        const dest = path.join(destDir, 'ic_notification.png');

        if (!fs.existsSync(src)) {
          console.warn(`[withMediaProjection] تحذير: أيقونة ${density} غير موجودة: ${src}`);
          continue;
        }
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(src, dest);
      }

      return config;
    },
  ]);
}

// ─── إضافة Services في AndroidManifest ────────────────────────────────────
function withMediaProjectionManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];
    if (!app.service) app.service = [];

    // إضافة tools namespace للـ manifest root (مطلوب لـ tools:replace)
    if (!manifest.manifest.$) manifest.manifest.$ = {};
    manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    // Notifee ForegroundService مع mediaProjection type
    const serviceExists = app.service.some(
      s => s.$?.['android:name'] === 'app.notifee.core.ForegroundService'
    );
    if (!serviceExists) {
      app.service.push({
        $: {
          'android:name': 'app.notifee.core.ForegroundService',
          'android:foregroundServiceType': 'mediaProjection',
          'android:exported': 'false',
          'tools:replace': 'android:foregroundServiceType',
        },
      });
    }

    // WebRTC ScreenCapture Service
    const webrtcExists = app.service.some(
      s => s.$?.['android:name'] === 'com.oney.WebRTCModule.WebRTCModuleScreenCaptureService'
    );
    if (!webrtcExists) {
      app.service.push({
        $: {
          'android:name': 'com.oney.WebRTCModule.WebRTCModuleScreenCaptureService',
          'android:foregroundServiceType': 'mediaProjection',
          'android:exported': 'false',
        },
      });
    }

    return config;
  });
}

// ─── تجميع كل الـ plugins ─────────────────────────────────────────────────
module.exports = (config) => {
  config = withMediaProjectionManifest(config);
  config = withNotificationIcon(config);
  return config;
};
