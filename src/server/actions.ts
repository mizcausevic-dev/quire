"use server";

import { unstable_rethrow } from "next/navigation";
import { redirect } from "next/navigation";
import { loginWithLimits, registerUser, changeUserRole } from "@/lib/auth";
import { confirmMockSubscription } from "@/lib/billing";
import { addToCollection, createCollection, removeFromCollection } from "@/lib/collections";
import { publicErrorMessage, AppError } from "@/lib/errors";
import { readImportUpload, runImport, saveImportUpload, type ColumnMapping } from "@/lib/imports";
import { createListing, getListing, proposeRevision, submitListing, updateUnpublished } from "@/lib/listings";
import { archiveListing, approveRevision, rejectRevision, restoreListing } from "@/lib/listings";
import { decideClaim, decideReview, fileClaim, reportReview, resolveReport, revokeClaim, submitReview, verifyCustomerReview } from "@/lib/moderation";
import { createOrganization, setMembership } from "@/lib/orgs";
import { saveArticle, setArticleStatus } from "@/lib/articles";
import { canAdminister } from "@/lib/permissions";
import { cancelPlacement, createPlacement } from "@/lib/sponsorship";
import { deleteCategory, saveAttributeDefinition, saveCategory, saveTag } from "@/lib/taxonomy";
import { safeNextPath } from "@/lib/text";
import type { ListingInput, ListingKind, MembershipRole, PriceInput, PriceModel } from "@/lib/types";
import { endSession, go, requireActor, requireAdmin, requireModerator, startSession } from "@/server/session";

function fail(error: unknown, path: string): never {
  unstable_rethrow(error);
  go(path, "err", publicErrorMessage(error));
}

function priceFrom(formData: FormData, prefix: string): PriceInput | null {
  const model = String(formData.get(`${prefix}model`) ?? "").trim();
  if (!model) return null;
  return {
    label: String(formData.get(`${prefix}label`) ?? "Price").trim() || "Price",
    model: model as PriceModel,
    amount: String(formData.get(`${prefix}amount`) ?? ""),
    currency: String(formData.get(`${prefix}currency`) ?? "USD"),
    interval: String(formData.get(`${prefix}interval`) ?? "") as "" | "month" | "year",
    notes: String(formData.get(`${prefix}notes`) ?? ""),
  };
}

function listingInput(formData: FormData): ListingInput & { organizationId?: string | null } {
  const kind = String(formData.get("kind") ?? "software");
  if (kind !== "software" && kind !== "service") throw new AppError("Choose software or service.", "kind");
  const attributes: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && key.startsWith("attr_")) attributes[key.slice(5)] = value;
  }
  const prices = [priceFrom(formData, "price_"), priceFrom(formData, "price2_")].filter((price): price is PriceInput => Boolean(price));
  const imagePath = String(formData.get("image_path") ?? "").trim();
  const organizationId = String(formData.get("organizationId") ?? "").trim();
  return {
    title: String(formData.get("title") ?? ""),
    summary: String(formData.get("summary") ?? ""),
    body: String(formData.get("body") ?? ""),
    website: String(formData.get("website") ?? ""),
    kind: kind as ListingKind,
    categoryId: String(formData.get("categoryId") ?? ""),
    proposedSlug: String(formData.get("proposedSlug") ?? "") || undefined,
    changeNote: String(formData.get("changeNote") ?? ""),
    prices,
    tags: formData.getAll("tag").map(String),
    attributes,
    images: imagePath ? [{ kind: "screenshot", path: imagePath, alt: String(formData.get("image_alt") ?? "") }] : [],
    organizationId: organizationId || null,
  };
}

export async function registerAction(formData: FormData) {
  const next = safeNextPath(String(formData.get("next") ?? ""), "/account");
  let message = "";
  try {
    const actor = registerUser({
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      password: String(formData.get("password") ?? ""),
      acceptPrivacy: formData.get("privacy") === "yes",
    });
    await startSession(actor.id);
  } catch (error) {
    message = publicErrorMessage(error);
    unstable_rethrow(error);
  }
  if (message) go("/register", "err", message);
  redirect(next);
}

