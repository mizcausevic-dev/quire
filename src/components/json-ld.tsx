import { jsonLdScript } from "@/lib/jsonld";

export function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  const payload = Array.isArray(data) ? data : [data];
  return payload.map((entry, index) => (
    <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(entry) }} />
  ));
}
