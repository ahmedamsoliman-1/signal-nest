import { getFirebaseMessagingAdmin } from "./firebase-admin.js";
import { disablePushSubscription, listActivePushSubscriptions, touchPushSubscription } from "./repository.js";

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered"
]);

function truncate(text, max = 160) {
  return String(text).replace(/\s+/gu, " ").trim().slice(0, max);
}

function buildNotificationPayload({ title, body, url, tag }) {
  return {
    notification: {
      title: truncate(title, 64),
      body: truncate(body, 160)
    },
    webpush: {
      notification: {
        title: truncate(title, 64),
        body: truncate(body, 160),
        tag,
        data: {
          url
        }
      },
      fcmOptions: {
        link: url
      }
    },
    data: {
      url
    }
  };
}

export async function sendPushNotification(payload) {
  const messaging = getFirebaseMessagingAdmin();
  if (!messaging) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const subscriptions = await listActivePushSubscriptions();
  if (!subscriptions.length) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const tokens = subscriptions.map((entry) => entry.token);
  const message = {
    tokens,
    ...buildNotificationPayload(payload)
  };

  const response = await messaging.sendEachForMulticast(message);

  const invalidTokens = [];
  await Promise.all(
    response.responses.map(async (item, index) => {
      const token = tokens[index];
      if (item.success) {
        await touchPushSubscription(token);
        return;
      }

      if (item.error?.code && INVALID_TOKEN_CODES.has(item.error.code)) {
        invalidTokens.push(token);
      }
    })
  );

  await Promise.all(invalidTokens.map((token) => disablePushSubscription(token)));

  return {
    sent: response.successCount,
    failed: response.failureCount,
    invalidated: invalidTokens.length,
    skipped: false
  };
}
