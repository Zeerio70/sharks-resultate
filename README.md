# Sharks-Resultate für die Homepage

Holt die Spieltage und Resultate der **UHC Sharks Kägiswil/Alpnach** (D-Junioren) von
[rEvolution ZSUV](https://revolution.ildrial.ch/gamedays/D) und veröffentlicht sie als kleine Webseite.
Diese Seite lässt sich in ClubDesk einbetten.

Ablauf: GitHub Actions startet das Skript automatisch. Ein Headless-Browser öffnet die rEvolution-Seite,
wählt den Verein aus und lädt den Kalender-Export (.ics) herunter. Das Skript wertet ihn aus und
veröffentlicht das Ergebnis über GitHub Pages.

Erzeugt werden:

| Datei | Inhalt |
|---|---|
| `index.html` | Anzeige mit Resultaten, nächsten Spieltagen und Saisonbilanz |
| `data.json` | Dieselben Daten maschinenlesbar |
| `kalender.ics` | Kalender zum Abonnieren (Handy, Outlook, Google Kalender) |

## Einrichtung (einmalig, ca. 10 Minuten)

1. **GitHub-Konto** anlegen (gratis) unter https://github.com, am besten für den Verein.
2. **Neues Repository** erstellen, z.B. `sharks-resultate`, Sichtbarkeit **Public**.
   GitHub Pages ist für öffentliche Repositories gratis.
3. **Dateien hochladen:** Im Repository auf «Add file → Upload files» klicken und den ganzen Inhalt
   dieses Ordners hineinziehen. Der Ordner `.github` muss mit, er ist im Explorer oder Finder
   eventuell versteckt. Danach «Commit changes» klicken.
   Falls das Hochladen von `.github` nicht klappt: «Add file → Create new file», als Namen
   `.github/workflows/update.yml` eintippen und den Inhalt der Datei hineinkopieren.
4. **GitHub Pages einschalten:** Settings → Pages → bei «Source» **GitHub Actions** wählen.
5. **Ersten Lauf starten:** Reiter «Actions» → «Resultate aktualisieren» → «Run workflow».
   Nach 1–2 Minuten ist die Seite online unter
   `https://<github-name>.github.io/sharks-resultate/`

Danach läuft alles automatisch: täglich um ca. 06:17 bzw. 07:17 Uhr und an Samstagen und Sonntagen
zusätzlich am Abend.

## In ClubDesk einbinden

Auf der Teamseite im Website-Editor ein Inhaltselement für **HTML / eigenen Code** einfügen und
diese Zeile hineinsetzen (`<github-name>` ersetzen):

```html
<iframe src="https://<github-name>.github.io/sharks-resultate/" style="width:100%;height:900px;border:0" title="Resultate Sharks"></iframe>
```

Varianten:

- Nur Resultate: `.../sharks-resultate/?nur=resultate`
- Nur kommende Spieltage: `.../sharks-resultate/?nur=kommend`

Falls ClubDesk kein HTML-Element anbietet, kann man stattdessen einfach auf die Seite verlinken.

**Kalender-Abo:** Die Adresse `https://<github-name>.github.io/sharks-resultate/kalender.ics` kann
man im Handy-, Outlook- oder Google-Kalender als Abo hinzufügen. Eltern sehen die Spieltage dann
automatisch, inklusive Paarungen und Resultaten.

## Anpassen

In `src/config.js`: Vereinsname, Titel und Akzentfarbe (`accent`, z.B. die Vereinsfarbe).
Für die nächste Saison oder eine andere Stufe die `url` anpassen (z.B. `.../gamedays/E`).

## Wenn es nicht mehr funktioniert

Bricht ein Lauf ab, schickt GitHub eine E-Mail. Die Seite zeigt dann weiterhin den letzten Stand.
Meist hat sich die rEvolution-Seite geändert, und das Skript (`src/build.js`) muss angepasst werden.

Lokal testen (Node.js 22 nötig):

```bash
npm install
npx playwright install chromium
npm run build
```

Danach `site/index.html` im Browser öffnen.

## Hinweis

Die Daten stammen von rEvolution ZSUV. Bitte den Betreiber informieren, dass sie so abgerufen
werden: 2–3 Abrufe pro Tag, nur der Kalender-Export des eigenen Vereins.
