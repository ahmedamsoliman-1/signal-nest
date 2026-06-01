export function getNotificationMode() {
  const value = String(process.env.SIGNALNEST_NOTIFY_MODE ?? "changes").trim().toLowerCase();
  return value === "always" ? "always" : "changes";
}

export function isAlwaysNotifyMode() {
  return getNotificationMode() === "always";
}
