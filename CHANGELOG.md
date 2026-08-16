# Changelog

Alle nennenswerten Änderungen an DG OS werden hier dokumentiert.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/lang/de/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/):

- **MAJOR** — große Meilensteine / grundlegende Architekturänderungen
- **MINOR** — neue Module oder größere Funktionen
- **PATCH** — Bugfixes, Optimierungen, kleine Verbesserungen

## [0.33.0] — DG OS Assistant: Dauer-Zuhören ("Hey Gomez", hands-free)

Direkte Umsetzung von Daniels beschriebenem Ablauf: "ich steh auf und
sage: Hey Gomez, wie ist der heutige Tag?" — ohne eine Taste zu drücken.
Opt-in-Checkbox "Dauer-Zuhören" im DG OS Assistant.

### Neu (`app.js`, `index.html`)
- `extractQuestionAfterWakeWord()`: erkennt das Wort "Gomez" in einem
  laufend erkannten Sprachstrom und extrahiert alles danach als Frage
  ("Hey Gomez, wie sieht der Markt aus?" → "wie sieht der Markt aus?").
  Ohne das Wake-Word wird der Satz ignoriert — DG OS Assistant reagiert
  nie auf zufälliges Hintergrundgespräch. Eine reine "Gomez"-Aussage ohne
  weiteren Text fragt trotzdem etwas (fällt auf den vollen Transkript-Text
  zurück) statt gar nicht zu reagieren.
- Kontinuierliche `SpeechRecognition` mit automatischem Neustart (die
  meisten Browser stoppen `continuous:true` nach kurzer Stille) — pausiert
  sauber während DG OS selbst spricht, damit der Assistant sich nicht
  selbst als neue Anfrage hört (klassische Feedback-Loop-Falle bei
  Sprachassistenten).
- Fail-safe bei verweigerter Mikrofon-Berechtigung: Dauer-Zuhören schaltet
  sich selbst ab, Status-Text erklärt warum, manuelle Mikrofon-Taste bleibt
  nutzbar (ein beim Debuggen gefundener Bug — die Taste blieb vorher
  dauerhaft deaktiviert, jetzt korrekt gefixt).

### Getestet
Playwright: alle Wake-Word-Extraktionsfälle korrekt (mit/ohne Satzzeichen,
alleinstehendes "Gomez", kein Wake-Word im Satz, leere/null Eingabe),
Mikrofon-Taste wird bei aktivem Dauer-Zuhören korrekt deaktiviert und bei
verweigerter Berechtigung wieder korrekt freigegeben.

### Geänderte Dateien
`app.js`, `index.html`, `package.json`, `CHANGELOG.md`

---

## [0.32.1] — DG OS Assistant: Bias- und Risiko-Fragen

Erweitert den in v0.32.0 gebauten Jarvis-Assistenten (Dashboard = Hauptding,
Telegram nur Hintergrund-Push, laut Daniels expliziter Priorität) um zwei
weitere direkt beantwortbare Fragetypen — Teil der "wie ich analysiere"-
Anforderung, die vorher nur über das volle Briefing erreichbar war.

