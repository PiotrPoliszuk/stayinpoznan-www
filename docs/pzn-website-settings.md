# Publiczna kopia ustawień PZN

Opcjonalne pole `website` w pliku `content/incoming/mission-public-facts.json` ma schemat `pzn.public-website-settings.v1`. Importer kopiuje jedynie jawne, typowane teksty do `content/public/website.json`; generator koduje je dla HTML i JSON-LD. Kontakty mają odrębne walidatory. Polecenia, tokeny, ścieżki repo, ceny i dane gości nie są akceptowane.

Brak kopii zachowuje treści bazowe. Puste pola przywracają treść bazową, a wyłączona kopia nie zawiera szkiców. Poprzednio opublikowana kopia pozostaje przy niedostępności nowego źródła. Tytuły i opisy dotyczą wersji polskiej; marka i kontakt są wspólne. Lokal bez istniejącej oferty nie jest tworzony automatycznie.

`update-public-content.mjs` zapisuje wynik, a istniejący publisher dopuszcza wyłącznie nowe publiczne JSON i generowane strony. Nie zmienia się stałej domeny, adresów OTA ani zdjęć. Test `website-settings.test.mjs` obejmuje rzeczywisty import i generator, dane z `<script>`, zachowanie bazowej treści oraz brak dodatkowych żądań sieciowych. Git/CI i wdrożenie Cloudflare mają osobne dowody.

Wycofanie kodu konsumenta przywraca bazowy wygląd; archiwum Git zachowuje wcześniejsze publiczne źródła. Zmiana nie jest potwierdzeniem obecnej konfiguracji profilu PZN ani aktywnego harmonogramu eksportera.
