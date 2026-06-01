import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function normalizePrivateKey(value) {
  return value?.replace(/\\n/gu, "\n");
}

export function isFirestoreConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );
}

export function getFirebaseDb() {
  if (!isFirestoreConfigured()) {
    return null;
  }

  const existing = getApps()[0];
  const app =
    existing ??
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY)
      })
    });

  return getFirestore(app);
}

export function getFirebaseMessagingAdmin() {
  if (!isFirestoreConfigured()) {
    return null;
  }

  const app = getApps()[0];
  return app ? getMessaging(app) : null;
}
