import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apartments, attractions, events, faq, site } from "../content/site.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexedPaths = [];

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const absolute = (path) => path.startsWith("http") ? path : `${site.url}${path}`;
const jsonLd = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
const cleanHtml = (html) => `${html.replace(/[ \t]+$/gm, "").trimEnd()}\n`;

async function writePage(path, html, { index = true } = {}) {
  const normalized = path === "/" ? "" : path.replace(/^\//, "").replace(/\/$/, "");
  const destination = normalized ? join(root, normalized, "index.html") : join(root, "index.html");
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, cleanHtml(html), "utf8");
  if (index) indexedPaths.push(path);
}

function breadcrumbSchema(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absolute(item.path),
    })),
  };
}

function breadcrumbs(items) {
  return `<nav class="breadcrumbs wrap" aria-label="Okruszki"><ol>${items.map((item, index) =>
    `<li>${index === items.length - 1 ? escapeHtml(item.name) : `<a href="${item.path}">${escapeHtml(item.name)}</a>`}</li>`
  ).join("")}</ol></nav>`;
}

function layout({
  title,
  description,
  path,
  body,
  lang = "pl",
  pageClass = "",
  noindex = false,
  image = "/assets/images/brand/og-stayinpoznan.webp",
  schema = [],
  alternate,
  preload,
}) {
  const canonical = absolute(path);
  const isPl = lang === "pl";
  const navigation = isPl
    ? [["Apartamenty", "/apartamenty/"], ["Stary Rynek", "/poznan/stary-rynek/"], ["Wydarzenia", "/wydarzenia/"], ["FAQ", "/faq/"]]
    : [["Apartments", "/en/#apartments"], ["Location", "/en/#location"], ["Events", "/wydarzenia/"], ["Contact", "/en/#contact"]];
  const graph = schema.length ? `<script type="application/ld+json">${jsonLd({ "@context": "https://schema.org", "@graph": schema })}</script>` : "";
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">'}
  <link rel="canonical" href="${canonical}">
  ${alternate ? `<link rel="alternate" hreflang="pl" href="${absolute(alternate.pl)}"><link rel="alternate" hreflang="en" href="${absolute(alternate.en)}"><link rel="alternate" hreflang="x-default" href="${absolute(alternate.pl)}">` : ""}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Stay in Poznań">
  <meta property="og:locale" content="${isPl ? "pl_PL" : "en_GB"}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${absolute(image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#101a24">
  ${preload ? `<link rel="preload" as="image" href="${preload}">` : ""}
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="stylesheet" href="/assets/site.css">
  <script src="/assets/site.js" defer></script>
  ${graph}
</head>
<body class="${pageClass}">
  <a class="skip-link" href="#main">${isPl ? "Przejdź do treści" : "Skip to content"}</a>
  <header class="site-header" data-header>
    <div class="nav-wrap wrap">
      <a class="wordmark" href="${isPl ? "/" : "/en/"}" aria-label="Stay in Poznań — ${isPl ? "strona główna" : "home"}">
        <span class="wordmark-mark" aria-hidden="true">S</span><span>Stay in <i>Poznań</i></span>
      </a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-menu" data-menu-toggle><span></span><span></span><span></span><span class="sr-only">Menu</span></button>
      <nav class="site-menu" id="site-menu" aria-label="${isPl ? "Główna nawigacja" : "Main navigation"}" data-menu>
        ${navigation.map(([label, href]) => `<a href="${href}">${label}</a>`).join("")}
        <a class="lang-link" href="${isPl ? (alternate?.en || "/en/") : (alternate?.pl || "/")}" hreflang="${isPl ? "en" : "pl"}">${isPl ? "EN" : "PL"}</a>
        <a class="nav-cta" href="${isPl ? "/apartamenty/" : "/en/#apartments"}">${isPl ? "Sprawdź pobyt" : "Find your stay"}</a>
      </nav>
    </div>
  </header>
  <main id="main">${body}</main>
  <footer class="site-footer">
    <div class="wrap footer-grid">
      <div><a class="wordmark wordmark-footer" href="${isPl ? "/" : "/en/"}"><span class="wordmark-mark" aria-hidden="true">S</span><span>Stay in <i>Poznań</i></span></a><p>${isPl ? "Prywatne apartamenty w zabytkowej kamienicy, około 100 metrów od Starego Rynku." : "Independent apartments in a historic townhouse, around 100 metres from the Old Market Square."}</p></div>
      <div><h2>${isPl ? "Odkrywaj" : "Explore"}</h2><a href="${isPl ? "/apartamenty/" : "/en/#apartments"}">${isPl ? "Apartamenty" : "Apartments"}</a><a href="/poznan/">Poznań</a><a href="/wydarzenia/">${isPl ? "Wydarzenia" : "Events"}</a><a href="/faq/">FAQ</a></div>
      <div><h2>${isPl ? "Kontakt" : "Contact"}</h2><a href="mailto:${site.email}">${site.email}</a><p>${site.address}</p><p>${isPl ? "Polski · English · Українська" : "English · Polski · Українська"}</p></div>
    </div>
    <div class="wrap footer-bottom"><span>© 2026 Stay in Poznań</span><span>${isPl ? "Rezerwacje realizowane bezpiecznie przez Airbnb" : "Secure booking via Airbnb"}</span></div>
  </footer>
</body>
</html>`;
}

function apartmentCard(apartment, lang = "pl") {
  const isPl = lang === "pl";
  const path = isPl ? `/apartamenty/${apartment.slug}/` : `/en/apartments/${apartment.slug}/`;
  return `<article class="stay-card reveal">
    <a class="stay-card-image" href="${path}" aria-label="${escapeHtml(apartment.title)}">
      <img src="${apartment.heroSmall}" srcset="${apartment.heroSmall} 720w, ${apartment.hero} 1448w" sizes="(max-width: 760px) 100vw, 50vw" width="720" height="540" alt="${escapeHtml(apartment.photos[0][1])}" loading="lazy">
      <span class="rating-pill" aria-label="${isPl ? "Ocena" : "Rated"} ${apartment.rating} ${isPl ? "na 5" : "out of 5"}">★ ${apartment.rating} <small>(${apartment.reviews})</small></span>
    </a>
    <div class="stay-card-body"><p class="eyebrow">${apartment.name} · ${isPl ? "do" : "up to"} ${apartment.guests} ${isPl ? "gości" : "guests"}</p><h3><a href="${path}">${isPl ? apartment.title : apartment.name === "Ratusz View" ? "Town Hall View Apartment" : "Koziołki View Apartment"}</a></h3><p>${isPl ? apartment.short : apartment.name === "Ratusz View" ? "Bright attic apartment with a direct view towards Poznań Town Hall." : "A sunlit apartment with Old Town roof views, only 100 metres from the square."}</p><a class="text-link" href="${path}">${isPl ? "Zobacz wnętrza i szczegóły" : "See photos and details"}<span aria-hidden="true">↗</span></a></div>
  </article>`;
}

function eventCard(event) {
  return `<article class="event-card reveal"><p class="event-date">${event.dateLabel}</p><p class="eyebrow">${event.category}</p><h3><a href="/wydarzenia/${event.slug}/">${event.name}</a></h3><p>${event.venue}</p><a class="text-link" href="/wydarzenia/${event.slug}/">Nocleg i praktyczne informacje <span aria-hidden="true">↗</span></a></article>`;
}

function faqList(items = faq) {
  return `<div class="faq-list">${items.map(([question, answer], index) => `<details ${index === 0 ? "open" : ""}><summary>${escapeHtml(question)}<span aria-hidden="true">+</span></summary><p>${escapeHtml(answer)}</p></details>`).join("")}</div>`;
}

function trustStrip(lang = "pl") {
  const isPl = lang === "pl";
  return `<section class="trust-strip" aria-label="${isPl ? "Najważniejsze zalety" : "Key benefits"}"><div class="wrap trust-grid"><div><strong>100 m</strong><span>${isPl ? "od Starego Rynku" : "to the Old Market Square"}</span></div><div><strong>4.85/5</strong><span>${isPl ? "średnia gospodarza" : "host average rating"}</span></div><div><strong>100%</strong><span>${isPl ? "odpowiedzi w ciągu godziny" : "response rate"}</span></div><div><strong>24/7</strong><span>${isPl ? "samodzielne zameldowanie" : "self check-in"}</span></div></div></section>`;
}

const homeSchema = [{
  "@type": "Organization",
  "@id": `${site.url}/#organization`,
  name: site.name,
  url: site.url,
  email: site.email,
  logo: absolute("/assets/favicon.svg"),
  address: { "@type": "PostalAddress", streetAddress: "Wielka 23", addressLocality: "Poznań", addressRegion: "wielkopolskie", addressCountry: "PL" },
}];

