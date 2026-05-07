// index.js — نقطة الدخول الرئيسية
import { registerRootComponent } from 'expo';
import notifee from '@notifee/react-native';
import App from './App';

// تسجيل Foreground Service لـ Notifee — يجب خارج أي Component
notifee.registerForegroundService((notification) => {
  return new Promise(() => {
    // الـ service يستمر حتى يُوقف يدوياً
  });
});

registerRootComponent(App);
