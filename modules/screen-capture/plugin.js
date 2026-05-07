// modules/screen-capture/plugin.js
// Expo Config Plugin لتسجيل الـ module في مشروع Android
const { withProjectBuildGradle, withAppBuildGradle } = require('@expo/config-plugins');

/**
 * يضيف الـ module كـ local project في Gradle
 */
function withScreenCaptureModule(config) {
  // إضافة include في settings.gradle
  config = withProjectBuildGradle(config, (c) => {
    // التحقق أن Gradle يحتوي على الـ repositories الصحيحة
    if (!c.modResults.contents.includes('mavenCentral()')) {
      c.modResults.contents = c.modResults.contents.replace(
        /allprojects\s*\{[\s\S]*?repositories\s*\{/,
        (match) => match + '\n        mavenCentral()'
      );
    }
    return c;
  });

  return config;
}

module.exports = withScreenCaptureModule;