function homePage(lang = "pl") {
  const isPl = lang === "pl";
  const path = isPl ? "/" : "/en/";
  const title = isPl ? "Apartamenty Poznań Stary Rynek | Stay in Poznań" : "Poznań Old Town Apartments | Stay in Poznań";
  const description = isPl
    ? "Klimatyzowane apartamenty przy ul. Wielkiej 23, około 100 m od Starego Rynku w Poznaniu. Widok na Ratusz, Wi-Fi, kuchnia i samodzielne zameldowanie."
    : "Independent, air-conditioned apartments at Wielka 23, around 100 metres from Poznań Old Market Square. Town Hall views, Wi-Fi, kitchen and self check-in.";
  const featuredEvents = [events.find((e) => e.slug === "pyrkon-2027"), events.find((e) => e.slug === "bittersweet-festival-2027"), events.find((e) => e.slug === "poznan-game-arena-2026")];
  const body = `<section class="hero hero-home">
    <div class="hero-art hero-art-authentic" role="img" aria-label="${isPl ? "Autentyczny widok z apartamentu na dachy Starego Miasta i wieżę Ratusza" : "Authentic apartment view over the Old Town rooftops towards the Town Hall tower"}"></div>
    <div class="wrap hero-inner"><div class="hero-copy reveal"><p class="eyebrow">${isPl ? "Poznań · Stare Miasto · Wielka 23" : "Poznań · Old Town · Wielka 23"}</p><h1>${isPl ? "Zostań tam, gdzie <em>Poznań</em> dzieje się naprawdę." : "Stay where <em>Poznań</em> truly happens."}</h1><p class="lead">${isPl ? "Dwa prywatne apartamenty pod dachami Starego Miasta — około 100 metrów od Ratusza, z klimatyzacją i widokiem, którego nie da się zabrać do hotelu." : "Two independent apartments above the Old Town rooftops — around 100 metres from the Town Hall, with air conditioning and a view no hotel corridor can match."}</p><div class="button-row"><a class="button button-primary" href="#apartments">${isPl ? "Wybierz apartament" : "Choose an apartment"}</a><a class="button button-ghost" href="#location">${isPl ? "Zobacz lokalizację" : "See the location"}</a></div></div>
      <div class="hero-note reveal"><span>★ 4.85</span><p>${isPl ? "Średnia ocena gospodarza z ponad 300 opinii gości na Airbnb" : "Host average from more than 300 guest reviews on Airbnb"}</p></div>
    </div><a class="scroll-cue" href="#apartments"><span>${isPl ? "Odkryj" : "Discover"}</span><i></i></a>
  </section>
  ${trustStrip(lang)}
  <section class="section wrap" id="apartments"><div class="section-heading"><div><p class="eyebrow">${isPl ? "Nasze miejsca" : "Our places"}</p><h2>${isPl ? "Twój własny adres na Starym Mieście" : "Your own Old Town address"}</h2></div><p>${isPl ? "Nie sieć i nie bezosobowy hotel. Dwa dopracowane mieszkania prowadzone przez lokalnych gospodarzy — Oksanę i Piotra." : "Not a chain and not an anonymous hotel. Two carefully hosted apartments run by Poznań locals, Oksana and Piotr."}</p></div><div class="stays-grid">${apartments.map((a) => apartmentCard(a, lang)).join("")}</div>
    <article class="coming-card reveal"><div><p class="eyebrow">${isPl ? "W przygotowaniu" : "Coming soon"}</p><h3>${isPl ? "Trzeci apartament z antresolą" : "A third mezzanine apartment"}</h3><p>${isPl ? "Nowa przestrzeń dołączy do Stay in Poznań po sesji zdjęciowej. Pokażemy ją dopiero wtedy, gdy będzie gotowa przyjąć gości." : "A new space will join Stay in Poznań after its photo session. We will show it only when it is ready to welcome guests."}</p></div><span class="coming-number">03</span></article>
  </section>
  <section class="location-section" id="location"><div class="wrap location-grid"><div class="location-visual reveal"><img src="/assets/images/koziolki/07-view.webp" width="1448" height="685" loading="lazy" alt="${isPl ? "Widok z apartamentu na wieżę poznańskiego Ratusza" : "View from the apartment towards Poznań Town Hall tower"}"><span>${isPl ? "Prawdziwy widok z apartamentu" : "The real view from the apartment"}</span></div><div class="location-copy reveal"><p class="eyebrow">${isPl ? "Lokalizacja, która robi pobyt" : "A location that makes the stay"}</p><h2>${isPl ? "Ratusz prawie za oknem. Całe miasto pod ręką." : "The Town Hall almost outside. The whole city within reach."}</h2><p>${isPl ? "Wielka 23 leży przy północno-wschodnim narożniku Starego Rynku. Rano możesz zejść po kawę, w południe zobaczyć koziołki, a wieczorem wrócić pieszo z restauracji lub koncertu." : "Wielka 23 sits by the north-eastern corner of the Old Market Square. Walk out for coffee, see the famous goats at noon and return on foot after dinner or a concert."}</p><ul class="check-list"><li>${isPl ? "Stary Rynek i Ratusz — około 100 m" : "Old Market Square and Town Hall — around 100 m"}</li><li>${isPl ? "Rogalowe Muzeum i Fara — krótki spacer" : "Croissant Museum and the Fara — a short walk"}</li><li>${isPl ? "Cytadela i Ostrów Tumski — pieszo przez miasto" : "Citadel Park and Cathedral Island — walkable"}</li><li>${isPl ? "MTP i Dworzec Główny — dogodny dojazd tramwajem" : "Poznań Expo and main station — easy by tram"}</li></ul><a class="text-link" href="/poznan/stary-rynek/">${isPl ? "Poznaj Stary Rynek po naszemu" : "Explore our Old Town guide"} <span aria-hidden="true">↗</span></a></div></div></section>
  ${isPl ? `<section class="section wrap"><div class="section-heading"><div><p class="eyebrow">Przyjedź po coś więcej</p><h2>Wielkie wydarzenia, wygodna baza</h2></div><p>Daty sprawdzamy u organizatorów. Ty sprawdzasz wolny apartament i masz własne miejsce między wydarzeniem a Starym Rynkiem.</p></div><div class="events-grid">${featuredEvents.map(eventCard).join("")}</div><div class="section-action"><a class="button button-dark" href="/wydarzenia/">Zobacz kalendarz wydarzeń</a></div></section>` : ""}
  <section class="host-section"><div class="wrap host-grid"><div><p class="eyebrow">${isPl ? "Lokalni gospodarze" : "Hosted by locals"}</p><h2>${isPl ? "Poznań znamy nie z mapy." : "We know Poznań beyond the map."}</h2></div><div><p>${isPl ? "Oksana jest Superhostem, a wspólnie odpowiadamy gościom zwykle w ciągu godziny. Mówimy po polsku, angielsku i ukraińsku. Podpowiemy, gdzie zjeść, jak dotrzeć na wydarzenie i co naprawdę warto zobaczyć." : "Oksana is a Superhost and together we typically reply within an hour. We speak English, Polish and Ukrainian, and are happy to share practical local tips."}</p><div class="host-stats"><span><strong>4</strong>${isPl ? "lata goszczenia" : "years hosting"}</span><span><strong>300+</strong>${isPl ? "opinii" : "reviews"}</span><span><strong>3</strong>${isPl ? "języki" : "languages"}</span></div></div></div></section>
  <section class="section wrap faq-section"><div class="section-heading"><div><p class="eyebrow">${isPl ? "Dobrze wiedzieć" : "Good to know"}</p><h2>${isPl ? "Najczęstsze pytania przed pobytem" : "Questions before your stay"}</h2></div></div>${faqList(isPl ? faq.slice(0, 6) : [
    ["How close are the apartments to the Old Market Square?", "They are at Wielka 23, around 100 metres from the square and a few minutes on foot from the Town Hall."],
    ["How many guests can stay?", "Each apartment accommodates up to four guests, with a separate bedroom and a sofa bed in the living area."],
    ["Is there air conditioning and Wi-Fi?", "Yes. Both apartments offer air conditioning, fast Wi-Fi, a TV and an equipped kitchen."],
    ["Is there a lift?", "No. The apartments are on the fourth floor of a historic building dating from around 1900."],
  ])}</section>
  <section class="final-cta" id="contact"><div class="wrap"><p class="eyebrow">${isPl ? "Twój Poznań zaczyna się tutaj" : "Your Poznań starts here"}</p><h2>${isPl ? "Wybierz widok. Zarezerwuj termin." : "Choose your view. Book your dates."}</h2><p>${isPl ? "Dostępność i końcową cenę sprawdzisz bezpiecznie na Airbnb." : "Check live availability and the final price securely on Airbnb."}</p><a class="button button-light" href="#apartments">${isPl ? "Zobacz apartamenty" : "See apartments"}</a></div></section>`;
  return layout({ title, description, path, body, lang, pageClass: "home", schema: homeSchema, alternate: { pl: "/", en: "/en/" }, preload: "/assets/images/koziolki/07-view.webp" });
}

