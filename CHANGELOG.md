# Changelog

Alle nennenswerten Änderungen an DG OS werden hier dokumentiert.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/lang/de/),
Versionierung nach [Semantic Versioning](https://semver.org/lang/de/):

- **MAJOR** — große Meilensteine / grundlegende Architekturänderungen
- **MINOR** — neue Module oder größere Funktionen
- **PATCH** — Bugfixes, Optimierungen, kleine Verbesserungen

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
