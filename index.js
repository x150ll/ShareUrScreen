// index.js — نقطة الدخول الرئيسية (React Native CLI)
import {AppRegistry} from 'react-native';
import notifee from '@notifee/react-native';
import App from './App';
import {name as appName} from './app.json';

// تسجيل Foreground Service لـ Notifee
notifee.registerForegroundService(() => {
  return new Promise(() => {
    // الـ service يستمر حتى يُوقف يدوياً عبر notifee.stopForegroundService()
  });
});

AppRegistry.registerComponent(appName, () => App);