function apartmentSchema(apartment) {
  const base = {
    "@type": apartment.schemaType,
    "@id": `${site.url}/apartamenty/${apartment.slug}/#property`,
    identifier: `stayinpoznan-${apartment.slug}`,
    name: `${apartment.name} — ${apartment.title}`,
    description: apartment.description,
    url: `${site.url}/apartamenty/${apartment.slug}/`,
    image: apartment.photos.map(([name]) => absolute(`/assets/images/${apartment.slug === "ratusz-view" ? "ratusz" : "koziolki"}/${name}.webp`)),
    address: { "@type": "PostalAddress", streetAddress: "Wielka 23", addressLocality: "Poznań", addressRegion: "wielkopolskie", addressCountry: "PL" },
    latitude: apartment.coordinates.latitude,
    longitude: apartment.coordinates.longitude,
    checkinTime: "15:00:00+02:00",
    checkoutTime: "11:00:00+02:00",
    aggregateRating: { "@type": "AggregateRating", ratingValue: apartment.rating, ratingCount: apartment.reviews, bestRating: 5 },
  };
  if (apartment.schemaType === "VacationRental") {
    base.containsPlace = {
      "@type": "Accommodation",
      additionalType: "EntirePlace",
      occupancy: { "@type": "QuantitativeValue", value: apartment.guests },
      numberOfBedrooms: apartment.bedrooms,
      numberOfBathroomsTotal: apartment.bathrooms,
      bed: [{ "@type": "BedDetails", numberOfBeds: 1, typeOfBed: "Double" }, { "@type": "BedDetails", numberOfBeds: 1, typeOfBed: "Sofa" }],
      amenityFeature: ["ac", "wifi", "kitchen", "tv", "heating", "selfCheckinCheckout"].map((name) => ({ "@type": "LocationFeatureSpecification", name, value: true })),
    };
  }
  return base;
}

