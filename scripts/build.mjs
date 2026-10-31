import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apartments, attractions, events as editorialEvents, faq, nightlifePlaces, site, veganPlaces } from "../content/site.mjs";
import { EVENT_MAX_AGE, RATING_MAX_AGE, isFresh, readJson, todayWarsaw } from './lib/public-data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexedPaths = [];
const now = new Date(process.env.STAY_BUILD_DATE || Date.now());
if (!Number.isFinite(now.getTime())) throw new Error('Invalid build date');
const today = todayWarsaw(now);
const publicEvents = await readJson(join(root, 'content/public/events.json'), { events: [] });
const publicRatings = await readJson(join(root, 'content/public/ratings.json'), { ratings: [] });
const freshRatings = (publicRatings.ratings || []).filter(record => isFresh(record.observed_at, RATING_MAX_AGE, now));
const hostRating = freshRatings.find(record => record.kind === 'host');
const ratingFor = apartment => freshRatings.find(record => record.kind === 'listing' && record.slug === apartment.slug);

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const absolute = (path) => path.startsWith("http") ? path : `${site.url}${path}`;
const jsonLd = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
const cleanHtml = (html) => `${html.replace(/[ \t]+$/gm, "").trimEnd()}\n`;
const checkedLabel = at => new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeZone: 'Europe/Warsaw' }).format(new Date(at));
const eventDates = event => event.start_date === event.end_date ? event.start_date : `${event.start_date} – ${event.end_date}`;
const events = [...editorialEvents.map(event => ({ ...event, checkedAt: '2026-08-20T12:00:00Z', status: 'scheduled', fresh: false })),
  ...(publicEvents.events || []).map(event => ({
    slug: event.slug, rawName: event.title, name: escapeHtml(event.title), dateLabel: eventDates(event),
    startDate: event.start_date, endDate: event.end_date, venue: escapeHtml(event.location || 'Miejsce podaje organizator'),
    category: 'Z kalendarza miasta', rawSourceUrl: event.url, sourceUrl: escapeHtml(event.url), sourceLabel: escapeHtml(event.source), checkedAt: event.observed_at,
    status: event.status, fresh: event.fresh === true && isFresh(event.observed_at, EVENT_MAX_AGE, now),
    intro: 'Połącz wydarzenie z pobytem w Poznaniu. Potwierdzony termin i miejsce znajdziesz poniżej; program, bilety oraz ewentualne zmiany publikuje organizator.',
    transport: 'Przed wyjściem sprawdź adres i wejście na stronie organizatora oraz aktualną trasę w oficjalnym planerze komunikacji miejskiej.',
    tip: 'Między wydarzeniami zajrzyj do naszych przewodników po Starym Rynku i Poznaniu. Apartamenty są na 4. piętrze bez windy.',
  }))];
const upcomingEvents = events.filter(event => event.status === 'scheduled' && event.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
const eventState = event => event.status === 'cancelled' ? 'Odwołane według źródła' : event.endDate < today ? 'Archiwum wydarzenia' : event.fresh ? 'Termin potwierdzony w źródle' : 'Sprawdź aktualny termin u organizatora';
function ratingPill(apartment, lang = 'pl') {
  const record = ratingFor(apartment);
  return record ? `<span class="rating-pill" title="${lang === 'pl' ? 'Odczyt' : 'Observed'}: ${record.observed_at.slice(0, 10)}">★ ${record.rating.toFixed(2)} <small>(${record.reviews})</small></span>` : '';
}

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
  const isUk = lang === "uk";
  const navigation = isPl
    ? [["Apartamenty", "/apartamenty/"], ["Stary Rynek", "/poznan/stary-rynek/"], ["Wydarzenia", "/wydarzenia/"], ["FAQ", "/faq/"]]
    : isUk
      ? [["Апартаменти", "/ua/#apartments"], ["Познань", "/ua/#city"], ["Документи", "/ua/#documents"], ["Контакт", "/ua/#contact"]]
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
  <meta property="og:locale" content="${isPl ? "pl_PL" : isUk ? "uk_UA" : "en_GB"}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${absolute(image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#101a24">
  ${preload ? `<link rel="preload" as="image" href="${preload}">` : ""}
  <link rel="icon" href="/assets/favicon-patrons-pro.svg" type="image/svg+xml">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="stylesheet" href="/assets/site.css?v=public-content-20261031">
  <script src="/assets/site.js" defer></script>
  ${graph}
</head>
<body class="${pageClass}">
  <a class="skip-link" href="#main">${isPl ? "Przejdź do treści" : isUk ? "Перейти до змісту" : "Skip to content"}</a>
  <header class="site-header" data-header>
    <div class="nav-wrap wrap">
      <a class="wordmark" href="${isPl ? "/" : isUk ? "/ua/" : "/en/"}" aria-label="Stay in Poznań — ${isPl ? "strona główna" : isUk ? "головна" : "home"}">
        <img class="wordmark-mark" src="/assets/logo-patrons-pro.svg" width="55" height="44" alt="" aria-hidden="true"><span class="wordmark-copy"><span>Stay in</span><strong>Poznań</strong></span>
      </a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-menu" data-menu-toggle><span></span><span></span><span></span><span class="sr-only">Menu</span></button>
      <nav class="site-menu" id="site-menu" aria-label="${isPl ? "Główna nawigacja" : "Main navigation"}" data-menu>
        ${navigation.map(([label, href]) => `<a href="${href}">${label}</a>`).join("")}
        <a class="lang-link" href="${isPl ? (alternate?.en || "/en/") : (alternate?.pl || "/")}" hreflang="${isPl ? "en" : "pl"}">${isPl ? "EN" : "PL"}</a>
        ${!isUk ? '<a class="language-shortcut" href="/ua/" hreflang="uk">UA</a>' : '<a class="language-shortcut" href="/en/" hreflang="en">EN</a>'}
        <a class="nav-cta" href="${isPl ? "/apartamenty/" : isUk ? "/ua/#apartments" : "/en/#apartments"}">${isPl ? "Sprawdź pobyt" : isUk ? "Перевірити житло" : "Find your stay"}</a>
      </nav>
    </div>
  </header>
  <main id="main">${body}</main>
  <footer class="site-footer">
    <div class="wrap footer-grid">
      <div><a class="wordmark wordmark-footer" href="${isPl ? "/" : isUk ? "/ua/" : "/en/"}" aria-label="Stay in Poznań"><img class="wordmark-mark" src="/assets/logo-patrons-pro.svg" width="55" height="44" alt="" aria-hidden="true"><span class="wordmark-copy"><span>Stay in</span><strong>Poznań</strong></span></a><p>${isPl ? "Prywatne apartamenty w zabytkowej kamienicy, około 100 metrów od Starego Rynku." : isUk ? "Приватні апартаменти в історичному будинку приблизно за 100 метрів від Старого Ринку." : "Independent apartments in a historic townhouse, around 100 metres from the Old Market Square."}</p></div>
      <div><h2>${isPl ? "Odkrywaj" : isUk ? "Дізнатися" : "Explore"}</h2><a href="${isPl ? "/apartamenty/" : isUk ? "/ua/#apartments" : "/en/#apartments"}">${isPl ? "Apartamenty" : isUk ? "Апартаменти" : "Apartments"}</a><a href="/poznan/">Poznań</a><a href="/wydarzenia/">${isPl ? "Wydarzenia" : isUk ? "Події" : "Events"}</a><a href="/faq/">FAQ</a></div>
      <div><h2>${isPl ? "Kontakt" : isUk ? "Контакт" : "Contact"}</h2><a href="mailto:${site.email}">${site.email}</a><p>${site.address}</p><p><a href="/">Polski</a> · <a href="/en/">English</a> · <a href="/ua/">Українська</a></p></div>
    </div>
    <div class="wrap footer-bottom"><span>© 2026 Stay in Poznań</span><span>${isPl ? "Rezerwacje realizowane bezpiecznie przez Airbnb" : isUk ? "Безпечне бронювання через Airbnb" : "Secure booking via Airbnb"}</span></div>
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
      ${ratingPill(apartment, lang)}
    </a>
    <div class="stay-card-body"><p class="eyebrow">${apartment.name} · ${isPl ? "do" : "up to"} ${apartment.guests} ${isPl ? "gości" : "guests"}</p><h3><a href="${path}">${isPl ? apartment.title : apartment.name === "Ratusz View" ? "Town Hall View Apartment" : "Koziołki View Apartment"}</a></h3><p>${isPl ? apartment.short : apartment.name === "Ratusz View" ? "Bright attic apartment with a direct view towards Poznań Town Hall." : "A sunlit apartment with Old Town roof views, only 100 metres from the square."}</p><a class="text-link" href="${path}">${isPl ? "Zobacz wnętrza i szczegóły" : "See photos and details"}<span aria-hidden="true">↗</span></a></div>
  </article>`;
}

function eventCard(event) {
  return `<article class="event-card reveal" data-event-end="${event.endDate}" data-event-status="${event.status}"><p class="event-date">${event.dateLabel}</p><p class="event-state">${eventState(event)}</p><p class="eyebrow">${event.category}</p><h3><a href="/wydarzenia/${event.slug}/">${event.name}</a></h3><p>${event.venue}</p><a class="text-link" href="/wydarzenia/${event.slug}/">Nocleg i praktyczne informacje <span aria-hidden="true">↗</span></a></article>`;
}

function faqList(items = faq) {
  return `<div class="faq-list">${items.map(([question, answer], index) => `<details ${index === 0 ? "open" : ""}><summary>${escapeHtml(question)}<span aria-hidden="true">+</span></summary><p>${escapeHtml(answer)}</p></details>`).join("")}</div>`;
}

function trustStrip(lang = "pl") {
  const isPl = lang === "pl";
  return `<section class="trust-strip" aria-label="${isPl ? "Najważniejsze zalety" : "Key benefits"}"><div class="wrap trust-grid"><div><strong>100 m</strong><span>${isPl ? "od Starego Rynku" : "to the Old Market Square"}</span></div><div><strong>${hostRating ? `${hostRating.rating.toFixed(2)}/5` : "2"}</strong><span>${hostRating ? (isPl ? `ocena gospodarza · ${hostRating.observed_at.slice(0,10)}` : `host rating · ${hostRating.observed_at.slice(0,10)}`) : (isPl ? "prywatne apartamenty" : "private apartments")}</span></div><div><strong>PL · EN · UA</strong><span>${isPl ? "mówimy w trzech językach" : "we speak three languages"}</span></div><div><strong>24/7</strong><span>${isPl ? "samodzielne zameldowanie" : "self check-in"}</span></div></div></section>`;
}

const homeSchema = [{
  "@type": "Organization",
  "@id": `${site.url}/#organization`,
  name: site.name,
  url: site.url,
  email: site.email,
  logo: absolute("/assets/favicon-patrons-pro.svg"),
  address: { "@type": "PostalAddress", streetAddress: "Wielka 23", addressLocality: "Poznań", addressRegion: "wielkopolskie", addressCountry: "PL" },
}];

