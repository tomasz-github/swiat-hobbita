# Pieśń o Samotnej Górze — Końska Przygoda 3D

Trójwymiarowa gra przygodowa w świecie Hobbitów z jazdą konną w stylu *Star Stable*.

## Uruchomienie na GitHub Pages

Repozytorium jest skonfigurowane do automatycznego wdrożenia na **GitHub Pages** za pomocą GitHub Actions (`.github/workflows/deploy.yml` oraz `base: './'` w `vite.config.ts`).

Aby strona działała na Twoim koncie GitHub:
1. Wypchnij kod do gałęzi `main` (lub `master`) na GitHubie.
2. Wejdź w **Settings → Pages** w swoim repozytorium na GitHubie.
3. W sekcji **Build and deployment → Source** wybierz **GitHub Actions**.
4. Po zakończeniu akcji `Deploy to GitHub Pages` gra uruchomi się automatycznie pod adresem `https://<twoj-login>.github.io/<nazwa-repo>/`.

## Sterowanie w grze

- **Obrót kamery myszką**: Przytrzymaj lewy lub prawy przycisk myszy i przeciągnij po ekranie (`Scroll` przybliża/oddala, `R` lub dwuklik resetuje widok).
- **Jazda konna (`WASD` / Strzałki)**:
  - `W` — jazda do przodu (domyślnie przyspiesza do **Galopu**).
  - `1` (Stęp), `2` (Kłus), `3` (Galop), `4` lub przytrzymanie `Shift + W` (**Cwał**).
  - `Spacja` — skok konia.
- **Zsiadanie z konia i obóz**:
  - `G` — zejdź z konia i spaceruj pieszo (lub wsiądź z powrotem).
  - `E` — rozbij obóz (namiot + ognisko) na noc, pogłaszcz liska Felka lub skorzystaj ze stajni.
- **Obrona i mapa**:
  - `Q` lub `F` — Gwiezdny Błysk (odstrasza trolle, orki i gobliny).
  - `M` — pełna mapa krain.