function apartmentPage(apartment, lang = "pl") {
  const isPl = lang === "pl";
  const folder = apartment.slug === "ratusz-view" ? "ratusz" : "koziolki";
  const path = isPl ? `/apartamenty/${apartment.slug}/` : `/en/apartments/${apartment.slug}/`;
  const plPath = `/apartamenty/${apartment.slug}/`;
  const enPath = `/en/apartments/${apartment.slug}/`;
  const enName = apartment.slug === "ratusz-view" ? "Town Hall View Apartment" : "Koziołki View Apartment";
  const title = isPl ? `${apartment.title} | Stay in Poznań` : `${enName} | Poznań Old Town`;
  const description = isPl
    ? `${apartment.name}: apartament dla maks. 4 osób przy Wielkiej 23, około 100 m od Starego Rynku. Klimatyzacja, Wi-Fi, kuchnia i samodzielne zameldowanie.`
    : `${enName} for up to four guests at Wielka 23, around 100 metres from Poznań Old Market Square. Air conditioning, Wi-Fi, kitchen and self check-in.`;
  const body = `${breadcrumbs(isPl ? [{ name: "Strona główna", path: "/" }, { name: "Apartamenty", path: "/apartamenty/" }, { name: apartment.name, path }] : [{ name: "Home", path: "/en/" }, { name: "Apartments", path: "/en/#apartments" }, { name: apartment.name, path }])}
  <section class="property-hero wrap"><div class="property-copy"><p class="eyebrow">${apartment.name} · ${site.address}</p><h1>${isPl ? apartment.title : enName}</h1><p class="lead">${isPl ? apartment.short : apartment.slug === "ratusz-view" ? "A bright private apartment under the Old Town roofs, with a direct view towards the Town Hall tower." : "A sunny private apartment with Poznań rooftops and the Town Hall tower visible from the windows."}</p><div class="property-rating"><strong>★ ${apartment.rating}</strong><span>${apartment.reviews} ${isPl ? "opinii na Airbnb" : "Airbnb reviews"}</span><i></i><span>${isPl ? "Superhost" : "Superhost"}</span></div><div class="button-row"><a class="button button-primary" href="${apartment.airbnb}" rel="noopener noreferrer">${isPl ? "Sprawdź termin na Airbnb" : "Check dates on Airbnb"}</a><a class="button button-dark" href="#gallery">${isPl ? "Zobacz zdjęcia" : "View photos"}</a></div></div><div class="property-hero-image"><img src="${apartment.hero}" srcset="${apartment.heroSmall} 720w, ${apartment.hero} 1448w" sizes="(max-width: 900px) 100vw, 55vw" width="1448" height="1086" alt="${escapeHtml(apartment.photos[0][1])}"><span>01 / ${String(apartment.photos.length).padStart(2, "0")}</span></div></section>
  <section class="property-facts"><div class="wrap"><span><strong>${apartment.guests}</strong>${isPl ? "gości" : "guests"}</span><span><strong>${apartment.bedrooms}</strong>${isPl ? "sypialnia" : "bedroom"}</span><span><strong>${apartment.beds}</strong>${isPl ? "miejsca do spania" : "sleeping spaces"}</span><span><strong>${apartment.bathrooms}</strong>${isPl ? "łazienka" : "bathroom"}</span><span><strong>A/C</strong>${isPl ? "klimatyzacja" : "air conditioning"}</span></div></section>
  <section class="section wrap property-intro"><div><p class="eyebrow">${isPl ? "Mieszkanie na wyłączność" : "Your private apartment"}</p><h2>${isPl ? "Ma wszystko, czego potrzebujesz. I widok, którego się nie spodziewasz." : "Everything you need, plus a view you will remember."}</h2></div><div><p>${isPl ? apartment.description : "A self-contained apartment with a separate bedroom, comfortable living area, equipped kitchen and private bathroom. Fast Wi-Fi and air conditioning make it work equally well for a city break or a few days of remote work."}</p><p>${isPl ? "Budynek stoi w żywej, międzynarodowej części Starego Miasta. Wychodzisz prosto między restauracje, kawiarnie i najważniejsze zabytki — bez tracenia czasu na dojazdy." : "The building sits in the lively, international heart of the Old Town. Step outside into restaurants, cafés and the city's main sights without losing time on commuting."}</p></div></section>
  <section class="gallery-section" id="gallery"><div class="wrap"><div class="section-heading"><div><p class="eyebrow">${isPl ? "Prawdziwe wnętrza" : "The real apartment"}</p><h2>${isPl ? "Zobacz każdy kąt" : "Look around"}</h2></div><p>${isPl ? "Kliknij zdjęcie, aby otworzyć galerię." : "Select a photo to open the gallery."}</p></div><div class="photo-grid">${apartment.photos.map(([name, alt], index) => `<button type="button" class="photo-item photo-${index + 1}" data-gallery-item data-src="/assets/images/${folder}/${name}.webp" data-alt="${escapeHtml(alt)}"><img src="/assets/images/${folder}/${name}-720.webp" width="720" height="540" loading="${index < 2 ? "eager" : "lazy"}" alt="${escapeHtml(alt)}"><span>${String(index + 1).padStart(2, "0")}</span></button>`).join("")}</div></div></section>
  <dialog class="lightbox" data-lightbox><button class="lightbox-close" type="button" data-lightbox-close aria-label="${isPl ? "Zamknij galerię" : "Close gallery"}">×</button><button class="lightbox-prev" type="button" data-lightbox-prev aria-label="${isPl ? "Poprzednie zdjęcie" : "Previous photo"}">←</button><figure><img data-lightbox-image src="/assets/images/${folder}/${apartment.photos[0][0]}.webp" alt="${escapeHtml(apartment.photos[0][1])}"><figcaption data-lightbox-caption>1 / ${apartment.photos.length} — ${escapeHtml(apartment.photos[0][1])}</figcaption></figure><button class="lightbox-next" type="button" data-lightbox-next aria-label="${isPl ? "Następne zdjęcie" : "Next photo"}">→</button></dialog>
  <section class="section wrap amenities-grid"><div><p class="eyebrow">${isPl ? "Na miejscu" : "Amenities"}</p><h2>${isPl ? "Wygodnie od pierwszej minuty" : "Comfort from the first minute"}</h2><p>${isPl ? "Dostajesz cały apartament — bez współdzielonej kuchni czy łazienki." : "The entire apartment is yours, with no shared kitchen or bathroom."}</p></div><ul>${apartment.amenities.map((item) => `<li><span aria-hidden="true">✓</span>${isPl ? item : ({ "Klimatyzacja": "Air conditioning", "Szybkie Wi-Fi": "Fast Wi-Fi", "Kuchnia": "Equipped kitchen", "TV": "TV", "Miejsce do pracy": "Workspace", "Widok na miasto": "City view", "Samodzielne zameldowanie": "Self check-in", "Pościel i ręczniki": "Bed linen and towels", "Prywatna łazienka": "Private bathroom" }[item] || item)}</li>`).join("")}</ul></section>
  <aside class="honest-note"><div class="wrap"><span class="note-icon" aria-hidden="true">↟</span><div><p class="eyebrow">${isPl ? "Uczciwie przed rezerwacją" : "Good to know before booking"}</p><h2>${isPl ? "Piękny widok ma cztery piętra." : "The view comes with four flights of stairs."}</h2><p>${isPl ? apartment.note : "The apartment is on the fourth floor of a historic building dating from around 1900. There is no lift, so it may not suit guests with limited mobility or very heavy luggage."}</p></div></div></aside>
  <section class="section wrap location-mini"><div><p class="eyebrow">${isPl ? "Wielka 23" : "Wielka 23"}</p><h2>${isPl ? "100 metrów od serca Poznania" : "100 metres from the heart of Poznań"}</h2><p>${isPl ? "Ratusz, koziołki, Rogalowe Muzeum, Fara, restauracje i kawiarnie są w zasięgu krótkiego spaceru. Na Cytadelę i Ostrów Tumski dojdziesz pieszo, a do MTP wygodnie dojedziesz tramwajem." : "The Town Hall, famous goats, Croissant Museum, Fara church, restaurants and cafés are a short walk away. Citadel Park and Cathedral Island are walkable, while Poznań Expo is easy to reach by tram."}</p><a class="text-link" href="/poznan/stary-rynek/">${isPl ? "Przewodnik po okolicy" : "Explore the neighbourhood"} <span aria-hidden="true">↗</span></a></div><div class="map-card" aria-label="${isPl ? "Schemat lokalizacji" : "Location overview"}"><span class="map-river"></span><span class="map-pin"><i></i>${site.name}<small>${site.address}</small></span><span class="map-label market">${isPl ? "Stary Rynek" : "Old Market Square"}</span><span class="map-label citadel">Cytadela</span><span class="map-label cathedral">Ostrów Tumski</span></div></section>
  <section class="booking-panel"><div class="wrap"><div><p class="eyebrow">${isPl ? "Aktualna dostępność" : "Live availability"}</p><h2>${isPl ? `Zarezerwuj ${apartment.name}` : `Book ${apartment.name}`}</h2><p>${isPl ? "Airbnb pokaże końcową cenę, zasady anulowania i wolne daty dla liczby gości." : "Airbnb shows the final price, cancellation policy and available dates for your party."}</p></div><a class="button button-light" href="${apartment.airbnb}" rel="noopener noreferrer">${isPl ? "Otwórz ofertę Airbnb" : "Open Airbnb listing"}</a></div></section>`;
  const crumbItems = isPl ? [{ name: "Strona główna", path: "/" }, { name: "Apartamenty", path: "/apartamenty/" }, { name: apartment.name, path }] : [{ name: "Home", path: "/en/" }, { name: "Apartments", path: "/en/#apartments" }, { name: apartment.name, path }];
  return layout({ title, description, path, body, lang, pageClass: "property-page", image: apartment.hero, schema: [apartmentSchema(apartment), breadcrumbSchema(crumbItems)], alternate: { pl: plPath, en: enPath }, preload: apartment.heroSmall });
}

