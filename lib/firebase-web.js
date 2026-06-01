import { initializeApp, getApps, getApp } from "firebase/app";
import { getMessaging, isSupported } from "firebase/messaging";

function getPublicFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  };
}

export function isFirebaseWebConfigured() {
  const config = getPublicFirebaseConfig();
  return Boolean(
    config.apiKey &&
      config.projectId &&
      config.messagingSenderId &&
      config.appId
  );
}

export function getFirebaseWebApp() {
  const config = getPublicFirebaseConfig();
  return getApps().length ? getApp() : initializeApp(config);
}

export async function getFirebaseMessagingClient() {
  if (!isFirebaseWebConfigured()) {
    return null;
  }

  const supported = await isSupported();
  if (!supported) {
    return null;
  }

  return getMessaging(getFirebaseWebApp());
}

export function getFirebaseWebConfigSnapshot() {
  return getPublicFirebaseConfig();
}