export async function loginAction(formData: FormData) {
  const next = safeNextPath(String(formData.get("next") ?? ""), "/account");
  let message = "";
  try {
    const actor = loginWithLimits(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
    await startSession(actor.id);
  } catch (error) {
    message = publicErrorMessage(error);
    unstable_rethrow(error);
  }
  if (message) go(`/login?next=${encodeURIComponent(next)}`, "err", message);
  redirect(next);
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

export async function saveListingAction(formData: FormData) {
  const actor = await requireActor("/submit");
  const listingId = String(formData.get("listingId") ?? "");
  const intent = String(formData.get("intent") ?? "draft");
  const back = listingId ? `/provider/listings/${listingId}` : "/submit";
  let message = "";
  let path = back;
  try {
    const input = listingInput(formData);
    if (!listingId) {
      const created = createListing(actor, input);
      if (intent === "submit") submitListing(actor, created.listingId);
      path = intent === "submit" ? "/account" : `/provider/listings/${created.listingId}`;
      message = intent === "submit" ? "Submitted for review. It is not public yet." : "Draft saved.";
    } else {
      const listing = getListing(listingId);
      if (!listing) throw new AppError("Listing not found.", "missing");
      if (listing.status === "published") {
        proposeRevision(actor, listingId, input);
        message = "Revision submitted. The published version stays visible during review.";
      } else {
        updateUnpublished(actor, listingId, input);
        if (intent === "submit") submitListing(actor, listingId);
        message = intent === "submit" ? "Submitted for review. It is not public yet." : "Draft saved.";
      }
      path = `/provider/listings/${listingId}`;
    }
  } catch (error) {
    unstable_rethrow(error);
    go(back, "err", publicErrorMessage(error));
  }
  go(path, "ok", message);
}

export async function claimAction(formData: FormData) {
  const actor = await requireActor();
  const listingId = String(formData.get("listingId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  try {
    fileClaim(actor, {
      listingId,
      organizationId: String(formData.get("organizationId") ?? "") || null,
      evidence: String(formData.get("evidence") ?? ""),
      evidenceUrl: String(formData.get("evidenceUrl") ?? ""),
    });
  } catch (error) {
    unstable_rethrow(error);
    go(`/listings/${slug}/claim`, "err", publicErrorMessage(error));
  }
  go("/provider/claims", "ok", "Claim filed. It stays pending until a moderator reviews the evidence.");
}

export async function reviewAction(formData: FormData) {
  const actor = await requireActor();
  const slug = String(formData.get("slug") ?? "");
  try {
    submitReview(actor, {
      listingId: String(formData.get("listingId") ?? ""),
      rating: Number(formData.get("rating") ?? 0),
      title: String(formData.get("title") ?? ""),
      body: String(formData.get("body") ?? ""),
    });
  } catch (error) {
    unstable_rethrow(error);
    go(`/listings/${slug}`, "err", publicErrorMessage(error));
  }
  go(`/listings/${slug}`, "ok", "Review submitted. It is hidden until a moderator publishes it.");
}

export async function reportAction(formData: FormData) {
  const actor = await requireActor();
  const slug = String(formData.get("slug") ?? "");
  const reason = String(formData.get("reason") ?? "other");
  if (!["spam", "conflict", "personal_data", "other"].includes(reason)) {
    go(`/listings/${slug}`, "err", "Choose a report reason.");
  }
  try {
    reportReview(actor, String(formData.get("reviewId") ?? ""), reason as "spam" | "conflict" | "personal_data" | "other", String(formData.get("details") ?? ""));
  } catch (error) {
    unstable_rethrow(error);
    go(`/listings/${slug}`, "err", publicErrorMessage(error));
  }
  go(`/listings/${slug}`, "ok", "Report sent to the moderation queue.");
}

export async function collectionAction(formData: FormData) {
  const actor = await requireActor("/account/collections");
  const intent = String(formData.get("intent") ?? "create");
  try {
    if (intent === "create") {
      const created = createCollection(actor, String(formData.get("name") ?? ""));
      const listingId = String(formData.get("listingId") ?? "");
      if (listingId) addToCollection(actor, created.id, listingId);
      go(`/account/collections/${created.id}`, "ok", "Collection saved.");
    }
    if (intent === "add") addToCollection(actor, String(formData.get("collectionId") ?? ""), String(formData.get("listingId") ?? ""));
    if (intent === "remove") removeFromCollection(actor, String(formData.get("collectionId") ?? ""), String(formData.get("listingId") ?? ""));
  } catch (error) {
    unstable_rethrow(error);
    go("/account/collections", "err", publicErrorMessage(error));
  }
  const collectionId = String(formData.get("collectionId") ?? "");
  go(collectionId ? `/account/collections/${collectionId}` : "/account/collections", "ok", "Collection updated.");
}

export async function approveAction(formData: FormData) {
  const actor = await requireModerator();
  const listingId = String(formData.get("listingId") ?? "");
  try {
    approveRevision(actor, String(formData.get("revisionId") ?? ""), String(formData.get("note") ?? ""));
  } catch (error) {
    unstable_rethrow(error);
    go(`/admin/listings/${listingId}`, "err", publicErrorMessage(error));
  }
  go(`/admin/listings/${listingId}`, "ok", "Approved. The public version now uses this revision.");
}

export async function rejectAction(formData: FormData) {
  const actor = await requireModerator();
  const listingId = String(formData.get("listingId") ?? "");
  try {
    rejectRevision(actor, String(formData.get("revisionId") ?? ""), String(formData.get("note") ?? ""));
  } catch (error) {
    unstable_rethrow(error);
    go(`/admin/listings/${listingId}`, "err", publicErrorMessage(error));
  }
  go("/admin/queue", "ok", "Revision rejected. A published version, if one exists, stays up.");
}

export async function archiveAction(formData: FormData) {
  const actor = await requireModerator();
  const listingId = String(formData.get("listingId") ?? "");
  const intent = String(formData.get("intent") ?? "archive");
  try {
    if (intent === "restore") restoreListing(actor, listingId, String(formData.get("note") ?? "Restored."));
    else archiveListing(actor, listingId, String(formData.get("note") ?? ""));
  } catch (error) {
    unstable_rethrow(error);
    go(`/admin/listings/${listingId}`, "err", publicErrorMessage(error));
  }
  go(`/admin/listings/${listingId}`, "ok", intent === "restore" ? "Listing restored to the public catalog." : "Listing archived. The URL remains, with noindex.");
}

export async function decideClaimAction(formData: FormData) {
  const actor = await requireModerator();
  const claimId = String(formData.get("claimId") ?? "");
  const decision = String(formData.get("decision") ?? "rejected");
  try {
    if (decision === "revoke") revokeClaim(actor, claimId, String(formData.get("note") ?? ""));
    else if (decision === "approved" || decision === "rejected") decideClaim(actor, claimId, decision, String(formData.get("note") ?? ""));
    else throw new AppError("Unknown claim decision.", "claim");
  } catch (error) {
    unstable_rethrow(error);
    go("/admin/claims", "err", publicErrorMessage(error));
  }
  go("/admin/claims", "ok", "Claim decision recorded.");
}

export async function decideReviewAction(formData: FormData) {
  const actor = await requireModerator();
  try {
    const decision = String(formData.get("decision") ?? "");
    const reviewId = String(formData.get("reviewId") ?? "");
    if (decision === "verify") verifyCustomerReview(actor, reviewId, String(formData.get("note") ?? ""));
    else if (decision === "published" || decision === "rejected") decideReview(actor, reviewId, decision, String(formData.get("note") ?? ""));
    else throw new AppError("Unknown review decision.", "review");
  } catch (error) {
    unstable_rethrow(error);
    go("/admin/reviews", "err", publicErrorMessage(error));
  }
  go("/admin/reviews", "ok", "Review decision recorded.");
}

export async function resolveReportAction(formData: FormData) {
  const actor = await requireModerator();
  const decision = String(formData.get("decision") ?? "");
  try {
    if (decision !== "dismissed" && decision !== "actioned") throw new AppError("Unknown report decision.", "report");
    resolveReport(actor, String(formData.get("reportId") ?? ""), decision, String(formData.get("note") ?? ""));
  } catch (error) {
    unstable_rethrow(error);
    go("/admin/reviews", "err", publicErrorMessage(error));
  }
  go("/admin/reviews", "ok", "Report resolved.");
}

export async function organizationAction(formData: FormData) {
  const actor = await requireActor("/provider/organization");
  const intent = String(formData.get("intent") ?? "create");
  try {
    if (intent === "create") {
      createOrganization(actor, {
        name: String(formData.get("name") ?? ""),
        website: String(formData.get("website") ?? ""),
        description: String(formData.get("description") ?? ""),
      });
    } else {
      const role = String(formData.get("role") ?? "editor");
      if (!["owner", "editor", "billing", "remove"].includes(role)) throw new AppError("Unknown membership role.", "membership");
      setMembership(actor, String(formData.get("organizationId") ?? ""), String(formData.get("email") ?? ""), role as MembershipRole | "remove");
    }
  } catch (error) {
    unstable_rethrow(error);
    go("/provider/organization", "err", publicErrorMessage(error));
  }
  go("/provider/organization", "ok", intent === "create" ? "Organization created. It does not own any listings yet." : "Membership updated.");
}

export async function mockBillingAction(formData: FormData) {
  const actor = await requireActor("/provider/billing");
  try {
    confirmMockSubscription(actor, String(formData.get("organizationId") ?? ""), String(formData.get("planCode") ?? ""));
  } catch (error) {
    unstable_rethrow(error);
    go("/provider/billing", "err", publicErrorMessage(error));
  }
  go("/provider/billing", "ok", "Mock subscription confirmed on the server. A browser redirect would not have done this.");
}

export async function categoryAction(formData: FormData) {
  const actor = await requireAdmin();
  const intent = String(formData.get("intent") ?? "save");
  try {
    if (intent === "delete") deleteCategory(actor, String(formData.get("id") ?? ""));
    else {
      saveCategory(actor, {
        id: String(formData.get("id") ?? "") || undefined,
        parentId: String(formData.get("parentId") ?? "") || null,
        name: String(formData.get("name") ?? ""),
        slug: String(formData.get("slug") ?? "") || undefined,
        description: String(formData.get("description") ?? ""),
        kind: String(formData.get("kind") ?? "software") === "service" ? "service" : "software",
        sortOrder: Number(formData.get("sortOrder") ?? 0),
      });
    }
  } catch (error) {
    unstable_rethrow(error);
    go("/admin/taxonomy", "err", publicErrorMessage(error));
  }
  go("/admin/taxonomy", "ok", "Taxonomy updated. Slug changes write redirects.");
}

export async function attributeAction(formData: FormData) {
  const actor = await requireAdmin();
  try {
    saveAttributeDefinition(actor, {
      categoryId: String(formData.get("categoryId") ?? "") || null,
      key: String(formData.get("key") ?? ""),
      label: String(formData.get("label") ?? ""),
      valueType: String(formData.get("valueType") ?? "text") as "text" | "long_text" | "number" | "boolean" | "enum" | "url",
      enumOptions: String(formData.get("enumOptions") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
      required: formData.get("required") === "yes",
      filterable: formData.get("filterable") === "yes",
      unit: String(formData.get("unit") ?? ""),
    });
  } catch (error) {
    unstable_rethrow(error);
    go("/admin/taxonomy", "err", publicErrorMessage(error));
  }
  go("/admin/taxonomy", "ok", "Attribute definition saved.");
}

export async function tagAction(formData: FormData) {
  const actor = await requireAdmin();
  try {
    saveTag(actor, String(formData.get("name") ?? ""));
  } catch (error) {
    unstable_rethrow(error);
    go("/admin/taxonomy", "err", publicErrorMessage(error));
  }
  go("/admin/taxonomy", "ok", "Tag saved.");
}

export async function roleAction(formData: FormData) {
  const actor = await requireAdmin();
  const role = String(formData.get("role") ?? "user");
  try {
    if (role !== "user" && role !== "moderator" && role !== "administrator") throw new AppError("Unknown role.", "role");
    changeUserRole(actor, String(formData.get("userId") ?? ""), role);
  } catch (error) {
    unstable_rethrow(error);
    go("/admin/users", "err", publicErrorMessage(error));
  }
  go("/admin/users", "ok", "Role updated. Roles do not grant listing ownership or a paid plan.");
}

export async function uploadImportAction(formData: FormData) {
  const actor = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) go("/admin/imports", "err", "Choose a CSV file.");
  try {
    const saved = saveImportUpload(actor, file.name, Buffer.from(await file.arrayBuffer()));
    redirect(`/admin/imports/${saved.id}`);
  } catch (error) {
    unstable_rethrow(error);
    go("/admin/imports", "err", publicErrorMessage(error));
  }
}

export async function runImportAction(formData: FormData) {
  const actor = await requireAdmin();
  const uploadId = String(formData.get("uploadId") ?? "");
  let batchPath = `/admin/imports/${uploadId}`;
  try {
    const attributes: Record<string, string> = {};
    const attributeHeader = String(formData.get("map_attribute_header") ?? "");
    const attributeKey = String(formData.get("map_attribute_key") ?? "");
    if (attributeHeader && attributeKey) attributes[attributeKey] = attributeHeader;
    const mapping: ColumnMapping = {
      title: String(formData.get("map_title") ?? ""),
      dedupe_key: String(formData.get("map_dedupe_key") ?? ""),
      category_slug: String(formData.get("map_category_slug") ?? ""),
      kind: String(formData.get("map_kind") ?? ""),
      summary: String(formData.get("map_summary") ?? ""),
      body: String(formData.get("map_body") ?? "") || undefined,
      website: String(formData.get("map_website") ?? "") || undefined,
      provider_name: String(formData.get("map_provider_name") ?? "") || undefined,
      organization_slug: String(formData.get("map_organization_slug") ?? "") || undefined,
      price_model: String(formData.get("map_price_model") ?? "") || undefined,
      price_amount: String(formData.get("map_price_amount") ?? "") || undefined,
      price_currency: String(formData.get("map_price_currency") ?? "") || undefined,
      price_interval: String(formData.get("map_price_interval") ?? "") || undefined,
      price_label: String(formData.get("map_price_label") ?? "") || undefined,
      tags: String(formData.get("map_tags") ?? "") || undefined,
      attributes,
    };
    const mode = formData.get("mode") === "commit" ? "commit" : "dry_run";
    const strategy = formData.get("strategy") === "partial" ? "partial" : "all_or_nothing";
    const onDuplicate = formData.get("onDuplicate") === "revise" ? "revise" : "skip";
    const result = runImport(actor, { filename: `${uploadId}.csv`, csv: readImportUpload(uploadId), mapping, mode, strategy, onDuplicate });
    batchPath = `/admin/imports/${result.batchId}`;
    go(batchPath, "ok", `${result.imported} imported, ${result.duplicates} duplicates, ${result.invalid} invalid.`);
  } catch (error) {
    unstable_rethrow(error);
    go(batchPath, "err", publicErrorMessage(error));
  }
}

export async function sponsorshipAction(formData: FormData) {
  const actor = await requireAdmin();
  const intent = String(formData.get("intent") ?? "create");
  try {
    if (intent === "cancel") cancelPlacement(actor, String(formData.get("placementId") ?? ""));
    else {
      const placement = String(formData.get("placement") ?? "homepage");
      if (placement !== "homepage" && placement !== "category" && placement !== "search") throw new AppError("Unknown placement.", "sponsorship");
      createPlacement(actor, {
        listingId: String(formData.get("listingId") ?? ""),
        placement,
        startsAt: String(formData.get("startsAt") ?? ""),
        endsAt: String(formData.get("endsAt") ?? ""),
        disclosure: String(formData.get("disclosure") ?? "Sponsored"),
        requiresEntitlement: formData.get("requiresEntitlement") !== "no",
      });
    }
  } catch (error) {
    unstable_rethrow(error);
    go("/admin/sponsorships", "err", publicErrorMessage(error));
  }
  go("/admin/sponsorships", "ok", "Sponsorship schedule updated. Visibility follows the stored dates.");
}

export async function articleAction(formData: FormData) {
  const actor = await requireModerator();
  const intent = String(formData.get("intent") ?? "save");
  try {
    if (intent === "status") {
      const status = String(formData.get("status") ?? "draft");
      if (status !== "draft" && status !== "published" && status !== "archived") throw new AppError("Unknown article status.", "article");
      setArticleStatus(actor, String(formData.get("id") ?? ""), status, String(formData.get("slug") ?? "") || undefined);
    } else if (canAdminister(actor) || actor.role === "moderator") {
      const saved = saveArticle(actor, {
        id: String(formData.get("id") ?? "") || undefined,
        title: String(formData.get("title") ?? ""),
        dek: String(formData.get("dek") ?? ""),
        body: String(formData.get("body") ?? ""),
        listingSlugs: String(formData.get("listingSlugs") ?? "").split(/[,\s]+/).map((slug) => slug.trim()).filter(Boolean),
      });
      if (formData.get("publish") === "yes") setArticleStatus(actor, saved.id, "published");
    }
  } catch (error) {
    unstable_rethrow(error);
    go("/admin/articles", "err", publicErrorMessage(error));
  }
  go("/admin/articles", "ok", "Article saved.");
}