function apartmentsHubPage() {
  const path = "/apartamenty/";
  const title = "Apartamenty Poznań centrum i Stary Rynek | Stay in Poznań";
  const description = "Dwa klimatyzowane apartamenty w centrum Poznania, około 100 m od Starego Rynku. Dla maks. 4 osób, z kuchnią, Wi-Fi i samodzielnym zameldowaniem.";
  const body = `${breadcrumbs([{ name: "Strona główna", path: "/" }, { name: "Apartamenty", path }])}<section class="page-hero wrap"><p class="eyebrow">Stay in Poznań · Wielka 23</p><h1>Dwa apartamenty.<br><em>Jedno wyjątkowe miejsce.</em></h1><p class="lead">Wybierz wnętrze, które pasuje do Twojego pobytu. W obu dostajesz prywatność całego mieszkania, klimatyzację, szybkie Wi‑Fi i Stary Rynek niemal za drzwiami.</p></section>${trustStrip()}
  <section class="section wrap"><div class="stays-grid">${apartments.map((a) => apartmentCard(a)).join("")}</div></section>
  <section class="compare-section"><div class="wrap"><div class="section-heading"><div><p class="eyebrow">Porównaj</p><h2>Który widok wybierasz?</h2></div></div><div class="compare-table" role="table" aria-label="Porównanie apartamentów"><div role="row" class="compare-head"><span role="columnheader">Cecha</span>${apartments.map((a) => `<strong role="columnheader">${a.name}</strong>`).join("")}</div>${[["Maksymalna liczba gości", "4", "4"], ["Oddzielna sypialnia", "Tak", "Tak"], ["Klimatyzacja", "Tak", "Tak"], ["Kuchnia i prywatna łazienka", "Tak", "Tak"], ["Samodzielne zameldowanie", "Tak", "Tak"], ["Piętro / winda", "4. / brak windy", "4. / brak windy"], ["Ocena Airbnb", "4,87 / 5", "4,82 / 5"]].map((row) => `<div role="row"><span role="rowheader">${row[0]}</span><span role="cell">${row[1]}</span><span role="cell">${row[2]}</span></div>`).join("")}</div></div></section>
  <section class="section wrap"><article class="coming-card"><div><p class="eyebrow">Następny rozdział</p><h2>Antresola przy Starym Rynku</h2><p>Trzeci apartament jest w przygotowaniu. Ma już swoje miejsce w systemie, ale pokażemy go publicznie dopiero po zakończeniu prac i prawdziwej sesji zdjęciowej.</p><a class="text-link" href="/apartamenty/antresola/">Zobacz zapowiedź <span aria-hidden="true">↗</span></a></div><span class="coming-number">03</span></article></section>
  <section class="final-cta"><div class="wrap"><p class="eyebrow">Dostępność na żywo</p><h2>Sprawdź ceny dla swoich dat.</h2><p>Końcowa cena zależy od terminu, liczby gości i długości pobytu.</p><a class="button button-light" href="#main">Wróć do apartamentów</a></div></section>`;
  return layout({ title, description, path, body, pageClass: "listing-page", schema: [breadcrumbSchema([{ name: "Strona główna", path: "/" }, { name: "Apartamenty", path }])] });
}