function homePage(lang = "pl") {
  const isPl = lang === "pl";
  const path = isPl ? "/" : "/en/";
  const title = isPl ? "Apartamenty Poznań Stary Rynek | Stay in Poznań" : "Poznań Old Town Apartments | Stay in Poznań";
  const description = isPl
    ? "Klimatyzowane apartamenty przy ul. Wielkiej 23, około 100 m od Starego Rynku w Poznaniu. Widok na Ratusz, Wi-Fi, kuchnia i samodzielne zameldowanie."
    : "Independent, air-conditioned apartments at Wielka 23, around 100 metres from Poznań Old Market Square. Town Hall views, Wi-Fi, kitchen and self check-in.";
  const featuredEvents = [...upcomingEvents].sort((a, b) => Number(b.fresh) - Number(a.fresh)).slice(0, 3);
  const body = `<section class="hero hero-home">
    <div class="hero-art hero-art-authentic" role="img" aria-label="${isPl ? "Autentyczny widok z apartamentu na dachy Starego Miasta i wieżę Ratusza" : "Authentic apartment view over the Old Town rooftops towards the Town Hall tower"}"></div>
    <div class="wrap hero-inner"><div class="hero-copy reveal"><p class="eyebrow">${isPl ? "Poznań · Stare Miasto · Wielka 23" : "Poznań · Old Town · Wielka 23"}</p><h1>${isPl ? "Zostań tam, gdzie <em>Poznań</em> dzieje się naprawdę." : "Stay where <em>Poznań</em> truly happens."}</h1><p class="lead">${isPl ? "Dwa prywatne apartamenty pod dachami Starego Miasta — około 100 metrów od Ratusza, z klimatyzacją i widokiem, którego nie da się zabrać do hotelu." : "Two independent apartments above the Old Town rooftops — around 100 metres from the Town Hall, with air conditioning and a view no hotel corridor can match."}</p><div class="button-row"><a class="button button-primary" href="#apartments">${isPl ? "Wybierz apartament" : "Choose an apartment"}</a><a class="button button-ghost" href="#location">${isPl ? "Zobacz lokalizację" : "See the location"}</a></div></div>
      <div class="hero-note reveal"><span>${hostRating ? `★ ${hostRating.rating.toFixed(2)}` : "Wielka 23"}</span><p>${hostRating ? (isPl ? `Ocena gospodarza z ${hostRating.reviews} opinii na Airbnb · odczyt ${hostRating.observed_at.slice(0,10)}` : `Host rating from ${hostRating.reviews} Airbnb reviews · observed ${hostRating.observed_at.slice(0,10)}`) : (isPl ? "Lokalni gospodarze. Aktualne oceny i opinie znajdziesz w ofercie Airbnb." : "Hosted by locals. See the Airbnb listing for current ratings and reviews.")}</p></div>
    </div><a class="scroll-cue" href="#apartments"><span>${isPl ? "Odkryj" : "Discover"}</span><i></i></a>
  </section>
  ${trustStrip(lang)}
  <section class="section wrap" id="apartments"><div class="section-heading"><div><p class="eyebrow">${isPl ? "Nasze miejsca" : "Our places"}</p><h2>${isPl ? "Twój własny adres na Starym Mieście" : "Your own Old Town address"}</h2></div><p>${isPl ? "Nie sieć i nie bezosobowy hotel. Dwa dopracowane mieszkania prowadzone przez lokalnych gospodarzy — Oksanę i Piotra." : "Not a chain and not an anonymous hotel. Two carefully hosted apartments run by Poznań locals, Oksana and Piotr."}</p></div><div class="stays-grid">${apartments.map((a) => apartmentCard(a, lang)).join("")}</div>
    <article class="coming-card reveal"><div><p class="eyebrow">${isPl ? "W przygotowaniu" : "Coming soon"}</p><h3>${isPl ? "Trzeci apartament z antresolą" : "A third mezzanine apartment"}</h3><p>${isPl ? "Nowa przestrzeń dołączy do Stay in Poznań po sesji zdjęciowej. Pokażemy ją dopiero wtedy, gdy będzie gotowa przyjąć gości." : "A new space will join Stay in Poznań after its photo session. We will show it only when it is ready to welcome guests."}</p></div><span class="coming-number">03</span></article>
  </section>
  <section class="location-section" id="location"><div class="wrap location-grid"><div class="location-visual reveal"><img src="/assets/images/koziolki/07-view.webp" width="1448" height="685" loading="lazy" alt="${isPl ? "Widok z apartamentu na wieżę poznańskiego Ratusza" : "View from the apartment towards Poznań Town Hall tower"}"><span>${isPl ? "Prawdziwy widok z apartamentu" : "The real view from the apartment"}</span></div><div class="location-copy reveal"><p class="eyebrow">${isPl ? "Lokalizacja, która robi pobyt" : "A location that makes the stay"}</p><h2>${isPl ? "Ratusz prawie za oknem. Całe miasto pod ręką." : "The Town Hall almost outside. The whole city within reach."}</h2><p>${isPl ? "Wielka 23 leży przy północno-wschodnim narożniku Starego Rynku. Rano możesz zejść po kawę, w południe zobaczyć koziołki, a wieczorem wrócić pieszo z restauracji lub koncertu." : "Wielka 23 sits by the north-eastern corner of the Old Market Square. Walk out for coffee, see the famous goats at noon and return on foot after dinner or a concert."}</p><ul class="check-list"><li>${isPl ? "Stary Rynek i Ratusz — około 100 m" : "Old Market Square and Town Hall — around 100 m"}</li><li>${isPl ? "Rogalowe Muzeum i Fara — krótki spacer" : "Croissant Museum and the Fara — a short walk"}</li><li>${isPl ? "Cytadela i Ostrów Tumski — pieszo przez miasto" : "Citadel Park and Cathedral Island — walkable"}</li><li>${isPl ? "MTP i Dworzec Główny — dogodny dojazd tramwajem" : "Poznań Expo and main station — easy by tram"}</li></ul><a class="text-link" href="/poznan/stary-rynek/">${isPl ? "Poznaj Stary Rynek po naszemu" : "Explore our Old Town guide"} <span aria-hidden="true">↗</span></a></div></div></section>
  ${isPl ? `<section class="section wrap"><div class="section-heading"><div><p class="eyebrow">Przyjedź po coś więcej</p><h2>Wielkie wydarzenia, wygodna baza</h2></div><p>Daty sprawdzamy u organizatorów. Ty sprawdzasz wolny apartament i masz własne miejsce między wydarzeniem a Starym Rynkiem.</p></div><div class="events-grid">${featuredEvents.map(eventCard).join("")}</div><div class="section-action"><a class="button button-dark" href="/wydarzenia/">Zobacz kalendarz wydarzeń</a></div></section>` : ""}
  <section class="host-section"><div class="wrap host-grid"><div><p class="eyebrow">${isPl ? "Lokalni gospodarze" : "Hosted by locals"}</p><h2>${isPl ? "Poznań znamy nie z mapy." : "We know Poznań beyond the map."}</h2></div><div><p>${isPl ? ` ${hostRating?.superhost ? "Oksana jest Superhostem. " : ""}Mówimy po polsku, angielsku i ukraińsku. Podpowiemy, gdzie zjeść, jak dotrzeć na wydarzenie i co naprawdę warto zobaczyć.` : `${hostRating?.superhost ? "Oksana is a Superhost. " : ""}We speak English, Polish and Ukrainian, and are happy to share practical local tips.`}</p><div class="host-stats"><span><strong>2</strong>${isPl ? "apartamenty" : "apartments"}</span><span><strong>100 m</strong>${isPl ? "od Starego Rynku" : "to the Old Market Square"}</span><span><strong>3</strong>${isPl ? "języki" : "languages"}</span></div></div></div></section>
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
    ...(ratingFor(apartment) ? { aggregateRating: { "@type": "AggregateRating", ratingValue: ratingFor(apartment).rating, ratingCount: ratingFor(apartment).reviews, bestRating: 5 } } : {}),
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
  <section class="property-hero wrap"><div class="property-copy"><p class="eyebrow">${apartment.name} · ${site.address}</p><h1>${isPl ? apartment.title : enName}</h1><p class="lead">${isPl ? apartment.short : apartment.slug === "ratusz-view" ? "A bright private apartment under the Old Town roofs, with a direct view towards the Town Hall tower." : "A sunny private apartment with Poznań rooftops and the Town Hall tower visible from the windows."}</p><div class="property-rating">${ratingFor(apartment) ? `<strong>★ ${ratingFor(apartment).rating.toFixed(2)}</strong><span>${ratingFor(apartment).reviews} ${isPl ? "opinii na Airbnb" : "Airbnb reviews"} · ${ratingFor(apartment).observed_at.slice(0,10)}</span>` : `<a href="${apartment.airbnb}" rel="noopener noreferrer">${isPl ? "Zobacz aktualne opinie na Airbnb" : "See current Airbnb reviews"}</a>`}${hostRating?.superhost ? "<span>Superhost</span>" : ""}</div><div class="button-row"><a class="button button-primary" href="${apartment.airbnb}" rel="noopener noreferrer">${isPl ? "Sprawdź termin na Airbnb" : "Check dates on Airbnb"}</a><a class="button button-dark" href="#gallery">${isPl ? "Zobacz zdjęcia" : "View photos"}</a></div></div><div class="property-hero-image"><img src="${apartment.hero}" srcset="${apartment.heroSmall} 720w, ${apartment.hero} 1448w" sizes="(max-width: 900px) 100vw, 55vw" width="1448" height="1086" alt="${escapeHtml(apartment.photos[0][1])}"><span>01 / ${String(apartment.photos.length).padStart(2, "0")}</span></div></section>
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
  <section class="compare-section"><div class="wrap"><div class="section-heading"><div><p class="eyebrow">Porównaj</p><h2>Który widok wybierasz?</h2></div></div><div class="compare-table" role="table" aria-label="Porównanie apartamentów"><div role="row" class="compare-head"><span role="columnheader">Cecha</span>${apartments.map((a) => `<strong role="columnheader">${a.name}</strong>`).join("")}</div>${[["Maksymalna liczba gości", "4", "4"], ["Oddzielna sypialnia", "Tak", "Tak"], ["Klimatyzacja", "Tak", "Tak"], ["Kuchnia i prywatna łazienka", "Tak", "Tak"], ["Samodzielne zameldowanie", "Tak", "Tak"], ["Piętro / winda", "4. / brak windy", "4. / brak windy"], ["Ocena Airbnb", ...apartments.map(a => ratingFor(a) ? `${ratingFor(a).rating.toFixed(2)} / 5 · ${ratingFor(a).observed_at.slice(0,10)}` : "Aktualne opinie w ofercie Airbnb")]].map((row) => `<div role="row"><span role="rowheader">${row[0]}</span><span role="cell">${row[1]}</span><span role="cell">${row[2]}</span></div>`).join("")}</div></div></section>
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
  <section class="section wrap"><p class="source-box">Kalendarz miasta obejmuje wybraną część wydarzeń. Dane odświeża PZN raz w tygodniu; przy każdej stronie podajemy datę odczytu. <a href="/poznan/teraz/">Zaplanuj pobyt z aktualnymi wydarzeniami</a>.</p><h2>Nadchodzące wydarzenia</h2><div class="events-grid events-grid-full">${upcomingEvents.map(eventCard).join("") || '<p>Sprawdź kalendarz miasta i wróć po kolejną aktualizację.</p>'}</div><details><summary>Archiwum i nieaktualne terminy</summary><div class="events-grid">${events.filter(event => event.status === 'cancelled' || event.endDate < today).map(eventCard).join('')}</div></details></section>
  <section class="editorial-note"><div class="wrap"><p class="eyebrow">Aktualność ponad pośpiech</p><h2>Daty mogą się zmieniać. Oficjalne źródło ma ostatnie słowo.</h2><p>Każdy artykuł zawiera link do organizatora. Przed zakupem biletu lub rezerwacją podróży sprawdź bieżący program, godziny wejścia i komunikaty transportowe.</p></div></section>`;
  return layout({ title, description, path, body, pageClass: "events-page", schema: [breadcrumbSchema([{ name: "Strona główna", path: "/" }, { name: "Wydarzenia", path }])] });
}

