"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { updateSettingsSchema } from "@/lib/validation";
import {
  AiApiKeyInvalidError,
  AiApiKeyRequiredError,
  GoogleApiKeyRequiredError,
  saveSettings,
} from "@/modules/settings";

function requestIp(headersList: Headers): string {
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return headersList.get("x-real-ip") ?? "unknown";
}

export async function updateSettings(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const parsed = updateSettingsSchema.safeParse({
    googleApiKey: formData.get("googleApiKey") ?? "",
    aiProvider: formData.get("aiProvider") ?? "",
    aiApiKey: formData.get("aiApiKey") ?? "",
  });

  if (!parsed.success) {
    redirect("/settings?error=InvalidInput");
  }

  try {
    await saveSettings(session.user.id, parsed.data, {
      ip: requestIp(await headers()),
    });
  } catch (error) {
    if (error instanceof GoogleApiKeyRequiredError) {
      redirect("/settings?error=GoogleApiKeyRequired");
    }
    if (error instanceof AiApiKeyRequiredError) {
      redirect("/settings?error=AiApiKeyRequired");
    }
    if (error instanceof AiApiKeyInvalidError) {
      redirect("/settings?error=AiApiKeyInvalid");
    }
    throw error;
  }

  redirect("/settings?success=1");
}
