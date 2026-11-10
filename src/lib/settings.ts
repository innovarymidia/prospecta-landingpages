import { db } from "@/lib/db";

const DEFAULT_SETTING_ID = "default";

function envDefaultMessagingEnabled(): boolean {
  return process.env.AUTOMATION_ENABLED === "true";
}

export async function getMessagingEnabled(): Promise<boolean> {
  const existing = await db.systemSetting.findUnique({
    where: { id: DEFAULT_SETTING_ID },
    select: { messagingEnabled: true },
  });
  if (existing) return existing.messagingEnabled;
  return envDefaultMessagingEnabled();
}

export async function setMessagingEnabled(enabled: boolean): Promise<boolean> {
  const updated = await db.systemSetting.upsert({
    where: { id: DEFAULT_SETTING_ID },
    create: { id: DEFAULT_SETTING_ID, messagingEnabled: enabled },
    update: { messagingEnabled: enabled },
    select: { messagingEnabled: true },
  });
  return updated.messagingEnabled;
}

