import { z } from "zod";

/**
 * Zod schema for the Settings boundary (architecture.md §13.3, §12.5
 * `PATCH /api/settings`). "Validate" at Sprint 1 is shape/format
 * validation only — a key is well-formed and non-trivial before it is
 * encrypted and stored (architecture.md §13.4 "Keys are validated on
 * save"). Live verification against the AI provider requires the
 * provider clients built in `modules/ai` (Sprint 5) and is
 * intentionally out of scope here.
 *
 * No Google key field — Business Discovery migrated off Google Maps
 * Platform onto free, keyless OpenStreetMap-backed services
 * (`modules/geo`); Settings now only ever validates the still-optional
 * AI provider key.
 *
 * Empty strings mean "leave the existing encrypted value unchanged" on
 * update (the raw value is never round-tripped to the client to be
 * re-submitted, so blank is the only way to signal "no change").
 */
const MIN_KEY_LENGTH = 10;

const aiApiKey = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || value.length >= MIN_KEY_LENGTH, {
    message: `AI API key must be at least ${MIN_KEY_LENGTH} characters`,
  });

export const aiProviderInputSchema = z.union([
  z.enum(["openai", "gemini", "claude"]),
  z.literal(""),
]);

export const updateSettingsSchema = z
  .object({
    aiProvider: aiProviderInputSchema,
    aiApiKey,
  })
  .refine((value) => value.aiProvider !== "" || value.aiApiKey === "", {
    message: "Select an AI provider before entering an AI API key",
    path: ["aiApiKey"],
  });

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
