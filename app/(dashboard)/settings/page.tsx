import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMaskedSettings } from "@/modules/settings";

import { updateSettings } from "./actions";

const errorMessages: Record<string, string> = {
  InvalidInput:
    "Enter a valid Google API key and, if selecting an AI provider, a valid AI API key.",
  GoogleApiKeyRequired:
    "A Google API key is required the first time you save settings.",
  AiApiKeyRequired: "Enter an AI API key for the newly selected provider.",
};

const AI_PROVIDERS = [
  { value: "", label: "None" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
  { value: "claude", label: "Claude" },
] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const { error, success } = await searchParams;
  const settings = await getMaskedSettings(session.user.id);

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Your Google Maps Platform and AI provider keys are encrypted at rest
          and never shown again after saving.
        </p>
      </div>

      {error && (
        <p className="text-destructive text-sm">
          {errorMessages[error] ?? "Something went wrong. Please try again."}
        </p>
      )}
      {success && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          Settings saved.
        </p>
      )}

      <form action={updateSettings} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="googleApiKey">Google API key</Label>
          <Input
            id="googleApiKey"
            name="googleApiKey"
            type="password"
            autoComplete="off"
            placeholder={
              settings.hasGoogleApiKey
                ? "Saved — enter a new key to replace it"
                : "Enter your Google API key"
            }
          />
          <p className="text-muted-foreground text-xs">
            {settings.hasGoogleApiKey
              ? "A Google API key is currently saved."
              : "No Google API key saved yet."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="aiProvider">AI provider (optional)</Label>
          <select
            id="aiProvider"
            name="aiProvider"
            defaultValue={settings.aiProvider ?? ""}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-base outline-none focus-visible:ring-3 md:text-sm"
          >
            {AI_PROVIDERS.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="aiApiKey">AI API key</Label>
          <Input
            id="aiApiKey"
            name="aiApiKey"
            type="password"
            autoComplete="off"
            placeholder={
              settings.hasAiApiKey
                ? "Saved — enter a new key to replace it"
                : "Enter your AI provider's API key"
            }
          />
          <p className="text-muted-foreground text-xs">
            {settings.hasAiApiKey
              ? "An AI API key is currently saved."
              : "No AI API key saved yet. AI features stay disabled without one."}
          </p>
        </div>

        <Button type="submit">Save</Button>
      </form>
    </div>
  );
}
