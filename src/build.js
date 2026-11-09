// Holt den Kalender-Export (.ics) des Vereins von rEvolution ZSUV,
// wertet ihn aus und schreibt site/index.html, site/data.json und site/kalender.ics.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const cfg = require('./config');

async function fetchIcs() {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();
    await page.goto(cfg.url, { waitUntil: 'networkidle', timeout: 60000 });
    // Blazor braucht nach dem Laden einen Moment, bis die Seite bedienbar ist
    await page.waitForTimeout(3000);

    // Filter "Verein" öffnen und den Verein wählen
    await page.locator('.mud-select').first().click();
    const item = page.locator('.mud-list-item').filter({ hasText: cfg.club }).first();
    await item.waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    await item.click();
    // Warten, bis der Verein im Filter gesetzt ist
    await page.waitForFunction(() => {
      const i = document.querySelector('.mud-select input');
      return i && i.value !== '';
    }, null, { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Kalender-Export auslösen und Download abfangen
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.locator('button[aria-label*="Kalender"]').first().click(),
    ]);
    const file = await download.path();
    return fs.readFileSync(file, 'utf8');
  } finally {
    await browser.close();
  }
}

// --- ICS auswerten --------------------------------------------------------

function parseIcs(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') ev = {};
    else if (line === 'END:VEVENT') { events.push(ev); ev = null; }
    else if (ev) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const key = line.slice(0, i).split(';')[0];
      ev[key] = line.slice(i + 1)
        .replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
    }
  }
  return events;
}

const isUs = (name) => name.includes(cfg.teamMatch);

// "09:00 [1] Team A - Team B 3:9" – Teamnamen können selbst " - " enthalten,
// darum wird die Trennstelle gewählt, an der eine Seite das eigene Team ist.
function parseGame(line) {
  const m = line.match(/^(\d{1,2}:\d{2}) \[(\d+)\] (.+?)(?: (\d+):(\d+))?$/);
  if (!m) return null;
  const [, time, field, pairing, hs, as] = m;
  const parts = pairing.split(' - ');
  let home = null, away = null;
  for (let i = 1; i < parts.length; i++) {
    const h = parts.slice(0, i).join(' - ');
    const a = parts.slice(i).join(' - ');
    if (isUs(h) || isUs(a)) { home = h; away = a; break; }
  }
  if (home === null) { home = parts[0]; away = parts.slice(1).join(' - '); }
  const g = { time, field: Number(field), home, away, homeGoals: null, awayGoals: null, result: null };
  if (hs !== undefined) {
    g.homeGoals = Number(hs);
    g.awayGoals = Number(as);
    const usHome = isUs(home);
    const our = usHome ? g.homeGoals : g.awayGoals;
    const their = usHome ? g.awayGoals : g.homeGoals;
    g.result = our > their ? 'S' : our < their ? 'N' : 'U';
  }
  return g;
}

function toGameday(ev) {
  const d = ev.DTSTART.match(/(\d{4})(\d{2})(\d{2})/);
  const desc = ev.DESCRIPTION || '';
  const games = desc.split('\n').map(parseGame).filter((g) => g && (isUs(g.home) || isUs(g.away)));
  const organizer = (desc.match(/Organisator: (.*)/) || [])[1] || '';
  return {
    date: `${d[1]}-${d[2]}-${d[3]}`,
    title: ev.SUMMARY || '',
    final: /final/i.test(ev.SUMMARY || ''),
    location: ev.LOCATION || '',
    organizer,
    pairingsOpen: /noch nicht fest/i.test(desc),
    games,
  };
}

// --- HTML erzeugen --------------------------------------------------------

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
};
const team = (n) => (isUs(n) ? `<strong>${esc(n)}</strong>` : esc(n));

function gameRow(g) {
  const score = g.homeGoals === null ? '<span class="score open">–:–</span>'
    : `<span class="score">${g.homeGoals}:${g.awayGoals}</span>`;
  const badge = g.result ? `<span class="badge ${g.result}">${g.result}</span>` : '<span class="badge"></span>';
  return `<li class="game"><span class="time">${esc(g.time)}</span>`
    + `<span class="teams">${team(g.home)} <span class="vs">–</span> ${team(g.away)}</span>${score}${badge}</li>`;
}

function gamedayCard(gd) {
  const body = gd.games.length
    ? `<ul>${gd.games.map(gameRow).join('')}</ul>`
    : `<p class="muted">${gd.pairingsOpen ? 'Paarungen folgen ca. 12 Tage vor dem Spieltag.' : 'Keine Spiele.'}</p>`;
  return `<article class="day"><header><span class="date">${fmtDate(gd.date)}</span>`
    + `${gd.final ? '<span class="tag">Final</span>' : ''}`
    + `<span class="loc">${esc(gd.location)}</span></header>${body}</article>`;
}

