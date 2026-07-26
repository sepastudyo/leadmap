import "server-only";
import * as cheerio from "cheerio";

/**
 * [2 Parse] (architecture.md §9.1: "Parse HTML with Cheerio
 * (server-side DOM, no JS execution)"). A thin, explicit wrapper —
 * exists so every downstream stage imports `parseHtml` from this one
 * place rather than importing `cheerio` directly, keeping Cheerio an
 * implementation detail of this module rather than a dependency every
 * stage file has to know about.
 */
export type ParsedHtml = ReturnType<typeof cheerio.load>;

export function parseHtml(html: string): ParsedHtml {
  return cheerio.load(html);
}
