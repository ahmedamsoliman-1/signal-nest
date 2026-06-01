import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function sendDesktopNotification(title, message) {
  if (process.platform !== "darwin") {
    return;
  }

  const normalize = (value) =>
    String(value)
      .replace(/\\/gu, "\\\\")
      .replace(/"/gu, '\\"')
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 220);

  const safeTitle = normalize(title);
  const safeMessage = normalize(message);

  try {
    await execFileAsync("osascript", [
      "-e",
      `display notification "${safeMessage}" with title "${safeTitle}"`
    ]);
  } catch (error) {
    console.error("Desktop notification failed:", error instanceof Error ? error.message : error);
  }
}