function eventPage(event) {
  const path = `/wydarzenia/${event.slug}/`;
  const rawName = event.rawName || event.name;
  const title = `Nocleg na ${rawName} Poznań | Apartament Stary Rynek`;
  const description = `Nocleg na ${rawName} (${event.dateLabel}) w Poznaniu. Prywatny apartament przy Starym Rynku, praktyczny dojazd, klimatyzacja i Wi-Fi.`;
  const eventFaq = [
    [`Kiedy odbywa się ${rawName}?`, `${rawName} zaplanowano na ${event.dateLabel}. Przed wyjazdem potwierdź datę i godziny na oficjalnej stronie organizatora.`],
    [`Gdzie odbywa się ${rawName}?`, `${event.venue.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&")}. Dokładne wejście, plan obiektu i bieżące zasady publikuje organizator.`],
    ["Jak dojechać z Wielkiej 23?", event.transport],
    ["Gdzie sprawdzić dostępność apartamentu?", "Wybierz Ratusz View lub Koziołki View i otwórz ofertę Airbnb. Po podaniu dat i liczby gości zobaczysz bieżącą dostępność oraz końcową cenę."],
  ];
  const body = `${breadcrumbs([{ name: "Strona główna", path: "/" }, { name: "Wydarzenia", path: "/wydarzenia/" }, { name: rawName, path }])}<article><header class="event-hero"><div class="wrap event-hero-grid"><div><p class="eyebrow">${event.category} · Poznań · ${eventState(event)}</p><h1>${event.endDate < today || event.status === 'cancelled' ? 'Archiwum:' : 'Nocleg na'}<br><em>${event.name}</em></h1><p class="lead">${event.intro}</p><div class="button-row"><a class="button button-primary" href="#stays">Zobacz apartamenty</a><a class="button button-ghost" href="${event.sourceUrl}" rel="noopener noreferrer">Oficjalna strona wydarzenia</a></div></div><aside><span>Termin</span><strong>${event.dateLabel}</strong><span>Miejsce</span><strong>${event.venue}</strong><span>Baza noclegowa</span><strong>Wielka 23 · Stary Rynek</strong></aside></div></header>
  <section class="section wrap article-grid"><div class="article-main"><p class="eyebrow">Plan pobytu</p><h2>Centrum po wydarzeniu nadal jest centrum.</h2><p>${event.intro}</p><h3>Dojazd z apartamentu</h3><p>${event.transport}</p><h3>Lokalna wskazówka</h3><p>${event.tip}</p><div class="source-box"><strong>Źródło daty</strong><p>Ostatni odczyt: ${checkedLabel(event.checkedAt)}. ${eventState(event)}. Źródło: <a href="${event.sourceUrl}" rel="noopener noreferrer">${event.sourceLabel}</a>. Program i organizacja mogą się zmienić.</p></div></div><aside class="article-aside"><p class="eyebrow">W skrócie</p><dl><dt>Data</dt><dd>${event.dateLabel}</dd><dt>Miejsce</dt><dd>${event.venue}</dd><dt>Apartament</dt><dd>do 4 gości</dd><dt>Check-in</dt><dd>samodzielny</dd><dt>Wi‑Fi / A/C</dt><dd>tak / tak</dd></dl></aside></section>
  <section class="section wrap" id="stays"><div class="section-heading"><div><p class="eyebrow">Nocleg na Starym Mieście</p><h2>Wybierz swój apartament</h2></div><p>Oba lokale są na 4. piętrze bez windy — ważne przy dużym bagażu lub stroju cosplay.</p></div><div class="stays-grid">${apartments.map((a) => apartmentCard(a)).join("")}</div></section>
  <section class="section wrap faq-section"><div class="section-heading"><div><p class="eyebrow">Praktyczne pytania</p><h2>${event.name} i nocleg</h2></div></div>${faqList(eventFaq)}</section></article>`;
  const crumbs = [{ name: "Strona główna", path: "/" }, { name: "Wydarzenia", path: "/wydarzenia/" }, { name: rawName, path }];
  const articleSchema = { "@type": "Article", headline: `Nocleg na ${rawName} w Poznaniu`, description, datePublished: event.checkedAt.slice(0,10), dateModified: event.checkedAt.slice(0,10), author: { "@type": "Organization", name: site.name, url: site.url }, image: absolute("/assets/images/brand/og-stayinpoznan.webp"), mainEntityOfPage: absolute(path), about: { "@type": "Thing", name: rawName, sameAs: event.rawSourceUrl || event.sourceUrl } };
  return layout({ title, description, path, body, pageClass: "event-detail-page", schema: [articleSchema, breadcrumbSchema(crumbs)] });
}

function currentGuidePage() {
  const path = '/poznan/teraz/';
  const title = 'Co robić w Poznaniu teraz — wydarzenia i plan pobytu';
  const description = 'Wydarzenia z kalendarza miasta, źródła i daty sprawdzenia oraz przewodniki po Starym Rynku i Poznaniu. Zaplanuj pobyt przy Wielkiej 23.';
  const fresh = upcomingEvents.filter(event => event.fresh);
  const body = `${breadcrumbs([{ name: 'Strona główna', path: '/' }, { name: 'Poznań', path: '/poznan/' }, { name: 'Poznań teraz', path }])}<section class="page-hero wrap"><p class="eyebrow">Miasto w rytmie wydarzeń</p><h1>Poznań teraz.<br><em>Ułóż swój pobyt.</em></h1><p class="lead">Wybierz wydarzenie, sprawdź szczegóły u organizatora, a czas pomiędzy zaplanuj z naszymi przewodnikami. Zestawienie rozwija się wraz z cotygodniowym odczytem kalendarza miasta.</p></section><section class="section wrap"><h2>Świeżo potwierdzone terminy</h2><p>Wybrana część kalendarza, nie pełny program Poznania. Źródła: Miasto Poznań i Grupa MTP. Data odczytu jest podana na stronie każdego wydarzenia.</p><div class="events-grid">${fresh.map(eventCard).join('') || '<p>Nie mamy obecnie świeżo potwierdzonych pozycji. Zobacz <a href="https://www.poznan.pl/mim/events/" rel="noopener noreferrer">oficjalny kalendarz miasta</a> oraz <a href="/wydarzenia/">nasze zestawienie z datami sprawdzenia</a>.</p>'}</div></section><section class="section wrap guide-cards"><a href="/poznan/stary-rynek/"><span>01</span><h2>Przed wydarzeniem</h2><p>Zacznij od Starego Rynku, tuż obok apartamentu.</p></a><a href="/poznan/weekend/"><span>02</span><h2>Dodatkowy dzień</h2><p>Połącz program wydarzenia z planem spokojnego weekendu.</p></a><a href="/poznan/przewodnik/"><span>03</span><h2>Więcej miasta</h2><p>Wybierz trasę z lokalnego przewodnika i sprawdź bieżące godziny miejsc u ich gospodarzy.</p></a></section>`;
  return layout({ title, description, path, body, pageClass: 'events-page', schema: [breadcrumbSchema([{ name: 'Strona główna', path: '/' }, { name: 'Poznań', path: '/poznan/' }, { name: 'Poznań teraz', path }])] });
}

