"use client";

import { useEffect, useState } from "react";
import { getToken, onMessage } from "firebase/messaging";
import { getFirebaseMessagingClient, isFirebaseWebConfigured } from "@/lib/firebase-web";

const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export function PushNotificationCard() {
  const [permission, setPermission] = useState("default");
  const [status, setStatus] = useState("idle");
  const [detail, setDetail] = useState("Browser push is not enabled yet.");

  useEffect(() => {
    let unsubscribe = null;

    if (!("Notification" in window)) {
      setPermission("unsupported");
      setStatus("error");
      setDetail("This browser does not support notifications.");
      return;
    }

    setPermission(Notification.permission);

    async function hydrateCurrentRegistration() {
      if (Notification.permission !== "granted") {
        return;
      }

      if (!isFirebaseWebConfigured() || !vapidKey) {
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        const messaging = await getFirebaseMessagingClient();
        if (!messaging) {
          return;
        }

        const token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: registration
        });

        if (token) {
          await fetch("/api/push/register", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              token,
              permission: Notification.permission,
              userAgent: navigator.userAgent,
              platform: navigator.platform,
              locale: navigator.language
            })
          });

          setStatus("ready");
          setDetail("This browser is already registered for SignalNest push alerts.");
        }
      } catch {
        // Ignore hydration issues and let the user retry manually.
      }
    }

    async function attachForegroundListener() {
      const messaging = await getFirebaseMessagingClient();
      if (!messaging) {
        return;
      }

      unsubscribe = onMessage(messaging, (payload) => {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(payload.notification?.title || "SignalNest update", {
            body: payload.notification?.body || "A monitor changed state."
          });
        }
      });
    }

    hydrateCurrentRegistration();
    attachForegroundListener();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      setStatus("error");
      setDetail("This browser does not support notifications.");
      return;
    }

    if (!isFirebaseWebConfigured() || !vapidKey) {
      setStatus("error");
      setDetail("Firebase web push is not configured yet.");
      return;
    }

    setStatus("working");
    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);

    if (nextPermission !== "granted") {
      setStatus("error");
      setDetail("Notification permission was not granted.");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      const messaging = await getFirebaseMessagingClient();

      if (!messaging) {
        throw new Error("Firebase messaging is not supported in this browser.");
      }

      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration
      });

      if (!token) {
        throw new Error("No push token was returned.");
      }

      await fetch("/api/push/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token,
          permission: nextPermission,
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          locale: navigator.language
        })
      });

      setStatus("ready");
      setDetail("This browser is registered. You will receive push alerts for monitor updates.");
    } catch (error) {
      setStatus("error");
      setDetail(error instanceof Error ? error.message : "Unable to enable notifications.");
    }
  }

  async function disableNotifications() {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
      const messaging = await getFirebaseMessagingClient();

      if (messaging && registration && vapidKey) {
        const token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: registration
        });

        if (token) {
          await fetch("/api/push/unregister", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ token })
          });
        }
      }

      setStatus("idle");
      setDetail("Push alerts were disabled for this browser record.");
    } catch (error) {
      setStatus("error");
      setDetail(error instanceof Error ? error.message : "Unable to disable notifications.");
    }
  }

  return (
    <div className="panel panel-push">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Push Alerts</p>
          <h2>Browser notifications</h2>
        </div>
        <span className={`pill pill-${status === "ready" ? "success" : status === "error" ? "danger" : "default"}`}>
          {permission}
        </span>
      </div>

      <p className="panel-copy">
        Register this browser to receive Firebase Cloud Messaging push alerts when a monitor changes
        or becomes available.
      </p>

      <p className="push-detail">{detail}</p>

      <div className="push-actions">
        <button className="button button-primary" type="button" onClick={enableNotifications}>
          Enable push alerts
        </button>
        <button className="button button-secondary" type="button" onClick={disableNotifications}>
          Disable for this browser
        </button>
      </div>
    </div>
  );
}
