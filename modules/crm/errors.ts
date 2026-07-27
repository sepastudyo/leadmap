/** Shared across `favorites.ts` and `notes.ts` — both create against a
 * client-supplied `businessId` that needs the same existence check
 * before insert (an FK violation is not an API-presentable 404). */
export class BusinessNotFoundError extends Error {
  constructor() {
    super("Business not found.");
    this.name = "BusinessNotFoundError";
  }
}