function poznanHubPage() {
  const path = "/poznan/";
  const title = "Poznań po naszemu — przewodniki, jedzenie i nocne życie";
  const description = "Autorskie przewodniki Stay in Poznań: Stary Rynek, ambitna trasa po mieście, wegańskie restauracje, klubing, wydarzenia i praktyczne wskazówki.";
  const body = `${breadcrumbs([{ name: "Strona główna", path: "/" }, { name: "Poznań", path }])}<section class="page-hero wrap"><p class="eyebrow">Miasto po naszemu</p><h1>Poznań od środka.<br><em>Nie z listy „top 10”.</em></h1><p class="lead">Mieszkamy tu, przyjmujemy gości i wiemy, że dobry weekend to nie wyścig między pinezkami. Zacznij od Rynku, ale zostaw czas na Chwaliszewo, Ostrów Tumski, Cytadelę i zwykłe życie miasta.</p></section>
  <section class="section wrap guide-cards"><a href="/poznan/teraz/"><span>TERAZ</span><p class="eyebrow">Aktualizacje z miasta</p><h2>Poznań teraz</h2><p>Potwierdzone wydarzenia i pomysły na pobyt między nimi.</p></a><a href="/poznan/przewodnik/"><span>01</span><p class="eyebrow">Jedna dobra trasa</p><h2>Przewodnik lokalny</h2><p>Miasto ułożone w rytm dnia: Rynek, rzeka, Ostrów Tumski, Cytadela, Jeżyce i noc.</p></a><a href="/poznan/stary-rynek/"><span>02</span><p class="eyebrow">Tuż za drzwiami</p><h2>Stary Rynek</h2><p>Ratusz, koziołki, kamienice i nasze sprawdzone wskazówki.</p></a><a href="/poznan/atrakcje/"><span>03</span><p class="eyebrow">Zobacz więcej</p><h2>Atrakcje</h2><p>Klasyki i miejsca, do których naprawdę warto dojść.</p></a><a href="/poznan/weekend/"><span>04</span><p class="eyebrow">Gotowy plan</p><h2>Weekend</h2><p>48 godzin bez gonitwy i bez zbędnych przejazdów.</p></a><a href="/poznan/weganskie-restauracje/"><span>05</span><p class="eyebrow">Przewodnik gospodarza</p><h2>Wegański Poznań</h2><p>Aktualna selekcja roślinnych miejsc, w tym ważna uwaga o fryturze w Talerzykach.</p></a><a href="/poznan/clubbing/"><span>06</span><p class="eyebrow">Po zmroku · Peter Polinski</p><h2>Clubbing</h2><p>Schron, TAMA, House Szkolna, LAB i letnie miejscówki nad Wartą.</p></a><a href="/poznan/nieoczywisty/"><span>07</span><p class="eyebrow">Pod powierzchnią</p><h2>Poznań nieoczywisty</h2><p>Latające hostie, lotnicy, wieże spadochronowe, Cytadela i miejskie legendy.</p></a><a class="wide-guide-card" href="/wydarzenia/"><span>08</span><p class="eyebrow">Daty 2026/27</p><h2>Wydarzenia</h2><p>Festiwale, targi, biegi i praktyczny nocleg w centrum.</p></a></section>
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

function veganGuidePage() {
  const path = "/poznan/weganskie-restauracje/";
  const title = "Wegańskie restauracje Poznań — przewodnik gospodarza 2026";
  const description = "Aktualna selekcja wegańskich restauracji w Poznaniu: centrum, Jeżyce i Łazarz. Sprawdzone adresy, dojazd ze Starego Rynku i praktyczne uwagi.";
  const crumbs = [{ name: "Strona główna", path: "/" }, { name: "Poznań", path: "/poznan/" }, { name: "Wegańskie restauracje", path }];
  const veganFaq = [
    ["Gdzie zjeść wegańsko blisko Starego Rynku w Poznaniu?", "Ze Stay in Poznań najłatwiej dojść przez centrum do Buły z Musztardą lub Sorrir. Najciekawsze w pełni roślinne restauracje są też na Jeżycach i Łazarzu, dokąd wygodnie dojedziesz tramwajem."],
    ["Które miejsca z listy są w pełni wegańskie?", "Buła z Musztardą, Kuchnia PoWolność, WYPAS, Owca Cała i La Papaya deklarują profil w pełni roślinny lub wegański. Menu i zasady lokalu mogą się zmieniać, dlatego przy alergiach zawsze potwierdź skład na miejscu."],
    ["Czy Talerzyki są restauracją wegańską?", "Nie. Talerzyki to lokal wegetariański z opcjami wegańskimi. Według informacji uzyskanej przez gospodarzy jedna frytura jest używana do pozycji wegetariańskich i wegańskich, w tym falafela."],
    ["Czy godziny otwarcia są zawsze aktualne?", "Nie obiecujemy stałych godzin, bo restauracje zmieniają je sezonowo. Listę zweryfikowaliśmy 20 sierpnia 2026 r.; przed wyjściem otwórz link do lokalu i sprawdź bieżące menu oraz godziny."],
  ];
  const cards = veganPlaces.map((place, index) => `<article class="vegan-place-card reveal">
    <div class="vegan-place-top"><span class="place-number">${String(index + 1).padStart(2, "0")}</span><span class="place-type">${escapeHtml(place.type)}</span></div>
    <p class="eyebrow">${escapeHtml(place.area)} · ${escapeHtml(place.route)}</p>
    <h2>${escapeHtml(place.name)}</h2>
    <p class="place-address">${escapeHtml(place.address)} · ${escapeHtml(place.bestFor)}</p>
    <p>${escapeHtml(place.description)}</p>
    ${place.warning ? `<aside class="vegan-warning"><strong>Uwaga praktyczna</strong><p>${escapeHtml(place.warning)}</p></aside>` : ""}
    <a class="text-link" href="${place.sourceUrl}" rel="noopener noreferrer">Sprawdź bieżące menu i godziny <span aria-hidden="true">↗</span></a>
  </article>`).join("");
  const body = `${breadcrumbs(crumbs)}<article><header class="guide-hero vegan-guide-hero wrap"><div><p class="eyebrow">Wegański przewodnik gospodarza · aktualizacja 20.08.2026</p><h1>Roślinny Poznań.<br><em>Bez przypadkowej listy z Google.</em></h1><p class="lead">Piotr je wegańsko, dlatego wybraliśmy krótko: miejsca o wyraźnym roślinnym charakterze, do których sami wysłalibyśmy gości. Ścisły Stary Rynek ma sporo pojedynczych opcji, ale po najlepszą wegańską kuchnię warto czasem przejść się przez centrum albo podjechać na Jeżyce i Łazarz.</p></div><img src="/assets/images/koziolki/06-view.webp" width="1032" height="2184" alt="Widok z apartamentu Stay in Poznań na dachy Starego Miasta"></header>
  <section class="section wrap vegan-guide-intro"><div class="section-heading"><div><p class="eyebrow">Nasza aktualna siódemka</p><h2>Od burgera po spokojną kolację</h2></div><p>Nie oznaczamy lokalu jako w pełni wegański, jeśli ma również nabiał lub jajka. Przy alergiach, celiakii i ścisłym unikaniu kontaktu krzyżowego zawsze porozmawiaj z obsługą.</p></div><div class="vegan-places-grid">${cards}</div></section>
  <section class="editorial-note vegan-editorial"><div class="wrap"><p class="eyebrow">Dlaczego nie ma tu 30 adresów?</p><h2>Aktualność jest ważniejsza niż długość listy.</h2><p>W czasie sprawdzania odrzuciliśmy miejsca zamknięte, czasowo nieczynne albo takie, których bieżącego działania nie dało się rozsądnie potwierdzić. Restauracje zmieniają menu i godziny — dlatego przy każdym adresie zostawiamy link do aktualnego źródła.</p></div></section>
  <section class="section wrap faq-section"><div class="section-heading"><div><p class="eyebrow">Wegański Poznań w praktyce</p><h2>Najczęstsze pytania</h2></div></div>${faqList(veganFaq)}</section>
  <section class="final-cta"><div class="wrap"><p class="eyebrow">Baza przy Starym Rynku</p><h2>Własna kuchnia na górze. Cały Poznań za drzwiami.</h2><p>Oba apartamenty mają wyposażoną kuchnię, więc śniadanie lub późną kolację możesz przygotować dokładnie po swojemu.</p><a class="button button-light" href="/apartamenty/">Zobacz apartamenty</a></div></section></article>`;
  const articleSchema = { "@type": "Article", headline: title, description, datePublished: site.modified, dateModified: site.modified, author: { "@type": "Organization", name: site.name, url: site.url }, image: absolute("/assets/images/koziolki/06-view.webp"), mainEntityOfPage: absolute(path) };
  const listSchema = { "@type": "ItemList", name: "Polecane wegańskie restauracje w Poznaniu", itemListElement: veganPlaces.map((place, index) => ({ "@type": "ListItem", position: index + 1, name: place.name, url: place.sourceUrl })) };
  const faqSchema = { "@type": "FAQPage", mainEntity: veganFaq.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) };
  return layout({ title, description, path, body, pageClass: "guide-detail-page vegan-guide-page", image: "/assets/images/koziolki/06-view.webp", schema: [articleSchema, listSchema, faqSchema, breadcrumbSchema(crumbs)] });
}

function nightlifeGuidePage() {
  const path = "/poznan/clubbing/";
  const title = "Clubbing Poznań — Schron, TAMA, House Szkolna i elektronika";
  const description = "Autorski przewodnik po klubach i muzyce elektronicznej w Poznaniu: SCHRON, TAMA, House Szkolna, Projekt LAB, KontenerART i Nurt.";
  const crumbs = [{ name: "Strona główna", path: "/" }, { name: "Poznań", path: "/poznan/" }, { name: "Clubbing", path }];
  const nightFaq = [
    ["Gdzie iść na techno w Poznaniu?", "Na surowszą, podziemną noc sprawdź program SCHRONU. TAMA wybiera większy format, mocną produkcję i rozpoznawalne nazwiska. W obu przypadkach o charakterze nocy decyduje konkretny lineup."],
    ["Który klub jest najbliżej Starego Rynku?", "House Szkolna przy Szkolnej 17 leży w ścisłym centrum i nadaje się na spontaniczne wyjście. Do pozostałych miejsc najwygodniej dojść, podjechać tramwajem albo zamówić przejazd."],
    ["Gdzie sprawdzać aktualne imprezy elektroniczne w Poznaniu?", "Najpierw sprawdź oficjalne kanały klubów, a następnie kalendarz Resident Advisor i profile konkretnych kolektywów. Program zmienia się z tygodnia na tydzień."],
    ["Czy KontenerART i Nurt są klubami?", "Nie w klasycznym sensie. To sezonowe miejsca nad Wartą: dobre na zachód słońca, koncert, DJ set i rozpoczęcie wieczoru, ale zależne od pogody oraz bieżącego programu."],
  ];
  const cards = nightlifePlaces.map((place, index) => `<article class="night-venue reveal">
    <div class="night-venue-index">${String(index + 1).padStart(2, "0")}</div>
    <div class="night-venue-copy"><p class="night-meta">${escapeHtml(place.scale)}</p><h2>${escapeHtml(place.name)}</h2><p class="night-address">${escapeHtml(place.address)}</p><p>${escapeHtml(place.description)}</p><p class="night-sound">${escapeHtml(place.sound)}</p><p class="night-tip">${escapeHtml(place.tip)}</p><a href="${place.sourceUrl}" rel="noopener noreferrer">Sprawdź aktualny program <span aria-hidden="true">↗</span></a></div>
  </article>`).join("");
  const body = `${breadcrumbs(crumbs)}<article class="night-experience"><header class="night-hero"><div class="night-grid" aria-hidden="true"></div><div class="wrap night-hero-inner"><div><p class="night-kicker">Poznań after dark · updated 20.08.2026</p><h1>Trochę młodszy.<br>Trochę czystszy.<br><em>Berlin po poznańsku.</em></h1><p>Miasto jest kompaktowe, scena nie musi niczego udowadniać, a dobra noc może zacząć się nad Wartą i skończyć w bunkrze. Nie wybieraj klubu po szyldzie. Wybierz lineup.</p></div><div class="night-orbit" aria-hidden="true"><span>SCHRON</span><span>TAMA</span><span>HOUSE</span><i></i></div></div></header>
  <div class="night-ticker" aria-hidden="true"><span>SCHRON · TAMA · HOUSE SZKOLNA · PROJEKT LAB · KONTENERART · NURT · LOCAL SELECTS · </span></div>
  <section class="night-intro wrap"><p class="night-label">01 / wybierz skalę</p><div><h2>Jedno miasto.<br>Sześć różnych nocy.</h2><p>Ta lista nie jest rankingiem. Duży headliner, surowy underground, mały dancefloor i letni DJ set służą zupełnie innym wieczorom.</p></div></section>
  <section class="wrap night-venues">${cards}</section>
  <section class="polinski-section"><div class="wrap polinski-grid"><p class="night-label">02 / selekcja</p><div><p class="polinski-sign">PETER<br>POLINSKI</p><h2>Gatunek jest narzędziem.<br>Liczy się przebieg nocy.</h2><p>Przewodnik układa Peter Polinski — DJ grający od 2003 roku, dziś od czasu do czasu pojawiający się za konsoletą w Poznaniu, między innymi w KontenerART. Najbliżej mu do house'u, minimalu, breaków i techno z hipnotycznym groovem. Bez pompowania biografii: najpierw lineup, potem szyld.</p><div class="polinski-links"><a href="https://www.facebook.com/piotrpoleepolinski/" rel="me noopener noreferrer">Facebook</a><a href="https://www.instagram.com/peter.polinski/" rel="me noopener noreferrer">Instagram</a></div></div><div class="polinski-stats"><span><strong>2003</strong>pierwsze sety</span><span><strong>4</strong>naturalne kierunki</span><span><strong>1</strong>zasada: sprawdź lineup</span></div></div></section>
  <section class="night-plan wrap"><p class="night-label">03 / ułóż noc</p><div class="night-plan-grid"><article><span>19:00</span><h3>Rzeka</h3><p>KontenerART albo Nurt. Zachód słońca, jedzenie, pierwszy set.</p></article><article><span>23:00</span><h3>Wybór</h3><p>House Szkolna na spontanicznie. SCHRON, TAMA lub LAB pod konkretny program.</p></article><article><span>rano</span><h3>Powrót</h3><p>Nie komplikuj. Sprawdź nocną komunikację lub zamów przejazd pod Wielką 23.</p></article></div></section>
  <section class="night-faq wrap"><p class="night-label">04 / praktycznie</p><div><h2>Zanim zgaśnie ekran</h2>${faqList(nightFaq)}</div></section>
  <section class="night-home"><div class="wrap"><p class="night-label">05 / reset</p><h2>Po nocy wracasz do własnego mieszkania.</h2><p>Nie obiecujemy ciszy miasta. Obiecujemy klimatyzację, własną kuchnię i adres w centrum, z którego nie trzeba robić wyprawy.</p><a class="button button-light" href="/apartamenty/">Zobacz apartamenty</a></div></section></article>`;
  const author = { "@type": "Person", name: "Peter Polinski", description: "DJ aktywny od 2003 roku, związany z muzyką house, minimal, breakbeat i techno.", sameAs: ["https://www.facebook.com/piotrpoleepolinski/", "https://www.instagram.com/peter.polinski/"] };
  const articleSchema = { "@type": "Article", headline: title, description, datePublished: site.modified, dateModified: site.modified, author, publisher: { "@type": "Organization", name: site.name, url: site.url }, image: absolute("/assets/images/brand/og-stayinpoznan.webp"), mainEntityOfPage: absolute(path) };
  const listSchema = { "@type": "ItemList", name: "Kluby i miejsca z muzyką elektroniczną w Poznaniu", itemListElement: nightlifePlaces.map((place, index) => ({ "@type": "ListItem", position: index + 1, name: place.name, url: place.sourceUrl })) };
  const faqSchema = { "@type": "FAQPage", mainEntity: nightFaq.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) };
  return layout({ title, description, path, body, pageClass: "nightlife-page", schema: [articleSchema, listSchema, faqSchema, breadcrumbSchema(crumbs)] });
}

function localGuidePage() {
  const path = "/poznan/przewodnik/";
  const title = "Przewodnik po Poznaniu 2026 — ambitna trasa bez pośpiechu";
  const description = "Prosty i ambitny przewodnik po Poznaniu: Stary Rynek, Chwaliszewo, Ostrów Tumski, Warta, Cytadela, Jeżyce, jedzenie i nocne życie.";
  const crumbs = [{ name: "Strona główna", path: "/" }, { name: "Poznań", path: "/poznan/" }, { name: "Przewodnik lokalny", path }];
  const route = [
    ["08:00", "Stary Rynek przed miastem", "Wyjdź wcześnie. Zobacz Ratusz i domki budnicze bez tłumu, wypij kawę dwie ulice dalej i wróć na koziołki dopiero w południe.", "Wielka 23 → Ratusz"],
    ["11:00", "Chwaliszewo i rzeka", "Zamiast zawracać przez centrum, idź w stronę Warty. Chwaliszewo jest łącznikiem między pocztówkowym Poznaniem a miastem, które żyje nad rzeką.", "Ratusz → Chwaliszewo"],
    ["13:00", "Ostrów Tumski bez szkolnej wycieczki", "Zobacz katedrę, ale daj więcej czasu Bramie Poznania i samej wyspie. To tutaj historia kraju ma przestrzeń, a nie tylko podpis pod zabytkiem.", "Chwaliszewo → Ostrów Tumski"],
    ["16:00", "Cytadela albo Jeżyce", "Przy dobrej pogodzie wybierz park i długi spacer. Jeśli chcesz miejskiego życia, jedź na Jeżyce: jedzenie, małe lokale, rynek i ulice, które nie są scenografią.", "Wybierz jeden kierunek"],
    ["20:00", "Kolacja, rzeka, muzyka", "Nie wracaj od razu na turystyczny Rynek. Zjedz roślinnie, sprawdź letni program nad Wartą albo wybierz klub po line-upie, nie po reklamie.", "Jedzenie → noc → Wielka 23"],
  ];
  const routeHtml = route.map(([time, name, text, line], index) => `<article class="city-stop reveal"><div class="city-stop-marker"><span>${String(index + 1).padStart(2, "0")}</span><i></i></div><div><p class="city-time">${time} · ${line}</p><h2>${name}</h2><p>${text}</p></div></article>`).join("");
  const body = `${breadcrumbs(crumbs)}<article class="city-experience"><header class="city-hero"><div class="wrap city-hero-grid"><div><p class="city-kicker">Poznań / instrukcja obsługi / 2026</p><h1>Nie zwiedzaj miasta.<br><em>Wejdź w jego rytm.</em></h1><p class="lead">Jedna dobra oś zamiast trzydziestu pinezek: rano Stary Rynek, potem rzeka i Ostrów Tumski, po południu zieleń albo Jeżyce, wieczorem jedzenie i muzyka.</p></div><div class="city-map" aria-hidden="true"><span class="map-point p1">Wielka 23</span><span class="map-point p2">Warta</span><span class="map-point p3">Ostrów</span><span class="map-point p4">Cytadela</span><span class="map-point p5">Jeżyce</span><svg viewBox="0 0 360 430"><path d="M68 342C92 285 155 304 172 245s-42-72-9-118 92-13 118-67"/><path d="M68 342c82 20 173 22 222-48"/></svg></div></div></header>
  <section class="city-manifesto"><div class="wrap"><p>POZNAŃ NIE POTRZEBUJE WIĘCEJ „TOP 10”. POTRZEBUJE DOBREJ KOLEJNOŚCI.</p></div></section>
  <section class="wrap city-route"><div class="city-route-head"><p class="city-kicker">Trasa / jeden pełny dzień</p><h2>Pięć ruchów przez miasto</h2></div>${routeHtml}</section>
  <section class="city-choices"><div class="wrap city-choices-grid"><div><p class="city-kicker">Wybierz dobrze</p><h2>Zostaw coś na następny raz.</h2></div><div class="city-choice-card keep"><span>Zrób</span><ul><li>Rynek przed 9:00</li><li>Wartę pieszo</li><li>jedną dzielnicę naprawdę</li><li>miejsce wybrane po programie</li></ul></div><div class="city-choice-card skip"><span>Odpuść</span><ul><li>pięć muzeów jednego dnia</li><li>obiad na pierwszym wolnym ogródku</li><li>jazdę autem po centrum</li><li>gonienie każdej atrakcji</li></ul></div></div></section>
  <section class="city-portals wrap"><a href="/poznan/weganskie-restauracje/"><span>01 / jedzenie</span><h2>Roślinny Poznań</h2><p>Siedem aktualnych adresów i uczciwe informacje, gdzie kończy się „vegan friendly”.</p></a><a href="/poznan/clubbing/"><span>02 / po zmroku</span><h2>Clubbing</h2><p>Schron, TAMA, Szkolna, LAB i letnie miejscówki wybrane przez Petera Polinskiego.</p></a><a href="/poznan/nieoczywisty/"><span>03 / pod powierzchnią</span><h2>Nieoczywisty Poznań</h2><p>Legendy, forty, lotnicy i miejsca, których nie widać na pierwszej pocztówce.</p></a></section>
  <section class="city-last-word"><div class="wrap"><p class="city-kicker">Baza / Wielka 23</p><h2>Najlepszy luksus w city breaku?<br>Nie tracić czasu na dojazdy.</h2><a class="button button-dark" href="/apartamenty/">Wybierz apartament</a></div></section></article>`;
  const articleSchema = { "@type": "Article", headline: title, description, datePublished: site.modified, dateModified: site.modified, author: { "@type": "Organization", name: site.name, url: site.url }, image: absolute("/assets/images/koziolki/07-view.webp"), mainEntityOfPage: absolute(path) };
  return layout({ title, description, path, body, pageClass: "city-guide-page", image: "/assets/images/koziolki/07-view.webp", schema: [articleSchema, breadcrumbSchema(crumbs)] });
}

const hiddenStories = [
  {
    slug: "trzy-hostie",
    path: "/poznan/legendy/trzy-hostie/",
    category: "legenda · pamięć · odpowiedzialność",
    motif: "hosts",
    year: "1399?",
    title: "Trzy hostie nad bagnem. Legenda, która zostawiła w Poznaniu dwa kościoły.",
    metaTitle: "Legenda o trzech hostiach w Poznaniu — cud, miejsca i prawda",
    description: "Poznańska legenda o trzech hostiach: opowieść o hostiach unoszących się nad mokradłem, kościoły na jej trasie i jej antyżydowski kontekst.",
    lead: "To jedna z najmocniejszych opowieści wpisanych w ulice Poznania. Ma cud, lot nad mokradłem i materialne ślady w mieście — ale ma też ciemną stronę, której uczciwy przewodnik nie może przemilczeć.",
    chapters: [
      ["Najpierw opowieść", "Według późnej tradycji trzy konsekrowane hostie miały zostać wykradzione z kościoła dominikanów, przebite, a następnie porzucone poza murami. Tam miały unosić się nad mokradłem, aż zauważyli je pasterze. W miejscu odnalezienia powstał kościół Bożego Ciała."],
      ["Dlaczego mówimy: legenda", "Współczesna Archidiecezja Poznańska opisuje tę historię wprost jako legendę. Miejski portal przypomina natomiast, że opowieść korzystała z europejskiego schematu oskarżania Żydów o profanację hostii. Nie ma powodu przedstawiać tych oskarżeń jako wydarzeń historycznych."],
      ["Dwa miejsca, jedna pamięć", "Przy ulicy Żydowskiej stoi kościół Najświętszej Krwi Pana Jezusa, wiązany z rzekomym miejscem profanacji. Dalej, przy Krakowskiej, znajduje się kościół Bożego Ciała, wzniesiony przy miejscu cudownego odnalezienia z legendy. Freski i polichromie pokazują, jak opowieść była utrwalana przez stulecia."],
      ["Jak przejść tę historię dziś", "Z Wielkiej 23 zacznij od ulicy Żydowskiej, potem przejdź przez Stary Rynek i ulicę Półwiejską w stronę kościoła Bożego Ciała. To około półgodzinny spacer między pamięcią religijną, miejską topografią i pytaniem o to, komu dawniej przypisywano rolę winnego."],
    ],
    note: "Ta strona świadomie oddziela tradycję religijną od ustaleń historycznych i nie powiela oskarżeń wobec poznańskich Żydów jako faktów.",
    sources: [
      ["Archidiecezja Poznańska — Legenda o trzech hostiach", "https://archpoznan.pl/pl/legenda-o-trzech-hostiach"],
      ["Poznan.pl — Skąd się wzięła antysemicka legenda", "https://www.poznan.pl/mim/wortals/cik/news,1200/skad-sie-wziela-antysemicka-legenda-o-trzech-hostiach,84157.html"],
      ["POLONA — legenda o sprofanowanych hostiach", "https://blog.polona.pl/2015/06/legenda-o-hostiach/"],
    ],
  },
  {
    slug: "lawica-polskie-lotnictwo",
    path: "/poznan/historia/lawica-polskie-lotnictwo/",
    category: "historia · lotnictwo · powstanie",
    motif: "aviation",
    year: "1919",
    title: "Dwadzieścia minut, które dało Polsce skrzydła.",
    metaTitle: "Ławica 1919 — jak w Poznaniu rodziło się polskie lotnictwo",
    description: "Historia zdobycia lotniska Ławica 6 stycznia 1919 roku i przejętych samolotów, które stały się filarem polskiego lotnictwa wojskowego.",
    lead: "Dzisiejsze lotnisko kojarzy się z walizką i city breakiem. O świcie 6 stycznia 1919 roku było jednak celem błyskawicznej operacji Powstania Wielkopolskiego.",
    chapters: [
      ["Cel: stacja lotnicza", "Niemiecka stacja lotnicza w podpoznańskiej wsi Ławica była zbyt ważna, by pozostawić ją poza kontrolą powstańców. W przygotowaniu akcji kluczową rolę odegrał sierżant pilot Wiktor Pniewski, który wcześniej organizował konspirację wewnątrz jednostki."],
      ["Szturm krótszy niż serial", "Atak 6 stycznia 1919 roku trwał około dwudziestu minut. Powstańcy zdobyli lotnisko, sprawne samoloty, części i zaplecze. Kolejne maszyny i wyposażenie znajdowały się również w hali na Winiarach."],
      ["Czarne krzyże, biało-czerwona szachownica", "Już w styczniu niemieckie oznaczenia zastępowano biało-czerwoną szachownicą. Z przejętego sprzętu utworzono cztery eskadry, a część maszyn wysłano do Warszawy. Ławica stała się jednym z fundamentów organizowanego polskiego lotnictwa wojskowego."],
      ["Historia nadal ląduje tutaj", "Port Poznań-Ławica działa w miejscu o wyjątkowej ciągłości lotniczej. Przy przylocie warto pamiętać, że pas startowy nie jest tylko infrastrukturą podróży — to fragment historii zwycięskiego powstania i nowego państwa."],
    ],
    note: "Określenie „kolebka polskiego lotnictwa” jest popularnym skrótem. Ławica była jednym z najważniejszych filarów rodzącego się lotnictwa wojskowego, nie jedynym miejscem jego powstania.",
    sources: [
      ["Poznan.pl — Ławica kolebką polskiego lotnictwa", "https://kultura.poznan.pl/mim/kultura/news/lawica-kolebka-polskiego-lotnictwa,127230.html"],
      ["Wielkopolskie Muzeum Niepodległości — bitwa o Ławicę", "https://www.wmn.poznan.pl/moje-aktualnosci/powstanczy-hit-czyli-bitwa-o-lawice/"],
      ["Muzeum Lotnictwa Polskiego — największy łup lotniczy", "https://muzeumlotnictwa.pl/aktualnosci/zwycieskie-powstanie-wielkopolskie-i-najwiekszy-lup-lotniczy-w-historii-polski/"],
    ],
  },
  {
    slug: "wieza-spadochronowa",
    path: "/poznan/historia/wieza-spadochronowa/",
    category: "zaginione miasto · Sołacz · wysokość",
    motif: "tower",
    year: "1938–1969",
    title: "Poznań miał wieże, z których skakało się bez samolotu.",
    metaTitle: "Wieża spadochronowa w Poznaniu — historia zaginionych konstrukcji",
    description: "Historia dwóch poznańskich wież spadochronowych: przedwojennej przy Drodze Dębińskiej i powojennej w Parku Sołackim.",
    lead: "Na starych fotografiach nad zielenią wyrasta metalowa konstrukcja przypominająca nadajnik z przyszłości. To nie radiostacja. To urządzenie do nauki skoku, zanim człowiek wsiadł do samolotu.",
    chapters: [
      ["Pierwsza wieża", "Pierwszą poznańską wieżę spadochronową otwarto w 1938 roku przy Drodze Dębińskiej. Służyła szkoleniu i popularyzacji spadochroniarstwa w epoce, w której lotnictwo było jednocześnie technologią, sportem i patriotycznym projektem."],
      ["Druga konstrukcja na Sołaczu", "Po wojnie do Poznania sprowadzono niemiecką wieżę nasłuchowo-zakłócającą z Osowej Góry. Przebudowana konstrukcja stanęła w Parku Sołackim i została otwarta w 1952 roku. Miała ponad trzydzieści metrów wysokości."],
      ["Skok bez lotu", "Ćwiczący był podwieszany do systemu lin i wysięgnika. Mechanizm pozwalał poczuć wyjście w przestrzeń, opadanie i lądowanie bez ryzyka pełnego skoku z samolotu. Dla spacerujących po parku wieża była zarazem treningowym urządzeniem i widowiskiem."],
      ["Wysadzona, ale nie zapomniana", "Pod koniec lat 60. uznano ją za niebezpieczną. Konstrukcję wysadzono, a pozostałości usuwano jeszcze później. Dziś Park Sołacki jest spokojny i elegancki — przez chwilę trudno uwierzyć, że nad stawem ćwiczono kiedyś lot ku ziemi."],
    ],
    note: "Źródła różnią się w szczegółach dat rozbiórki. Miejski portal opisuje wysadzenie w 1968 roku; inne opracowania wskazują rok 1969 i późniejsze usuwanie resztek.",
    sources: [
      ["Poznan.pl — Dwie wieże", "https://kultura.poznan.pl/mim/kultura/news/historia,c,8/dwie-wieze,154811.html"],
      ["CYRYL — Park Sołacki 1906–1962", "https://cyryl.poznan.pl/kolekcje-a-z/"],
    ],
  },
  {
    slug: "cytadela-fort-winiary",
    path: "/poznan/historia/cytadela-fort-winiary/",
    category: "forteca · bitwa · park",
    motif: "citadel",
    year: "1828–dziś",
    title: "Pod największym parkiem centrum leży forteca.",
    metaTitle: "Cytadela Poznań — Fort Winiary, bitwa 1945 i park",
    description: "Nieoczywista historia poznańskiej Cytadeli: pruski Fort Winiary, walki w lutym 1945 roku, cmentarze, muzea i park ze sztuką.",
    lead: "Dzisiaj biegnie się tu, spaceruje z psem i ogląda Nierozpoznanych Abakanowicz. Układ alejek nadal zdradza jednak geometrię miejsca stworzonego do wojny.",
    chapters: [
      ["Fort w forcie", "Budowę Fortu Winiary rozpoczęto w 1828 roku, a zakończono w 1842. Był głównym dziełem Twierdzy Poznań, zdolnym do samodzielnej obrony. Jego rdzeń — Kernwerk — działał jak kolejna forteca zamknięta wewnątrz fortecy."],
      ["Luty 1945", "Cytadela była ostatnim silnym punktem niemieckiej obrony podczas bitwy o Poznań. Walki pozostawiły miasto z ogromnymi zniszczeniami i tysiącami ofiar po obu stronach oraz wśród ludności cywilnej. Relikty murów i ekspozycje muzealne nadal opowiadają tę warstwę miejsca."],
      ["Po wojnie: rozbroić krajobraz", "Znaczną część fortyfikacji rozebrano, a cegłę wykorzystywano przy odbudowie. Na terenie dawnego fortu urządzono park. Pozostały fragmenty umocnień, cmentarze wojenne, Muzeum Uzbrojenia i Muzeum Armii „Poznań”."],
      ["Sztuka pomiędzy pamięcią", "Na osi parku stoi Pomnik Bohaterów, dalej instalacja Nierozpoznani Magdaleny Abakanowicz. Sto dwanaście żeliwnych postaci nie wyjaśnia historii — raczej zmusza, by przejść pomiędzy anonimowością, tłumem i pamięcią."],
    ],
    note: "Na Cytadelę warto przeznaczyć co najmniej dwie godziny. To jednocześnie park, teren dawnej twierdzy, nekropolia i zespół muzealny — nie jedna atrakcja.",
    sources: [
      ["CYRYL — Fort Winiary", "https://cyryl.poznan.pl/kolekcja/fort-winiary-mkz/"],
      ["Wielkopolskie Muzeum Niepodległości — Muzeum Uzbrojenia", "https://www.wmn.poznan.pl/oddzialy/muzeum-uzbrojenia/"],
    ],
  },
];

function hiddenPoznanHubPage() {
  const path = "/poznan/nieoczywisty/";
  const title = "Nieoczywisty Poznań — legendy, lotnictwo i zaginione miejsca";
  const description = "Żywy przewodnik po nieoczywistym Poznaniu: trzy hostie, Ławica 1919, wieże spadochronowe, Fort Winiary, król kruków i miejskie legendy.";
  const crumbs = [{ name: "Strona główna", path: "/" }, { name: "Poznań", path: "/poznan/" }, { name: "Poznań nieoczywisty", path }];
  const cards = hiddenStories.map((story, index) => `<a class="hidden-story-card story-${story.motif}" href="${story.path}"><span>${String(index + 1).padStart(2, "0")} / ${story.year}</span><div class="story-card-symbol" aria-hidden="true"><i></i><i></i><i></i></div><p class="eyebrow">${story.category}</p><h2>${story.title}</h2><p>${story.lead}</p><b>Czytaj historię ↗</b></a>`).join("");
  const body = `${breadcrumbs(crumbs)}<article class="hidden-city"><header class="hidden-hero"><div class="hidden-noise" aria-hidden="true"></div><div class="wrap"><p>POZNAŃ / ARCHIWUM RZECZY NIEOCZYWISTYCH</p><h1>Pod pocztówką<br>jest <em>drugie miasto.</em></h1><div class="hidden-hero-foot"><span>legendy</span><span>lotnicy</span><span>forty</span><span>zaginione konstrukcje</span></div></div></header>
  <section class="hidden-manifesto wrap"><p class="chapter-number">00</p><div><h2>Nie wszystko, co ważne, nadal stoi.</h2><p>Poznań opowiada się przez warstwy: kościół wyrasta z legendy, lotnisko z powstania, park z fortecy, a spokojny Sołacz pamięta metalową wieżę do skoków. Zamiast kolejnej listy atrakcji zbieramy historie, które zmieniają sposób patrzenia na miasto.</p></div></section>
  <section class="hidden-stories wrap">${cards}</section>
  <section class="legend-strip"><div class="wrap"><p class="eyebrow">Miejskie opowieści zapisane w bruku</p><h2>Koziołki to dopiero początek.</h2><div class="legend-mini-grid"><article><span>RATUSZ</span><h3>Król kruków</h3><p>Trębacz miał uratować króla kruków, a ptasia armia odwdzięczyła się obroną miasta.</p></article><article><span>WZGÓRZE PRZEMYSŁA</span><h3>Diabły niosą górę</h3><p>Złe moce chciały zatamować Wartę i zatopić Poznań. Świt pokrzyżował plan, a niesiona góra spadła obok miasta.</p></article><article><span>STARY RYNEK</span><h3>Koziołki uciekają kucharzowi</h3><p>Zamiast skończyć na uczcie, wbiegły na wieżę i zaczęły się trykać. Mechanizm zegara miał zachować ten moment.</p></article><article><span>CHWALISZEWO</span><h3>Złoty krzyż</h3><p>Legenda o krzyżu z dawnego mostu prowadzi przez miejsce, które samo niemal zniknęło po zasypaniu starego koryta Warty.</p></article></div><a class="source-link" href="https://www.poznan.pl/mim/wortals/turystyka/-,p,27888.html" rel="noopener noreferrer">Oficjalny zbiór podań i legend Poznania ↗</a></div></section>
  <section class="hidden-route wrap"><p class="chapter-number">05</p><div><p class="eyebrow">Trasa na jeden dziwny dzień</p><h2>Od hostii do fortecy.</h2><ol><li><strong>09:00 — Żydowska</strong><span>zacznij od miejsca legendy i jej trudnego kontekstu</span></li><li><strong>11:00 — Stary Rynek</strong><span>kruki, koziołki i ślady legend w bruku</span></li><li><strong>13:00 — Sołacz</strong><span>spacer po parku, nad którym stała wieża</span></li><li><strong>15:00 — Cytadela</strong><span>wejdź w geometrię dawnego Fortu Winiary</span></li></ol></div></section>
  <section class="night-home"><div class="wrap"><p class="night-label">BAZA / WIELKA 23</p><h2>Śpij sto metrów od pierwszej historii.</h2><p>Ulica Żydowska, Ratusz i początek miejskiego szlaku są tuż za drzwiami.</p><a class="button button-light" href="/apartamenty/">Zobacz apartamenty</a></div></section></article>`;
  const articleSchema = { "@type": "CollectionPage", name: title, description, url: absolute(path), mainEntity: hiddenStories.map((story) => ({ "@type": "Article", headline: story.title, url: absolute(story.path) })) };
  return layout({ title, description, path, body, pageClass: "hidden-city-page", schema: [articleSchema, breadcrumbSchema(crumbs)] });
}

function hiddenStoryPage(story) {
  const crumbs = [{ name: "Strona główna", path: "/" }, { name: "Poznań", path: "/poznan/" }, { name: "Nieoczywisty Poznań", path: "/poznan/nieoczywisty/" }, { name: story.title, path: story.path }];
  const chapters = story.chapters.map(([heading, text], index) => `<section><p class="chapter-number">${String(index + 1).padStart(2, "0")}</p><h2>${heading}</h2><p>${text}</p></section>`).join("");
  const sources = story.sources.map(([label, url]) => `<li><a href="${url}" rel="noopener noreferrer">${label} ↗</a></li>`).join("");
  const body = `${breadcrumbs(crumbs)}<article class="hidden-story story-${story.motif}"><header class="story-hero"><div class="story-lines" aria-hidden="true"></div><div class="wrap story-hero-grid"><div><p class="eyebrow">${story.category} · ${story.year}</p><h1>${story.title}</h1><p class="lead">${story.lead}</p></div><div class="story-emblem" aria-hidden="true"><span>${story.year}</span><i></i><i></i><i></i></div></div></header>
  <section class="story-body wrap"><div class="story-chapters">${chapters}</div><aside class="story-sidebar"><p class="eyebrow">Czytaj uważnie</p><p>${story.note}</p><h2>Źródła</h2><ul>${sources}</ul><p class="source-date">Weryfikacja: 21.08.2026</p></aside></section>
  <nav class="story-next wrap" aria-label="Pozostałe historie"><p class="eyebrow">Następne warstwy</p><div>${hiddenStories.filter((item) => item.slug !== story.slug).map((item) => `<a href="${item.path}"><span>${item.year}</span>${item.title}</a>`).join("")}</div></nav>
  <section class="night-home"><div class="wrap"><p class="night-label">WRÓĆ DO ARCHIWUM</p><h2>To nie jest jedyna historia pod powierzchnią.</h2><a class="button button-light" href="/poznan/nieoczywisty/">Poznań nieoczywisty</a></div></section></article>`;
  const articleSchema = { "@type": "Article", headline: story.metaTitle, description: story.description, datePublished: site.modified, dateModified: site.modified, author: { "@type": "Organization", name: site.name, url: site.url }, publisher: { "@type": "Organization", name: site.name, url: site.url }, image: absolute("/assets/images/brand/og-stayinpoznan.webp"), mainEntityOfPage: absolute(story.path), citation: story.sources.map(([, url]) => url) };
  return layout({ title: story.metaTitle, description: story.description, path: story.path, body, pageClass: `hidden-story-page story-${story.motif}`, schema: [articleSchema, breadcrumbSchema(crumbs)] });
}

function ukrainianLongStayPage() {
  const path = "/ua/";
  const title = "Житло в Познані та практичний путівник українською";
  const description = "Апартаменти в центрі Познані та перевірені посилання українською: PESEL UKR, легалізація перебування, запис до установи й польське громадянство.";
  const apartmentLinks = apartments.map((apartment) => `<article><p class="eyebrow">до ${apartment.guests} гостей</p><h3>${apartment.name}</h3><p>Окрема спальня, кухня, кондиціонер, Wi‑Fi та самостійне заселення в історичному центрі.</p><a class="text-link" href="/apartamenty/${apartment.slug}/">Фото й бронювання <span aria-hidden="true">↗</span></a></article>`).join("");
  const body = `<article class="ukraine-guide"><header class="ua-hero"><div class="wrap ua-hero-grid"><div><p class="eyebrow">Познань · українською · оновлено 21.08.2026</p><h1>Приїхати на кілька днів.<br><em>Залишитися довше.</em></h1><p class="lead">Приватні апартаменти біля Старого Ринку та спокійна стартова точка для знайомства з містом. Ми говоримо українською, польською й англійською та зібрали офіційні посилання, які допомагають не загубитися в перших формальностях.</p><div class="button-row"><a class="button button-primary" href="#apartments">Переглянути житло</a><a class="button button-ghost" href="#documents">Документи й установи</a></div></div><div class="ua-orbit" aria-hidden="true"><span>UA</span><i>POZ</i><b>PL</b></div></div></header>
  <section class="ua-welcome wrap" id="city"><p class="chapter-number">01</p><div><p class="eyebrow">Місто для життя</p><h2>Компактне, міжнародне й достатньо велике.</h2><p>У Познані сильні університети, технологічні компанії, міжнародні виставки та велика українська спільнота. Центр легко пройти пішки, а трамваї з’єднують Старе Місто з вокзалом, університетами й районами для довшого проживання.</p><div class="ua-facts"><span><strong>3</strong>мови господарів</span><span><strong>100 м</strong>до Старого Ринку</span><span><strong>24/7</strong>самостійне заселення</span></div></div></section>
  <section class="ua-documents" id="documents"><div class="wrap"><p class="chapter-number">02</p><div class="section-heading"><div><p class="eyebrow">Офіційні справи</p><h2>Куди йти й що перевірити.</h2></div><p>Правила змінюються. Ми не замінюємо юриста чи працівника установи — ведемо безпосередньо до актуальних державних джерел.</p></div><div class="ua-document-grid"><article><span>01</span><h3>PESEL зі статусом UKR</h3><p>Актуальні бланки доступні польською та українською. Заяву подають до органу гміни; перед візитом перевірте вимоги до документа, фотографії та підтвердження особи.</p><a href="https://www.gov.pl/web/cyfryzacja/wzor-wniosku-o-nadanie-numeru-pesel-w-zwiazku-z-konfliktem-na-ukrainie-wzor-oswiadczenia-obywatela-ukrainy-o-wyjezdzie-z-polski-na-okres-powyzej-1-miesiaca-oraz-wzor-wniosku-o-uzupelnienie-danych-w-rejestrze-obywateli-ukrainy" rel="noopener noreferrer">Офіційні бланки GOV.PL ↗</a></article><article><span>02</span><h3>Легалізація перебування</h3><p>Відділ у справах іноземців Великопольського воєводського управління публікує процедури, форми, оплату й окремий розділ для громадян України.</p><a href="https://migrant.poznan.uw.gov.pl/" rel="noopener noreferrer">Відділ у справах іноземців ↗</a></article><article><span>03</span><h3>Запис і статус справи</h3><p>Обслуговування іноземців у Познані відбувається, зокрема, на pl. Wolności 17. Записуйте конкретну особу й зберігайте код доступу до перевірки справи.</p><a href="https://www.poznan.uw.gov.pl/rejestracja/" rel="noopener noreferrer">Онлайн-запис ↗</a><a href="https://www.poznan.uw.gov.pl/cudzoziemcy-stan/?lang=pl" rel="noopener noreferrer">Перевірити статус справи ↗</a></article><article><span>04</span><h3>Визнання громадянином Польщі</h3><p>Це окрема процедура з кількома правовими підставами. У більшості випадків потрібне офіційне підтвердження знання польської мови на рівні B1; рішення приймає воєвода.</p><a href="https://www.gov.pl/web/mswia/popros-o-uznanie-za-polskiego-obywatela" rel="noopener noreferrer">Умови на GOV.PL ↗</a></article></div><aside class="ua-alert"><strong>Важливо</strong><p>Не покладайтеся на старі пости в соцмережах. Перевіряйте дату публікації, свій індивідуальний статус і чинні правила безпосередньо в установі.</p></aside></div></section>
  <section class="section wrap" id="apartments"><div class="section-heading"><div><p class="eyebrow">Житло в самому центрі</p><h2>Власний простір замість готельного коридору.</h2></div><p>Наші апартаменти найкраще підходять для першого етапу перебування, робочої поїздки або кількох тижнів у місті. Остаточну доступність і ціну показує Airbnb.</p></div><div class="ua-apartments">${apartmentLinks}</div></section>
  <section class="ua-people" id="contact"><div class="wrap"><p class="eyebrow">Люди, а не call center</p><h2>Оксана й Пьотр приймають гостей особисто.</h2><p>Можемо пояснити дорогу, район, транспорт і побутові речі українською. У питаннях права та документів завжди скеровуємо до офіційного джерела.</p><a class="button button-light" href="mailto:${site.email}">${site.email}</a></div></section></article>`;
  const pageSchema = { "@type": "WebPage", name: title, description, inLanguage: "uk", url: absolute(path), dateModified: site.modified, about: [{ "@type": "Thing", name: "Житло в Познані" }, { "@type": "Thing", name: "Інформація для громадян України" }] };
  return layout({ title, description, path, body, lang: "uk", pageClass: "ukraine-page", schema: [pageSchema] });
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
await writePage("/poznan/teraz/", currentGuidePage());
for (const event of events) await writePage(`/wydarzenia/${event.slug}/`, eventPage(event));
await writePage("/poznan/", poznanHubPage());
for (const kind of ["stary-rynek", "atrakcje", "weekend"]) await writePage(`/poznan/${kind}/`, guidePage(kind));
await writePage("/poznan/przewodnik/", localGuidePage());
await writePage("/poznan/weganskie-restauracje/", veganGuidePage());
await writePage("/poznan/clubbing/", nightlifeGuidePage());
await writePage("/poznan/nieoczywisty/", hiddenPoznanHubPage());
for (const story of hiddenStories) await writePage(story.path, hiddenStoryPage(story));
await writePage("/ua/", ukrainianLongStayPage());
await writePage("/faq/", faqPage());

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexedPaths.map((path) => `  <url><loc>${absolute(path)}</loc><lastmod>${site.modified}</lastmod></url>`).join("\n")}\n</urlset>\n`;
await writeFile(join(root, "sitemap.xml"), sitemap, "utf8");
const notFoundBody = `<section class="coming-hero"><div class="wrap"><p class="eyebrow">Błąd 404</p><h1>Ta uliczka prowadzi<br><em>donikąd.</em></h1><p class="lead">Wróć na Stary Rynek albo wybierz jeden z naszych apartamentów.</p><div class="button-row"><a class="button button-primary" href="/">Strona główna</a><a class="button button-ghost" href="/apartamenty/">Apartamenty</a></div></div></section>`;
await writeFile(join(root, "404.html"), cleanHtml(layout({ title: "Nie znaleziono strony | Stay in Poznań", description: "Strona nie istnieje. Wróć do Stay in Poznań i zobacz apartamenty przy Starym Rynku.", path: "/404.html", body: notFoundBody, noindex: true, pageClass: "not-found-page" })), "utf8");
console.log(`Built ${indexedPaths.length} indexable pages, 1 noindex preview and a 404 page.`);