function comingSoonPage() {
  const path = "/apartamenty/antresola/";
  const body = `${breadcrumbs([{ name: "Strona główna", path: "/" }, { name: "Apartamenty", path: "/apartamenty/" }, { name: "Antresola", path }])}<section class="coming-hero"><div class="wrap"><p class="eyebrow">Apartament 03 · w przygotowaniu</p><h1>Antresola przy<br><em>Starym Rynku</em></h1><p class="lead">Trzeci apartament dołączy do Stay in Poznań po zakończeniu prac i sesji zdjęciowej. Nie publikujemy wizualizacji wnętrza i nie przyjmujemy rezerwacji, dopóki przestrzeń nie będzie naprawdę gotowa.</p><a class="button button-primary" href="/apartamenty/">Zobacz dostępne apartamenty</a></div></section>`;
  return layout({ title: "Antresola przy Starym Rynku — wkrótce | Stay in Poznań", description: "Zapowiedź trzeciego apartamentu Stay in Poznań z antresolą. Zdjęcia i rezerwacje pojawią się po zakończeniu przygotowań.", path, body, noindex: true, pageClass: "coming-page" });
}

function eventsHubPage() {
  const path = "/wydarzenia/";
  const title = "Wydarzenia Poznań 2026/2027 i noclegi | Stay in Poznań";
  const description = "Kalendarz dużych wydarzeń w Poznaniu: Pyrkon, BitterSweet, PGA, Poznań Maraton i targi MTP. Sprawdzone daty oraz apartament 100 m od Starego Rynku.";
  const body = `${breadcrumbs([{ name: "Strona główna", path: "/" }, { name: "Wydarzenia", path }])}<section class="page-hero wrap"><p class="eyebrow">Kalendarz 2026 / 2027</p><h1>Przyjedź na wydarzenie.<br><em>Zostań dla Poznania.</em></h1><p class="lead">Najważniejsze targi, festiwale i biegi w jednym miejscu. Daty weryfikujemy u oficjalnych organizatorów, a z Wielkiej 23 masz wygodną bazę między Starym Rynkiem, Cytadelą i MTP.</p></section>
  <section class="section wrap"><div class="event-filter" aria-label="Kategorie wydarzeń"><span>Wszystkie</span><span>MTP</span><span>Festiwale</span><span>Sport</span></div><div class="events-grid events-grid-full">${events.map(eventCard).join("")}</div></section>
  <section class="editorial-note"><div class="wrap"><p class="eyebrow">Aktualność ponad pośpiech</p><h2>Daty mogą się zmieniać. Oficjalne źródło ma ostatnie słowo.</h2><p>Każdy artykuł zawiera link do organizatora. Przed zakupem biletu lub rezerwacją podróży sprawdź bieżący program, godziny wejścia i komunikaty transportowe.</p></div></section>`;
  return layout({ title, description, path, body, pageClass: "events-page", schema: [breadcrumbSchema([{ name: "Strona główna", path: "/" }, { name: "Wydarzenia", path }])] });
}

function eventPage(event) {
  const path = `/wydarzenia/${event.slug}/`;
  const title = `Nocleg na ${event.name} Poznań | Apartament Stary Rynek`;
  const description = `Nocleg na ${event.name} (${event.dateLabel}) w Poznaniu. Prywatny apartament przy Starym Rynku, praktyczny dojazd, klimatyzacja i Wi-Fi.`;
  const eventFaq = [
    [`Kiedy odbywa się ${event.name}?`, `${event.name} zaplanowano na ${event.dateLabel}. Przed wyjazdem potwierdź datę i godziny na oficjalnej stronie organizatora.`],
    [`Gdzie odbywa się ${event.name}?`, `${event.venue}. Dokładne wejście, plan obiektu i bieżące zasady publikuje organizator.`],
    ["Jak dojechać z Wielkiej 23?", event.transport],
    ["Gdzie sprawdzić dostępność apartamentu?", "Wybierz Ratusz View lub Koziołki View i otwórz ofertę Airbnb. Po podaniu dat i liczby gości zobaczysz bieżącą dostępność oraz końcową cenę."],
  ];
  const body = `${breadcrumbs([{ name: "Strona główna", path: "/" }, { name: "Wydarzenia", path: "/wydarzenia/" }, { name: event.name, path }])}<article><header class="event-hero"><div class="wrap event-hero-grid"><div><p class="eyebrow">${event.category} · Poznań</p><h1>Nocleg na<br><em>${event.name}</em></h1><p class="lead">${event.intro}</p><div class="button-row"><a class="button button-primary" href="#stays">Zobacz apartamenty</a><a class="button button-ghost" href="${event.sourceUrl}" rel="noopener noreferrer">Oficjalna strona wydarzenia</a></div></div><aside><span>Termin</span><strong>${event.dateLabel}</strong><span>Miejsce</span><strong>${event.venue}</strong><span>Baza noclegowa</span><strong>Wielka 23 · Stary Rynek</strong></aside></div></header>
  <section class="section wrap article-grid"><div class="article-main"><p class="eyebrow">Plan pobytu</p><h2>Centrum po wydarzeniu nadal jest centrum.</h2><p>${event.intro}</p><h3>Dojazd z apartamentu</h3><p>${event.transport}</p><h3>Lokalna wskazówka</h3><p>${event.tip}</p><div class="source-box"><strong>Źródło daty</strong><p>Informację o terminie sprawdziliśmy 20 sierpnia 2026 r. na stronie: <a href="${event.sourceUrl}" rel="noopener noreferrer">${event.sourceLabel}</a>. Program i organizacja mogą się zmienić.</p></div></div><aside class="article-aside"><p class="eyebrow">W skrócie</p><dl><dt>Data</dt><dd>${event.dateLabel}</dd><dt>Miejsce</dt><dd>${event.venue}</dd><dt>Apartament</dt><dd>do 4 gości</dd><dt>Check-in</dt><dd>samodzielny</dd><dt>Wi‑Fi / A/C</dt><dd>tak / tak</dd></dl></aside></section>
  <section class="section wrap" id="stays"><div class="section-heading"><div><p class="eyebrow">Nocleg na Starym Mieście</p><h2>Wybierz swój apartament</h2></div><p>Oba lokale są na 4. piętrze bez windy — ważne przy dużym bagażu lub stroju cosplay.</p></div><div class="stays-grid">${apartments.map((a) => apartmentCard(a)).join("")}</div></section>
  <section class="section wrap faq-section"><div class="section-heading"><div><p class="eyebrow">Praktyczne pytania</p><h2>${event.name} i nocleg</h2></div></div>${faqList(eventFaq)}</section></article>`;
  const crumbs = [{ name: "Strona główna", path: "/" }, { name: "Wydarzenia", path: "/wydarzenia/" }, { name: event.name, path }];
  const articleSchema = { "@type": "Article", headline: `Nocleg na ${event.name} w Poznaniu`, description, datePublished: site.modified, dateModified: site.modified, author: { "@type": "Organization", name: site.name, url: site.url }, image: absolute("/assets/images/brand/og-stayinpoznan.webp"), mainEntityOfPage: absolute(path), about: { "@type": "Thing", name: event.name, sameAs: event.sourceUrl } };
  return layout({ title, description, path, body, pageClass: "event-detail-page", schema: [articleSchema, breadcrumbSchema(crumbs)] });
}

