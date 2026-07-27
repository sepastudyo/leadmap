import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import {
  AI_ANTHROPIC_MODEL,
  AI_GEMINI_MODEL,
  AI_OPENAI_MODEL,
} from "@/config/constants";

import type { AiProvider } from "./types";

/**
 * Resolves a provider + user-supplied key to a concrete `LanguageModel`
 * (architecture.md §11.1: "Provider + key come from `user_settings`;
 * the key is decrypted server-side per request and never sent to the
 * client" — this function is the one place in `modules/ai` that
 * touches a vendor SDK constructor; `generate-structured.ts` never
 * imports `@ai-sdk/*` directly). The `apiKey` is always the caller's
 * own decrypted key — never an env var default, since there is no
 * app-level AI key (BYOK only, same as the Google key in
 * `modules/google`).
 */
export function resolveModel(
  provider: AiProvider,
  apiKey: string,
): LanguageModel {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(AI_OPENAI_MODEL);
    case "gemini":
      return createGoogleGenerativeAI({ apiKey })(AI_GEMINI_MODEL);
    case "claude":
      return createAnthropic({ apiKey })(AI_ANTHROPIC_MODEL);
  }
}
