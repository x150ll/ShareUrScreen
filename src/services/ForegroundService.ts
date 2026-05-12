// src/services/ForegroundService.ts
import notifee, { AndroidImportance, AndroidCategory } from '@notifee/react-native';

const CHANNEL_ID      = 'screen_share_channel';
const NOTIFICATION_ID = 'screen_share_fg';

// ننشئ الـ channel مرة واحدة فقط
let channelCreated = false;
async function ensureChannel(): Promise<string> {
  if (channelCreated) return CHANNEL_ID;
  await notifee.createChannel({
    id:         CHANNEL_ID,
    name:       'البث المباشر',
    importance: AndroidImportance.LOW,
  });
  channelCreated = true;
  return CHANNEL_ID;
}

export const ForegroundService = {

  async start(): Promise<void> {
    const channelId = await ensureChannel();
    await notifee.displayNotification({
      id:    NOTIFICATION_ID,
      title: '📡 Share Ur Screen',
      body:  'جارٍ بث شاشتك...',
      android: {
        channelId,
        asForegroundService: true,
        importance:          AndroidImportance.LOW,
        category:            AndroidCategory.SERVICE,
        color:               '#7B2FFF',
        colorized:           true,
        smallIcon:           'ic_notification',
        ongoing:             true,
        onlyAlertOnce:       true,
        pressAction:         { id: 'default' },
        actions: [
          { title: '⏹ إيقاف البث', pressAction: { id: 'stop' } },
        ],
      },
    });
  },

  async stop(): Promise<void> {
    await notifee.stopForegroundService();
    await notifee.cancelNotification(NOTIFICATION_ID);
  },

  async updateViewerCount(count: number): Promise<void> {
    const channelId = await ensureChannel();
    await notifee.displayNotification({
      id:    NOTIFICATION_ID,
      title: '📡 Share Ur Screen — البث مباشر',
      body:  count > 0 ? `👁 ${count} مشاهد يشاهد الآن` : 'في انتظار المشاهدين...',
      android: {
        channelId,
        asForegroundService: true,
        importance:          AndroidImportance.LOW,
        category:            AndroidCategory.SERVICE,
        color:               '#7B2FFF',
        colorized:           true,
        smallIcon:           'ic_notification',
        ongoing:             true,
        onlyAlertOnce:       true,
        pressAction:         { id: 'default' },
        actions: [
          { title: '⏹ إيقاف البث', pressAction: { id: 'stop' } },
        ],
      },
    });
  },
};
