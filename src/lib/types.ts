export type Role = "user" | "moderator" | "administrator";
export type ListingKind = "software" | "service";
export type ListingStatus = "draft" | "submitted" | "published" | "rejected" | "archived";
export type RevisionStatus = "draft" | "submitted" | "approved" | "rejected";
export type MembershipRole = "owner" | "editor" | "billing";
export type AttributeType = "text" | "long_text" | "number" | "boolean" | "enum" | "url";
export type PriceModel = "free" | "subscription" | "one_time" | "usage" | "contact";

export type Actor = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export type PriceInput = {
  label: string;
  model: PriceModel;
  amount: string;
  currency: string;
  interval: "" | "month" | "year";
  notes: string;
};

export type ImageInput = {
  kind: "logo" | "screenshot";
  path: string;
  alt: string;
};

export type ListingInput = {
  title: string;
  summary: string;
  body: string;
  website: string;
  kind: ListingKind;
  categoryId: string;
  proposedSlug?: string;
  changeNote?: string;
  prices: PriceInput[];
  tags: string[];
  attributes: Record<string, string>;
  images: ImageInput[];
};

export type NormalizedPrice = {
  label: string;
  model: PriceModel;
  amountCents: number | null;
  currency: string;
  interval: "month" | "year" | null;
  notes: string;
};

export type NormalizedAttribute = {
  definitionId: string;
  key: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: number | null;
};

export type CanonicalListing = {
  title: string;
  summary: string;
  body: string;
  website: string | null;
  kind: ListingKind;
  categorySlug: string;
  prices: NormalizedPrice[];
  tags: string[];
  attributes: { key: string; value: string }[];
};
