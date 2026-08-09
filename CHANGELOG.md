# Changelog

Alle nennenswerten Änderungen an DG OS werden hier dokumentiert.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/lang/de/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/):

- **MAJOR** — große Meilensteine / grundlegende Architekturänderungen
- **MINOR** — neue Module oder größere Funktionen
- **PATCH** — Bugfixes, Optimierungen, kleine Verbesserungen

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