### Neu (`marketBrain.js`)
- `buildBiasSection()`: Macro-/Trading-Bias direkt abfragbar ("was ist der
  Bias?", "wie ist der Trend?").
- `buildRiskSection()`: Invalidation/SL, R:R pro Target, Position Size
  (immer `MANUAL`) direkt abfragbar ("wie ist mein Risiko?", "R:R?").
- Beide über `answerMarketQuestion()` erreichbar — Dashboard-Jarvis und
  Telegram-Chat nutzen automatisch dieselbe erweiterte Logik.

### Getestet
85 Tests in `test_dg_rules_v1.js` (2 neu), voller End-to-End-Servertest
weiterhin grün.

### Geänderte Dateien
`marketBrain.js`, `package.json`, `CHANGELOG.md`

---

## [0.32.0] — DG OS Assistant: Jarvis-Sprachinterface im Dashboard

Korrektur nach Daniels Rückmeldung: nicht Telegram-Chat, sondern ein
echtes Sprach-/Text-Interface direkt im Dashboard ("Hey Gomez, wie ist
der heutige Tag?"). Neue Karte "DG OS Assistant" — Mikrofon-Button oder
Texteingabe, Antwort erscheint im Log und wird optional vorgelesen.

### Neu (`app.js`, `index.html`, `styles.css`)
- Browser-natives Web Speech API (`SpeechRecognition` für Spracheingabe,
  `SpeechSynthesis` für Vorlesen) — kein Server-Roundtrip, keine Secrets,
  funktioniert sofort nach Deploy. Fällt ehrlich auf reine Text-Eingabe
  zurück, wenn der Browser keine Spracherkennung unterstützt (v.a.
  Safari/iOS) statt eine kaputte Mikrofon-Taste zu zeigen.
- Jede Antwort läuft durch dieselbe `answerMarketQuestion()`
  (`marketBrain.js`, bereits in v0.31.0 für den Telegram-Chat gebaut) —
  eine Wahrheitsquelle für beide Oberflächen, kein LLM-Call, keine
  erfundene Markteinschätzung. Ohne verbundenen Always-On Server
  antwortet der Assistant ehrlich statt zu raten.
- Jarvis-optisch ins bestehende dunkle HUD-Theme eingepasst (pulsierender
  Mikrofon-Button während der Aufnahme, Chat-Log im Karten-Stil).

### Getestet
Playwright-End-to-End-Test: Texteingabe → echte `answerMarketQuestion()`-
Antwort im Log, Eingabefeld wird geleert, kein Konsolenfehler. Die
zugrunde liegende Antwortlogik ist bereits über `test_dg_rules_v1.js`
(77 Tests) abgedeckt — hier neu nur die DOM-Verkabelung geprüft.

### Geänderte Dateien
`app.js`, `index.html`, `styles.css`, `package.json`, `CHANGELOG.md`

---

## [0.31.1] — Proaktives Morgen-Briefing

Ergänzt v0.31.0's reaktiven DG OS Chat um eine proaktive Variante von
Daniels "ich will einfach immer up to date werden" — DG OS schickt
täglich von selbst ein echtes Briefing, ohne dass er fragen muss.

### Neu
- `shouldSendScheduledBriefing()` (`marketBrain.js`): reine Entscheidungs-
  funktion (Europe/Zurich-Zeit), feuert einmal pro Kalendertag ab der
  konfigurierten Uhrzeit — holt eine verpasste Sendezeit (Redeploy/Ausfall)
  am selben Tag nach, sendet aber nie doppelt.
- `server/lib/scheduledBriefingStore.js`: persistiert das letzte Sende-
  Datum, gleiches Muster wie `tradingBrainStore.js`.
- `server/index.js`: 60s-Check, sendet über `generateDGBriefing()` +
  den bestehenden `sendTelegramMessage()`. Komplett aus (kein
  ungefragtes Verhalten), solange `TELEGRAM_MORNING_BRIEFING_TIME` nicht
  gesetzt ist — ehrliches Opt-in, kein Default-An.

### Getestet
83 Tests in `test_dg_rules_v1.js` (6 neu: Zeitfenster-Logik, Tages-Reset,
Opt-in-Verhalten), voller End-to-End-Servertest weiterhin grün.

### Geänderte/neue Dateien
`marketBrain.js`, `server/index.js`, `server/lib/scheduledBriefingStore.js`
(neu), `.gitignore`, `README.md`, `package.json`, `CHANGELOG.md`

---

## [0.31.0] — DG OS Chat: Konversationelle Telegram-Anbindung

Auf Daniels Vision ("ich steh auf und sage: Gomez, wie sieht der aktuelle
Markt aus im Gold?"): ein erster echter Konversations-Layer. Daniel schreibt
dem Telegram-Bot eine Frage, DG OS antwortet mit real berechneten Daten aus
dem DG Trading Brain V1 — kein LLM-Call, keine erfundene Markteinschätzung,
exakt dieselbe Ehrlichkeits-Regel wie überall sonst im System. Push-Alerts
(bestehender Mechanismus) bleiben unverändert zusätzlich bestehen.

### Neu: `answerMarketQuestion()` (`marketBrain.js`)
- Deterministisches Keyword-Routing (kein LLM) auf real bereits vorhandene
  Report-Sektionen: Liquidity, POIs/FVG/Order Blocks, Targets, Entry-
  Status/Signal, News/Fundamental (ehrlich `DATA_SOURCE_NOT_CONNECTED`,
  Kapitel 14 — keine erfundene Einschätzung zur Weltlage), Fallback auf
  das volle Briefing bei unerkannter Frage — nie stille Nicht-Antwort.
- `generateDGBriefing()` intern in wiederverwendbare Sektionen zerlegt
  (`buildLiquiditySection`, `buildRecentEventsSection`, `buildPOISection`,
  `buildTargetsSection`, `buildStatusSection`) — eine Wahrheitsquelle pro
  Sektion für Briefing UND Chat, keine Duplikation.

### Neu: Telegram-Webhook (`server/lib/telegramAssistant.js`, `server/api.js`)
- `POST /api/telegram/webhook` — empfängt eingehende Telegram-Nachrichten,
  antwortet über `answerMarketQuestion()` gegen den echten, aktuellen
  Trading-Brain-Snapshot.
- **Datenschutz: fail closed, nicht fail open.** Ohne konfigurierte
  `TELEGRAM_CHAT_ID` antwortet der Bot niemandem — echte Marktdaten gehen
  nie an einen fremden Chat, der den Bot zufällig findet. Optionaler
  `TELEGRAM_WEBHOOK_SECRET`-Header-Check gegen gefälschte Aufrufe.
- Antwortet Telegram immer mit 200 (auch bei kaputtem Body/Sende-Fehler) —
  Telegram würde eine Nicht-200-Antwort sonst endlos wiederholt zustellen.
- `scripts/setTelegramWebhook.js` — einmaliges Setup-Skript, das Telegram
  die Server-URL mitteilt (README dokumentiert die genauen Schritte).

### Bewusst NICHT gebaut (siehe Ansage an Daniel)
- **Fundamentale/News-Analyse**: braucht eine echte, ggf. kostenpflichtige
  News-/Wirtschaftskalender-Quelle — Daniels Entscheidung, nicht heute
  Nacht autonom festgelegt. Bleibt ehrlich `DATA_SOURCE_NOT_CONNECTED`.
- **Automatisierte Order-Ausführung**: laut Daniel selbst "nur für die
  Zukunft gedacht" — bleibt komplett außen vor, passt zur permanenten
  Regel, dass DG OS nie selbst Trades platziert.

### Getestet
77 Tests in `test_dg_rules_v1.js` (8 neu: Chat-Intent-Routing, ehrliche
Nicht-Antworten), 12 neue Tests in `test_telegram_chat.js` (Privacy-
Fail-Closed, Chat-ID-Filter, Non-Text-Updates, HTTP-Route inkl. Secret-
Header und kaputtem JSON-Body), voller End-to-End-Servertest weiterhin
grün.

### Geänderte/neue Dateien
`marketBrain.js`, `server/api.js`, `server/index.js`,
`server/lib/telegramAssistant.js` (neu), `scripts/setTelegramWebhook.js`
(neu), `README.md`, `package.json`, `CHANGELOG.md`

---

## [0.30.0] — V1 Prioritäten: Liquidity → Sweep → Reaction → FVG/OB → Meldung

Auf Daniels expliziten Auftrag "DG OS – V1 PRIORITÄTEN VEREINFACHEN":
Premium/Discount, komplexes Bias-Scoring und feine POI-Rankings haben keine
Priorität mehr. Höchste Priorität ist jetzt: relevante Liquidity sauber
erkennen → Sweep erkennen → Reaktion danach erkennen → relevante FVGs/Order
Blocks im Kontext zeigen → klar melden. Bestehende Architektur nicht
umgebaut — Priorisierung/Filterung angepasst plus zwei neue, kleine
Zustands-Bausteine (Liquidity Memory, Liquidity-Events), nach demselben
Muster wie das bestehende Active Setup Model.

### DG Liquidity — V1-Prioritätsfilter (`marketBrain.js`)
- `isV1PrimaryLiquidity()`: nur noch Previous/aktuelles Daily High/Low,
  relevante externe Daily/4H Swings und die drei Session-Levels
  (Asia/London/New York High/Low) zählen als primäre Liquidity. Weekly/
  Monthly-Level und H1-Swings bleiben Bias-Kontext, sind aber nie mehr
  Haupt-Liquidity/-Target/-Sweep-Support in V1.
- Neuer Status `APPROACHING` zwischen `OPEN` und `TOUCHED`
  (`LIQUIDITY_APPROACH_PERCENT`), Anzeige-Vokabular jetzt Daniels eigenes:
  OPEN/APPROACHING/TOUCHED/SWEPT.

### Liquidity Memory — Sweep-Persistenz + Reaktionserkennung
- `enrichLiquidityWithMemory()`: ein Sweep wird nur einmal als neu gemeldet
  ("nicht immer wieder als neu melden") — der Status bleibt SWEPT (sticky),
  auch wenn der Preis kurz zurück in die Zone läuft; `sweptAt` wird beim
  ersten echten Beobachtungszeitpunkt gesetzt und danach nie überschrieben.
  Eine neue Periode (z.B. der nächste Handelstag) startet mit einer sauberen
  Weste, keine Vererbung alter Sweeps.
- `detectLiquidityReaction()`: prüft nach jedem relevanten Sweep exakt
  Daniels fünf Kriterien — Rejection, Engulfing, Displacement, BOS/CHOCH,
  neue FVG — auf H1 und liefert `REACTED` oder `NO_REACTION_YET`.
- Zustand wird wie das Active Setup Model serverseitig persistiert
  (`server/marketState.js`, gleiche `tradingBrainState.json`), übersteht
  also einen Railway-Neustart.

### DG Entry (Kapitel 9) — Bias ist Context, kein Gatekeeper mehr
- `computeEntryDecision()` blockiert bei NEUTRAL_MIXED Bias nicht mehr
  automatisch auf WAIT. Liegt in einer der beiden Richtungen ein echter
  Liquidity Sweep + relevanter POI + Reaktion vor, kann WATCH_BUY/
  WATCH_SELL (bis hin zu READY) trotzdem entstehen — beide Richtungen
  werden rein faktenbasiert geprüft, die weiter fortgeschrittene gewinnt.
  MISSED-Erkennung (Kapitel 12) läuft jetzt unabhängig von der aktuellen
  Bias-Richtung.
- `liquiditySweepSupport()`/`computeTargets()`: nur noch primäre Liquidity
  zählt als Sweep-Support bzw. Liquidity-Target; bereits TOUCHED/SWEPT
  Level werden nie erneut als frisches Target behandelt.

### Briefing/Report V1 (`generateDGBriefing`, `generateMarketReport`)
- Neues Format exakt nach Daniels Vorgabe: STATUS / LIQUIDITY (Oben/Unten,
  Status + Swept-At + Reaction pro Level) / RECENT EVENTS (aus echten
  Sweep-/Reaction-Zeitstempeln, keine erfundene Reihenfolge) / RELEVANT
  POIs (Bullish/Bearish) / WAITING FOR.
- FVG/Order-Block-Auswahl im Report jetzt auf Daily/4H/1H begrenzt, frisch,
  mit Priorität für bereits reagierte Zonen und Nähe zum Preis — nicht mehr
  hunderte alte Zonen aller Timeframes.

### Alerts (`events.js`, `app.js`, `index.html`)
- Neue Event-Typen `LIQUIDITY_APPROACHING`, `LIQUIDITY_SWEPT`,
  `LIQUIDITY_REACTED` (source `tradingBrainV1`, eigene Dedupe-Keys/Cooldown,
  nur für primäre Liquidity).
- Alert-Kategorien in der Telegram-Karte neu priorisiert und umbenannt:
  Liquidity (Approaching/Swept/Reaction/POI/Target) jetzt standardmäßig an,
  ebenso Confirmation — passend zu Daniels Prioritätenliste 1–6.

### Getestet
69 Unit-Tests in `test_dg_rules_v1.js` (22 neu: Liquidity-Status/Prioritäts-
filter/Memory/Reaction, Bias-als-Context, SELL_READY-Kette), 23 in
`test_alert_engine.js` (7 neu: Liquidity-Events), vollständiger End-to-End-
Servertest (`test_trading_brain.js`) und Sweep-Reversal-Regressionstest
weiterhin grün. Playwright-Smoke-Test ohne Konsolenfehler.

### Geänderte Dateien
`marketBrain.js`, `events.js`, `server/marketState.js`, `app.js`,
`index.html`, `styles.css`, `package.json`, `CHANGELOG.md`

---

## [0.29.1] — Testabdeckung für alle 8 Kapitel-15-Beispiele komplettiert

Checkpoint 6 der Nacht-Session. Audit der Unit-Tests gegen Daniels eigene
Kapitel-15-Beispiele (`rules/strategy.md`) ergab: 4 von 8 Beispielen hatten
noch keinen expliziten Test (Beispiel 1/2 Valid Buy/Sell, Beispiel 5
Counter-POI as Target, Beispiel 8 No Trade). Beispiel 1 (Valid Buy, volle
BUY_READY-Kette) war bereits abgedeckt, aber ohne explizite Referenz.

### Neu (Tests, nicht Teil des Repos — siehe scratchpad)
- Beispiel 2 (Valid Sell): volle SELL_READY-Kette, symmetrisch zum
  bestehenden BUY_READY-Test — Stop Loss oberhalb des geswepten Levels,
  Entry Zone aus der bestätigenden FVG.
- Beispiel 5 (Counter-POI as Target): bestätigt, dass ein gegenläufiger
  POI zwischen Preis und einem weiter entfernten Liquidity-Level als Target
  berücksichtigt wird (nicht ignoriert) und `hasCounterPOIInPath()` korrekt
  erkennt, wann ein Counter-POI im Pfad liegt (Grundlage für die Prioritäts-
  Reduktion in `computeTargets()`).
- Beispiel 8 (No Trade): mehrere kleine/niedrigqualitative POIs plus
  vorhandener Liquidity Sweep führen weiterhin zu WAIT, nie zu einer
  erzwungenen Trade-Idee.

Kein Code in `marketBrain.js`/`events.js`/`server/` geändert — reiner
Testabdeckungs-Checkpoint, alle 45 Tests (vorher 37) grün.

### Geänderte Dateien
`package.json`, `CHANGELOG.md`

---

## [0.29.0] — Dashboard-Ehrlichkeits-Audit (Phase 4 Nacharbeit)

Checkpoint 5 der Nacht-Session — Fortsetzung nach "AUTONOME NIGHT BUILD".
Gezielter Audit aller Karten auf erfundene/statische Werte, wie in Daniels
"keine erfundene Prozentzahl"-Vorgabe für Phase 4 gefordert.

### Gefunden & behoben (`index.html`, `app.js`)
- Der DG-Confidence-Ring im Hero-Bereich hatte einen fest einprogrammierten
  Startwert `54%` in der HTML-Datei (Rückstand aus der Alpha-Simulation).
  Standard jetzt `—`, keine erfundene Zahl mehr vor der ersten Berechnung.
- **Echter Bug:** Die Alpha-Simulation (`render()`) und die reale Hero-Anzeige
  (`renderHeroAction()`) teilen sich dieselben DOM-Elemente (`#action`,
  `#confidence`, `#tradeType`, `#decisionReason`). Ein Klick auf einen
  Alpha-Simulation-Button überschrieb bisher — auch bei aktiv verbundenem
  Always-On Server — kurzzeitig (bis zu 3s, bis zum nächsten Poll) die echten
  Werte mit simulierten Zahlen, während das Badge weiterhin "LIVE" zeigte.
  Fix: nach jedem Simulation-Klick wird sofort `renderHeroAction()` mit dem
  echten (oder `null`, wenn nicht verbunden) Zustand erneut aufgerufen, sodass
  nie fingierte Werte unter einem "LIVE"-Badge sichtbar sind.
- Vier Legacy-Karten ("Market Plan", "Asia Session", "Liquidity",
  "Confirmation") zeigten Alpha-Simulation-Werte völlig unbeschriftet, sahen
  also wie echte Module aus. Jetzt alle mit dem gleichen `TEST`-Badge markiert
  wie die "Alpha Simulation"-Karte selbst.
- Die "Market Plan"-Karte enthielt außerdem zwei komplett tote, nie von JS
  aktualisierte Felder (`HTF Plan: Bullish`, `Primary Target: Daily Buyside`)
  — fest verdrahtete Fantasiewerte ohne jede Datenquelle. Entfernt.
- Die zwei statischen "Ja"/"H1 OB + M5 FVG"-Checks in der Liquidity-Karte
  (Teil von `computeDecision()`s Platzhalter-Kriterien) sind jetzt explizit
  als "(simuliert)" gekennzeichnet.
- System-Status-Karte und die separate "DG Confidence Engine"-Karte geprüft:
  beide zeigten bereits ehrliche `—`/"Noch keine Daten"-Fallbacks, keine
  Änderung nötig.

### Getestet
`test_dg_rules_v1.js` (37/37 grün, unverändert — reine Logik, nicht
betroffen), Duplicate-ID-Check auf `index.html`, Playwright-Check bestätigt:
(a) unverbunden → Simulation läuft frei unter "SIMULATION"-Badge, (b) mit
simuliertem `marketServerReachable=true`+`tradingBrainState` → Klick auf
Alpha-Simulation-Button ändert die Hero-Anzeige nicht mehr, echte Werte
bleiben unter "LIVE"-Badge sichtbar.

### Geänderte Dateien
`index.html`, `app.js`, `package.json`, `CHANGELOG.md`

---

## [0.28.0] — MISSED/NO_ENTRY Status (Kapitel 12)

Checkpoint 4 der Nacht-Session — schließt die im letzten Abschlussbericht
explizit genannte Lücke.

### Neu (`marketBrain.js`, `events.js`, `server/marketState.js`)
- `computeEntryDecision()` bekommt einen optionalen 5. Parameter `priorSetupContext` (das vom Server persistierte Active Setup) — die einzige Möglichkeit, MISSED überhaupt zu erkennen, da die Funktion sonst zustandslos ist. Ohne diesen Parameter (Browser, Tests) kann MISSED nie auftreten — ehrliche Konsequenz fehlender Historie, kein Bug.
- `detectMissedMove()`: MISSED feuert nur, wenn ein Setup bereits mindestens BUY_CONFIRMATION/SELL_CONFIRMATION/BUY_READY/SELL_READY erreicht hatte UND der Preis sich seitdem um eine volle Zonenhöhe vom verpassten POI wegbewegt hat, ohne dass ein neuer Kandidat existiert — mechanische, offengelegte Distanzregel (dokumentiert als eigene V1-Entscheidung, keine Daniel-Zahl), passend zu Kapitel 12: "Markt ist ohne sinnvollen Entry gelaufen."
- `server/marketState.js` reicht das vorherige Active Setup jetzt bei jeder Neuberechnung durch; `events.js` feuert ein neues `MISSED`-Event bei diesem Übergang (nie durch das Cooldown-Fenster unterdrückt, da inhärent einmalig — `buildActiveSetup()` räumt den Zustand danach automatisch ab).
- Dashboard/Telegram: `MISSED` in allen Status-Label-Zuordnungen (Hero-Karte, Briefing-Headline, Alert-Kategorien) ergänzt.

### Getestet
7 neue Unit-Tests (MISSED-Erkennung, Abstandsgrenze, zustandslose Aufrufer bekommen nie MISSED, ein reines WATCH qualifiziert nicht, Event-Emission, Active-Setup-Clearing) — alle grün. Bestehende Regressionstests unverändert grün.

### Geänderte Dateien
`marketBrain.js`, `events.js`, `server/marketState.js`, `app.js`, `index.html`, `package.json`, `CHANGELOG.md`

---

## [0.27.0] — Echte Event-basierte Telegram-Alerts + Alert-Einstellungen

Checkpoint 3 der Nacht-Session. DG OS meldet jetzt wichtige Veränderungen
selbstständig an Telegram — zentral für Daniels Vision ("informiere mich,
auch wenn ich nicht am Chart bin").

### Neu (`app.js`, `index.html`)
- Live-Alerts-Sektion in der Telegram-Karte: 5 Kategorie-Checkboxen (BUY/SELL READY, Confirmation, WATCH BUY/SELL, POI-Nähe/Target erreicht, System-/Datenprobleme), Zustand pro Checkbox in `localStorage` persistiert. Default konservativ (nur READY + System aktiv), wie von Daniel explizit gefordert.
- `pollAndSendEventAlerts()`: läuft im bestehenden Poll-Takt (`pollMarketServer()`), holt `/api/events/XAUUSD`, filtert auf `source:'tradingBrainV1'` + aktivierte Kategorien, sendet neue (noch nicht gesehene) Events als kurze Telegram-Nachricht. Eigenständiger Mechanismus, komplett getrennt vom Alpha-Simulation-Auto-Send.
- Client-seitiges Dedup (`localStorage`, gedeckelt auf 300 Einträge) zusätzlich zum bereits serverseitig gedeckelten Cooldown (v0.26.0) — übersteht auch einen Seiten-Reload ohne Doppel-Alerts.

### Getestet
Dashboard gegen echten Server per Playwright geprüft — Checkboxen zeigen korrekte konservative Defaults, keine JS-Fehler. Bestehende Regressionstests weiterhin grün.

### Geänderte Dateien
`app.js`, `index.html`, `package.json`, `CHANGELOG.md`

---

## [0.26.0] — Event/Alert Engine V1 + Active Setup Model (Market Memory)

Checkpoint 2 der Nacht-Session. DG Trading Brain V1 wird jetzt auf jeder
Brain-Änderung neu berechnet (nicht mehr nur bei API-Anfragen), gegen den
vorherigen Zustand gediffed und persistiert — DG OS "vergisst" ein
laufendes Setup nicht mehr bei einem Railway-Restart.

### Neu
- `server/lib/tradingBrainStore.js`: persistiert Entry Status + Active Setup nach `state/tradingBrainState.json` auf dem bestehenden Railway Volume (nicht git-getrackt, wie `data/`).
- `events.js`: `classifyTradingBrainEvents()` + `buildActiveSetup()` — neue, vom Legacy-Event-Pipeline getrennte Diff-Logik (Tag `source:'tradingBrainV1'`) für die Kapitel-9-Statuswechsel (WATCH_BUY/WATCH_SELL/BUY_CONFIRMATION/SELL_CONFIRMATION/BUY_READY/SELL_READY/SETUP_INVALIDATED/DATA_NOT_READY/SYSTEM_RECOVERED), Confirmation-Fortschritt (REACTION_DETECTED→…→STRUCTURE_CONFIRMED, nur vorwärts, nur am selben POI), `IMPORTANT_POI_APPROACHING` (SYSTEM_THRESHOLD, keine DG-Regel, klar so gekennzeichnet) und `PRIMARY_TARGET_REACHED`. Jedes Event trägt type/timestamp/symbol/direction/timeframe/price/relatedPoi/significance/explanation/dedupeKey.
- Alert-Fatigue-Schutz: Status- und Approach-Events haben eine 60s-Cooldown, damit kurzfristig zappelnder Preis nicht WATCH_BUY/SETUP_INVALIDATED im Sekundentakt spammt — BUY_READY/SELL_READY werden davon nie unterdrückt.
- `server/marketState.js`: `_recomputeTradingBrain()` läuft bei jeder Brain-Änderung (gleicher Trigger wie die bestehende Legacy-Diff-Logik), `getTradingBrain()` liefert jetzt den konsistenten gecachten Stand inkl. `activeSetup` statt bei jeder Anfrage neu (und aus dem Nichts) zu rechnen.

### Bugfix
- `getTradingBrain()`s Fallback-Pfad (vor der ersten Brain-Änderung) berechnete den Trading Brain zwar frisch, aktualisierte aber `activeSetup` nicht mit — dadurch konnte die API einen WATCH_BUY-Status mit `activeSetup: null` zurückgeben. Behoben, indem der Fallback denselben Pfad wie jede andere Neuberechnung nutzt.

### Getestet
16 neue Unit-Tests (Cold Start, Übergänge, Cooldown-Unterdrückung, „BUY_READY nie unterdrückt", Confirmation-Fortschritt nur vorwärts, DATA_NOT_READY/SYSTEM_RECOVERED, Active-Setup-Regeln, Persistenz-Round-Trip) — alle grün. Live gegen echten Server verifiziert: vor dem Fix Status-Flapping alle paar Sekunden, danach nur noch reale Übergänge; Restart-Test bestätigt, dass Setup-Status nach Neustart erhalten bleibt. Bestehende Regressionstests (End-to-End Trading Brain, Sweep/Reversal, Initial-Fetch-Retry) weiterhin grün.

### Geänderte Dateien
`events.js`, `server/marketState.js`, `server/lib/tradingBrainStore.js` (neu), `.gitignore`, `package.json`, `CHANGELOG.md`

---

## [0.25.0] — Decision Summary, echter DG Report, Live-Dashboard

Erster Checkpoint der Nacht-Session (Autonomous Night Build, Daniels
Auftrag): Trading Brain V1 aus v0.24.0 bekommt jetzt einen sauberen
Decision-Block, einen echten trader-tauglichen Report-Text und wird
tatsächlich im Dashboard/Briefing/Telegram angezeigt statt der alten
Alpha-Simulationswerte.

### Neu (`marketBrain.js`)
- `brain.decision` — flacher Summary-Block (`status`, `direction`, `macroBias`, `tradingBias`, `primaryPoi`, `confirmation`, `entryZone`, `invalidation`, `targets`, `riskReward`, `missingRequirements`, `reasons`). Reine Zusammenfassung bereits berechneter Felder, keine neue Logik.
- `generateDGBriefing(brain, now)` — deterministischer, kompakter Report-Text (Begrüßung nach Tageszeit in Europe/Zurich, Market Status, HTF, Liquidity, Top Buy/Sell Areas, Current Scenario, Waiting For, Targets, Invalidation, Why). Ausschließlich aus bereits berechneten Market Facts/DG-Regeln zusammengesetzt, keine erfundene Analyse.

### Dashboard (`app.js`, `index.html`, `styles.css`)
- Hero-Karte „Aktuelle Handlung" zeigt jetzt den echten Entry Status (`brain.decision`) inkl. Badge LIVE/SIMULATION, sobald ein Always-On Server verbunden ist — ohne Server bleibt die bisherige Alpha-Simulation als Demo aktiv, jetzt klar als TEST gekennzeichnet.
- „DG Briefing anzeigen" und „An Telegram senden" nutzen ab sofort ausschließlich `generateDGBriefing()` — keine Alpha-/Fake-Werte mehr in einem Report, der real gesendet werden kann.
- Alpha-Simulation-Karte trägt jetzt einen sichtbaren TEST-Badge und einen Hinweistext, dass sie nur ohne verbundenen Server die Hero-Karte steuert.

### Getestet
Bestehende 30 Unit-Tests weiterhin grün; End-to-End-Test gegen echten Server weiterhin grün; Dashboard gegen echten Server per Playwright geprüft — Hero-Karte zeigt live „WATCH BUY" mit LIVE-Badge, Briefing-Text zeigt reale Kurse/POIs/Liquidity.

### Geänderte Dateien
`marketBrain.js`, `app.js`, `index.html`, `styles.css`, `package.json`, `CHANGELOG.md`

---

## [0.24.0] — DG Trading Brain V1: alle 17 Kapitel implementiert

Daniel hat alle 17 Kapitel von `rules/strategy.md` in einer Session direkt
diktiert. Dieser Build implementiert die Regelanwendung für die 14 davon,
die auf ein echtes Laufzeitmodul abbilden (Philosophy/Examples/Edge Cases
sind reine Referenzkapitel ohne eigenständiges Modul). `DG_RULES_DEFINED`
ist jetzt für diese 14 Kapitel `true`.

### Neu / Geändert (`marketBrain.js`, Modul 11)
- **DG HTF Bias** (Kapitel 1): Macro (Monthly/Weekly) und Trading (Daily/4H) getrennt bewertet, je eine offengelegte Confluence-Abstimmung (Struktur + Premium/Discount + Liquidity-Sweeps + frische POIs) statt einer erfundenen Gewichtungsformel. Keine erfundene Confidence-Zahl.
- **DG Liquidity** (Kapitel 2): neues `relevance`-Feld pro Level (Score + Tier `low/medium/high`) nach Daniels expliziter Vorgabe — externe Struktur-Swings + HTF vor internen/LTF, zusätzliche Relevanz durch Equal-Level- und POI-Nähe. Keine neue Swing-Erkennung — nutzt die bestehende Structure Engine unverändert.
- **DG Premium/Discount** (Kapitel 3): Range kommt jetzt aus dem jüngsten externen Struktur-Swing-High/Low statt aus dem vollen Kerzen-Fenster; zusätzlich OTE-(0.68-0.78) und Deep-(0.85-0.89) Fibonacci-Zonen.
- **DG Order Block / Valid FVG / Breaker / Inverse FVG** (Kapitel 4/5/6/7): reales Confluence-Score-Ranking (`score`/`quality`) nach den in den Kapiteln genannten Faktoren; 65%-Mitigations-Richtwert für Order Blocks; OPEN/PARTIALLY/FULLY-MITIGATED-Status für FVGs. `detectBreakers()`/`detectInverseFairValueGaps()` sind jetzt echte Detektoren (vorher Stubs) und in die Multi-Timeframe-POI-Pipeline eingebunden.
- **DG Confirmation** (Kapitel 8): prüft 15M-Kerzen nach einer POI-Reaktion auf Engulfing/Structure-Shift/Rejection — alle 5 Zustände (NO_CONFIRMATION bis STRUCTURE_CONFIRMED) erreichbar.
- **DG Entry** (Kapitel 9): echte Zustandsmaschine (WAIT/WATCH_BUY/WATCH_SELL/BUY_CONFIRMATION/SELL_CONFIRMATION/BUY_READY/SELL_READY) aus Bias + Liquidity-Sweep + POI-Qualität + Confirmation. Entry Zone kommt aus der bestätigenden FVG, Stop Loss liegt hinter dem stützenden Sweep — nie automatische Order-Ausführung.
- **DG Exit/Targets** (Kapitel 10): reale PRIMARY/SECONDARY/EXTENDED-Priorität nach Timeframe-Rang, Bias-Übereinstimmung, Distanz und Counter-POI-Kontext.
- **DG Risk Management** (Kapitel 11): R:R wird arithmetisch berechnet, sobald ein echtes BUY_READY/SELL_READY-Setup existiert; `positionSize` bleibt immer die Konstante `'MANUAL'`.
- **DG No-Trade Rules** (Kapitel 12): WAIT-Zustände + `DATA_NOT_READY`-Override, wenn ein HTF-Kern-Timeframe fehlt.
- **DG Sessions** (Kapitel 13): informative Sweep-Notizen (z. B. "Asia Low gesweept"), nie eine Handelsregel.
- **DG News** (Kapitel 14): `NEWS_STATUS = 'DATA_SOURCE_NOT_CONNECTED'` — Daniels eigene V1-Antwort, keine Annahme.
- HTF-Kontext erweitert um Monthly (Macro Bias) und 15M (nur für Confirmation).

### Dashboard (`app.js`, `index.html`, `styles.css`)
- „DG Trading Brain V1"-Karte zeigt jetzt reale Werte statt `AWAITING_DG_RULE`: farbcodierter Entry Status, Macro/Trading Bias, POI-Qualität mit Score, Target-Priorität, neuer Entry/Risk-Block (Entry Zone, Stop Loss, R:R) sowie Sessions/News-Hinweise.

### Getestet
30 neue Unit-Tests direkt gegen die einzelnen Regel-Funktionen (Bias-Gruppierung, POI-Qualität, alle 5 Confirmation-Zustände, vollständige Entry-Kette bis BUY_READY inkl. Kapitel-15-Beispielszenarien 3/4/7); bestehender End-to-End-Test gegen den echten Server aktualisiert und grün (reale Werte statt der alten Gating-Assertions); Sweep/Reversal- und Initial-Fetch-Retry-Regressionstests unverändert grün; Dashboard-Karte per Playwright gegen den echten Server geprüft.

### Geänderte Dateien
`marketBrain.js`, `app.js`, `index.html`, `styles.css`, `CLAUDE.md`, `package.json`, `CHANGELOG.md`

---

## [0.23.1] — DG Trading Brain V1: Interpretation-Ebene ehrlich gegated

Korrektur an v0.23.0, noch vor Produktionsverifikation: die POI-Score-,
HTF-Bias- und Report-Status-Logik aus dem ersten V1-Build war generische
SMC/ICT-artige Interpretation — genau das, was die dauerhafte Projektregel
„DG-Methodik" verbietet, solange die zugehörigen Kapitel in
`rules/strategy.md` TODO sind. Auf Daniels explizite Anweisung umgebaut:
Market Facts bleiben vollständig echt, aber jedes Interpretation-Ergebnis
ist jetzt ehrlich `AWAITING_DG_RULE`, solange die passende Regel fehlt.

### Geändert
- `marketBrain.js`: `computeOverallBias()` liefert `overallBias: 'AWAITING_DG_RULE'`, `confidence: null`, solange `DG_RULES_DEFINED.htfBias` `false` ist (aktuell immer) — `reasoning` listet weiterhin die rohen Fakten (Struktur/Premium-Discount/Sweeps je Timeframe) als Kontext, ohne sie zu einem Bias zu verdichten.
- `rankPOI()` liefert `score: null, quality: 'AWAITING_DG_RULE'`, solange Kapitel 4 (DG Order Block) bzw. 5 (DG Valid FVG) TODO sind — `reasons` bleibt die gleiche Fakten-Liste wie vorher, nur ohne Punktevergabe.
- `computeTargets()`: `priority` ist jetzt `'AWAITING_DG_RULE'` statt einer erfundenen Timeframe-Gewichtung; die Kandidatenliste selbst (welches Level über/unter dem Preis liegt) bleibt ein reiner, geometrischer Fakt.
- `generateMarketReport()`: `status` ist immer `'AWAITING_DG_RULE'` (nie mehr WAIT/WATCH BUY/WATCH SELL/BULLISH/BEARISH SCENARIO, solange kein Kapitel definiert ist); `bestBuyPOIs`/`bestSellPOIs`/`keyLiquidity` umbenannt zu `freshBullishPOIs`/`freshBearishPOIs`/`notableLiquidity` — ungewichtete Fakten-Listen statt einer impliziten "beste/wichtigste"-Bewertung.
- Neues Feld `awaitingDgRule` im `/api/brain/XAUUSD`-Output — maschinenlesbare Liste, welche `rules/strategy.md`-Kapitel aktuell gaten.
- `rules/strategy.md`: die in v0.23.0 hinzugefügten 🟡 V1-DRAFT-Inhalte (Kapitel 1-5) vollständig zurückgenommen — diese Datei bleibt ausschließlich Daniels eigener Text, nie aus einem Build-Prompt übernommener Inhalt. Alle 17 Kapitel wieder 🔴 TODO. Die Modul-Zuordnungstabelle beschreibt weiterhin akkurat, welche Fakten-Engine existiert, ohne eine Regel zu behaupten.
- Dashboard-Karte „DG Trading Brain V1": zeigt `AWAITING_DG_RULE`-Felder jetzt im gleichen gedämpften Stil wie die bestehende DG-Confidence-Karte für „fehlend" — keine bullish/bearish-Einfärbung mehr ohne echte Regel dahinter.

### Getestet
Alle Assertions aus dem v0.23.0-Testlauf auf die neue Gating-Logik umgeschrieben und erneut grün: `overallBias`/`score`/`priority`/`status` sind durchgängig `AWAITING_DG_RULE`/`null`, nirgends ein fabriziertes bullish/bearish/neutral im JSON-Output; Market Facts (Struktur, Liquidity, Premium/Discount, FVG/OB-Erkennung) unverändert real; Regressionstests (Sweep/Reversal, Initial-Fetch-Retry) weiterhin grün; Dashboard-Karte per Playwright im verbundenen Zustand geprüft.

### Geänderte Dateien
`marketBrain.js`, `app.js`, `index.html`, `styles.css`, `rules/strategy.md`, `package.json`, `CHANGELOG.md`

---

## [0.23.0] — DG Trading Brain V1

Erster Ausbau der eigentlichen Trading-Logik, direkt aus Daniels "DG TRADING
BRAIN V1"-Prompt umgesetzt (Funktion statt Perfektion, keine unnötigen
Architektur-Umbauten, bestehende Infrastruktur beibehalten). Alles unten ist
ausdrücklich **V1-Entwurf**, keine finalen DG-Regeln — siehe die neuen
🟡 V1 DRAFT-Kapitel in `rules/strategy.md`.

### Neu
- **Modul 11 „DG Trading Brain V1"** in `marketBrain.js` — HTF Context (Weekly → Daily → 4H → 1H), Structure/FVG/Order Block jetzt pro Timeframe statt nur H1, POI Ranking (Score 0-100, regelbasiert, nachvollziehbar), Targets-Engine, Market Report. Nutzt ausschließlich die bereits bestehenden Detektoren (`detectStructure`/`detectFairValueGaps`/`detectOrderBlocks`, jetzt mit Timeframe-Parameter statt hartem `'H1'`) — keine zweite parallele Engine.
- **`GET /api/brain/XAUUSD`** (`server/api.js`) — liefert `{symbol, timestamp, htfContext, structure, liquidity, premiumDiscount, pois, targets, report, status}`. Bestehende Endpoints unverändert.
- **Neue Karte „DG Trading Brain V1"** im Dashboard (`index.html`/`app.js`) — HTF Bias, Status, Top Buy/Sell POIs, Key Liquidity, Targets, Market-Report-Zusammenfassung. Nur mit verbundenem Always-On Server sichtbar; ohne Verbindung ehrlich "Nicht verbunden", keine Fake-Zahlen.
- **`rules/strategy.md`**: neuer Status 🟡 V1 DRAFT; Kapitel 1 (DG HTF Bias), 2 (DG Liquidity), 3 (DG Premium/Discount), 4 (DG Order Block), 5 (DG Valid FVG) mit dem tatsächlich in Daniels Prompt definierten V1-Inhalt gefüllt, offene Punkte klar als "noch offen" markiert. Alle anderen Kapitel bleiben unverändert 🔴 TODO.

### Bewusst NICHT gebaut (wie von Daniel vorgegeben)
Keine Trade-Ausführung, keine Entry-Automation, keine Risk-Engine, keine News-Engine, kein M1/M5-System, kein BUY/SELL READY — Status bleibt bei WAIT/WATCH BUY/WATCH SELL/BULLISH SCENARIO/BEARISH SCENARIO.

### Bekannte Lücken in V1 (ehrlich benannt, nicht erfunden)
- Equal Highs/Equal Lows fehlen in der Liquidity — kein Detector vorhanden.
- "Schwache Reaktion" als POI-Ranking-Negativfaktor nicht umgesetzt — `detectZoneReaction()` liefert nur ja/nein, keine Stärke.
- "Nächstes relevantes HTF Target" fließt nur als Kontext in die Bias-Begründung ein, nicht als Score-Faktor — keine nicht-willkürliche Regel dafür vorhanden.

### Getestet (lokal, gegen Mock-TwelveData REST/WebSocket + echten Browser)
Alle 4 HTF-Timeframes liefern echte Kontextdaten; FVG/Orderblock pro Timeframe; POI-Score 0-100 mit nachvollziehbaren `reasons`; Targets vorhanden; Report wird erzeugt, Status einer der 5 erlaubten Werte; keine BUY/SELL-READY-Sprache irgendwo in der Ausgabe; bestehender WebSocket bleibt `streaming`; Event-Pipeline unverändert erreichbar; Persistence-Flush weiterhin aktiv; bestehende APIs (`/api/health`, `/api/market/XAUUSD`, `/api/events/XAUUSD`) unverändert funktionsfähig; Dashboard-Karte per Playwright im verbundenen und nicht-verbundenen Zustand geprüft, keine Konsolenfehler, reale Daten sichtbar.

### Geänderte Dateien
`marketBrain.js`, `server/api.js`, `app.js`, `index.html`, `styles.css`, `rules/strategy.md`, `package.json`, `CHANGELOG.md`

---

## [0.22.1] — Initial-Fetch-Zuverlässigkeit nach Railway-Deployment

Gefunden bei der Produktions-Persistenz-Verifikation nach dem ersten echten Railway-Restart: `/api/health` zeigte nach dem Neustart nur 3 von 7 Timeframes (`15min`, `30min`, `1h`) — Monthly/Weekly/Daily/4H fehlten. `/api/market/XAUUSD` bestätigte den Effekt: `premiumDiscount.daily/weekly/monthly` und `htfBias` waren `null`.

### Root Cause
Der initiale Fetch beim Serverstart (`server/index.js`) feuerte 8 TwelveData-Requests (1 Quote + 7 Kerzen-Timeframes) in ~2,4s (300ms Abstand) — vermutlich zu schnell für das TwelveData-Rate-Limit. Ein fehlgeschlagener Request wurde nur geloggt, nie wiederholt: das betroffene Timeframe bekam nie einen Eintrag in `candlesByTimeframe` und blieb bis zu seinem eigenen nächsten Candle-Close leer (bei Monthly bis zu ~30 Tage).

### Bugfix
- `server/index.js`: Abstand zwischen Initial-Fetch-Requests von 300ms auf 1500ms erhöht; genau EIN Retry-Pass nach 10s ausschließlich für die nach dem ersten Durchlauf fehlenden Timeframes (kein Retry für bereits erfolgreiche, keine Endlosschleife). WebSocket, Persistence, Scheduler (Phase E), `marketBrain.js` und die Event-Pipeline bleiben unverändert.
- `server/marketState.js`: `getHealth()` liefert jetzt ehrlich `expectedTimeframes`, `loadedTimeframes`, `missingTimeframes` und `htfReady` (true nur wenn der HTF-Kern Weekly/Daily/4H/1H vollständig geladen ist). `restStatus` ist kein reiner Last-Call-Status mehr, sondern `"ok"` (7/7 geladen) / `"partial"` (teilweise) / `"error"` (0/7) — vorher konnte ein einzelner erfolgreicher Quote-Refresh `restStatus: "ok"` zeigen, obwohl mehrere HTF-Timeframes fehlten.

### Getestet (lokal, gegen Mock-TwelveData-REST/WebSocket — kein echter API-Key)
Alle 7 Timeframes laden erfolgreich ohne Retry; ein simulierter einmaliger Fehler auf 2 Timeframes wird vom Retry-Pass korrekt und ausschließlich für diese behoben (Aufruf-Zähler bewiesen: kein erneuter Request für bereits erfolgreiche Timeframes); ein dauerhaft fehlschlagendes HTF-Kern-Timeframe bleibt nach dem einen Retry-Pass korrekt als `missingTimeframes` markiert, `htfReady: false`, `restStatus: "partial"`, genau 2 Aufrufe (Initial + 1 Retry, kein Endlosloop); WebSocket erreicht weiterhin `streaming`; Event-Pipeline (`/api/events/XAUUSD`) antwortet unverändert; debounced Disk-Flush (`state/latest.json`) feuert weiterhin wie vorher.

### Geänderte Dateien
`server/index.js`, `server/marketState.js`, `package.json`, `CHANGELOG.md`

---

## [0.22.0] — DG OS Always-On Market Server (gebaut, lokal getestet, nicht gehostet)

### Neu
- **Neuer `server/`-Ordner**: ein kleiner, abhängigkeitsfreier Node.js-Dienst (Node 22 `fetch`/`WebSocket`, keine npm-Pakete), der `marketBrain.js`/`events.js` unverändert wiederverwendet — keine zweite parallele Engine
- **Phase A** — HTTP API (`server/api.js`, Node `http`, kein Express): `GET /api/health`, `GET /api/market/XAUUSD`, `GET /api/events/XAUUSD`, `POST /api/tradingview/webhook` (Architektur-Stub, `501`, siehe Phase G)
- **Phase B** — REST-Kerzendaten auf 7 HTF-priorisierte Timeframes erweitert (`server/lib/timeframes.js`): Monthly (24×), Weekly (52×), Daily (120×), 4H (180×), 1H (168×), 30M (192×), 15M (192×) — 5M/1M bewusst noch nicht dabei, wie von Daniel angeordnet. Jeder Timeframe dokumentiert mit Intervall, Kerzenanzahl und historischer Reichweite
- **Phase C** — TwelveData WebSocket serverseitig (`server/lib/twelveDataSocket.js`): Verbindung, Subscription, Heartbeat, Reconnect mit Backoff — Server-Portierung der bisherigen browserseitigen Logik, API-Key ausschließlich aus Environment Variable, nie geloggt, nie im Frontend
- **Phase D** — Market Freshness zentral bereitgestellt und im Dashboard getrennt nach Preis und Kerzen angezeigt (Last Price / HTF Candles / Price Source / Candles) statt einer einzigen Kennzahl; neues optionales Feld „Always-On Market Server URL" im Dashboard mit automatischem, unterbrechungsfreiem Fallback auf den bisherigen 15-Min-Feed, solange kein Server konfiguriert ist (was heute der reale Produktionsstand ist)
- **Phase E** — Kerzen-Refresh an tatsächlichen Candle-Close-Zeitpunkten ausgerichtet (`server/lib/candleRefreshScheduler.js`), nicht an einem festen Intervall — keine unnötigen Requests
- **Phase F** — Live-Preis überwacht bestehende Level/POIs kontinuierlich auf Touch, über die unveränderte Event-Klassifizierung (Market Context/Trading Event bleibt exakt bestehen); jeder Preis-Tick wird sofort im Speicher klassifiziert, nur das Schreiben auf die Festplatte ist gebündelt (5s) — verifiziert per Test, dass ein Sweep-und-Reversal innerhalb eines Bündelungsfensters trotzdem als echtes Event erfasst wird
- **Phase G** — TradingView-Webhook-Route architektonisch vorbereitet, funktional nicht implementiert (`501`)
- **Phase H** — `docs/ALWAYS_ON_HOSTING.md`: Vergleich von Railway/Fly.io/Render, Empfehlung Railway — kein Hosting gebucht, kein Account erstellt, kein Secret übertragen
- Neue Datei `docs/ALWAYS_ON_SERVER.md`: vollständige Architektur-Dokumentation, inkl. Testprotokoll

### Bugfix (während des Testens gefunden und behoben)
- Ursprüngliches Debounce-Design hätte Ereignisse verloren: wenn ein Sweep UND seine Reversal-Reaktion innerhalb desselben 5-Sekunden-Bündelungsfensters passierten, wäre der Netto-Vergleich „keine Änderung" gewesen und das Event verloren gegangen. Behoben durch zweistufiges Diffing: jede Preis-Änderung wird sofort im Speicher klassifiziert, nur die Festplatten-Schreibung ist gebündelt

### Geändert
- `scripts/ingest.js`: Persistenz-Logik nach `server/lib/marketStateStore.js` ausgelagert und von dort wiederverwendet (identisches Verhalten, keine doppelte Implementierung)
- `app.js`/`index.html`/`styles.css`: System-Status-Karte erweitert (getrennte Preis-/Kerzen-Anzeige, optionale Server-Verbindung)
- `.gitignore`: `.env` und `node_modules/` ergänzt

### Getestet (lokal, gegen Mock-TwelveData-REST/WebSocket-Server — kein echter API-Key verwendet)
REST-Modul, WebSocket-Modul (inkl. abruptem Verbindungsabbruch + Reconnect-Timing), Kerzen-Scheduler (alle 7 Timeframes inkl. Jahreswechsel), vollständiger End-to-End-Lauf des echten Servers, Event-Pipeline (inkl. des behobenen Bugs), Frontend in beiden Modi (Server konfiguriert/nicht konfiguriert), „LIVE nur bei echter WebSocket-Verbindung" unter simuliertem WS-Ausfall, vollständiger Regressionstest des bestehenden Dashboards

### Geänderte Dateien
`server/` (neu: `index.js`, `api.js`, `marketState.js`, `lib/timeframes.js`, `lib/twelveDataRest.js`, `lib/twelveDataSocket.js`, `lib/candleRefreshScheduler.js`, `lib/marketStateStore.js`), `scripts/ingest.js`, `app.js`, `index.html`, `styles.css`, `.env.example` (neu), `.gitignore`, `package.json`, `docs/ALWAYS_ON_SERVER.md` (neu), `docs/ALWAYS_ON_HOSTING.md` (neu), `docs/MARKET_BRAIN.md`, `CLAUDE.md`, `ROADMAP.md`, `CHANGELOG.md`

---

## [0.21.0] — TradingView-Integrationsplan, Version- & Daten-Aktualitäts-Anzeige

### Neu
- **`docs/TRADINGVIEW_INTEGRATION_PLAN.md`** (neu): vollständiger Architektur-Plan für eine Hybrid-Lösung (TwelveData liefert kontinuierliche OHLC/Preis-Daten, TradingView liefert strategische Events über Webhook/Alerts, beide laufen im selben Event Store zusammen) — Webhook Flow, Payload Schema, Secret-Validierung, Duplicate Protection, Timestamp Handling, Event Mapping (identisches Vokabular wie `events.js`), Fehlerbehandlung, welche Events besser aus TradingView vs. direkt aus Market Data kommen. Bewusst nur der Plan — noch keine Webhook-Infrastruktur gebaut, da GitHub Pages keine POST-Requests annehmen kann und GitHub Actions kein dauerhaft lauschender Server ist; das braucht erst die noch offene Always-on-Host-Entscheidung
- **Version als Single Source of Truth**: neue `package.json` mit `version`-Feld — einzige Stelle, an der die Versionsnummer als String steht. Browser lädt sie per `fetch()` (`loadVersion()` in `app.js`), Node-Ingest-Skript per `require()` (stempelt `dgOsVersion` in `state/latest.json`). `package.json` bewusst NICHT im Service-Worker-Precache, damit eine installierte PWA nie eine veraltete Versionsanzeige zeigt
- **Neue Karte „System Status"** ganz oben im Dashboard: Version, Last Market Update (Uhrzeit + tatsächliche Browser-Zeitzone, nicht hartkodiert), Data Age (live hochzählend), Data Status (LIVE/DELAYED/STALE/NO DATA), Market Source
- **Vier-Stufen-Datenaktualität** (`computeDataFreshness()` in `marketBrain.js`): Schwellenwerte technisch aus den tatsächlichen Feed-Intervallen abgeleitet (WebSocket-Heartbeat 10s → LIVE ≤20s/DELAYED ≤90s; 15-Min-Cron-Baseline → LIVE ≤5min/DELAYED ≤20min), reine technische Darstellung, keine Tradingregel
- Der bisherige Header-Badge („LIVE"/„OFFLINE DEMO") nutzt jetzt denselben Freshness-Status wie die neue Karte — vorher eigene, lockerere 45-Minuten-Schwelle (`MARKET_STALE_MS`, jetzt entfernt), die theoretisch 40 Minuten alte Daten noch als „LIVE" zeigen konnte. Header, Ticker und Status-Karte können jetzt nicht mehr widersprüchliche Aussagen zeigen

### Geändert
- `app.js`: `DG_OS_VERSION`-Konstante entfernt (durch `loadVersion()` ersetzt), `setLiveStatus()` arbeitet jetzt mit dem 4-Stufen-Status statt einem Boolean
- `marketBrain.js`: `computeDataFreshness()`/`formatDataAge()` ergänzt
- `scripts/ingest.js`: liest `package.json`, stempelt `dgOsVersion` in den persistierten Zustand

### Geänderte Dateien
`app.js`, `marketBrain.js`, `scripts/ingest.js`, `index.html`, `styles.css`, `package.json` (neu), `docs/TRADINGVIEW_INTEGRATION_PLAN.md` (neu), `docs/MARKET_BRAIN.md`, `CLAUDE.md`, `ROADMAP.md`, `CHANGELOG.md`

---

## [0.20.0] — Phase 1: Core Foundation — Event Store & Ingest Pipeline

### Neu
- Neue Datei `marketBrain.js`: jede reine Market-Brain-/Daniel-Brain-Berechnung (Premium/Discount, HTF Bias, Liquidity Engine, POI Engine, Structure Engine, DG Confidence Engine, Daniel Decision Engine, DG Overview) aus `app.js` extrahiert — läuft jetzt identisch im Browser (als globale Funktionen, vor `app.js` geladen) und in Node (`require()`), damit Browser und Server-Ingest niemals auseinanderlaufen können
- Neue Datei `events.js`: `classifyMarketEvents()` implementiert Daniels Korrektur exakt — Session-Level-Entstehung (`ASIA_HIGH_CREATED` etc.) ist **Market Context** (still, nie Notification, nie Trading-Event-Stream, nie Setup-Signal), Touch/Sweep/Reaktion/Confirmation sind **Trading Events** (persistiert, benachrichtigungsfähig); Kategorie steckt in einem Feld pro Event, nicht in einer manuell gepflegten Ausschlussliste
- Neue Datei `scripts/ingest.js` (Node): läuft in `.github/workflows/market-data.yml` direkt nach dem bestehenden TwelveData-Fetch, berechnet den nächsten Market-Brain-Snapshot, vergleicht ihn mit dem vorherigen und persistiert beides — `state/latest.json` (aktueller Snapshot, restart-sicher, git-committed) und `state/events.jsonl` (Event-Log, auf die letzten 2000 Einträge begrenzt, git-committed)
- `market-data.yml` committet `state/` jetzt automatisch zurück ins Repo (nur bei echter Änderung, `contents: write`) — das ist DG OS' erster echter, dauerhafter Datenspeicher: ein Neustart rekonstruiert den letzten bekannten Zustand direkt aus `state/latest.json`
- Implementierte Event-Typen (alle aus bereits bestehenden, echten Detektoren abgeleitet, keine neue Tradingregel erfunden): `ASIA/LONDON/NY_HIGH/LOW_CREATED` (Kontext), `ASIA/LONDON/NY_HIGH/LOW_TOUCHED`/`_SWEPT`, `LIQUIDITY_SWEPT`, `POI_REACHED`, `FVG_REACHED`, `ORDERBLOCK_REACHED`, `REACTION_DETECTED`, `BOS_CONFIRMED`, `CHOCH_CONFIRMED`, `DISPLACEMENT_DETECTED`, `ENGULFING_CONFIRMED` (zwei neue generische, DG-regel-freie Kerzenmuster-Detektoren, gleiche Kategorie wie FVG/Order Block)
- `SETUP_FORMING`/`SETUP_CONFIRMED`/`SETUP_INVALIDATED`/`TARGET_REACHED` bewusst nur im Vokabular registriert, aber ohne Emitter — ein "Setup" ist untrennbar eine `rules/strategy.md`-Regel, die noch nicht existiert
- Deterministische IDs für POIs und Structure-Elemente (vorher zufällig, jetzt aus Typ/Timeframe/Kerzenzeit/Preisgrenzen abgeleitet) — notwendige Voraussetzung dafür, dass zwei aufeinanderfolgende Snapshots überhaupt verglichen werden können

### Bugfixes
- `detectZoneReaction()` scannte fälschlich ab der mittleren FVG-Kerze statt der zuletzt zonenbildenden Kerze — dadurch konnte eine frische, nie wirklich retestete FVG sofort wie "getestet und reagiert" aussehen. Betraf bereits die produktive DG-Overview-"Meldungen"-Anzeige (v0.19.0), nicht erst diesen Build

### Geändert
- `app.js` (1738 → ~700 Zeilen): jetzt nur noch DOM/Rendering + App-Logik (Begrüßung, Sessions-Uhr, Alpha Simulation, Telegram, WebSocket-Stream) — jede `render*()`-Funktion unverändert, nur die Berechnungen sind umgezogen
- `index.html`: lädt `marketBrain.js` vor `app.js`
- `sw.js`: Cache-Liste um `marketBrain.js` ergänzt, Cache-Version erhöht

### Bekannte Grenzen (bewusst, dokumentiert)
- Läuft weiterhin auf dem bestehenden 15-Minuten-Cron — noch kein echtes durchgängiges Live-Monitoring unabhängig vom Cron; das braucht einen eigenen Always-on-Host (spätere, separate Infrastruktur-Entscheidung, siehe `docs/DG_OS_V2_AUDIT.md`)
- `state/events.jsonl` auf 2000 Einträge begrenzt (Git-Historie bleibt vollständig) — eine echte Datenbank ist spätere Ausbaustufe
- Keine neue UI in diesem Build — bewusst, wie von Daniel angeordnet ("keine UI-Aufräumarbeiten vorziehen")

### Geänderte Dateien
`app.js`, `marketBrain.js` (neu), `events.js` (neu), `scripts/ingest.js` (neu), `index.html`, `sw.js`, `.github/workflows/market-data.yml`, `docs/MARKET_BRAIN.md`, `docs/DG_OS_V2_AUDIT.md`, `ROADMAP.md`, `CLAUDE.md`, `CHANGELOG.md`

---

## [0.19.2] — Audit-Korrektur: Event-Klassifikation Market Context vs. Trading Event

### Neu
- `docs/DG_OS_V2_AUDIT.md` ergänzt um Daniels Korrektur zur Event-Logik: Session-Level-Entstehung (`ASIA_HIGH_CREATED`, `ASIA_LOW_CREATED`, `LONDON_HIGH_CREATED`, `LONDON_LOW_CREATED`, `NY_HIGH_CREATED`, `NY_LOW_CREATED`) ist reiner „Market Context" — intern berechnet/gespeichert, aber niemals Notification, niemals Trading-Event-Stream, niemals Setup-Signal
- Erst Touch/Sweep/Reaktion/Confirmation (`*_TOUCHED`, `*_SWEPT`, `LIQUIDITY_SWEPT`, `POI_REACHED`, `FVG_REACHED`, `ORDERBLOCK_REACHED`, `REACTION_DETECTED`, `ENGULFING_CONFIRMED`, `DISPLACEMENT_DETECTED`, `BOS_CONFIRMED`, `CHOCH_CONFIRMED`, `SETUP_FORMING`, `SETUP_CONFIRMED`, `SETUP_INVALIDATED`, `TARGET_REACHED`) zählen als „Trading Event" — persistiert und benachrichtigungsfähig
- Als Architekturentscheidung festgehalten: jedes Event trägt im Event Store ein Kategorie-Feld (Market Context / Trading Event), das Alert Layer und Event-Stream-Abfragen filtert — statt einer manuell gepflegten Ausschlussliste, damit auch künftige Event-Typen automatisch korrekt behandelt werden
- Reine Dokumentations-Korrektur — keine funktionalen Code-Änderungen

### Geänderte Dateien
`app.js`, `docs/DG_OS_V2_AUDIT.md`, `CHANGELOG.md`

---

## [0.19.1] — DG OS V2 Audit

### Neu
- Neue Datei `docs/DG_OS_V2_AUDIT.md`: vollständiger technischer Audit des bestehenden Projekts vor dem Umbau zu „DG OS – Personal AI Trading Brain" — aktuelle Architektur, echte vs. simulierte Komponenten, implementierte Tradinglogik, Datenquellen, Datenbank (keine vorhanden), Frontend/Backend-Analyse, bekannte technische Schulden (u. a. defekte PWA-Icon-Pfade, komplett simulierte Hero-Entscheidungsanzeige), was für V2 erhalten bleibt, was ersetzt wird, empfohlene V2-Architektur (Ingestion Layer, Event Store, DG Trading Brain, Query/Conversation Layer, Alert Layer) und ein phasenweiser, jeweils freigabepflichtiger Migrationsplan
- Reine Analyse- und Dokumentations-Arbeit — keine funktionalen Code-Änderungen, kein Feature entfernt oder umgebaut, wie explizit angefordert

### Geänderte Dateien
`app.js`, `docs/DG_OS_V2_AUDIT.md`, `CHANGELOG.md`

---

## [0.19.0] — DG Overview: Dashboard auf einen Blick

### Neu
- Neue Karte „DG Overview" ganz oben im Dashboard — auf einen Blick: Asia/London/New-York/Daily/Weekly High &amp; Low mit Status, aktuelle Struktur (intern &amp; extern, bullish/bearish) und offene, hochwertige H1-Zonen (fresh, ≥65% Confidence aus FVG/Order-Block-Erkennung)
- Reine Aggregation bestehender Engines (Liquidity/Structure/POI Engine) — kein neues Modul, keine neue Erkennung, keine neue DG-Regel
- Neue Textmeldungen-Liste: Sweeps aktiver Liquiditäts-Levels (Daily/Weekly/Session High/Low) als lesbarer Satz, plus ein neuer, bewusst NICHT „DG Confirmation" genannter mechanischer Check „Zonen-Reaktion" (`detectZoneReaction()`): Preis hat eine frische Zone getestet und mit einer Kerze wieder außerhalb geschlossen — eine strukturelle Tatsache wie `status`, keine erfundene DG-Regel
- Ehrlichkeits-Hinweis direkt in der UI: „Offene Zonen" sind H1-Zonen, nicht echte Daily-Kerzen-FVGs — DG OS ruft aktuell keine Daily-Kerzen-Historie ab, das wird klar so benannt statt vorgetäuscht

### Geänderte Dateien
`app.js`, `index.html`, `styles.css`, `docs/MARKET_BRAIN.md`, `CHANGELOG.md`

---

## [0.18.3] — Dauerhafte Projektregel: DG Knowledge Assistant

### Neu
- Neue dauerhafte Projektregel dokumentiert (`CLAUDE.md`, `ROADMAP.md`, `docs/MARKET_BRAIN.md`, Hinweis auch in `rules/strategy.md`): DG OS unterstützt Daniel ab sofort aktiv beim Digitalisieren seiner Strategie, statt Kapitel nur zu speichern
- Bei jedem definierten/geänderten Kapitel in `rules/strategy.md` soll DG OS: Unklarheiten/Widersprüche erkennen, Rückfragen stellen, mögliche Edge Cases nennen, Beispiele erzeugen, Testfälle erzeugen, Vorschläge machen, wie die Regel später gegen Live-Marktdaten geprüft werden kann, und welche bestehenden Module sie verwenden könnten
- Weiterhin absolut: DG OS erfindet dabei niemals eine eigene Tradingregel — jeder Vorschlag ist zur Bestätigung durch Daniel gedacht, nie eine eigenmächtige Ergänzung von `rules/strategy.md`
- Reine Verhaltens-/Governance-Regel ohne UI oder neues Modul — reine Dokumentations-Änderung, keine funktionalen Code-Änderungen

### Geänderte Dateien
`app.js`, `CLAUDE.md`, `ROADMAP.md`, `docs/MARKET_BRAIN.md`, `rules/strategy.md`, `CHANGELOG.md`

---

## [0.18.2] — Neue Projektphase: Knowledge Mode

### Neu
- Neue dauerhafte Projektphase „Knowledge Mode" in `ROADMAP.md` und `CLAUDE.md` verankert (formaler Name für das bisherige „Wissensmodus"-Prinzip, jetzt vollständig als Phase 2 dokumentiert): Fokus liegt nicht mehr auf neuen Modulen, sondern auf der Digitalisierung von Daniels Trading-Wissen
- Neue Module werden ab sofort nur noch gebaut, wenn sie direkt zur Umsetzung einer definierten DG-Regel benötigt werden — keine weiteren Architektur-Module auf Vorrat, bis Daniel neue Anforderungen definiert
- Permanente Prioritätsreihenfolge dokumentiert: Denkweise dokumentieren → Regeln digitalisieren → Regeln implementieren → gegen echte Marktdaten testen → Performance messen → Verbesserungsvorschläge erzeugen → niemals eigenständig Regeln verändern
- `ROADMAP.md`s „Next phases"-Liste als abhängig von Knowledge Mode gekennzeichnet, statt als eigenständige Bauvorhaben
- Reine Dokumentations-/Governance-Änderung, keine funktionalen Code-Änderungen

### Geänderte Dateien
`app.js`, `CLAUDE.md`, `ROADMAP.md`, `CHANGELOG.md`

---

## [0.18.1] — Dauerhafte Projektregel: DG Learning Philosophy

### Neu
- Neue dauerhafte Projektregel dokumentiert (`CLAUDE.md`, `ROADMAP.md`, `docs/MARKET_BRAIN.md`): DG OS ist **keine Trading-KI**, sondern eine digitale Erweiterung von Daniel Gomes. Oberstes Ziel: „DG OS soll im Laufe der Zeit immer besser verstehen, wie Daniel Gomes denkt."
- Erlaubt: kontinuierliches Lernen aus echten Markt-/historischen Daten und Trading-Ergebnissen, Statistiken, Mustererkennung, Performance-Analyse, Verbesserungsvorschläge, alternative Szenarien, Wahrscheinlichkeitsvergleiche
- Niemals erlaubt: DG OS darf Tradingregeln niemals eigenständig ändern, überschreiben oder neue Regeln aktivieren. Jede Verbesserung muss explizit als Empfehlung gekennzeichnet werden — nur Daniel entscheidet über Übernahme, indem er selbst `rules/strategy.md` bearbeitet
- Gilt automatisch für alle künftigen Module, insbesondere Learning Engine, Reports, Statistics und jede künftige Auto-Trading-Arbeit
- **`ROADMAP.md`** neu angelegt: vollständige Modul-Roadmap (Ist-Stand, aktuelle Phase „Wissensmodus", nächste Phasen bis v1.0 Alpha) plus die neue Lern-Philosophie
- Reine Dokumentations-/Governance-Änderung, keine funktionalen Code-Änderungen

### Geänderte Dateien
`app.js`, `CLAUDE.md`, `ROADMAP.md` (neu), `docs/MARKET_BRAIN.md`, `CHANGELOG.md`

---

## [0.18.0] — Daniel Decision Engine (Modul 10): vollständige Architektur

### Neu
- **Daniel Decision Engine** (Modul 10): vollständige Architektur für WAIT/WATCH/READY/INVALID — liest HTF Bias, Structure Engine, Liquidity Engine, POI Engine, Premium/Discount und die DG Confidence Engine. Noch **keine** Tradingentscheidung, keine DG-Regeln, keine Entries, keine Alerts
- Vollständiges `DecisionState`-Datenmodell (Status, Confidence, Begründung, verfügbare/fehlende Module, Konflikte zwischen Modulen, erfüllte/fehlende Bedingungen, Regel-Status-Snapshot, vollständiger Modul-Snapshot) — bereit für künftige Konsumenten: Telegram Alerts, Reports, Replay, Learning Engine, Auto Trading
- `DG_RULES_DEFINED`: von Hand gepflegte Kopie der Status-Übersicht aus `rules/strategy.md` — solange kein Kapitel definiert ist, liefert die Engine ehrlich immer `WAIT` mit expliziter Begründung, nie eine erfundene Bewertung
- Konflikterkennung zwischen Modulen (z. B. HTF Bias vs. Structure Engine vs. POI-Mehrheitsrichtung) — rein mechanischer Abgleich, keine DG-Bewertung
- Gleiche Modularität wie POI/DG Confidence Engine: `DECISION_INPUT_MODULES`-Registry, jedes Modul liefert nur eine `input`/`describe`-Paarung
- Neue Karte „Daniel Decision Engine" im Dashboard

### Geänderte Dateien
`app.js`, `index.html`, `styles.css`, `docs/MARKET_BRAIN.md`, `rules/strategy.md`, `CHANGELOG.md`

---

## [0.17.0] — Structure Engine (Modul 9): reine Marktstruktur-Erkennung

### Neu
- **Structure Engine** (Modul 9): erkennt Swing High/Low, Higher High/Higher Low/Lower High/Lower Low, Break of Structure (BOS) und Change of Character (CHOCH) — sowohl interne als auch externe Struktur (zwei Fraktal-Fenstergrößen auf derselben H1-Kerzenreihe, keine zusätzliche API-Abfrage)
- Jedes erkannte Element als einheitliches Objekt: Typ, Label (HH/HL/LH/LL), Preis, Zeit, Timeframe, Bullish/Bearish, interne/externe Struktur, Status (Active/Broken/Confirmed), Confidence, zugehörige Session, HTF-Kontext
- Gleiche Modularität wie die POI Engine: der Detector kennt ausschließlich die eigene Kerzenreihe, keine Kopplung an andere Module — Anreicherung mit Session/HTF Bias passiert zentral in `enrichStructureContext()`
- Grundlage für DG HTF Bias, die Daniel Decision Engine, die Learning Engine, Reports und Alerts — noch bewusst **keine** Tradingentscheidung, keine Alerts, keine DG-Regeln
- Neue Karte „Structure Engine" im Dashboard mit interner/externer Bias-Anzeige und vollständiger Element-Liste

### Geänderte Dateien
`app.js`, `index.html`, `styles.css`, `docs/MARKET_BRAIN.md`, `rules/strategy.md`, `CHANGELOG.md`

---

## [0.16.1] — `rules/strategy.md`: Kapitel 0 „DG Philosophy" ergänzt

### Neu
- Neues Kapitel **0. DG Philosophy** vor Kapitel 1 eingefügt — bewusst keine Regeln, sondern Daniels grundlegende Sicht auf den Markt (Warum bewegt sich der Markt? Was ist Liquidität? Warum entstehen Sweeps/Order Blocks/Fair Value Gaps? Was ist das Ziel des Marktes? Wann wird grundsätzlich nicht gehandelt?) als künftiges Leitbild für die Auslegung aller anderen Kapitel
- Status-Übersicht und Kapitel-Modul-Zuordnung in `rules/strategy.md` entsprechend erweitert
- `CLAUDE.md` aktualisiert: „Wissensmodus"-Workflow dauerhaft dokumentiert — Regel → Implementierung → Tests → Deploy → BUILD FERTIG, ein Kapitel nach dem anderen, kein neues Feature ohne ausgefülltes Kapitel

### Geänderte Dateien
`app.js`, `CLAUDE.md`, `rules/strategy.md`, `CHANGELOG.md`

---

## [0.16.0] — `rules/strategy.md`: vollständige Architektur der Wissensbasis

### Neu
- **`rules/strategy.md`** von einem 7-Punkte-Platzhalter zur vollständigen, zentralen Wissensbasis von DG OS ausgebaut: 16 Kapitel (DG HTF Bias, DG Liquidity, DG Premium/Discount, DG Order Block, DG Valid FVG, DG Inverse FVG, DG Breaker, DG Confirmation, Entry, Exit, Risk Management, No Trades, Session-Regeln, News, Beispiele, Edge Cases)
- Jedes Kapitel mit Status-Marker (🔴 TODO / 🟢 DEFINIERT), Leitfragen als Orientierung und explizitem Platzhalter — noch **keine** erfundenen Regeln
- Status-Übersichtstabelle am Anfang des Dokuments für schnellen Fortschrittsüberblick
- Neue Zuordnungstabelle: welches Kapitel später von welchem Code-Modul gelesen wird (Market Brain, POI Engine, DG Confidence Engine, künftige Confirmation/Entry/Exit/Risk-Module)
- `CLAUDE.md` aktualisiert: verweist jetzt auf die vollständige Kapitelstruktur statt auf den alten 7-Punkte-Platzhalter

### Geänderte Dateien
`app.js`, `CLAUDE.md`, `rules/strategy.md`, `CHANGELOG.md`

---

## [0.15.0] — DG Confidence Engine (Modul 8) — Architektur

### Neu
- **DG Confidence Engine** (Modul 8): erstes Modul des künftigen Daniel Brain, direkt über dem Market Brain. Sammelt einen einheitlichen "Contribution Score" von jedem bestehenden Modul (Sessions, Liquidity Engine, Premium/Discount, HTF Bias, Fair Value Gap, Order Block) und berechnet daraus Confidence, Positive Faktoren, Negative Faktoren und Fehlende Faktoren
- Vollständig konfigurationsgetrieben (`CONFIDENCE_CONTRIBUTORS`), wie schon `POI_TYPE_DEFS`: ein neues Modul liefert künftig nur einen Registry-Eintrag mit eigenem Score — der Rest (Aggregation, Gruppierung, Darstellung) passiert automatisch
- Confidence ist bewusst nur ein transparenter Durchschnitt der verfügbaren Scores — keine erfundene DG-Gewichtung, da Daniels exakte Regeln noch nicht definiert sind. Genau diese Formel wird ersetzt, sobald sie es sind
- Bewusst noch **keine** finale Tradingentscheidung, keine Alerts, keine Entries
- Neue Karte „DG Confidence Engine" im Dashboard

### Geänderte Dateien
`app.js`, `index.html`, `styles.css`, `docs/MARKET_BRAIN.md`, `CHANGELOG.md`

---

## [0.14.1] — Dauerhafte Projektregel: DG-Methodik statt ICT/Standard-SMC

### Sonstiges
- Neue dauerhafte Projektregel dokumentiert (`CLAUDE.md`, `docs/MARKET_BRAIN.md`): DG OS digitalisiert Daniel Gomes' eigene Handelsweise — nicht ICT, nicht generische Smart-Money-Concepts, kein Standard-Indikator. Künftige Module heißen und werden definiert als DG Order Block, DG Valid FVG, DG Liquidity, DG HTF Bias, DG Confirmation, DG Decision Engine
- Alle bisherigen Module (Liquidity Engine, Fair-Value-Gap-Detector, Order-Block-Detector, HTF Bias) sind ab sofort explizit als technische Basis gekennzeichnet — generische/strukturelle Umsetzung, noch nicht Daniels DG-spezifisches Regelwerk. Anpassung erfolgt schrittweise, sobald die exakten DG-Regeln definiert sind
- Regel verankert: niemals generische Tradinglogik erfinden oder annähern, solange die exakte DG-Regel dafür noch nicht in `rules/strategy.md` steht — stattdessen Architektur vorbereiten und warten

### Geänderte Dateien
`app.js`, `CLAUDE.md`, `docs/MARKET_BRAIN.md`, `CHANGELOG.md`

---

## [0.14.0] — Market Brain Modul 7: POI Engine Stage 2/4 — Order Block Detector

### Neu
- **Order Block Detector** (`detectOrderBlocks`): zweite echte Erkennung der POI Engine — Architektur für den späteren "Daniel Order Block", noch keine finale Tradingbewertung. Erkennt strukturell die letzte gegensätzliche Kerze vor einer echten Displacement-Kerze (Range ≥ 1,5x Ø-Range, starker Close im äußeren Drittel)
- POI-Datenmodell um `impulseSize` (Impulsgröße), `displacement` (Displacement-Nachweis: Kerze, Range, Ø-Range, Ratio), `structureReference` (reserviert für künftige BOS/CHOCH Structure Engine) und `mitigationDetail` (reserviert für ein späteres, feineres Mitigation-Flag) erweitert — beide reservierten Felder bewusst `null`, nicht erfunden
- Gemeinsame Kerzen-Hilfsfunktionen (`localAverageRange`, `isZoneMitigatedAfter`) zwischen FVG- und Order-Block-Detector geteilt, ohne die Modularitätsregel zu verletzen — beide Detectoren bleiben vollständig unabhängig von Liquidity/Session/HTF Bias und kennen nur ihre eigene Kerzenreihe
- POI-Karte zeigt Order Blocks jetzt inklusive Displacement-Ratio und Impulsgröße im Kontext

### Geänderte Dateien
`app.js`, `index.html`, `docs/MARKET_BRAIN.md`, `CHANGELOG.md`

---

## [0.13.0] — Market Brain Modul 7: POI Engine Stage 2/4 — Fair Value Gap Detector

### Neu
- **Fair Value Gap Detector** (`detectFairValueGaps`): erste echte Erkennung der POI Engine. Klassische 3-Kerzen-ICT-Imbalance auf H1, mit intrinsischer Confidence (Gap-Größe relativ zum lokalen ATR), Fresh/Mitigated-Status (per Preisverlauf-Scan) und Entstehungskerze
- **Strikte Modularität**: Detector-Funktionen erhalten ausschließlich ihre eigenen Rohdaten (z. B. die H1-Kerzenreihe) und besitzen keinerlei Wissen über andere Module. Die Verknüpfung mit Liquidity, Session und HTF Bias passiert an genau einer Stelle im Market Brain (`enrichPOIContext()`), zentral für alle aktuellen und künftigen Detectoren
- POI-Datenmodell um `sourceCandle` (Entstehungskerze) und `relatedSession` erweitert
- `data/market.json` liefert jetzt `candles.h1` (72h-Stundenkerzen, wiederverwendet aus dem bestehenden Session-Engine-Fetch, kein zusätzlicher API-Call)
- POI-Karte im Dashboard zeigt erkannte Fair-Value-Gaps mit Preisbereich, Confidence, Status und Kontext (Session/Bias/Zone/Liquidity)

### Geänderte Dateien
`app.js`, `index.html`, `styles.css`, `.github/workflows/market-data.yml`, `docs/MARKET_BRAIN.md`, `CHANGELOG.md`

---

## [0.12.0] — Market Brain Modul 7: POI Engine (Stage 1/4 — Architektur)

### Neu
- **POI Engine** (Modul 7), erste von vier geplanten Stufen: Architektur. Vollständiges POI-Datenmodell (`createPOI()`) mit Typ, Preisbereich, Timeframe, Erstellungszeit, Status (Frisch/Mitigated), Stärke, Confidence, Grund, zugehöriger Liquidity, zugehörigem HTF Bias und Premium/Discount-Lage
- Registry für alle 8 geplanten POI-Typen (Order Block, Breaker, Fair Value Gap, Inverse Fair Value Gap, Mitigation Block, Rejection Block, Supply Zone, Demand Zone) — jeder mit eigenem, einzeln dokumentiertem Detector-Stub und `implemented`-Flag, damit Stufe 2 (Erkennung) einzelne Funktionen ersetzt statt die Architektur neu zu bauen
- Neue Karte „POI Engine" im Dashboard: zeigt ehrlich „Noch keine POIs erkannt" plus Typ-Registry mit Status („Aktiv" / „Erkennung folgt") — keine erfundenen Beispiel-Zonen
- Bewusst noch **keine** echte Erkennung, keine Bewertung, keine Anbindung an die Daniel Decision Engine — folgt in den nächsten drei Builds

### Geänderte Dateien
`app.js`, `index.html`, `styles.css`, `docs/MARKET_BRAIN.md`, `CHANGELOG.md`

---

## [0.11.0] — Market Brain Modul 6: Liquidity Engine

### Neu
- **Liquidity Engine** (Modul 6): 12 Liquiditäts-Level (Daily/Weekly/Monthly High & Low, Asia/London/New York High & Low), jedes mit Preis, Typ, Session/Zeitraum und Status — `ACTIVE`, `TOUCHED`, `SWEEPED`, `INVALID`
- Konfigurationsgetriebenes Modell (`LIQUIDITY_LEVEL_DEFS`), wie schon bei der Session Engine — ein 13. Level bedeutet einen neuen Eintrag, keine neue Funktion
- Status-Logik funktioniert identisch für noch laufende Zeiträume (können per Konstruktion nie „sweeped" sein) und bereits abgeschlossene (echte Sweeps erkennbar) — ohne separate „ist der Zeitraum geschlossen"-Prüfung
- Noch bewusst **keine** Tradingentscheidung, kein Alert, keine Confirmation — reine Status-Engine als Grundlage für die spätere Daniel Decision Engine, Alerts, Reports und Learning Engine
- Neue Karte „Liquidity Engine" im Dashboard, unterhalb von Premium/Discount & HTF Bias

### Geänderte Dateien
`app.js`, `index.html`, `styles.css`, `docs/MARKET_BRAIN.md`, `CHANGELOG.md`

---

## [0.10.0] — Market Brain Modul 4 + 5: Premium/Discount & HTF Bias

### Neu
- **Premium/Discount Engine** (Modul 4): vollständiges Objekt pro Timeframe (Daily/Weekly/Monthly) statt nur true/false — Equilibrium, Distance to EQ, aktuelle Zone, `isPremium`/`isDiscount`/`isEquilibrium`
- **HTF Bias Engine** (Modul 5): Bias, Confidence, Trend Strength, Reason — bewusst als struktureller Proxy (Preis vs. Daily/Weekly/Monthly Open) gekennzeichnet, noch nicht Daniels echtes Regelwerk. `lastBOS`/`currentStructure` sind reserviert, aber `null`, bis eine echte Struktur-Engine existiert
- `MarketBrain`-Aggregator-Objekt: gemeinsame Datenbasis, auf der künftig Daniel Brain (Decision/Scenario/Risk Engine) und System-Layer (Alerts/Reports/Learning/Statistics) aufbauen
- Semantic Versioning eingeführt (dieses Changelog, Versionsanzeige im Interface)

### Geänderte Dateien
`app.js`, `index.html`, `styles.css`, `docs/MARKET_BRAIN.md`, `CHANGELOG.md` (neu)

---

## [0.9.0] — Market Brain Modul 3: Session Engine

### Neu
- Wiederverwendbare Session-Architektur (Asia/London/New York): Status (Bevorstehend/Aktiv/Geschlossen), High/Low/Range
- Server-seitige Intraday-Datenabfrage mit robuster "echte Kerze finden"-Logik (72h Rückblick, überspringt Wochenend-Platzhalter)

### Geänderte Dateien
`.github/workflows/market-data.yml`, `app.js`, `index.html`, `styles.css`, `docs/MARKET_BRAIN.md` (neu)

---

## [0.8.1] — Doku: Kommunikationspräferenz

### Sonstiges
- `CLAUDE.md`: Regel für Abschluss-Signal + weiterleitbare Zusammenfassung nach jedem Build dokumentiert

---

## [0.8.0] — Market Brain Modul 2: Weekly/Monthly Range

### Neu
- Weekly & Monthly Open/High/Low, gleiche robuste Kerzen-Logik wie Modul 1

### Geänderte Dateien
`.github/workflows/market-data.yml`, `app.js`, `index.html`

---

## [0.7.1] – [0.7.5] — Daily-Range-Fixes (5 Iterationen)

### Bugfixes
- Daily High/Low zeigte am Wochenende/Periodenwechsel eine unrealistisch enge Range (z. B. $0.26 statt der echten ~$142 Tagesspanne)
- Ursache: TwelveData liefert für jeden Kalendertag eine Kerze, auch für Tage ohne echten Handel (flacher Platzhalter statt Auslassung), und rollt Tagesgrenzen anders als reines UTC-Kalenderdatum
- Finale Lösung: Kerzen nach Spannweite (nicht nach Datum) bewerten, vorwärts durch mehrere Tage scannen, bis eine Kerze mit echter (> 0,1 % vom Preis) Range gefunden wird
- Zusätzlich: ehrlicher Hinweistext im Interface, wenn der Markt gerade geschlossen ist

### Geänderte Dateien
`.github/workflows/market-data.yml`, `app.js`

---

## [0.7.0] — Echtzeit-Preis-Stream

### Neu
- Optionaler TwelveData-WebSocket-Stream für sekundengenaue Live-Preise direkt im Browser (bewusste Entscheidung: API-Key liegt dafür sichtbar im Frontend-Code, im Gegenzug für echtes Live-Update statt 15-Minuten-Takt)

### Geänderte Dateien
`app.js`, `index.html`, `styles.css`

---

## [0.6.0] — Echte Marktdaten angebunden

### Neu
- XAUUSD Live-Preis, Daily Open/High/Low über TwelveData (kostenloser Tarif), automatisiert per GitHub Actions alle 15 Minuten
- Ehrlicher LIVE/OFFLINE-DEMO-Status statt erfundener Zahlen, wenn keine echten Daten verfügbar sind

### Geänderte Dateien
`.github/workflows/market-data.yml` (neu), `app.js`, `index.html`, `README.md`

---

## [0.5.1] — Eigene Schriftarten

### Verbessert
- Chakra Petch (Überschriften/Chrome) + JetBrains Mono (Daten) selbst gehostet statt Systemschriften, für ein konsistentes Erscheinungsbild auf jedem Gerät

### Geänderte Dateien
`styles.css`, `sw.js`, `fonts/` (neu)

---

## [0.5.0] — HUD-Terminal-Redesign

### Verbessert
- Emoji durch ein einheitliches SVG-Icon-System ersetzt
- Status-Ticker-Leiste, größeres Hero-Panel mit Gauge-Tickmarks und Radar-Reticle
- Responsives Multi-Panel-Layout ab 1080px Breite statt gestreckter Handy-Spalte
- Market Events als farbcodiertes Log statt Emoji-Marker

### Geänderte Dateien
`index.html`, `app.js`, `styles.css`

---

## [0.4.1] — Jarvis-HUD-Politur

### Verbessert
- Animierter Confidence-Ring, pulsierende Live-Status-Punkte, atmendes Logo-Glühen, Boot-Sequenz-Animation der Cards

### Geänderte Dateien
`app.js`, `index.html`, `styles.css`

---

## [0.4.0] — Entscheidungslogik & Projekt-Leitplanken

### Neu
- WAIT/WATCH/READY-System mit erklärbarer, itemisierter Begründung (`computeDecision()`) statt binärem WAIT/SELL
- `docs/VISION.md` (Daniels vollständige Projektvision) und `CLAUDE.md` (verdichteter Leitfaden für künftige Sessions) als dauerhafte Referenz
- `rules/strategy.md`-Gerüst für Daniels Trading-Regelwerk

### Geänderte Dateien
`app.js`, `index.html`, `styles.css`, `docs/VISION.md` (neu), `CLAUDE.md` (neu), `rules/strategy.md` (neu)

---

## [0.3.0] — Zeitbewusstes Dashboard

### Neu
- Begrüßung ("Guten Morgen/Tag/Abend/Nacht, Daniel Gomes") und aktuelle Session nach Uhrzeit
- Telegram-Heartbeat-Workflow (Server-seitiger Verbindungstest über GitHub Actions)

### Geänderte Dateien
`app.js`, `index.html`, `styles.css`, `.github/workflows/telegram-heartbeat.yml` (neu)

---

## [0.2.1] — Live-Vorschau

### Neu
- GitHub Pages Auto-Deploy bei jedem Merge nach `main`, damit der aktuelle Stand jederzeit unter einem festen Link einsehbar ist

### Geänderte Dateien
`.github/workflows/deploy-pages.yml` (neu), `README.md`

---

## [0.2.0] — Telegram-Integration & erstes Jarvis-Theme

### Neu
- Client-seitige Telegram-Anbindung (manuelles/automatisches Senden des Briefings)
- Erstes dunkles Jarvis-HUD-Farbschema (Cyan/Gold-Akzente)

### Geänderte Dateien
`app.js`, `index.html`, `styles.css`, `README.md`

---

## [0.1.0] — Initial Alpha

### Neu
- Erste statische PWA mit simulierten Alpha-Buttons (Asia Session / Sweep / Bearish Engulfing) zur Demonstration des WAIT/SELL-Konzepts