function poznanHubPage() {
  const path = "/poznan/";
  const title = "Poznań — atrakcje, Stary Rynek i lokalny przewodnik";
  const description = "Co zobaczyć w Poznaniu? Lokalny przewodnik Stay in Poznań: Stary Rynek, atrakcje, plan weekendu, wydarzenia i praktyczne wskazówki z Wielkiej 23.";
  const body = `${breadcrumbs([{ name: "Strona główna", path: "/" }, { name: "Poznań", path }])}<section class="page-hero wrap"><p class="eyebrow">Miasto po naszemu</p><h1>Poznań od środka.<br><em>Nie z listy „top 10”.</em></h1><p class="lead">Mieszkamy tu, przyjmujemy gości i wiemy, że dobry weekend to nie wyścig między pinezkami. Zacznij od Rynku, ale zostaw czas na Chwaliszewo, Ostrów Tumski, Cytadelę i zwykłe życie miasta.</p></section>
  <section class="section wrap guide-cards"><a href="/poznan/stary-rynek/"><span>01</span><p class="eyebrow">Tuż za drzwiami</p><h2>Stary Rynek</h2><p>Ratusz, koziołki, kamienice i nasze sprawdzone wskazówki.</p></a><a href="/poznan/atrakcje/"><span>02</span><p class="eyebrow">Zobacz więcej</p><h2>Atrakcje</h2><p>Klasyki i miejsca, do których naprawdę warto dojść.</p></a><a href="/poznan/weekend/"><span>03</span><p class="eyebrow">Gotowy plan</p><h2>Weekend</h2><p>48 godzin bez gonitwy i bez zbędnych przejazdów.</p></a><a href="/wydarzenia/"><span>04</span><p class="eyebrow">Daty 2026/27</p><h2>Wydarzenia</h2><p>Festiwale, targi, biegi i praktyczny nocleg w centrum.</p></a></section>
  <section class="location-section"><div class="wrap location-grid"><div class="location-visual"><img src="/assets/images/koziolki/06-view.webp" width="1032" height="2184" loading="lazy" alt="Widok z Wielkiej 23 na ulicę i dachy Starego Miasta"><span>Widok z Wielkiej 23</span></div><div class="location-copy"><p class="eyebrow">Punkt startowy</p><h2>Wielka 23 to dobry środek ciężkości.</h2><p>Rano jesteś na Rynku, potem przechodzisz przez Chwaliszewo na Ostrów Tumski, wracasz wzdłuż Warty, a wieczorem nie sprawdzasz już rozkładu — po prostu idziesz do domu.</p><a class="button button-dark" href="/apartamenty/">Zobacz apartamenty</a></div></div></section>`;
  return layout({ title, description, path, body, pageClass: "guide-page", schema: [breadcrumbSchema([{ name: "Strona główna", path: "/" }, { name: "Poznań", path }])] });
}

