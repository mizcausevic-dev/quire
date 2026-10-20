import { sha256, stableStringify } from "./text";
import type { CanonicalListing } from "./types";

export function listingContentHash(content: CanonicalListing): string {
  return sha256(stableStringify(content));
}
