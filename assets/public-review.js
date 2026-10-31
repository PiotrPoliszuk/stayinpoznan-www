export function suggestionUrl(context, title, change) {
  title = String(title ?? '').trim(); change = String(change ?? '').trim();
  if (title.length < 5 || title.length > 100 || change.length < 10 || change.length > 800) throw new Error('Sprawdź długość tytułu i opisu zmiany.');
  const page = new URL(context.url);
  if (page.origin !== 'https://stayinpoznan.pl' || page.username || page.password || page.search || page.hash || page.pathname.length > 300) throw new Error('Nieprawidłowy adres strony.');
  const lines = ['## Proponowana zmiana', change, '', '## Kontekst', `Strona: ${page.href}`];
  if (/^EVT-\d{6,}$/.test(context.record)) lines.push(`Wydarzenie: ${context.record}`);
  if (Number.isSafeInteger(context.revision) && context.revision > 0) lines.push(`Rewizja: ${context.revision}`);
  if (Number.isFinite(Date.parse(context.observed_at))) lines.push(`Obserwacja: ${context.observed_at}`);
  lines.push('', 'Przygotowano z publicznego podglądu PZN. Zgłoszenie wymaga wysłania przez autora.');
  const url = new URL('https://github.com/PiotrPoliszuk/stayinpoznan-www/issues/new');
  url.searchParams.set('title', `[Strona] ${title}`); url.searchParams.set('body', lines.join('\n'));
  return url.href;
}

if (typeof document !== 'undefined') {
  const form = document.getElementById('reviewSuggestion');
  const contexts = JSON.parse(document.getElementById('reviewContexts').textContent);
  const select = document.getElementById('reviewContext');
  const draft = document.getElementById('reviewDraft');
  const feedback = document.getElementById('reviewFeedback');
  const reset = () => { draft.hidden = true; draft.removeAttribute('href'); feedback.textContent = ''; };
  form.addEventListener('input', reset); form.addEventListener('change', reset);
  document.querySelectorAll('[data-review-context]').forEach(button => button.addEventListener('click', () => {
    select.value = button.dataset.reviewContext;
    reset(); document.getElementById('suggestion').scrollIntoView({ block: 'start', behavior: 'smooth' });
    document.getElementById('reviewTitle').focus({ preventScroll: true });
  }));
  form.addEventListener('submit', event => {
    event.preventDefault(); reset();
    try {
      const context = contexts.find(item => item.key === select.value);
      draft.href = suggestionUrl(context, document.getElementById('reviewTitle').value, document.getElementById('reviewChange').value);
      draft.hidden = false; feedback.textContent = 'Szkic jest gotowy. Otwórz go, sprawdź treść i zatwierdź wysłanie w GitHubie.';
    } catch (error) { feedback.textContent = error.message; }
  });
}
