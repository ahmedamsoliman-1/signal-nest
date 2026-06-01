"use server";

import { revalidatePath } from "next/cache";
import { createJob, deleteJob, runJobNow, setJobEnabled } from "@/lib/jobs";

export async function createMonitorAction(formData) {
  await createJob({
    name: String(formData.get("name") ?? "").trim(),
    providerId: String(formData.get("providerId") ?? "").trim(),
    intervalMinutes: Number(formData.get("intervalMinutes") ?? 5),
    config: {
      nationalId: String(formData.get("nationalId") ?? "").trim()
    }
  });

  revalidatePath("/");
}

export async function runMonitorNowAction(formData) {
  await runJobNow(String(formData.get("jobId") ?? "").trim());
  revalidatePath("/");
}

export async function toggleMonitorAction(formData) {
  await setJobEnabled(
    String(formData.get("jobId") ?? "").trim(),
    String(formData.get("enabled") ?? "false") === "true"
  );
  revalidatePath("/");
}

export async function deleteMonitorAction(formData) {
  await deleteJob(String(formData.get("jobId") ?? "").trim());
  revalidatePath("/");
}
