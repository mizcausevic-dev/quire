export type OfferLd = {
  name: string;
  price?: number;
  currency?: string;
  model: string;
};

export function websiteJsonLd(origin: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Quire",
    url: origin,
    description: "An edited catalog of software products and service providers.",
    publisher: {
      "@type": "Organization",
      name: "Quire",
      url: origin,
    },
    potentialAction: {
      "@type": "SearchAction",
      target: `${origin}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(origin: string, items: Array<{ name: string; path: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${origin}${item.path}`,
    })),
  };
}

export function itemListJsonLd(origin: string, name: string, items: Array<{ name: string; path: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        url: `${origin}${item.path}`,
      })),
    },
  };
}

export function listingJsonLd(input: {
  origin: string;
  path: string;
  kind: "software" | "service";
  title: string;
  summary: string;
  categoryName: string;
  providerName: string | null;
  offers: OfferLd[];
}): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": input.kind === "software" ? "SoftwareApplication" : "Service",
    name: input.title,
    description: input.summary,
    url: `${input.origin}${input.path}`,
  };
  if (input.kind === "software") data.applicationCategory = input.categoryName;
  if (input.providerName) data.provider = { "@type": "Organization", name: input.providerName };
  if (input.offers.length > 0) {
    data.offers = input.offers.map((offer) => {
      const entry: Record<string, unknown> = { "@type": "Offer", name: offer.name, url: `${input.origin}${input.path}` };
      if (offer.model === "free") {
        entry.price = 0;
        entry.priceCurrency = offer.currency || "USD";
      } else if (typeof offer.price === "number" && offer.currency) {
        entry.price = (offer.price / 100).toFixed(2);
        entry.priceCurrency = offer.currency;
      }
      return entry;
    });
  }
  return data;
}

export function articleJsonLd(input: { origin: string; path: string; title: string; description: string; publishedAt: string | null }): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    datePublished: input.publishedAt ?? undefined,
    mainEntityOfPage: `${input.origin}${input.path}`,
    author: { "@type": "Organization", name: "Quire editorial desk", url: input.origin },
    publisher: { "@type": "Organization", name: "Quire", url: input.origin },
  };
}

export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
