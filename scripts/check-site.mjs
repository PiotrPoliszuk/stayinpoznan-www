import { access, readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1];
}

const files = await walk(root);
const htmlFiles = files.filter((file) => extname(file) === ".html");
const titles = new Map();
const canonicals = new Map();
const indexableCanonicals = new Set();

for (const file of htmlFiles) {
  const name = relative(root, file);
  const html = await readFile(file, "utf8");
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  const description = html.match(/<meta name="description" content="([^"]+)"/i)?.[1]?.trim();
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1]?.trim();
  const isNoindex = /<meta name="robots" content="[^"]*noindex/i.test(html);
  const h1Count = (html.match(/<h1\b/gi) || []).length;

  if (!title || title.length < 12) errors.push(`${name}: missing or short title`);
  if (!description || description.length < 70) errors.push(`${name}: missing or short meta description`);
  if (!canonical?.startsWith("https://stayinpoznan.pl/")) errors.push(`${name}: invalid canonical`);
  if (h1Count !== 1) errors.push(`${name}: expected one H1, found ${h1Count}`);
  if (html.includes("poznan-old-town.webp") || html.includes("placeholder")) errors.push(`${name}: rejected or placeholder asset reference`);
  if (title) {
    if (titles.has(title)) errors.push(`${name}: duplicate title also used by ${titles.get(title)}`);
    titles.set(title, name);
  }
  if (canonical) {
    if (canonicals.has(canonical)) errors.push(`${name}: duplicate canonical also used by ${canonicals.get(canonical)}`);
    canonicals.set(canonical, name);
    if (!isNoindex) indexableCanonicals.add(canonical);
  }

  for (const script of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(script[1]); } catch (error) { errors.push(`${name}: invalid JSON-LD: ${error.message}`); }
  }

  for (const image of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = image[0];
    const src = attribute(tag, "src");
    const alt = attribute(tag, "alt");
    const decorative = alt === "" && attribute(tag, "aria-hidden") === "true";
    if (!src) errors.push(`${name}: image without src`);
    if (alt === undefined || (alt.trim() === "" && !decorative)) errors.push(`${name}: image without useful alt text (${src || "unknown"})`);
    if (src?.startsWith("/")) {
      const imagePath = join(root, src);
      if (!await exists(imagePath)) errors.push(`${name}: missing image ${src}`);
      else if (extname(imagePath).toLowerCase() === ".svg") {
        const svg = await readFile(imagePath, "utf8");
        if (svg.length < 200 || !/<svg\b/i.test(svg) || !/viewBox=/i.test(svg) || !/<(?:path|rect|circle)\b/i.test(svg)) {
          errors.push(`${name}: invalid or suspiciously small SVG ${src}`);
        }
      } else if ((await stat(imagePath)).size < 1024) errors.push(`${name}: empty or suspiciously small image ${src}`);
    }
  }

  for (const link of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attribute(link[0], "href");
    if (!href || !href.startsWith("/") || href.startsWith("//")) continue;
    const clean = href.split("#")[0].split("?")[0];
    if (!clean) continue;
    const target = clean.endsWith("/") ? join(root, clean, "index.html") : join(root, clean);
    if (!await exists(target)) errors.push(`${name}: broken internal link ${href}`);
  }
}

const sitemap = await readFile(join(root, "sitemap.xml"), "utf8");
if (sitemap.includes("/apartamenty/antresola/")) errors.push("sitemap.xml: noindex antresola page must not be listed");
const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
if (sitemapUrls.size !== indexableCanonicals.size) {
  errors.push(`sitemap.xml: expected ${indexableCanonicals.size} indexable URLs, found ${sitemapUrls.size}`);
}
for (const canonical of indexableCanonicals) {
  if (!sitemapUrls.has(canonical)) errors.push(`sitemap.xml: missing ${canonical}`);
}

const redirects = await readFile(join(root, "_redirects"), "utf8");
for (const [alias, target] of [
  ["/pyrkon", "/wydarzenia/pyrkon-2027/"],
  ["/bittersweet", "/wydarzenia/bittersweet-festival-2027/"],
  ["/targi", "/wydarzenia/"],
  ["/apartament", "/apartamenty/"],
  ["/stary-rynek", "/poznan/stary-rynek/"],
  ["/weganskie", "/poznan/weganskie-restauracje/"],
  ["/clubbing", "/poznan/clubbing/"],
  ["/kluby", "/poznan/clubbing/"],
  ["/przewodnik", "/poznan/przewodnik/"],
  ["/legendy", "/poznan/nieoczywisty/"],
  ["/cytadela", "/poznan/historia/cytadela-fort-winiary/"],
  ["/lotnictwo", "/poznan/historia/lawica-polskie-lotnictwo/"],
  ["/ukraina", "/ua/"],
]) {
  if (!redirects.includes(`${alias} ${target} 301`)) errors.push(`_redirects: missing campaign alias ${alias}`);
  if (!await exists(join(root, target, "index.html"))) errors.push(`_redirects: missing target ${target}`);
}
for (const line of redirects.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"))) {
  if (!line.startsWith("/")) errors.push(`_redirects: unsupported domain-level source ${line.split(/\s+/)[0]}`);
}

const bulkRedirects = await readFile(join(root, "cloudflare", "bulk-redirects.csv"), "utf8");
for (const expected of [
  "www.stayinpoznan.pl,https://stayinpoznan.pl,301,TRUE,FALSE,TRUE,TRUE",
  "oldmarketsquare.pl,https://stayinpoznan.pl,301,TRUE,TRUE,TRUE,TRUE",
  "stayinpoznan-www.pages.dev,https://stayinpoznan.pl,301,TRUE,FALSE,TRUE,TRUE",
]) {
  if (!bulkRedirects.includes(expected)) errors.push(`cloudflare/bulk-redirects.csv: missing ${expected.split(",")[0]}`);
}

const headers = await readFile(join(root, "_headers"), "utf8");
if (!headers.includes("https://:version.stayinpoznan-www.pages.dev/*\n  X-Robots-Tag: noindex")) errors.push("_headers: preview deployments must be noindex");

if (errors.length) {
  console.error(errors.map((error) => `ERROR ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${htmlFiles.length} HTML files, unique metadata, JSON-LD, images, links and sitemap.`);