function guidePage(kind) {
  const pages = {
    "stary-rynek": {
      path: "/poznan/stary-rynek/", title: "Stary Rynek Poznań — atrakcje i nocleg 100 m od Ratusza", description: "Przewodnik po Starym Rynku w Poznaniu: Ratusz, koziołki, Rogalowe Muzeum, Fara, jedzenie i praktyczny nocleg przy Wielkiej 23.", eyebrow: "100 metrów od apartamentu", heading: "Stary Rynek nie jest atrakcją obok. To nasza okolica.", intro: "Wychodzisz z kamienicy przy Wielkiej 23 i po chwili jesteś przy Ratuszu. Najlepiej przyjść tu wcześnie rano, zanim ogródki wypełnią plac, a potem wrócić w południe na koziołki.", sections: [["Ratusz i koziołki", "O godzinie 12.00 nad zegarem pojawiają się dwa trykające się koziołki. Warto być kilka minut wcześniej i spojrzeć także na renesansową fasadę Ratusza — nie tylko na wieżę."], ["Domki budnicze i muzeum", "Kolorowe domki stoją po południowej stronie Ratusza. Tuż obok znajdują się muzealne wnętrza, a przy Starym Rynku działa także Rogalowe Muzeum z pokazami."], ["Fara i zaułki", "Ze Starego Rynku przejdź ulicą Świętosławską do Fary. Zajrzyj też na Plac Kolegiacki i pozwól sobie skręcić bez planu w boczne uliczki."], ["Wieczorem", "Rynek jest głośny i turystyczny, ale kilka ulic dalej łatwo znaleźć spokojniejszą kawiarnię lub kolację. Zaletą Wielkiej 23 jest to, że wracasz pieszo o dowolnej porze."]], image: "/assets/images/koziolki/07-view.webp", imageAlt: "Prawdziwy widok z apartamentu na wieżę poznańskiego Ratusza" },
    "atrakcje": {
      path: "/poznan/atrakcje/", title: "Atrakcje Poznań — co zobaczyć blisko Starego Rynku", description: "Najciekawsze atrakcje Poznania blisko Starego Rynku: Ratusz, Ostrów Tumski, Brama Poznania, Cytadela, Enigma i miejsca dla dzieci.", eyebrow: "Poznań pieszo", heading: "Najlepsze atrakcje są połączone spacerem.", intro: "Z centrum nie potrzebujesz samochodu, żeby zobaczyć najważniejsze miejsca Poznania. Poniższa lista układa się w naturalne trasy wychodzące z Wielkiej 23.", sections: attractions.map(([name, distance, text]) => [name, `${distance}. ${text}`]), image: "/assets/images/koziolki/06-view.webp", imageAlt: "Widok z apartamentu na zabudowę poznańskiego Starego Miasta" },
    "weekend": {
      path: "/poznan/weekend/", title: "Weekend w Poznaniu — plan 48 godzin ze Starego Rynku", description: "Gotowy plan na weekend w Poznaniu: Stary Rynek, Ostrów Tumski, Cytadela, muzea i jedzenie. Wszystko z bazy przy Wielkiej 23.", eyebrow: "48 godzin bez gonitwy", heading: "Weekend w Poznaniu, który ma rytm.", intro: "Ten plan zakłada, że śpisz w centrum i większość trasy robisz pieszo. Nie próbujemy odhaczyć wszystkiego — wybieramy miejsca, które dobrze układają się w dwa dni.", sections: [["Piątek wieczorem — wejście w miasto", "Po zameldowaniu przejdź na Stary Rynek, zajrzyj na Plac Kolegiacki i zjedz kolację w centrum. Nie planuj dalekiej trasy: pierwszego wieczoru wygraj lokalizacją."], ["Sobota rano — Rynek bez tłumu", "Zobacz Ratusz i domki budnicze rano, potem wróć na koziołki w południe. Pomiędzy zmieści się Rogalowe Muzeum albo spacer przez Farę."], ["Sobota po południu — początki Polski", "Idź przez Chwaliszewo na Ostrów Tumski i do Bramy Poznania. Wróć inną trasą wzdłuż Warty lub przez Śródkę."], ["Niedziela — Cytadela lub Enigma", "Przy dobrej pogodzie wybierz Cytadelę. Gdy pada, jedź do Centrum Szyfrów Enigma lub jednego z muzeów w centrum. Zostaw zapas przed wymeldowaniem o 11.00."]], image: "/assets/images/ratusz/01-living.webp", imageAlt: "Jasny salon apartamentu Stay in Poznań" },
  };
  const page = pages[kind];
  const crumbs = [{ name: "Strona główna", path: "/" }, { name: "Poznań", path: "/poznan/" }, { name: kind === "stary-rynek" ? "Stary Rynek" : kind === "atrakcje" ? "Atrakcje" : "Weekend", path: page.path }];
  const body = `${breadcrumbs(crumbs)}<article><header class="guide-hero wrap"><div><p class="eyebrow">${page.eyebrow}</p><h1>${page.heading}</h1><p class="lead">${page.intro}</p></div><img src="${page.image}" width="1448" height="1086" alt="${page.imageAlt}"></header><section class="section wrap article-grid"><div class="article-main">${page.sections.map(([heading, text], index) => `<section><p class="chapter-number">${String(index + 1).padStart(2, "0")}</p><h2>${heading}</h2><p>${text}</p></section>`).join("")}</div><aside class="article-aside sticky"><p class="eyebrow">Baza spaceru</p><h2>Wielka 23</h2><p>Około 100 m od Starego Rynku. Dwa prywatne apartamenty dla maks. 4 osób.</p><a class="button button-dark" href="/apartamenty/">Zobacz apartamenty</a></aside></section></article>`;
  const articleSchema = { "@type": "Article", headline: page.title, description: page.description, datePublished: site.modified, dateModified: site.modified, author: { "@type": "Organization", name: site.name }, image: absolute(page.image), mainEntityOfPage: absolute(page.path) };
  return layout({ title: page.title, description: page.description, path: page.path, body, pageClass: "guide-detail-page", image: page.image, schema: [articleSchema, breadcrumbSchema(crumbs)] });
}

function faqPage() {
  const path = "/faq/";
  const title = "FAQ — apartamenty Poznań Stary Rynek | Stay in Poznań";
  const description = "Odpowiedzi przed pobytem: lokalizacja, liczba gości, klimatyzacja, Wi-Fi, samodzielne zameldowanie, brak windy, ceny i wydarzenia w Poznaniu.";
  const crumbs = [{ name: "Strona główna", path: "/" }, { name: "FAQ", path }];
  const body = `${breadcrumbs(crumbs)}<section class="page-hero wrap"><p class="eyebrow">Przed przyjazdem</p><h1>Bez drobnego druku.<br><em>Wszystko jasno.</em></h1><p class="lead">Najważniejsze odpowiedzi zebrane w jednym miejscu. Szczegółowe zasady i końcowa cena zawsze pozostają widoczne w kanale rezerwacji.</p></section><section class="section wrap faq-section">${faqList()}</section><section class="booking-panel"><div class="wrap"><div><p class="eyebrow">Nie znalazłeś odpowiedzi?</p><h2>Napisz do nas.</h2><p>Zwykle odpowiadamy w ciągu godziny.</p></div><a class="button button-light" href="mailto:${site.email}">${site.email}</a></div></section>`;
  return layout({ title, description, path, body, pageClass: "faq-page", schema: [breadcrumbSchema(crumbs)] });
}

await writePage("/", homePage("pl"));
await writePage("/en/", homePage("en"));
await writePage("/apartamenty/", apartmentsHubPage());
for (const apartment of apartments) {
  await writePage(`/apartamenty/${apartment.slug}/`, apartmentPage(apartment, "pl"));
  await writePage(`/en/apartments/${apartment.slug}/`, apartmentPage(apartment, "en"));
}
await writePage("/apartamenty/antresola/", comingSoonPage(), { index: false });
await writePage("/wydarzenia/", eventsHubPage());
for (const event of events) await writePage(`/wydarzenia/${event.slug}/`, eventPage(event));
await writePage("/poznan/", poznanHubPage());
for (const kind of ["stary-rynek", "atrakcje", "weekend"]) await writePage(`/poznan/${kind}/`, guidePage(kind));
await writePage("/faq/", faqPage());

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexedPaths.map((path) => `  <url><loc>${absolute(path)}</loc><lastmod>${site.modified}</lastmod></url>`).join("\n")}\n</urlset>\n`;
await writeFile(join(root, "sitemap.xml"), sitemap, "utf8");
const notFoundBody = `<section class="coming-hero"><div class="wrap"><p class="eyebrow">Błąd 404</p><h1>Ta uliczka prowadzi<br><em>donikąd.</em></h1><p class="lead">Wróć na Stary Rynek albo wybierz jeden z naszych apartamentów.</p><div class="button-row"><a class="button button-primary" href="/">Strona główna</a><a class="button button-ghost" href="/apartamenty/">Apartamenty</a></div></div></section>`;
await writeFile(join(root, "404.html"), cleanHtml(layout({ title: "Nie znaleziono strony | Stay in Poznań", description: "Strona nie istnieje. Wróć do Stay in Poznań i zobacz apartamenty przy Starym Rynku.", path: "/404.html", body: notFoundBody, noindex: true, pageClass: "not-found-page" })), "utf8");
console.log(`Built ${indexedPaths.length} indexable pages, 1 noindex preview and a 404 page.`);
