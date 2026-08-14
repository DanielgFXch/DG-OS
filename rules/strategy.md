# Daniels Trading-Regeln — DG OS Strategy Config

Diese Datei ist die **einzige Quelle der Wahrheit** für Daniel Gomes' exakte
Trading-Regeln. Sie ist die zentrale Wissensbasis von DG OS. Jedes Modul, das
später eine Tradingentscheidung trifft — Confirmation Engine, Entry/Exit-Logik,
Risk Management, No-Trade-Filter, letztlich die Daniel Decision Engine — liest
ausschließlich hier definierte Regeln. Die Entscheidungslogik von DG OS darf
diese Regeln niemals erfinden, erraten, annähern oder eigenständig verändern.
Nur Daniel bearbeitet diese Datei (direkt oder indem er hier einen
aktualisierten Text einfügt).

Kapitel 0 (DG Philosophy) ist ein Sonderfall: es beschreibt keine anwendbaren
Regeln, sondern Daniels grundlegende Sicht auf den Markt — das Leitbild, an
dem sich die Auslegung aller folgenden Kapitel orientiert. Kapitel 1-16
enthalten die eigentlichen, direkt anwendbaren DG-Regeln.

**Wenn ein Kapitel unten `TODO` ist, wartet DG OS.** Das System baut in diesem
Fall keine Ersatzregel, keine Annäherung an eine bekannte Strategie (ICT,
generische Smart-Money-Concepts, Standardindikatoren) und keine Platzhalterzahl
— siehe die dauerhafte Projektregel "DG-Methodik" in
[`CLAUDE.md`](../CLAUDE.md#dg-methodology--not-ict-not-generic-smart-money). Die
Architektur wird vorbereitet; die Anwendung der Regel beginnt erst, sobald das
jeweilige Kapitel ausgefüllt ist.

**🟡 V1 DRAFT** ist ein dritter, zwischen 🔴 TODO und 🟢 DEFINIERT liegender
Status — eingeführt für die Kapitel, deren Inhalt unten aus Daniels eigenem
"DG TRADING BRAIN V1"-Prompt übernommen wurde. Das ist echter, von Daniel
selbst diktierter Inhalt, keine von DG OS erfundene Regel — aber es ist eine
Architektur-/Interpretations-Vorgabe für den ersten Ausbau, nicht zwangsläufig
Daniels endgültige, ausformulierte DG-Regel. Ein Kapitel wechselt erst dann zu
🟢 DEFINIERT, wenn Daniel es explizit als final bestätigt oder direkt
überarbeitet.

## Status-Übersicht

Ein schneller Überblick, welche Kapitel bereits Daniels Regeln enthalten. Wird
manuell aktualisiert, sobald ein Kapitel ausgefüllt wird.

| # | Kapitel | Status |
|---|---|---|
| 0 | [DG Philosophy](#0-dg-philosophy) | 🔴 TODO |
| 1 | [DG HTF Bias](#1-dg-htf-bias) | 🟡 V1 DRAFT |
| 2 | [DG Liquidity](#2-dg-liquidity) | 🟡 V1 DRAFT |
| 3 | [DG Premium / Discount](#3-dg-premium--discount) | 🟡 V1 DRAFT |
| 4 | [DG Order Block](#4-dg-order-block) | 🟡 V1 DRAFT |
| 5 | [DG Valid FVG](#5-dg-valid-fvg-fair-value-gap) | 🟡 V1 DRAFT |
| 6 | [DG Inverse FVG (iFVG)](#6-dg-inverse-fvg-ifvg) | 🔴 TODO |
| 7 | [DG Breaker](#7-dg-breaker) | 🔴 TODO |
| 8 | [DG Confirmation](#8-dg-confirmation) | 🔴 TODO |
| 9 | [Entry](#9-entry) | 🔴 TODO |
| 10 | [Exit](#10-exit) | 🔴 TODO |
| 11 | [Risk Management](#11-risk-management) | 🔴 TODO |
| 12 | [No Trades](#12-no-trades) | 🔴 TODO |
| 13 | [Session-Regeln](#13-session-regeln) | 🔴 TODO |
| 14 | [News](#14-news) | 🔴 TODO |
| 15 | [Beispiele](#15-beispiele) | 🔴 TODO |
| 16 | [Edge Cases](#16-edge-cases) | 🔴 TODO |

## Wie du dieses Dokument ausfüllst

Kein festes Format nötig — Freitext, Stichpunkte, nummerierte Regeln, Screenshots
(als Link/Pfad), alles ist verwendbar. Jedes Kapitel enthält Leitfragen als
Orientierung, keine Pflichtfelder — beantworte, was für dich relevant ist, und
ergänze, was fehlt. Wenn du ein Kapitel ausgefüllt hast, setze den Status oben in
der Tabelle von 🔴 TODO auf 🟢 DEFINIERT.

Wenn du ein Kapitel definierst oder änderst, unterstützt DG OS aktiv statt nur
zu speichern — erkennt Unklarheiten/Widersprüche, stellt Rückfragen, nennt
mögliche Edge Cases, erzeugt Beispiele und Testfälle, schlägt vor, wie die
Regel später gegen Live-Marktdaten geprüft werden kann, und welche
bestehenden Module sie verwenden könnten. Siehe die dauerhafte Projektregel
„DG Knowledge Assistant" in [`CLAUDE.md`](../CLAUDE.md#dg-knowledge-assistant--active-support-while-digitizing-daniels-rules).
DG OS erfindet dabei niemals eine eigene Regel — jeder Vorschlag ist ein
Vorschlag zur Bestätigung, nie eine eigenmächtige Ergänzung.

## Wie dieses Dokument von DG OS verwendet wird

Jedes Kapitel ist einem oder mehreren Code-Modulen zugeordnet. Bereits gebaute
Module laufen aktuell mit generischen/strukturellen Platzhalter-Definitionen
(siehe `docs/MARKET_BRAIN.md`) und werden angepasst, sobald das jeweilige
Kapitel hier ausgefüllt ist — nicht neu gebaut.

| Kapitel | Zuständiges Modul (Stand heute) |
|---|---|
| DG Philosophy | kein einzelnes Modul — Leitbild/Kontext für die Auslegung aller anderen Kapitel, kein direkt ausführbarer Code |
| DG HTF Bias | `computeOverallBias()`/`computeTradingBrainV1()` in `marketBrain.js` (Modul 11, V1 DRAFT) — Score aus externer Struktur (Modul 9) + Premium/Discount + Liquidity-Sweeps über Weekly/Daily/4H/H1; legacy `computeHTFBias()` (struktureller Open-Proxy) bleibt für die alte Single-Timeframe-Pipeline unverändert bestehen |
| DG Liquidity | `computeLiquidityEngine()` + neu `previousDayLiquidityFrom()`/`swingLiquidityFrom()` in `marketBrain.js` — Level-Status bereits real, DG-Bewertung (`VALID_DG_SWEEP`) noch offen |
| DG Premium / Discount | `computePremiumDiscountForRange()` (Modul 11) für Weekly/Daily/4H — Zonenberechnung bereits real, Grenzen noch generisch |
| DG Order Block | `detectOrderBlocks()` (POI Engine, Modul 7) + `rankPOI()` (Modul 11, V1 DRAFT) — Struktur-Erkennung bereits real, Score/Qualität jetzt vorhanden, noch keine DG-Kriterien im Detector selbst |
| DG Valid FVG | `detectFairValueGaps()` (POI Engine, Modul 7) + `rankPOI()` (Modul 11, V1 DRAFT) — Struktur-Erkennung bereits real, Score/Qualität jetzt vorhanden, noch keine DG-Kriterien im Detector selbst |
| DG Inverse FVG | `detectInverseFairValueGaps()` (POI Engine, Modul 7) — noch nicht implementiert |
| DG Breaker | `detectBreakers()` (POI Engine, Modul 7) — noch nicht implementiert |
| DG Confirmation | noch nicht gebaut — Confirmation Engine |
| Entry / Exit | noch nicht gebaut |
| Risk Management | noch nicht gebaut |
| No Trades | noch nicht gebaut |
| Session-Regeln | `SESSIONS`-Konfiguration in `app.js` deckt aktuell nur Zeitfenster ab, keine Handelsregeln |
| News | noch nicht gebaut |
| Beispiele / Edge Cases | Referenz für die spätere Learning Engine und für Tests der Daniel Decision Engine |

Sobald ein Kapitel ausgefüllt ist, liest die **DG Confidence Engine** (Modul 8,
`CONFIDENCE_CONTRIBUTORS` in `app.js`) und die **Daniel Decision Engine**
(Modul 10, `DG_RULES_DEFINED` in `app.js`) diese Regeln direkt aus diesem
Dokument — nie aus eigenen Annahmen. `DG_RULES_DEFINED` ist eine von Hand
gepflegte Kopie der Status-Übersicht oben; ein Kapitel-Flag wird dort erst
auf `true` gesetzt, wenn dieses Kapitel hier wirklich ausgefüllt wurde —
niemals vorher.

---

## 0. DG Philosophy

**Status:** 🔴 TODO — noch nicht definiert

Dieses Kapitel beschreibt **keine Regeln**, sondern Daniels grundlegende Sicht
auf den Markt — das Leitbild, vor dessen Hintergrund alle Regeln in den
folgenden Kapiteln zu lesen sind. Wo ein späteres Kapitel unklar oder
mehrdeutig ist, ist dieses Kapitel der Maßstab dafür, im Sinne welcher
Grundhaltung die Regel gemeint war.

Leitfragen:
- Warum bewegt sich der Markt?
- Was ist Liquidität?
- Warum entstehen Sweeps?
- Warum existieren Order Blocks?
- Warum existieren Fair Value Gaps?
- Was ist das eigentliche Ziel des Marktes?
- Wann wird grundsätzlich NICHT gehandelt?

*(Platzhalter — hier folgt Daniels grundlegende Sicht auf den Markt.)*

## 1. DG HTF Bias

**Status:** 🟡 V1 DRAFT — aus dem "DG TRADING BRAIN V1"-Prompt übernommen, noch nicht final bestätigt

Leitfragen:
- Welche Timeframes fließen ein (Monthly/Weekly/Daily/H4/H1/...)? → **V1:** Weekly, Daily, 4H, 1H. Denkfluss: Weekly Context → Daily Bias → 4H Structure/POIs → 1H Structure/Reaktion → 30M/15M Verfeinerung. Ein niedrigerer Timeframe darf den HTF-Kontext nie überschreiben. 5M/1M sind explizit kein Teil von V1 (später für Entry-Timing).
- Wie wird der Bias auf jedem Timeframe bestimmt? → **V1:** externe Marktstruktur (BOS/CHOCH über die bestehende Structure Engine) pro Timeframe, gewichtet nach Timeframe-Rang (Weekly=4, Daily=3, 4H=2, H1=1); zusätzlich Premium/Discount-Lage auf Weekly+Daily und kürzlich gesweepte Liquidity als Reversal-Hinweis.
- Wann gilt der Bias als bullish, bearish oder neutral/mixed? → **V1:** höherer gewichteter Score gewinnt (bullish/bearish); bei Gleichstand `neutral`. Einfache, nachvollziehbare Score-Logik, keine Gewichtungs-KI.
- Wie werden widersprüchliche Timeframes gewichtet oder aufgelöst? → **V1:** über die Timeframe-Gewichtung oben, kein Sonderfall-Handling.
- Wie oft/wann wird der Bias neu bewertet? → **V1:** bei jeder Anfrage an `GET /api/brain/XAUUSD` frisch berechnet, nicht zwischengespeichert.
- **Noch offen, auch in V1:** was genau einen "relevanten" BOS/CHOCH ausmacht (aktuell zählt jeder erkannte), und ob die Gewichtung (4/3/2/1) so bleibt oder Daniels eigener Einschätzung angepasst wird.

*(Dieses Kapitel ist noch kein von Daniel final geprüfter Text — siehe Status oben.)*

## 2. DG Liquidity

**Status:** 🟡 V1 DRAFT — aus dem "DG TRADING BRAIN V1"-Prompt übernommen, noch nicht final bestätigt

Leitfragen:
- Welche Liquidity-Level zählen? → **V1:** Weekly High/Low, Daily High/Low, Vortages-High/Low (aus der echten Daily-Kerzenreihe), Session High/Low (Asia/London/NY), relevante externe (noch ungebrochene) Swing Highs/Lows. **Equal Highs/Equal Lows fehlen noch** — kein Detector dafür vorhanden, bewusst nicht erfunden.
- Was macht einen Sweep gültig? → **Noch offen, auch in V1.** DG OS unterscheidet nur den reinen Market Fact (Level touched/breached/sweeped, mechanisch über Preis vs. Level) von einer DG-Bewertung. Ein `VALID_DG_SWEEP`-Konzept ist vorgesehen, aber die Gültigkeitskriterien (Wick vs. Close, Mindestgröße, erforderliche Reaktion) sind noch nicht definiert.
- Wie werden mehrere gleichzeitig aktive Level priorisiert? → **Noch offen.** V1 listet alle Level gleichrangig, mit Timeframe als einzigem impliziten Gewicht (siehe POI Ranking V1, Kapitel-übergreifend in `marketBrain.js`).
- Ab wann gilt ein Level als irrelevant/invalidiert? → **Noch offen.** V1 markiert ein Level nur als `sweeped` (Market Fact), entfernt es aber nicht aus der Liste.

**Wichtig (unverändert, bestehende Projektregel):** Level-Entstehung ("wurde gebildet") ist **Market Context**, kein Signal. Erst Touch/Breach/Sweep/Reaktion ist ein **Trading Event**. Diese Trennung ist bereits im Event Store (`events.js`) umgesetzt und wird durch V1 nicht verändert.

*(Dieses Kapitel ist noch kein von Daniel final geprüfter Text — siehe Status oben.)*

## 3. DG Premium / Discount

**Status:** 🟡 V1 DRAFT — aus dem "DG TRADING BRAIN V1"-Prompt übernommen, noch nicht final bestätigt

Leitfragen:
- Welche Range definiert die Zone? → **V1:** primär Weekly, Daily und 4H, parallel berechnet (Priorität in dieser Reihenfolge) — jeweils High/Low der tatsächlich abgerufenen Kerzenreihe dieses Timeframes.
- Wo genau verläuft die Grenze zwischen Premium, Discount und Equilibrium? → **V1 übernimmt die bereits bestehende, generische Grenze** (±3% der Range-Breite um die Equilibrium = "Equilibrium", sonst Premium/Discount) — noch keine DG-spezifische Grenze.
- Muss der Preis in einer bestimmten Zone stehen, bevor ein Setup überhaupt gültig ist? → **Noch offen.** V1 nutzt die Zone nur als einen von mehreren Faktoren im HTF-Bias-Score und im POI Ranking, keine Pflichtbedingung.
- Unterscheiden sich die Regeln je nach Timeframe? → **Noch offen**, keine OTE-Regeln in V1.

*(Dieses Kapitel ist noch kein von Daniel final geprüfter Text — siehe Status oben.)*

## 4. DG Order Block

**Status:** 🟡 V1 DRAFT — aus dem "DG TRADING BRAIN V1"-Prompt übernommen, noch nicht final bestätigt

Leitfragen:
- Was macht eine Kerze zu einem gültigen Order Block? → **V1 nutzt ausschließlich den bereits bestehenden technischen Detector** (letzte gegenläufige Kerze vor einer Displacement-Kerze mit ≥1,5× durchschnittlicher Range und Schlusskurs im äußeren Drittel) — keine zusätzlichen DG-Kriterien erfunden.
- Auf welchen Timeframes zählt ein Order Block? → **V1:** Weekly, Daily, 4H, 1H.
- Gibt es Qualitätskriterien? → **Ja, aber getrennt vom Detector**: die neue POI Ranking V1 (Score 0-100, siehe `rankPOI()` in `marketBrain.js`) bewertet Timeframe, Frische, Displacement, Struktur-/Liquidity-Nähe, HTF-Bias-Übereinstimmung und Premium/Discount-Lage. Der Order Block selbst bleibt ein reiner Market Fact.
- Wann gilt ein Order Block als mitigiert/ungültig? → unverändert: Preis handelt zurück in die Zone (bestehende `isZoneMitigatedAfter()`-Logik).

*(Dieses Kapitel ist noch kein von Daniel final geprüfter Text — siehe Status oben.)*

## 5. DG Valid FVG (Fair Value Gap)

**Status:** 🟡 V1 DRAFT — aus dem "DG TRADING BRAIN V1"-Prompt übernommen, noch nicht final bestätigt

Leitfragen:
- Wie wird eine gültige FVG definiert, und auf welchem Timeframe? → **V1 nutzt ausschließlich den bereits bestehenden technischen Detector** (klassische 3-Kerzen-Lücke) auf Weekly, Daily, 4H, 1H — keine zusätzlichen DG-Kriterien erfunden.
- Muss sie mit einem Order Block, Liquidity-Event oder einer Session zusammenfallen? → **Noch offen.** Eine FVG ist in V1 explizit noch kein automatisch guter POI — die Qualitätsbewertung läuft über POI Ranking V1 (siehe Kapitel 4).
- Ab welcher Mindestgröße gilt eine Lücke überhaupt als relevante FVG? → **Noch offen**, keine Mindestgröße definiert.
- Wann gilt eine FVG als mitigiert? → unverändert: Preis handelt vollständig durch die Zone (bestehende `isZoneMitigatedAfter()`-Logik).

*(Dieses Kapitel ist noch kein von Daniel final geprüfter Text — siehe Status oben.)*

## 6. DG Inverse FVG (iFVG)

**Status:** 🔴 TODO — noch nicht definiert

Leitfragen:
- Unter welchen Bedingungen wird eine FVG zu einer gültigen Inverse FVG?
- Welche Invalidierungs-/Inversionsbedingung muss exakt erfüllt sein?
- Wird eine iFVG wie ein normaler POI gehandelt, oder gelten eigene Regeln?

*(Platzhalter — hier folgen Daniels exakte Regeln.)*

## 7. DG Breaker

**Status:** 🔴 TODO — noch nicht definiert

Leitfragen:
- Wann wird ein invalidierter Order Block zu einem gültigen Breaker?
- Welche Strukturbedingung muss vorher gebrochen worden sein?
- Gilt der Breaker auf allen Timeframes gleich, oder nur auf bestimmten?

*(Platzhalter — hier folgen Daniels exakte Regeln.)*

## 8. DG Confirmation

**Status:** 🔴 TODO — noch nicht definiert

Leitfragen:
- Welches Muster/Verhalten bestätigt einen Einstieg (Engulfing, Displacement, CHOCH, Wick-Rejection, anderes)?
- Auf welchem Timeframe wird die Bestätigung gesucht (M1/M5/M15/...)?
- Reicht ein einzelnes Signal, oder ist eine Kombination nötig?
- Gibt es eine Zeitfenster-Begrenzung, wie lange nach einem Liquidity-Event eine Confirmation noch zählt?

*(Platzhalter — hier folgen Daniels exakte Regeln.)*

## 9. Entry

**Status:** 🔴 TODO — noch nicht definiert

Leitfragen:
- Wie wird genau eingestiegen (Market-Order, Limit am POI, Retest-Bestätigung, bestimmter Prozentsatz der Zone)?
- Gibt es unterschiedliche Entry-Modelle je nach Setup-Typ (z. B. OB vs. FVG vs. Breaker)?
- Gibt es einen maximalen Preisabstand zum POI, ab dem ein Entry nicht mehr gültig ist?

*(Platzhalter — hier folgen Daniels exakte Regeln.)*

## 10. Exit

**Status:** 🔴 TODO — noch nicht definiert

Leitfragen:
- Wie werden Take-Profit-Level bestimmt (nächstes Liquidity-Level, festes RR, Teilausstiege)?
- Gibt es Trailing-Regeln?
- Unter welchen Bedingungen wird vorzeitig ausgestiegen (z. B. Strukturbruch gegen die Position)?

*(Platzhalter — hier folgen Daniels exakte Regeln.)*

## 11. Risk Management

**Status:** 🔴 TODO — noch nicht definiert

Leitfragen:
- Wie wird die Positionsgröße bestimmt, und wie viel Risiko pro Trade ist erlaubt?
- Gibt es Tages-/Wochenverlustlimits?
- Wie viele gleichzeitig offene Positionen sind erlaubt?
- Gibt es ein anderes Verhalten nach einer Verlustserie (z. B. Pause, reduziertes Risiko)?

*(Platzhalter — hier folgen Daniels exakte Regeln.)*

## 12. No Trades

**Status:** 🔴 TODO — noch nicht definiert

Leitfragen:
- Welche Marktbedingungen werden explizit gemieden (z. B. Range-bound, dünne Liquidität, bestimmte Wochentage/Uhrzeiten)?
- Gibt es Setups, die zwar technisch valide aussehen, aber trotzdem nicht gehandelt werden?

*(Platzhalter — hier folgen Daniels exakte Regeln.)*

## 13. Session-Regeln

**Status:** 🔴 TODO — noch nicht definiert

Leitfragen:
- Welche Sessions werden gehandelt (Asia/London/New York/Overlap)?
- Gibt es bevorzugte Zeitfenster innerhalb einer Session?
- Gibt es Sessions oder Tageszeiten, die komplett gemieden werden?

*(Platzhalter — hier folgen Daniels exakte Regeln.)*

## 14. News

**Status:** 🔴 TODO — noch nicht definiert

Leitfragen:
- Wie wird mit Hochimpact-News umgegangen (Pause davor/danach, offene Positionen schließen, Session komplett meiden)?
- Welche News-Kategorien sind für XAUUSD überhaupt relevant?
- Wie lange vor/nach einem Event gilt die Regel?

*(Platzhalter — hier folgen Daniels exakte Regeln.)*

## 15. Beispiele

**Status:** 🔴 TODO — noch nicht definiert

Konkrete, kommentierte Trade-Beispiele — Datum, Chart-Referenz (Screenshot-Pfad
oder Link), Setup-Ablauf Schritt für Schritt (Bias → Liquidity-Event → POI →
Confirmation → Entry → Exit). Dient später als Referenz für die Learning Engine
und zur Validierung, ob die Module die Regeln oben korrekt umsetzen.

*(Platzhalter — hier folgen Daniels Beispiel-Trades.)*

## 16. Edge Cases

**Status:** 🔴 TODO — noch nicht definiert

Ungewöhnliche Situationen und wie damit umgegangen wird, z. B.:
- Zwei gültige POIs unterschiedlicher Richtung gleichzeitig aktiv
- Bias wechselt mitten in einem laufenden Setup
- Sweep ohne jede Reaktion danach
- Wochenend-Gap direkt durch einen aktiven POI
- Session-Überlappung mit widersprüchlichen Signalen

*(Platzhalter — hier folgen Daniels Regeln für Sonderfälle.)*
