import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { listPublicArticles, getPublicArticle } from "../src/lib/articles.ts";
import { migrate } from "../src/lib/db.ts";
import { getPublicListing } from "../src/lib/listings.ts";
import { searchListings } from "../src/lib/search.ts";
import { categoryTree, getCategoryBySlug, listCategories } from "../src/lib/taxonomy.ts";
import { paragraphs } from "../src/lib/text.ts";

const out = join(process.cwd(), "preview-dist");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

function write(path: string, html: string) {
  const file = join(out, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function shell(title: string, body: string, depth: number): string {
  const prefix = depth === 0 ? "./" : "../".repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${prefix}preview.css">
</head>
<body>
<p class="banner">Static preview snapshot. Search on this page filters the exported JSON. The publishing desk, accounts, and database search run on the Node server.</p>
<header class="wrap"><p class="issue">Quire preview</p><a class="wordmark" href="${prefix}index.html">Quire</a>
<nav><a href="${prefix}index.html">Home</a> <a href="${prefix}categories/software.html">Software</a> <a href="${prefix}categories/services.html">Services</a> <a href="${prefix}search.html">Search snapshot</a></nav>
</header>
<main class="wrap">${body}</main>
</body></html>`;
}

const css = `:root { --paper:#f3eee4; --ink:#1c1712; --rule:#8e2433; --line:#d5cbb8; --serif:Georgia,serif; --sans:"Segoe UI",sans-serif; }
body { margin:0; background:var(--paper); color:var(--ink); font-family:var(--sans); line-height:1.5; }
.wrap { width:min(960px, calc(100% - 2rem)); margin:0 auto; }
.banner { background:#1c1712; color:#f3eee4; padding:.6rem 1rem; font-size:.85rem; }
.wordmark { font-family:var(--serif); font-size:3rem; color:inherit; text-decoration:none; }
a { color:#1c4038; }
.entry { border-top:1px solid var(--line); padding:.8rem 0; }
h1,h2,h3 { font-family:var(--serif); letter-spacing:-.03em; }
.sponsored { background:#efe6cf; border-left:4px solid #7d6230; padding:.7rem 1rem; }
`;
write("preview.css", css);
write(".nojekyll", "");

migrate();
const tree = categoryTree();
const newest = searchListings({ sort: "newest", placement: "homepage" });
const articles = listPublicArticles();
write("index.html", shell("Quire preview", `
<h1>An edited catalog, frozen for this preview.</h1>
${tree.map((category) => `<p><a href="./categories/${category.slug}.html">${escapeHtml(category.name)}</a> · ${category.publishedCount}</p>`).join("")}
<h2>Sponsored</h2>
${newest.sponsored.map((hit) => `<p class="sponsored">${escapeHtml(hit.disclosure ?? "Sponsored")} · <a href="./listings/${hit.slug}.html">${escapeHtml(hit.title)}</a></p>`).join("") || "<p>No live sponsorship in this snapshot.</p>"}
<h2>Entries</h2>
${newest.hits.slice(0, 12).map((hit) => `<article class="entry"><h3><a href="./listings/${hit.slug}.html">${escapeHtml(hit.title)}</a></h3><p>${escapeHtml(hit.summary)}</p></article>`).join("")}
<h2>Journal</h2>
${articles.map((article) => `<p><a href="./articles/${article.slug}.html">${escapeHtml(article.title)}</a></p>`).join("")}
`, 0));

const catalog: Array<{ slug: string; title: string; summary: string; category: string; kind: string }> = [];
for (const category of listCategories()) {
  const full = getCategoryBySlug(category.slug);
  if (!full) continue;
  const cards = [];
  let sponsored = searchListings({ category: category.slug, sort: "name", page: 1 }).sponsored;
  for (let page = 1; page < 20; page += 1) {
    const result = searchListings({ category: category.slug, sort: "name", page });
    cards.push(...result.hits);
    if (result.hits.length < result.pageSize) break;
  }
  for (const hit of cards) catalog.push({ slug: hit.slug, title: hit.title, summary: hit.summary, category: hit.categorySlug, kind: hit.kind });
  write(`categories/${category.slug}.html`, shell(category.name, `
<p><a href="../index.html">Home</a></p>
<h1>${escapeHtml(category.name)}</h1>
<p>${escapeHtml(full.description)}</p>
${sponsored.map((hit) => `<p class="sponsored">${escapeHtml(hit.disclosure ?? "Sponsored")} · <a href="../listings/${hit.slug}.html">${escapeHtml(hit.title)}</a></p>`).join("")}
${cards.map((hit) => `<article class="entry"><h3><a href="../listings/${hit.slug}.html">${escapeHtml(hit.title)}</a></h3><p>${escapeHtml(hit.summary)}</p></article>`).join("") || "<p>No published entries.</p>"}
`, 1));
}

const seen = new Set<string>();
for (const item of catalog) {
  if (seen.has(item.slug)) continue;
  seen.add(item.slug);
  const listing = getPublicListing(item.slug);
  if (!listing) continue;
  write(`listings/${listing.slug}.html`, shell(listing.title, `
<p><a href="../categories/${listing.categorySlug}.html">${escapeHtml(listing.categoryName)}</a></p>
<h1>${escapeHtml(listing.title)}</h1>
${listing.isDemo ? "<p>Fictional</p>" : ""}
${listing.status === "archived" ? "<p>Archived. Kept for reference.</p>" : ""}
<p>${escapeHtml(listing.summary)}</p>
${paragraphs(listing.body).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
<ul>${listing.attributes.map((attribute) => `<li>${escapeHtml(attribute.label)}: ${escapeHtml(attribute.display)}</li>`).join("")}</ul>
<h2>Reviews</h2>
${listing.reviews.map((review) => `<article><p>${review.relationship === "verified_customer" ? "Verified customer" : "Review"} · ${review.rating}/5</p><h3>${escapeHtml(review.title)}</h3><p>${escapeHtml(review.body)}</p>${review.verificationNote ? `<p>${escapeHtml(review.verificationNote)}</p>` : ""}</article>`).join("") || "<p>No published reviews.</p>"}
`, 1));
}

for (const article of articles) {
  const full = getPublicArticle(article.slug);
  if (!full) continue;
  write(`articles/${article.slug}.html`, shell(article.title, `
<h1>${escapeHtml(full.title)}</h1>
<p>${escapeHtml(full.dek)}</p>
${paragraphs(full.body).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
<ul>${full.listings.map((listing) => `<li><a href="../listings/${listing.slug}.html">${escapeHtml(listing.title)}</a></li>`).join("")}</ul>
`, 1));
}

write("search.html", shell("Search snapshot", `
<h1>Search snapshot</h1>
<p>This filters the exported file. It does not query the database.</p>
<form id="finder"><label>Query <input id="q" type="search"></label> <button type="submit">Filter</button></form>
<div id="results"></div>
<script type="application/json" id="catalog">${JSON.stringify(catalog).replace(/</g, "\\u003c")}</script>
<script>
const data = JSON.parse(document.getElementById("catalog").textContent);
const box = document.getElementById("results");
function render(query) {
  const words = query.toLowerCase().split(/\\s+/).filter(Boolean);
  const hits = data.filter((item) => words.every((word) => (item.title + " " + item.summary).toLowerCase().includes(word)));
  box.innerHTML = hits.slice(0, 20).map((item) => "<article class=\\"entry\\"><h3><a href=\\"./listings/" + item.slug + ".html\\">" + item.title.replace(/[&<>]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])) + "</a></h3><p>" + item.summary.replace(/[&<>]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])) + "</p></article>").join("") || "<p>No matches in the snapshot.</p>";
}
document.getElementById("finder").addEventListener("submit", (event) => { event.preventDefault(); render(document.getElementById("q").value); });
render("");
</script>
`, 0));

write("404.html", shell("Missing page", "<h1>That page is not in the preview.</h1>", 0));
write("robots.txt", "User-agent: *\nAllow: /\n");
console.log(`Wrote preview to ${out}`);
