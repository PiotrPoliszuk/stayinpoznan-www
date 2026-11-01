import { EVENT_MAX_AGE, RATING_MAX_AGE, isFresh, todayWarsaw } from './public-data.mjs';

const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const dateLabel = value => Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw' }).format(new Date(value))
  : 'Brak potwierdzonego odczytu';
const workflow = 'https://github.com/PiotrPoliszuk/stayinpoznan-www/actions/workflows/public-content.yml';
const reviewUrl = 'https://github.com/PiotrPoliszuk/stayinpoznan-www/pulls';
const stateLabel = { read: 'Źródło odczytane', unavailable: 'Źródło niedostępne', 'not-configured': 'Źródło niepodłączone' };
const sourceLabel = { events: 'Wydarzenia Poznania i MTP', ratings: 'Oceny gospodarza i apartamentów', reviews: 'Wybrane publiczne opinie' };

function safeWorkflowUrl(value) {
  return typeof value === 'string' && /^https:\/\/github\.com\/PiotrPoliszuk\/stayinpoznan-www\/actions\/runs\/\d+$/.test(value) ? value : workflow;
}

export function renderReviewConsole({ events = {}, ratings = {}, status = {}, now = new Date() } = {}) {
  const today = todayWarsaw(now);
  const publicEvents = Array.isArray(events.events) ? events.events : [];
  const upcoming = publicEvents.filter(event => event.status === 'scheduled' && event.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const observations = Array.isArray(ratings.ratings) ? ratings.ratings : [];
  const sources = Array.isArray(status.sources) ? status.sources.filter(source => source.source in sourceLabel) : [];
  const contexts = [
    { key: 'home', label: 'Strona główna', url: 'https://stayinpoznan.pl/' },
    { key: 'events', label: 'Lista wydarzeń', url: 'https://stayinpoznan.pl/wydarzenia/' },
    { key: 'guide', label: 'Poznań teraz', url: 'https://stayinpoznan.pl/poznan/teraz/' },
    { key: 'ratusz', label: 'Ratusz View', url: 'https://stayinpoznan.pl/apartamenty/ratusz-view/' },
    { key: 'koziolki', label: 'Koziołki View', url: 'https://stayinpoznan.pl/apartamenty/koziolki-view/' },
  ];
  const validEvents = upcoming.filter(event => /^EVT-\d{6,}$/.test(event.id) && /^poznan-evt-\d{6,}$/.test(event.slug));
  for (const event of validEvents.slice(0, 12)) contexts.push({ key: event.id, label: String(event.title).slice(0, 160),
    url: `https://stayinpoznan.pl/wydarzenia/${event.slug}/`, record: event.id,
    revision: Number.isSafeInteger(event.revision) ? event.revision : null, observed_at: event.observed_at });
  const sourceCards = sources.map(source => `<article class="review-card"><h3>${sourceLabel[source.source]}</h3><p class="review-badge ${source.state === 'read' ? '' : 'attention'}">${stateLabel[source.state] || 'Stan niepotwierdzony'}</p><dl><div><dt>Próba odczytu</dt><dd>${escape(dateLabel(source.checked_at))}</dd></div><div><dt>Ostatni udany odczyt</dt><dd>${escape(dateLabel(source.last_success_at))}</dd></div><div><dt>Najnowsza obserwacja</dt><dd>${escape(dateLabel(source.latest_observed_at))}</dd></div><div><dt>Rekordy w zapisanej kopii</dt><dd>${Number.isSafeInteger(source.cached_records) ? source.cached_records : 'Brak danych'}</dd></div></dl></article>`).join('');
  const ratingRows = observations.map(record => {
    const current = isFresh(record.observed_at, RATING_MAX_AGE, now);
    const label = record.kind === 'host' ? 'Gospodarz' : record.slug === 'ratusz-view' ? 'Ratusz View' : 'Koziołki View';
    return `<tr><th scope="row">${label}</th><td data-label="Ocena">${Number(record.rating).toFixed(2)} / 5 · ${Number(record.reviews)} opinii</td><td data-label="Obserwacja">${escape(dateLabel(record.observed_at))}</td><td data-label="Widoczność">${current ? 'Widoczna na stronie' : 'Wygasła — ukryta na stronie'}</td></tr>`;
  }).join('');
  const eventCards = validEvents.slice(0, 12).map(event => {
    const fresh = event.fresh === true && isFresh(event.observed_at, EVENT_MAX_AGE, now);
    return `<article class="review-event"><div><p class="review-eyebrow">${escape(event.id)} · rewizja ${Number(event.revision)}</p><h3><a href="/wydarzenia/${event.slug}/">${escape(event.title)}</a></h3><p>${escape(event.start_date)}${event.end_date !== event.start_date ? ` – ${escape(event.end_date)}` : ''} · ${escape(event.location)}</p><p class="review-muted">${escape(event.source)} · ${escape(dateLabel(event.observed_at))}</p><p class="review-badge ${fresh ? '' : 'attention'}">${fresh ? 'Świeża obserwacja' : 'Termin wymaga potwierdzenia'}</p></div><button type="button" class="review-button quiet" data-review-context="${escape(event.id)}">Zaproponuj zmianę</button></article>`;
  }).join('');
  const data = JSON.stringify(contexts).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Podgląd publikacji — Stay in Poznań</title><meta name="description" content="Podgląd zapisanych źródeł, wydarzeń i ocen Stay in Poznań oraz miejsce przygotowania propozycji zmian do strony."><meta name="robots" content="noindex,nofollow"><link rel="canonical" href="https://stayinpoznan.pl/podglad/"><link rel="icon" href="/assets/favicon-patrons-pro.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/public-review.css?v=1"><script src="/assets/public-review.js?v=1" type="module"></script></head>
<body><a class="review-skip" href="#main">Przejdź do treści</a><header class="review-header"><a href="/" class="review-brand">Stay in <strong>Poznań</strong></a><a href="https://stayinpoznan.pl/" class="review-button quiet">Otwórz stronę ↗</a></header>
<main id="main"><section class="review-intro"><p class="review-eyebrow">PZN / publikacja strony</p><h1>Podgląd i propozycje zmian.</h1><p>Strona aktualizuje treści automatycznie. Tutaj sprawdzisz zapisaną kopię źródeł i przygotujesz korektę.</p><p class="review-muted">To publiczny podgląd bez uprawnień do edycji. Nie wpisuj danych gości ani sekretów.</p><nav class="review-actions" aria-label="Publikacja"><a class="review-button" href="${reviewUrl}">Podglądy proponowanych zmian ↗</a><a class="review-button quiet" href="${escape(safeWorkflowUrl(status.workflow_url))}">Sprawdź przebieg publikacji ↗</a><a class="review-button quiet" href="#suggestion">Zaproponuj zmianę</a></nav></section>
<section aria-labelledby="source-heading"><div class="review-heading"><h2 id="source-heading">Co wiemy ze źródeł</h2><p class="review-muted">Migawka odczytu: ${escape(dateLabel(status.checked_at))}</p></div><p>Plan: strona codziennie o 04:15 UTC (05:15 zimą, 06:15 latem w Poznaniu), a także po otrzymaniu nowych publicznych faktów z PZN. Baza wydarzeń PZN jest odświeżana raz w tygodniu. Wynik ostatniego uruchomienia sprawdzisz w przebiegu publikacji.</p><div class="review-grid">${sourceCards || '<article class="review-card"><h3>Oczekiwanie na pierwszy odczyt automatu</h3><p>Brak zapisanej próby odświeżenia. Same pliki strony nie potwierdzają działania harmonogramu.</p></article>'}</div><p class="review-muted">Stan źródła jest dowodem odczytu, nie potwierdzeniem wdrożenia Cloudflare. Pokrycie wydarzeń pozostaje częściowe; awaria źródła zachowuje poprzednie obserwacje.</p></section>
<section aria-labelledby="rating-heading"><h2 id="rating-heading">Oceny i ich data</h2>${ratingRows ? `<div class="review-table-wrap"><table><caption>Zapisane obserwacje; po 14 dniach ocena znika ze strony</caption><thead><tr><th>Dotyczy</th><th>Ocena</th><th>Obserwacja</th><th>Widoczność</th></tr></thead><tbody>${ratingRows}</tbody></table></div>` : '<p>Brak zapisanych ocen. Strona kieruje do aktualnych opinii na Airbnb.</p>'}<p class="review-muted">Automatyczne kolejne odczyty ocen wymagają podłączenia autoryzowanego źródła. Obserwacja operatora nie oznacza aktywnego API.</p></section>
<section aria-labelledby="event-heading"><div class="review-heading"><h2 id="event-heading">Nadchodzące wydarzenia</h2><a href="/wydarzenia/">Wszystkie strony wydarzeń ↗</a></div><p class="review-muted">${validEvents.length} zapisanych przyszłych wydarzeń; pokazujemy najwyżej 12. Brak wydarzenia w częściowym źródle nie oznacza anulowania.</p><div class="review-events">${eventCards || '<p class="review-empty">Brak przyszłych faktów w automatycznej kopii. Ręcznie opracowane wydarzenia znajdziesz na liście wydarzeń.</p>'}</div></section>
<section class="review-suggestion" id="suggestion" aria-labelledby="suggestion-heading"><h2 id="suggestion-heading">Co poprawić lub rozwinąć?</h2><p>Wybierz stronę i opisz zmianę. Przygotujemy szkic zgłoszenia z adresem i kontekstem obserwacji. Otworzysz go w GitHubie i samodzielnie zatwierdzisz wysłanie.</p><form id="reviewSuggestion"><label>Strona<select id="reviewContext" name="context">${contexts.map(item => `<option value="${escape(item.key)}">${escape(item.label)}</option>`).join('')}</select></label><label>Krótki tytuł<input id="reviewTitle" name="title" required minlength="5" maxlength="100" autocomplete="off"></label><label>Proponowana zmiana<textarea id="reviewChange" name="change" required minlength="10" maxlength="800" rows="5"></textarea></label><p class="review-muted">Zgłoszenie jest publiczne. Do wysłania w GitHubie potrzebne jest konto. Sam podgląd i przygotowanie szkicu niczego nie publikują.</p><button class="review-button" type="submit">Przygotuj propozycję</button><p id="reviewFeedback" role="status" aria-live="polite"></p><a id="reviewDraft" class="review-button" hidden target="_blank" rel="noopener noreferrer">Otwórz szkic w GitHubie ↗</a></form><noscript><p>Przygotowanie szkicu wymaga JavaScript. Możesz też <a href="https://github.com/PiotrPoliszuk/stayinpoznan-www/issues/new">otworzyć formularz zgłoszenia w GitHubie</a>.</p></noscript></section></main><footer>Stay in Poznań · publiczna migawka treści · <a href="/">wróć do strony</a></footer><script id="reviewContexts" type="application/json">${data}</script></body></html>`;
}
