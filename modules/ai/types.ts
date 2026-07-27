import { aiProviderEnum } from "@/db/schema/user-settings";
import { aiResultTypeEnum } from "@/db/schema/ai-results";

/** architecture.md §11.1 "Supported: OpenAI, Gemini, Claude" — derived
 * from the schema enum, not redeclared, matching the
 * `FavoriteStatus`-from-`favoriteStatusEnum` pattern in
 * `modules/crm/favorites-repository.ts`. */
export type AiProvider = (typeof aiProviderEnum.enumValues)[number];

/** architecture.md §5.2 `ai_results.type` — "audit|opportunity". */
export type AiResultType = (typeof aiResultTypeEnum.enumValues)[number];
