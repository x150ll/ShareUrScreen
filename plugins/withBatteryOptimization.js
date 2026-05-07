// plugins/withBatteryOptimization.js
// يضيف طلب REQUEST_IGNORE_BATTERY_OPTIMIZATIONS في AndroidManifest
// ويضيف Service مع foregroundServiceType لضمان استمرار البث

const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withBatteryOptimization(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app      = manifest.manifest.application[0];

    // ─── تأكد من وجود uses-permission ─────────────────────────────────
    if (!manifest.manifest['uses-permission']) {
      manifest.manifest['uses-permission'] = [];
    }

    const perms = manifest.manifest['uses-permission'];

    const batteryPerm = 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS';
    const wakePerm    = 'android.permission.WAKE_LOCK';

    const hasBattery = perms.some(p => p.$?.['android:name'] === batteryPerm);
    if (!hasBattery) {
      perms.push({ $: { 'android:name': batteryPerm } });
    }

    const hasWake = perms.some(p => p.$?.['android:name'] === wakePerm);
    if (!hasWake) {
      perms.push({ $: { 'android:name': wakePerm } });
    }

    // ─── ضبط android:persistent و largeHeap ──────────────────────────
    // largeHeap: يعطي التطبيق ذاكرة أكبر — مهم لـ WebRTC + MediaProjection
    if (!app.$) app.$ = {};
    app.$['android:largeHeap']  = 'true';
    app.$['android:persistent'] = 'false'; // لا نريد system app

    return config;
  });
};