function renderHtml(data) {
  const played = data.gamedays.filter((g) => g.games.some((x) => x.result)).reverse();
  const upcoming = data.gamedays.filter((g) => !g.games.some((x) => x.result) && g.date >= data.today);
  const all = data.gamedays.flatMap((g) => g.games).filter((g) => g.result);
  const n = (r) => all.filter((g) => g.result === r).length;
  const updated = new Date(data.updated).toLocaleString('de-CH', { timeZone: 'Europe/Zurich', dateStyle: 'short', timeStyle: 'short' });

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sharks Resultate</title>
<style>
:root { --accent: ${cfg.accent}; --text: #1d2330; --muted: #6b7280; --line: #e5e7eb; --bg: #ffffff; --card: #f8fafc;
  --win: #15803d; --loss: #b91c1c; --draw: #a16207; }
* { box-sizing: border-box; }
body { margin: 0; padding: 12px; font: 15px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--text); background: var(--bg); }
h1 { font-size: 18px; margin: 0 0 4px; }
h2 { font-size: 15px; margin: 20px 0 8px; color: var(--accent); text-transform: uppercase; letter-spacing: .04em; }
.summary { color: var(--muted); font-size: 13px; margin: 0; }
.day { background: var(--card); border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; }
.day header { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; margin-bottom: 4px; }
.date { font-weight: 600; }
.loc { color: var(--muted); font-size: 13px; }
.tag { background: var(--accent); color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 3px; }
ul { list-style: none; margin: 0; padding: 0; }
.game { display: grid; grid-template-columns: 44px 1fr auto 24px; gap: 8px; align-items: center; padding: 4px 0; border-top: 1px solid var(--line); }
.game:first-child { border-top: 0; }
.time { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.vs { color: var(--muted); }
.score { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.score.open { color: var(--muted); font-weight: 400; }
.badge { width: 22px; height: 22px; border-radius: 50%; color: #fff; font-size: 12px; font-weight: 700; display: grid; place-items: center; }
.badge.S { background: var(--win); } .badge.N { background: var(--loss); } .badge.U { background: var(--draw); }
.muted { color: var(--muted); margin: 2px 0; font-size: 14px; }
footer { margin-top: 16px; font-size: 12px; color: var(--muted); }
footer a { color: var(--accent); }
body.nur-resultate #kommend, body.nur-kommend #resultate { display: none; }
@media (max-width: 420px) { .game { grid-template-columns: 38px 1fr auto 22px; gap: 6px; font-size: 14px; } }
</style>
</head>
<body>
<script>
  // ?nur=resultate oder ?nur=kommend zeigt nur einen Teil an
  var nur = new URLSearchParams(location.search).get('nur');
  if (nur) document.body.classList.add('nur-' + nur);
</script>
<h1>${esc(cfg.title)}</h1>
<p class="summary">Saisonbilanz: ${all.length} Spiele · ${n('S')} Siege · ${n('U')} Unentschieden · ${n('N')} Niederlagen</p>

<section id="resultate">
<h2>Resultate</h2>
${played.length ? played.map(gamedayCard).join('\n') : '<p class="muted">Noch keine Resultate.</p>'}
</section>

<section id="kommend">
<h2>Nächste Spieltage</h2>
${upcoming.length ? upcoming.map(gamedayCard).join('\n') : '<p class="muted">Keine weiteren Spieltage.</p>'}
</section>

<footer>
Stand: ${esc(updated)} · Quelle: <a href="${esc(cfg.url)}" target="_blank" rel="noopener">rEvolution ZSUV</a> · Ohne Gewähr ·
<a href="kalender.ics">Kalender (.ics)</a>
</footer>
</body>
</html>
`;
}

// --- Ablauf ---------------------------------------------------------------

(async () => {
  const icsArg = process.argv[2]; // optional: lokale .ics-Datei statt Abruf (zum Testen)
  const ics = icsArg ? fs.readFileSync(icsArg, 'utf8') : await fetchIcs();
  const events = parseIcs(ics);
  if (!events.length) throw new Error('Keine Spieltage im Kalender-Export gefunden – hat sich die Seite geändert?');

  const gamedays = events.map(toGameday).sort((a, b) => a.date.localeCompare(b.date));
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich' }).format(new Date());
  const data = { team: cfg.club, source: cfg.url, updated: new Date().toISOString(), today, gamedays };

  fs.mkdirSync(cfg.outDir, { recursive: true });
  fs.writeFileSync(path.join(cfg.outDir, 'data.json'), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(cfg.outDir, 'kalender.ics'), ics);
  fs.writeFileSync(path.join(cfg.outDir, 'index.html'), renderHtml(data));
  const games = gamedays.reduce((s, g) => s + g.games.length, 0);
  console.log(`OK: ${gamedays.length} Spieltage, ${games} Spiele -> ${cfg.outDir}/`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
