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

**Stand dieses Dokuments:** Alle 17 Kapitel sind jetzt mit Daniels Text
ausgefüllt (🟢 DEFINIERT). Die Implementierung erfolgt weiterhin nicht
automatisch und nicht gleichzeitig — sie folgt Kapitel für Kapitel dem Pfad
Regel → Implementierung → Tests → Deploy → BUILD FERTIG (siehe
[`ROADMAP.md`](../ROADMAP.md)). `DG_RULES_DEFINED` in `marketBrain.js` bleibt
bis auf Weiteres unverändert (alle Flags `false`), bis die jeweilige
Implementierung tatsächlich gebaut und getestet ist — ein definiertes Kapitel
hier heißt noch nicht "im Code aktiv".

## Status-Übersicht

Ein schneller Überblick, welche Kapitel bereits Daniels Regeln enthalten. Wird
manuell aktualisiert, sobald ein Kapitel ausgefüllt wird.

| # | Kapitel | Status |
|---|---|---|
| 0 | [DG Philosophy](#0-dg-philosophy) | 🟢 DEFINIERT |
| 1 | [DG HTF Bias](#1-dg-htf-bias) | 🟢 DEFINIERT |
| 2 | [DG Liquidity](#2-dg-liquidity) | 🟢 DEFINIERT |
| 3 | [DG Premium / Discount](#3-dg-premium--discount) | 🟢 DEFINIERT |
| 4 | [DG Order Block](#4-dg-order-block) | 🟢 DEFINIERT |
| 5 | [DG Valid FVG](#5-dg-valid-fvg-fair-value-gap) | 🟢 DEFINIERT |
| 6 | [DG Inverse FVG (iFVG)](#6-dg-inverse-fvg-ifvg) | 🟢 DEFINIERT |
| 7 | [DG Breaker](#7-dg-breaker) | 🟢 DEFINIERT |
| 8 | [DG Confirmation](#8-dg-confirmation) | 🟢 DEFINIERT |
| 9 | [DG Entry](#9-dg-entry) | 🟢 DEFINIERT |
| 10 | [DG Exit / Take Profit](#10-dg-exit--take-profit) | 🟢 DEFINIERT |
| 11 | [DG Risk Management](#11-dg-risk-management) | 🟢 DEFINIERT |
| 12 | [DG No-Trade Rules](#12-dg-no-trade-rules) | 🟢 DEFINIERT |
| 13 | [DG Sessions & Timing](#13-dg-sessions--timing) | 🟢 DEFINIERT |
| 14 | [DG News](#14-dg-news) | 🟢 DEFINIERT |
| 15 | [DG Examples](#15-dg-examples) | 🟢 DEFINIERT |
| 16 | [DG Edge Cases](#16-dg-edge-cases) | 🟢 DEFINIERT |

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
Module berechnen aktuell ausschließlich Market Facts (siehe `docs/MARKET_BRAIN.md`)
und werden Kapitel für Kapitel um die jeweilige DG-Interpretation erweitert,
sobald Regel → Implementierung → Tests → Deploy für dieses Kapitel durchlaufen
ist — nicht neu gebaut.

| Kapitel | Zuständiges Modul (Stand heute) |
|---|---|
| DG Philosophy | kein einzelnes Modul — Leitbild/Kontext für die Auslegung aller anderen Kapitel, kein direkt ausführbarer Code |
| DG HTF Bias | `computeOverallBias()` (Modul 11, `marketBrain.js`) liest Struktur (Modul 9) + Premium/Discount + Liquidity-Sweeps über Weekly/Daily/4H/H1 als reine Fakten aus, bildet daraus aber bewusst **keinen** Bias-Verdikt — `overallBias` bleibt `AWAITING_DG_RULE`, bis `DG_RULES_DEFINED.htfBias` im Code auf `true` gesetzt UND die Regelanwendung implementiert ist |
| DG Liquidity | `computeLiquidityEngine()` + `previousDayLiquidityFrom()`/`swingLiquidityFrom()` in `marketBrain.js` — Level-Status (touched/sweeped/active) bereits real; Sweep-/Inducement-Bewertung nach Kapitel 2 noch nicht implementiert |
| DG Premium / Discount | `computePremiumDiscountForRange()` (Modul 11) für Weekly/Daily/4H — Zonenberechnung (Premium/Discount/Equilibrium) bereits real als Fakt, DG-spezifische Range-Auswahl/Fib-Bereiche nach Kapitel 3 noch nicht implementiert |
| DG Order Block | `detectOrderBlocks()` (POI Engine, Modul 7) — Erkennung bereits real; `rankPOI()` (Modul 11) liefert bewusst `score:null, quality:'AWAITING_DG_RULE'`, bis Kapitel 4 implementiert ist |
| DG Valid FVG | `detectFairValueGaps()` (POI Engine, Modul 7) — Erkennung bereits real; `rankPOI()` (Modul 11) liefert bewusst `score:null, quality:'AWAITING_DG_RULE'`, bis Kapitel 5 implementiert ist |
| DG Inverse FVG | `detectInverseFairValueGaps()` (POI Engine, Modul 7) — noch nicht implementiert |
| DG Breaker | `detectBreakers()` (POI Engine, Modul 7) — noch nicht implementiert |
| DG Confirmation | noch nicht gebaut — Confirmation Engine |
| DG Entry / Exit | noch nicht gebaut |
| DG Risk Management | noch nicht gebaut |
| DG No-Trade Rules | noch nicht gebaut |
| DG Sessions & Timing | `SESSIONS`-Konfiguration in `app.js` deckt aktuell nur Zeitfenster ab, keine Handelsregeln |
| DG News | noch nicht gebaut — Kapitel 14 verlangt explizit zuerst eine Economic-Calendar-Datenquelle |
| DG Examples / Edge Cases | Referenz für die spätere Learning Engine und für Tests der Daniel Decision Engine |

Sobald ein Kapitel implementiert ist, liest die **DG Confidence Engine** (Modul 8,
`CONFIDENCE_CONTRIBUTORS` in `app.js`) und die **Daniel Decision Engine**
(Modul 10, `DG_RULES_DEFINED` in `marketBrain.js`) diese Regeln direkt aus diesem
Dokument — nie aus eigenen Annahmen. `DG_RULES_DEFINED` ist eine von Hand
gepflegte Kopie der Status-Übersicht oben; ein Kapitel-Flag wird dort erst
auf `true` gesetzt, wenn dieses Kapitel hier wirklich definiert UND die
zugehörige Implementierung fertig und getestet ist — niemals vorher.

---

## 0. DG Philosophy

**Status:** 🟢 DEFINIERT

Dieses Kapitel beschreibt **keine Regeln**, sondern Daniels grundlegende Sicht
auf den Markt — das Leitbild, vor dessen Hintergrund alle Regeln in den
folgenden Kapiteln zu lesen sind. Wo ein späteres Kapitel unklar oder
mehrdeutig ist, ist dieses Kapitel der Maßstab dafür, im Sinne welcher
Grundhaltung die Regel gemeint war.

Der Markt wird primär über Liquidity gelesen.

Grundprinzip:
"Understand the liquidity or be the liquidity."

DG OS versucht nicht vorherzusagen, wohin der Markt gehen MUSS.
Das System identifiziert:
1. Wo relevante Liquidity liegt
2. Welche Liquidity bereits genommen wurde
3. Wo der Markt darauf reagiert
4. Welche relevanten POIs im aktuellen Kontext liegen
5. Ob eine valide Confirmation entsteht
6. Wo die nächste plausible Liquidity / das nächste Ziel liegt

Top-Down-Ansatz:
HTF Context → Liquidity → POI → Sweep → Confirmation → Entry → Target

Ein POI alleine ist kein Entry.
Ein Sweep alleine ist kein Entry.
Premium/Discount alleine ist kein Entry.

Je mehr unabhängige DG-Confluences zusammenkommen, desto höher die Qualität eines Setups.

Der aktuelle Markt-Kontext hat Vorrang vor starren Vorhersagen.

Wenn die notwendigen Bedingungen nicht erfüllt sind:
WAIT / NO TRADE.

DG OS darf niemals eine Confirmation, Liquidity oder Trading-Regel erfinden, nur um ein Signal auszugeben.

## 1. DG HTF Bias

**Status:** 🟢 DEFINIERT

Der HTF Bias wird Top-Down bestimmt.

Priorität der Timeframes:
Monthly → Weekly → Daily → 4H

Monthly und Weekly liefern den übergeordneten Makro-Kontext.
Daily und 4H liefern den aktuell relevanteren Trading-Kontext.

Der Bias darf nicht ausschließlich anhand der Kerzenfarbe oder eines einzelnen BOS/CHoCH bestimmt werden.

Für die Bias-Bestimmung werden kombiniert:
- aktuelle Marktstruktur
- relevante HTF Highs und Lows
- vorhandene bzw. gesweepte Liquidity
- aktueller Premium-/Discount-Bereich
- relevante HTF POIs
- nächstes plausibles Liquidity Target

Mögliche Zustände:
BULLISH
BEARISH
NEUTRAL / MIXED

Ein höherer Timeframe gibt Kontext, verbietet aber nicht automatisch einen Trade in die Gegenrichtung auf einem niedrigeren Timeframe.

Beispiel:
Weekly kann bullish sein, während Daily/4H kurzfristig bearish laufen, um Sellside Liquidity oder einen tieferen HTF POI zu erreichen.

Deshalb müssen DG OS und der Report getrennt darstellen:
- Macro Bias: Monthly/Weekly
- Trading Bias: Daily/4H

Bei widersprüchlichen Timeframes darf DG OS den Konflikt nicht künstlich auflösen.
Der Zustand wird als MIXED dargestellt und der konkrete Liquidity-Kontext entscheidet, welche Bewegung aktuell wahrscheinlicher relevant ist.

Ein Bias allein ist niemals ein Entry-Signal.

Falls nicht genügend valide Informationen für einen Bias vorhanden sind:
NEUTRAL / AWAITING_CONFIRMATION.

## 2. DG Liquidity

**Status:** 🟢 DEFINIERT

Liquidity ist eines der zentralen Elemente des DG Trading Brain.

Grundprinzip:
Der Markt bewegt sich von Liquidity zu Liquidity.
DG OS soll deshalb unterscheiden zwischen:
- bereits genommener Liquidity
- noch offener Liquidity
- relevanter Liquidity
- untergeordneter Liquidity / Inducement

Relevante Liquidity Points sind insbesondere:
- Previous Monthly High / Low
- Previous Weekly High / Low
- Previous Daily High / Low
- Previous 4H High / Low
- relevante Swing Highs / Swing Lows
- Equal Highs / Equal Lows
- Session Highs / Lows
- Asia High / Low
- London High / Low
- New York High / Low

Buyside Liquidity liegt oberhalb relevanter Highs.
Sellside Liquidity liegt unterhalb relevanter Lows.

Nicht jedes sichtbare High oder Low besitzt dieselbe Relevanz.
HTF Liquidity und klar erkennbare, noch nicht abgeholte Liquidity erhalten grundsätzlich höhere Bedeutung als kleine interne LTF-Punkte.

**Sweep:**

Ein Sweep entsteht, wenn der Markt einen relevanten Liquidity Point überschreitet bzw. unterschreitet und anschließend wieder zurück reagiert.

Buyside Sweep:
Preis nimmt relevante Liquidity oberhalb eines Highs.

Sellside Sweep:
Preis nimmt relevante Liquidity unterhalb eines Lows.

Ein Sweep allein ist KEIN Entry.

Nach einem Sweep müssen Kontext, Reaktion, POI und gegebenenfalls LTF Confirmation separat bewertet werden.

**Liquidity Grab / Reaction:**

Je stärker und unmittelbarer die Reaktion nach dem Liquidity Take, desto relevanter kann der Sweep für das aktuelle Setup sein.

DG OS soll deshalb erfassen:
- welches Liquidity Level genommen wurde
- Zeitpunkt des Sweeps
- Timeframe des Levels
- Sweep-Richtung
- Distanz über/unter dem Level
- Reaktion nach dem Sweep
- ob anschließend Displacement entsteht
- ob anschließend relevante Structure gebrochen wird

**Inducement:**

Interne bzw. kleinere Liquidity kann als Inducement dienen, wenn sie Marktteilnehmer in eine Richtung zieht, bevor ein relevanteres externes Liquidity-Ziel abgeholt wird.

DG OS darf jedoch nicht jedes kleine Swing High/Low automatisch als Inducement klassifizieren.

Wenn der Kontext für Inducement nicht eindeutig durch eine definierte DG-Regel bestimmt werden kann:
AWAITING_DG_RULE.

**Wichtig:**

Liquidity muss immer im Kontext betrachtet werden.

Beispiel:
Wenn London das Asia High sweeped, kann anschließend eine Bewegung Richtung Asia Low bzw. tieferer Sellside Liquidity relevant werden.

Das ist jedoch keine automatische Sell-Regel.
POI, Reaktion, Marktstruktur und Confirmation müssen weiterhin berücksichtigt werden.

Offene gegenüberliegende Liquidity kann als potenzielles Target dienen.

DG OS darf niemals nur deshalb BUY oder SELL ausgeben, weil Liquidity gesweept wurde.

Pipeline:
Liquidity identifizieren
→ Sweep erkennen
→ Reaktion beobachten
→ POI / Kontext prüfen
→ Confirmation prüfen
→ erst danach mögliche Trade-Entscheidung.

## 3. DG Premium / Discount

**Status:** 🟢 DEFINIERT

Premium und Discount werden immer innerhalb einer relevanten aktuellen Range bestimmt.

Grundprinzip:
- Unterhalb 50 % = Discount
- Oberhalb 50 % = Premium
- 50 % = Equilibrium (EQ)

Für Long-Setups werden POIs im Discount bevorzugt.
Für Short-Setups werden POIs im Premium bevorzugt.

Wichtige Fibonacci-Bereiche für DG:
- 0.50 = Equilibrium
- 0.68–0.78 = bevorzugter Retracement-/OTE-Bereich
- 0.85–0.89 = tiefer/extremer Retracement-Bereich

**Wichtig:**
DG OS darf nicht irgendein beliebiges High und Low verwenden, um Premium/Discount zu berechnen.

Die Range muss aus einer relevanten Marktbewegung bzw. einem relevanten Swing High und Swing Low stammen und zum aktuell analysierten Timeframe/Setup gehören.

HTF-Ranges haben für HTF-Kontext Priorität.
LTF-Ranges dürfen für Entry-Verfeinerung innerhalb des HTF-Kontexts verwendet werden.

Premium/Discount ist eine Confluence und niemals alleine ein Entry-Signal.

Ein Long im Premium oder Short im Discount ist nicht automatisch verboten, wenn Liquidity, Marktstruktur, POI und Confirmation den Trade im aktuellen Kontext rechtfertigen.

Falls DG OS keine eindeutig relevante Range bestimmen kann:
PREMIUM_DISCOUNT = UNDEFINED / AWAITING_DG_RULE.

Keine Range darf künstlich gewählt werden, nur damit ein Setup in Premium oder Discount liegt.

## 4. DG Order Block

**Status:** 🟢 DEFINIERT

Ein Order Block (OB) ist für DG OS nicht einfach die letzte Gegenkerze vor einer Bewegung.

Ein relevanter Order Block muss im Markt-Kontext bewertet werden.

**Grundlogik:**

Ein hochwertiger DG Order Block entsteht bevorzugt in Verbindung mit:

1. relevanter Liquidity bzw. einem Liquidity Grab / Sweep
2. einer deutlichen Reaktion vom Bereich
3. impulsiver Bewegung / Displacement weg vom Bereich
4. einer dadurch entstandenen bzw. noch offenen FVG / Imbalance
5. idealerweise anschließendem Structure Break / BOS

Ein BOS erhöht die Qualität des Order Blocks, ist aber nicht in jedem Fall zwingend erforderlich.

**Order-Block-Bereich:**

Ein Order Block kann aus einer oder mehreren zusammengehörenden Gegenkerzen bestehen.

DG OS darf deshalb nicht grundsätzlich nur eine einzelne letzte Gegenkerze markieren.

Bullish OB:
Gegenläufige bearish Candle bzw. zusammengehörende bearish Candles vor einer relevanten bullish Expansion.

Bearish OB:
Gegenläufige bullish Candle bzw. zusammengehörende bullish Candles vor einer relevanten bearish Expansion.

**Qualität / Ranking:**

Ein OB erhält höhere Relevanz, wenn mehrere Faktoren zusammenkommen:

- vorheriger Liquidity Sweep / Grab
- starke unmittelbare Reaktion
- Displacement
- offene FVG / Imbalance
- Structure Break / BOS
- Lage in relevantem Premium/Discount
- HTF-Kontext unterstützt die Idee
- OB ist frisch bzw. noch nicht stark mitigiert

**Mitigation:**

Ein bereits angelaufener OB verliert mit zunehmender Mitigation an Qualität.

Wenn ein großer Teil des relevanten Bereichs bereits gehandelt bzw. abgeholt wurde, soll DG OS seine Qualität entsprechend reduzieren.

Als V1-Richtwert:
Ist mehr als ca. 65 % des relevanten OB-Bereichs bereits mitigiert, soll er nicht mehr als frischer High-Quality-POI behandelt werden.

Dieser Wert ist ein Qualitätsfilter und kein automatisches Trade-Verbot.

**POI:**

Ein gültiger Order Block kann als Point of Interest (POI) verwendet werden.

Der Touch eines Order Blocks ist jedoch KEIN automatischer Entry.

Nach einem POI-Touch muss der weitere Kontext geprüft werden:
Liquidity → Reaktion → LTF Confirmation → mögliche Entry-Entscheidung.

**Counter-POI:**

Ein Order Block in Gegenrichtung kann als Counter-POI relevant sein.

Beispiel:
Bei einem laufenden BUY kann ein relevanter bearish OB oberhalb des Preises ein mögliches Mindestziel, Reaktionsgebiet oder Hindernis darstellen.

DG OS soll Counter-POIs deshalb nicht ignorieren, nur weil sie gegen die aktuelle Trade-Richtung zeigen.

**Wichtig:**

DG OS darf keinen Order Block allein aufgrund eines simplen Candle-Musters erzeugen.

Wenn die notwendigen Kontextinformationen für die Bewertung fehlen:
ORDER_BLOCK_QUALITY = UNDEFINED / AWAITING_DG_RULE.

Ein Order Block allein erzeugt niemals BUY oder SELL.

## 5. DG Valid FVG (Fair Value Gap)

**Status:** 🟢 DEFINIERT

Eine Fair Value Gap (FVG) ist eine 3-Kerzen-Imbalance, die durch eine impulsive Preisbewegung entsteht.

Bullish FVG:
Zwischen High der ersten Kerze und Low der dritten Kerze bleibt eine Preisineffizienz.

Bearish FVG:
Zwischen Low der ersten Kerze und High der dritten Kerze bleibt eine Preisineffizienz.

**Wichtig:**
Nicht jede technisch vorhandene FVG ist automatisch ein relevanter DG POI.

**Qualität:**

Eine FVG erhält höhere Relevanz, wenn sie mit mehreren Faktoren zusammenfällt:

- vorheriger relevanter Liquidity Sweep / Grab
- deutlicher Displacement
- Structure Break / BOS
- relevanter HTF-Kontext
- Lage in Premium / Discount
- Überschneidung bzw. Nähe zu einem relevanten Order Block
- frische / noch offene FVG
- Reaktion des Marktes auf den Bereich

HTF-FVGs besitzen grundsätzlich höhere Kontext-Relevanz.
LTF-FVGs können für Confirmation und Entry-Verfeinerung verwendet werden.

**Mitigation:**

DG OS muss unterscheiden zwischen:
- OPEN / UNMITIGATED
- PARTIALLY MITIGATED
- FULLY MITIGATED

Eine vollständig gefüllte FVG wird nicht mehr als offene FVG behandelt.

Mit zunehmender Mitigation sinkt grundsätzlich ihre Qualität als frischer POI.

**FVG + Order Block:**

Eine FVG, die sich mit einem relevanten Order Block überschneidet oder unmittelbar damit zusammenhängt, erhält zusätzliche Confluence.

Dies macht sie jedoch nicht automatisch zu einem Entry.

**Entry:**

Der reine Touch einer FVG ist KEIN automatischer BUY- oder SELL-Entry.

Pipeline:
FVG identifizieren
→ Qualität / Kontext bewerten
→ Liquidity berücksichtigen
→ POI-Touch
→ Reaktion / Confirmation
→ mögliche Entry-Entscheidung

**Counter-POI:**

Eine FVG in Gegenrichtung kann als Counter-POI, Reaktionsbereich oder mögliches Target relevant sein und darf nicht ignoriert werden.

DG OS soll FVGs über mehrere Timeframes erkennen und ihre Timeframe-Herkunft beibehalten.

Wenn eine FVG zwar technisch erkannt wird, aber ihre strategische Relevanz nicht eindeutig nach einer DG-Regel bestimmt werden kann:
FVG_QUALITY = UNDEFINED / AWAITING_DG_RULE.

Eine FVG allein erzeugt niemals BUY oder SELL.

## 6. DG Inverse FVG (iFVG)

**Status:** 🟢 DEFINIERT

Eine inverse Fair Value Gap (iFVG) entsteht, wenn eine bestehende FVG ihre ursprüngliche Funktion verliert und der Markt sie anschließend in Gegenrichtung als relevanten Bereich verwendet.

**Grundlogik:**

Bullish FVG verliert ihre ursprüngliche bullish Funktion
→ Markt handelt/breakt durch die FVG
→ Bereich kann anschließend als bearish iFVG relevant werden.

Bearish FVG verliert ihre ursprüngliche bearish Funktion
→ Markt handelt/breakt durch die FVG
→ Bereich kann anschließend als bullish iFVG relevant werden.

**Wichtig:**
Nicht jede gebrochene FVG wird automatisch zu einer validen DG iFVG.

**Qualität:**

Eine iFVG erhält höhere Relevanz, wenn sie mit mehreren Faktoren zusammenkommt:

- vorheriger Liquidity Sweep / Grab
- klarer Bruch der ursprünglichen FVG
- Displacement in die neue Richtung
- Structure Shift / BOS / CHOCH
- relevanter HTF-Kontext
- Lage an einem relevanten POI
- sinnvolle Premium-/Discount-Lage
- deutliche Reaktion beim Retest

**Retest:**

Ein Retest einer validen iFVG kann als interessanter POI dienen.

Der reine Touch einer iFVG ist jedoch KEIN automatischer Entry.

Pipeline:
ursprüngliche FVG
→ Invalidierung / Break
→ Richtungswechsel der Funktion
→ iFVG
→ Retest / Reaktion
→ Confirmation
→ mögliche Entry-Entscheidung

**Timeframes:**

HTF-iFVGs dienen primär als Kontext und POIs.

LTF-iFVGs können später für Confirmation und Entry-Verfeinerung verwendet werden.

**Counter-POI:**

Eine iFVG in Gegenrichtung kann ebenfalls als Counter-POI, Reaktionsbereich oder Target relevant sein.

Wenn die technische FVG zwar gebrochen wurde, aber keine ausreichende DG-Regel für eine valide Inversion erfüllt ist:
IFVG_STATUS = UNDEFINED / AWAITING_DG_RULE.

Eine iFVG allein erzeugt niemals BUY oder SELL.

## 7. DG Breaker

**Status:** 🟢 DEFINIERT

Ein Breaker Block entsteht, wenn ein zuvor relevanter Order Block seine ursprüngliche Funktion verliert und der Markt den Bereich anschließend in Gegenrichtung verwendet.

**Grundlogik:**

Bullish Order Block wird klar invalidiert
→ Markt bricht durch den Bereich
→ ehemaliger bullish OB kann anschließend als bearish Breaker relevant werden.

Bearish Order Block wird klar invalidiert
→ Markt bricht durch den Bereich
→ ehemaliger bearish OB kann anschließend als bullish Breaker relevant werden.

**Wichtig:**
Nicht jeder gebrochene Order Block ist automatisch ein valider DG Breaker.

**Qualität:**

Ein Breaker erhält höhere Relevanz, wenn mehrere Faktoren zusammenkommen:

- vorherige relevante Liquidity wurde genommen
- ursprünglicher Order Block wurde klar invalidiert
- Displacement durch den ursprünglichen Bereich
- Structure Shift / BOS / CHOCH
- relevanter HTF-Kontext
- sinnvolle Premium-/Discount-Lage
- offene bzw. relevante FVG/iFVG in Verbindung mit dem Bereich
- deutliche Reaktion beim späteren Retest

**Retest:**

Nach der Invalidierung kann der ehemalige Order Block beim Retest in Gegenrichtung als POI dienen.

Der reine Touch eines Breakers ist KEIN automatischer Entry.

Pipeline:
ursprünglicher Order Block
→ Invalidierung
→ Displacement / Structure Shift
→ Breaker
→ Retest
→ Reaktion / Confirmation
→ mögliche Entry-Entscheidung

**Timeframe:**

HTF Breaker dienen primär als relevante POIs und Kontext.

LTF Breaker können später für Confirmation und Entry-Verfeinerung verwendet werden.

**Counter-POI:**

Ein Breaker in Gegenrichtung kann ebenfalls als Counter-POI, Reaktionsbereich oder mögliches Target relevant sein.

Wenn ein Order Block technisch gebrochen wurde, aber die Bedingungen für einen validen DG Breaker nicht eindeutig erfüllt sind:
BREAKER_STATUS = UNDEFINED / AWAITING_DG_RULE.

Ein Breaker allein erzeugt niemals BUY oder SELL.

## 8. DG Confirmation

**Status:** 🟢 DEFINIERT

Eine Confirmation wird erst relevant, nachdem der Markt in einem sinnvollen Kontext bzw. an einem relevanten POI angekommen ist.

Grundprinzip:

HTF Context
→ relevante Liquidity
→ Liquidity Sweep / Grab
→ relevanter POI
→ Reaktion
→ LTF Confirmation
→ möglicher Entry

DG OS darf eine Confirmation nicht isoliert betrachten.

Ein Engulfing irgendwo im Chart ist KEINE valide DG Confirmation.

**Primary Confirmation:**

Die bevorzugte Confirmation ist ein Engulfing in die erwartete Richtung.

Bullish Confirmation:
Nach einem relevanten Sellside Liquidity Sweep bzw. an einem relevanten bullish POI entsteht eine deutliche bullish Reaktion mit bullish Engulfing.

Bearish Confirmation:
Nach einem relevanten Buyside Liquidity Sweep bzw. an einem relevanten bearish POI entsteht eine deutliche bearish Reaktion mit bearish Engulfing.

**Timing:**

Die Qualität der Confirmation ist höher, wenn sie zeitnah nach dem Sweep bzw. POI-Touch entsteht.

Eine unmittelbare Reaktion ist grundsätzlich relevanter als ein Engulfing, das erst deutlich später ohne klaren Zusammenhang entsteht.

**Secondary Confirmations:**

Wenn kein sauberes Engulfing vorhanden ist, können auch deutliche Rejection-Candles zusätzliche Information liefern, insbesondere:

- Hammer / Pinbar-artige Rejection
- Doji mit klarer Rejection

Diese sind grundsätzlich schwächer als ein sauberes Engulfing und dürfen nicht automatisch gleich bewertet werden.

**Structure Confirmation:**

Ein anschließender BOS / CHOCH bzw. Structure Shift in die erwartete Richtung erhöht die Qualität einer Confirmation.

Structure Confirmation ist zusätzliche Confluence und nicht zwingend in jedem Setup erforderlich.

**Displacement:**

Starkes Displacement nach der Confirmation erhöht die Qualität.

Wenn durch die Reaktion zusätzlich eine neue FVG entsteht, kann diese später für die Entry-Verfeinerung verwendet werden.

**Timeframe:**

Für V1 soll die Confirmation primär auf 15M geprüft werden.

30M und 1H können zusätzliche Context-/Confirmation-Information liefern.

5M und 1M werden später für präzisere Entry-Modelle ergänzt und sind aktuell noch nicht Teil der automatischen V1-Entry-Logik.

**Valid Confirmation:**

Eine Confirmation erhält höhere Qualität, wenn mehrere Punkte zusammenkommen:

- relevante Liquidity wurde zuvor genommen
- Markt befindet sich an/in einem relevanten POI
- unmittelbare Reaktion
- Engulfing in erwartete Richtung
- Displacement
- BOS / CHOCH / Structure Shift
- neue FVG in erwartete Richtung
- HTF Context unterstützt das Szenario

**Invalid / Low Quality:**

Eine Confirmation soll nicht als hochwertig gelten, wenn:

- sie ohne relevanten Kontext irgendwo im Markt entsteht
- keine relevante Liquidity / kein relevanter POI vorhanden ist
- sie deutlich verspätet zum eigentlichen Event entsteht
- die Reaktion schwach ist
- sie klar gegen den dominanten aktuellen Kontext läuft, ohne dass eine entsprechende Gegenbewegung begründet ist

**Status:**

DG OS soll unterscheiden zwischen:

NO_CONFIRMATION
REACTION_DETECTED
CONFIRMATION_DEVELOPING
ENGULFING_CONFIRMED
STRUCTURE_CONFIRMED

Diese Zustände sollen später Alerts ermöglichen.

Beispiel:

"XAUUSD hat den relevanten 4H Buy POI erreicht."

Danach:

"Reaktion im POI erkannt – Confirmation beobachten."

Danach:

"15M bullish Engulfing bestätigt."

Dadurch kann DG OS Gomes informieren, auch wenn er gerade nicht am Chart ist.

**Wichtig:**

Confirmation allein erzeugt noch keinen automatischen Trade.

Die finale Entry-Entscheidung muss weiterhin den gesamten DG Context berücksichtigen.

Wenn nicht eindeutig bestimmt werden kann, ob eine Reaktion die DG Confirmation-Regeln erfüllt:
CONFIRMATION_STATUS = AWAITING_DG_RULE

DG OS darf niemals eine Confirmation erfinden, um ein Setup zu erzeugen.

## 9. DG Entry

**Status:** 🟢 DEFINIERT

Ein Entry entsteht erst am Ende der vollständigen DG Decision Pipeline.

Grundprinzip:

HTF Context
→ Liquidity
→ Sweep / Grab
→ relevanter POI
→ Reaktion
→ Confirmation
→ Entry

Ein POI-Touch allein ist KEIN Entry.
Ein Sweep allein ist KEIN Entry.
Ein Engulfing allein ist KEIN Entry.

**Entry Status:**

DG OS soll für V1 folgende Zustände unterscheiden:

WAIT
WATCH_BUY
WATCH_SELL
BUY_CONFIRMATION
SELL_CONFIRMATION
BUY_READY
SELL_READY

WAIT:
Aktuell ist kein ausreichend relevantes Setup vorhanden.

WATCH_BUY:
Ein potenzielles bullish Szenario entwickelt sich, aber es fehlt noch Confirmation.

WATCH_SELL:
Ein potenzielles bearish Szenario entwickelt sich, aber es fehlt noch Confirmation.

BUY_CONFIRMATION / SELL_CONFIRMATION:
Der Markt befindet sich im relevanten Bereich und DG OS wartet konkret auf die definierte Confirmation.

BUY_READY / SELL_READY:
Die für das Setup notwendigen DG-Bedingungen sind erfüllt und ein möglicher Entry darf angezeigt bzw. gemeldet werden.

BUY_READY oder SELL_READY bedeutet in V1 ausdrücklich NICHT:
Order automatisch ausführen.

**Entry Direction:**

BUY wird grundsätzlich erst interessant, wenn:

- bullish Szenario mit HTF-/Liquidity-Kontext vorhanden ist
- relevante Sellside Liquidity genommen wurde bzw. der notwendige Liquidity-Kontext erfüllt ist
- Preis einen relevanten bullish POI erreicht
- eine valide bullish Reaktion / Confirmation entsteht

SELL entsprechend umgekehrt:

- bearish Szenario mit HTF-/Liquidity-Kontext
- relevante Buyside Liquidity genommen bzw. notwendiger Liquidity-Kontext erfüllt
- relevanter bearish POI
- valide bearish Reaktion / Confirmation

**Entry Method V1:**

Für V1 soll DG OS zunächst einen validen Entry-Bereich bzw. eine Entry-Idee bestimmen und NICHT automatisch handeln.

Nach einer validen Confirmation kann eine durch das Displacement entstandene bzw. relevante FVG als mögliche Entry-Zone verwendet werden.

Wenn keine valide FVG für eine präzise Entry-Zone vorhanden ist, darf DG OS nicht künstlich eine erzeugen.

Dann:
ENTRY_ZONE = UNDEFINED

**Stop Loss:**

Der Stop Loss soll grundsätzlich dort liegen, wo die Trade-Idee logisch invalidiert ist und möglichst keine relevante offene Liquidity direkt vor dem Stop liegt.

Grundprinzip:
SL an einem logischen Invalidationspunkt / "no liquidity".

DG OS darf den Stop Loss NICHT einfach über eine fixe Pip-Anzahl bestimmen.

Mögliche Grundlage:
- hinter relevantem Sweep Extreme
- hinter relevantem POI
- hinter relevantem Swing High / Low
- dort, wo das Setup strukturell invalidiert wäre

Die genaue Auswahl muss vom jeweiligen Setup-Kontext abhängen.

**Entry Quality:**

DG OS soll für einen möglichen Entry nachvollziehbar darstellen:

- direction
- entryZone
- confirmation
- POI
- liquidityEvent
- invalidationLevel
- target
- confidence
- reasons

**No Forced Entry:**

Wenn der Markt nach einem Sweep direkt läuft und keinen sinnvollen Entry bietet:
NO ENTRY / MISSED

DG OS darf einem bereits gelaufenen Move nicht hinterherjagen und keinen künstlichen Entry erzeugen.

**Multi-Timeframe:**

V1:
15M dient primär für die Entry-Confirmation.

Später:
5M Confirmation
→ 1M FVG / präzise Entry Box

Diese spätere LTF-Logik jetzt noch NICHT automatisch implementieren.

**Important:**

DG OS ist in V1 ein Decision-Support-System.

Es darf:
- BUY_READY melden
- SELL_READY melden
- Entry Zone anzeigen
- Invalidationslevel anzeigen
- Targets anzeigen
- Gomes benachrichtigen

Es darf noch NICHT:
- Broker Orders platzieren
- Positionen automatisch eröffnen
- Positionen automatisch schließen
- Positionsgrößen selbstständig bestimmen

Automatische Execution wird erst später separat freigegeben.

Wenn eine notwendige DG-Regel für einen Entry fehlt:
ENTRY_STATUS = AWAITING_DG_RULE

Keine fehlende Regel darf durch eine generische Trading-Regel ersetzt werden.

## 10. DG Exit / Take Profit

**Status:** 🟢 DEFINIERT

Take Profits und Exit-Ziele werden primär anhand der Marktstruktur und relevanter Liquidity bestimmt.

Grundprinzip:

Der Markt bewegt sich von Liquidity zu Liquidity.

Deshalb soll DG OS zuerst bestimmen:
"Wo liegt das nächste plausible Ziel des Marktes?"

und nicht:
"Wo liegt mathematisch 1:2 oder 1:3?"

**Primary Targets:**

Mögliche relevante Targets sind insbesondere:

- offene Buyside / Sellside Liquidity
- relevante Swing Highs / Swing Lows
- Previous Daily High / Low
- Previous Weekly High / Low
- Previous Monthly High / Low
- Session Highs / Lows
- Equal Highs / Equal Lows
- relevante Counter-POIs
- offene gegensätzliche FVGs
- gegensätzliche Order Blocks / Breaker / iFVGs

**Counter-POI:**

Counter-POIs sind besonders wichtig.

Beispiel:

DG OS befindet sich in einem BUY-Szenario.

Oberhalb des Preises liegt ein relevanter bearish POI.

Dieser bearish POI kann als:
- Mindestziel
- Reaktionsbereich
- TP-Bereich
- potenzielles Hindernis

verwendet werden.

Entsprechend umgekehrt bei SELL-Szenarien.

DG OS darf Counter-POIs nicht ignorieren.

**Target Priority:**

Targets sollen nach Relevanz priorisiert werden.

Beispiel:

PRIMARY TARGET
SECONDARY TARGET
EXTENDED TARGET

Die Priorität soll unter anderem berücksichtigen:

- Timeframe des Liquidity Levels
- ob Liquidity noch offen ist
- aktuelle Marktstruktur
- HTF Bias / Trading Bias
- Entfernung zum Preis
- Counter-POIs auf dem Weg
- bereits abgeholte Liquidity

**R:R:**

Risk-to-Reward wird zusätzlich berechnet und angezeigt.

Es bestimmt aber NICHT automatisch das Markt-Target.

DG OS kann beispielsweise anzeigen:

Market Target: 4385
R:R bis Market Target: 1:2.4

Dadurch bleibt die Marktlogik primär und das R:R dient als Qualitäts-/Risk-Information.

**TP1 / TP2 / TP3:**

Wenn mehrere sinnvolle Targets vorhanden sind, darf DG OS sie als:

TP1
TP2
TP3

strukturieren.

Diese sollen bevorzugt echten Markt-/Liquidity-Zielen entsprechen.

Falls keine sinnvollen gestaffelten Marktziele vorhanden sind, darf DG OS keine künstlichen Targets nur für TP1/TP2/TP3 erzeugen.

**Invalidation / Early Exit:**

Wenn sich die ursprüngliche Trade-Idee klar invalidiert, soll DG OS dies erkennen und melden.

Mögliche Gründe:

- relevante Struktur bricht gegen das Setup
- erwartete Reaktion scheitert
- POI wird klar invalidiert
- neuer Liquidity-/HTF-Kontext widerspricht der ursprünglichen Idee

Für V1 soll DG OS dies als Warnung / Statusänderung melden.

Noch KEINE Position automatisch schließen.

**Target Reached:**

Wenn ein definiertes Target erreicht wird, soll ein Event erzeugt werden.

Beispiele:

PRIMARY_TARGET_REACHED
TP1_REACHED
TP2_REACHED
TP3_REACHED

Dadurch kann DG OS später Gomes automatisch über Telegram informieren.

**Important:**

Ein mathematisches R:R ersetzt niemals die Marktlogik.

Market Structure + Liquidity + Counter-POIs bestimmen primär das Ziel.

Wenn kein valides Ziel nach DG-Regeln bestimmt werden kann:
TARGET = UNDEFINED / AWAITING_DG_RULE

DG OS darf kein Target erfinden, nur damit ein Setup vollständig aussieht.

## 11. DG Risk Management

**Status:** 🟢 DEFINIERT

Risk Management ist ein separater Teil der Trade-Entscheidung.

Ein technisch gutes Setup bedeutet nicht automatisch, dass ein Trade eingegangen werden sollte.

V1:

DG OS führt noch KEINE Orders automatisch aus und bestimmt noch KEINE Positionsgröße automatisch.

Das System soll jedoch bereits alle Informationen vorbereiten, die später für die Risk Engine benötigt werden.

**Stop Loss:**

Der Stop Loss wird aus der Marktlogik bestimmt und nicht über eine fixe Pip-Anzahl.

Der SL soll an einem logischen Invalidationspunkt liegen.

Mögliche Grundlage:

- hinter dem relevanten Sweep Extreme
- hinter dem relevanten POI
- hinter einem relevanten Swing High / Low
- an einem Punkt, an dem die ursprüngliche Trade-Idee klar invalidiert ist

Grundprinzip:

SL möglichst an "no liquidity".

DG OS soll vermeiden, einen SL direkt dort vorzuschlagen, wo offensichtlich relevante Liquidity liegt.

**Risk / Reward:**

DG OS berechnet für jedes BUY_READY / SELL_READY Setup das resultierende R:R anhand von:

- Entry bzw. Entry Zone
- Invalidationslevel / SL
- Primary Target
- weiteren Targets

Beispiel:

Entry: 4350
SL: 4340
Primary Target: 4375
R:R: 1:2.5

**Minimum Quality:**

Ein schlechtes R:R kann die Qualität eines ansonsten validen Setups reduzieren.

DG OS darf jedoch nicht das Markt-Target verschieben oder einen künstlich engen Stop verwenden, nur um ein besseres R:R zu erzeugen.

Marktlogik hat Vorrang vor einem künstlich erzeugten R:R.

**Multiple Targets:**

Falls TP1 / TP2 / TP3 vorhanden sind, soll DG OS das jeweilige R:R separat berechnen.

Beispiel:

TP1: 1:1
TP2: 1:2
TP3: 1:3.4

**Position Size:**

Für V1:

POSITION_SIZE = MANUAL

Gomes entscheidet selbst über:
- Kontogröße
- Risikoprozent
- Lot Size
- tatsächliche Ordergröße

Eine automatische Positionsgrößenberechnung kann später als eigenes Modul ergänzt werden.

**Setup Information:**

Für jedes tradebare Setup soll DG OS mindestens darstellen:

Direction
Entry Zone
Stop / Invalidation
Risk Distance
TP1
TP2
TP3
R:R pro Target
Setup Confidence
Setup Reasons

**No Forced Trade:**

Wenn ein sinnvoller Stop aufgrund der Marktstruktur zu weit entfernt liegt oder das resultierende R:R unattraktiv ist:

DG OS soll das transparent anzeigen.

Es darf niemals:
- den Stop künstlich verkleinern
- das Target künstlich vergrößern
- Marktinformationen verändern

nur damit ein Setup attraktiver aussieht.

**Automation:**

Automatische Risk-Ausführung ist in V1 ausdrücklich deaktiviert.

Keine:
- automatische Lot Size
- automatische Order
- automatische SL-Verschiebung
- automatische Teilgewinnmitnahme
- automatische Positionsschließung

Diese Funktionen werden erst später separat definiert und freigegeben.

**Important:**

Kapitalerhalt hat Vorrang vor der Erzeugung möglichst vieler Signale.

Wenn notwendige DG Risk-Regeln noch nicht definiert sind:
RISK_STATUS = AWAITING_DG_RULE

Keine fehlende Risk-Regel darf durch eine generische Regel ersetzt werden.

## 12. DG No-Trade Rules

**Status:** 🟢 DEFINIERT

DG OS muss nicht ständig einen Trade finden.

Grundprinzip:

NO TRADE / WAIT ist eine valide und wichtige Entscheidung.

Qualität hat Vorrang vor Quantität.

DG OS darf niemals ein Setup erzwingen, nur weil der Markt geöffnet ist oder einzelne Confluences vorhanden sind.

**Wait / No Trade:**

DG OS soll WAIT bzw. NO TRADE ausgeben, wenn unter anderem:

- kein klarer Markt-Kontext vorhanden ist
- HTF-Kontext widersprüchlich bzw. MIXED ist und keine klare Liquidity-Idee besteht
- keine relevante Liquidity erkennbar ist
- kein relevanter POI vorhanden ist
- der relevante POI bereits stark mitigiert / verbraucht ist
- der erwartete Liquidity Sweep fehlt
- keine ausreichende Reaktion entsteht
- notwendige Confirmation fehlt
- Confirmation deutlich verspätet entsteht
- der Markt bereits ohne sinnvollen Entry gelaufen ist
- Entry nur durch Chasing möglich wäre
- kein logisches Invalidationslevel / SL vorhanden ist
- kein sinnvolles Markt-Target vorhanden ist
- das Setup insgesamt zu wenig DG-Confluence besitzt

**Mixed Context:**

Ein Konflikt zwischen Timeframes ist nicht automatisch NO TRADE.

Beispiel:

Weekly bullish
Daily / 4H kurzfristig bearish

kann eine legitime Korrektur Richtung Sellside Liquidity oder eines tieferen HTF POIs darstellen.

DG OS soll deshalb zuerst den Liquidity-Kontext bewerten.

Wenn daraus keine klare Idee entsteht:
STATUS = WAIT / MIXED

**POI without Confirmation:**

Wenn Preis einen hochwertigen POI erreicht, aber noch keine valide Confirmation vorhanden ist:
STATUS = WATCH_BUY oder WATCH_SELL

NICHT:
BUY_READY / SELL_READY

**Missed Move:**

Wenn das erwartete Szenario bereits ohne validen Entry ausgelöst wurde und der Markt deutlich gelaufen ist:
STATUS = MISSED / NO_ENTRY

DG OS darf dem Markt nicht hinterherjagen.

**Low Quality:**

Ein technisch mögliches Setup mit schwachen Confluences soll nicht automatisch als tradebereit gelten.

DG OS soll lieber melden:
LOW_QUALITY / WAIT

statt ein künstlich hohes Confidence-Level zu erzeugen.

**Insufficient Data:**

Wenn notwendige Marktdaten fehlen oder nicht aktuell sind:
STATUS = DATA_NOT_READY

Keine Trading-Entscheidung darf aus unvollständigen oder veralteten Daten erzwungen werden.

**Unknown Rule:**

Wenn für eine Situation noch keine DG-Regel definiert wurde:
STATUS = AWAITING_DG_RULE

DG OS darf die fehlende Regel niemals selbst ergänzen.

**Important:**

WAIT ist kein Fehler des Systems.

Ein gutes DG Trading Brain soll nicht möglichst viele Signale produzieren.

Es soll Gomes nur dann aufmerksam machen, wenn sich ein nach seinen Regeln relevanter Markt-Kontext oder ein hochwertiges Setup entwickelt.

Grundsatz:
When in doubt → WAIT.

Keine erfundenen Trades.
Keine erzwungenen Setups.
Kein Chasing.

## 13. DG Sessions & Timing

**Status:** 🟢 DEFINIERT

Sessions dienen DG OS primär zur Einordnung von Liquidity und Marktverhalten.

Relevante Sessions:

- Asia
- London
- New York

DG OS soll für jede Session mindestens erfassen:

- Session High
- Session Low
- ob High/Low noch offen ist
- ob High/Low touched wurde
- ob High/Low gesweept wurde
- Zeitpunkt des Sweeps
- Reaktion nach dem Sweep

**Asia:**

Asia High und Asia Low sind wichtige Intraday-Liquidity-Referenzen.

DG OS soll beide Levels nach Abschluss bzw. während der relevanten Session verfolgen.

**Wichtig:**
Das bloße Entstehen eines Asia High oder Asia Low ist KEIN Signal und benötigt keine Benachrichtigung.

Relevant wird es insbesondere, wenn später Liquidity an diesen Levels genommen wird.

**London:**

London kann Asia Liquidity abholen und dadurch einen relevanten Intraday-Kontext erzeugen.

Wichtiger DG-Kontext:

Wenn London das Asia High sweeped, kann anschließend eine Bewegung in Richtung Asia Low bzw. tieferer Sellside Liquidity relevant werden.

Wenn London das Asia Low sweeped, kann entsprechend eine Bewegung in Richtung Asia High bzw. höherer Buyside Liquidity relevant werden.

Dies ist KEINE automatische Buy-/Sell-Regel.

DG OS muss weiterhin prüfen:

- HTF Context
- welche Liquidity tatsächlich relevant ist
- POIs
- Reaktion nach dem Sweep
- Structure
- Confirmation

**New York:**

New York soll im Kontext dessen bewertet werden, was Asia und London bereits gemacht haben.

DG OS soll erkennen:

- welche Session Liquidity bereits genommen wurde
- welche relevante Liquidity noch offen ist
- ob London bereits eine klare Expansion erzeugt hat
- welche HTF-/Intraday-Targets noch plausibel sind
- ob New York einen relevanten POI erreicht oder Liquidity sweeped

**Session Liquidity:**

Session Highs/Lows sind Liquidity Points.

Sie haben jedoch nicht automatisch dieselbe Priorität wie relevante HTF Liquidity.

HTF Context hat Vorrang.

Session Liquidity dient primär zur Verfeinerung des aktuellen Intraday-Szenarios.

**Alerts:**

Keine unnötigen Meldungen wie:

"Asia High created"
"London High created"

DG OS soll Gomes hauptsächlich informieren, wenn etwas tradingrelevantes passiert.

Beispiele:

"Asia High gesweept."

"London hat Buyside Liquidity genommen und reagiert."

"XAUUSD nähert sich dem relevanten 4H POI."

"POI erreicht – auf Confirmation achten."

"15M Confirmation erkannt."

**Timing:**

Ein Setup wird nicht allein aufgrund einer bestimmten Uhrzeit valide.

Session-Zeit ist Context, keine alleinige Entry-Regel.

**Swing / HTF Priority:**

DG OS ist primär HTF-/Swing-orientiert und kein Scalping-System.

Deshalb darf Session-Logik niemals Weekly/Daily/4H Context überschreiben.

Priorität:

HTF Context
→ HTF Liquidity / POIs
→ Session Context
→ LTF Confirmation

**Important:**

DG OS soll Sessions nutzen, um zu verstehen:

Was wurde bereits abgeholt?
Was ist noch offen?
Wo könnte der Markt als Nächstes hinziehen?

Nicht:

"Es ist London, deshalb SELL."

Wenn keine klare DG-Regel aus dem Session-Kontext entsteht:
SESSION_BIAS = NEUTRAL / AWAITING_CONFIRMATION

## 14. DG News

**Status:** 🟢 DEFINIERT

News sind für DG OS ein zusätzlicher Risiko- und Kontextfaktor.

Grundprinzip:

DG OS soll wichtige wirtschaftliche News berücksichtigen, die den aktuell analysierten Markt direkt beeinflussen können.

Für XAUUSD sind insbesondere relevante High-Impact-News wichtig, die USD, Zinsen, Inflation, Arbeitsmarkt oder die US-Geldpolitik betreffen können.

Beispiele:
- FOMC / Federal Reserve Entscheidungen
- Fed Press Conference
- CPI
- PPI
- NFP
- Arbeitsmarktdaten
- relevante US-Zinsentscheidungen
- andere klar als High Impact eingestufte USD-News

**Wichtig:**

News bestimmen nicht automatisch die Trading-Richtung.

DG OS darf nicht sagen:

"Positive USD News = Gold SELL"

oder

"Negative USD News = Gold BUY"

nur aufgrund des News-Ergebnisses.

Price Action, Liquidity und der DG Trading Context bleiben entscheidend.

**News Context:**

DG OS soll später mindestens erkennen:

- welches relevante Event bevorsteht
- Datum und Uhrzeit
- betroffene Währung
- Impact / Wichtigkeit
- Zeit bis zum Event
- ob ein aktuelles Setup zeitlich direkt mit High-Impact-News kollidiert

**Before News:**

Wenn sich ein Setup kurz vor relevanten High-Impact-News entwickelt, soll DG OS Gomes darauf hinweisen.

Beispiel:

"HIGH IMPACT USD NEWS in 20 Minuten – erhöhte Volatilität möglich."

Das Setup wird dadurch nicht automatisch invalidiert.

DG OS soll die News jedoch klar im Report und bei einem möglichen Setup anzeigen.

**After News:**

Nach High-Impact-News soll DG OS nicht die Schlagzeile interpretieren und blind eine Richtung vorgeben.

Stattdessen soll das System beobachten:

- welche Liquidity durch die News genommen wurde
- ob ein relevanter Sweep entstanden ist
- welche POIs erreicht wurden
- ob Displacement entstanden ist
- wie sich Structure verändert hat
- ob anschließend eine valide DG Confirmation entsteht

**News Spike:**

Ein News Spike allein ist keine Confirmation.

Wenn News Liquidity sweepen und anschließend eine valide DG-Reaktion nach den normalen Regeln entsteht, darf diese Situation anschließend wieder durch die normale DG Pipeline bewertet werden.

**V1:**

Falls noch keine zuverlässige Live-News-/Economic-Calendar-Datenquelle angebunden ist:
NEWS_STATUS = DATA_SOURCE_NOT_CONNECTED

DG OS darf keine News erfinden oder aus alten Daten ableiten.

Das Fehlen der News-Datenquelle darf die bereits funktionierende Market-Facts-/Trading-Brain-Infrastruktur nicht blockieren.

**Future:**

Später kann eine Economic-Calendar-Datenquelle angebunden werden und DG OS kann automatisch Telegram-Warnungen senden, zum Beispiel:

"⚠️ HIGH IMPACT: US CPI in 30 Minuten."

Diese Integration ist nicht zwingend erforderlich, um Trading Brain V1 fertigzustellen.

**Important:**

News = zusätzlicher Context / Risk Factor.

News ≠ automatischer Direction Bias.

Die Reaktion des Marktes auf Liquidity, POIs und Structure bleibt für DG OS entscheidend.

Wenn keine verlässlichen News-Daten vorhanden sind:

Keine Annahmen treffen.
NEWS_STATUS = DATA_SOURCE_NOT_CONNECTED.

## 15. DG Examples

**Status:** 🟢 DEFINIERT

Diese Beispiele dienen dazu, die Kombination der DG-Regeln zu verdeutlichen.

Sie sind Beispiele und keine zusätzlichen Trading-Regeln.

**Example 1 — Valid Buy Scenario**

Context:
- Weekly/Daily Context unterstützt grundsätzlich höhere Preise
- relevante Sellside Liquidity liegt unter dem Markt
- Preis handelt in einen relevanten bullish 4H POI
- Sellside Liquidity wird gesweept
- Markt reagiert unmittelbar
- 15M bullish Engulfing entsteht
- bullish Displacement folgt
- neue bullish FVG entsteht
- oberhalb liegt relevante offene Buyside Liquidity

DG OS Entwicklung:

WATCH_BUY
→ BUY_CONFIRMATION
→ BUY_READY

Report soll erklären:
- welche Liquidity genommen wurde
- welcher POI reagiert hat
- welche Confirmation entstanden ist
- mögliche Entry Zone
- logisches Invalidationslevel
- nächstes relevantes Target

Nicht einfach nur:
"BUY"

**Example 2 — Valid Sell Scenario**

Context:
- HTF-/aktueller Trading Context unterstützt tiefere Preise
- relevante Buyside Liquidity liegt oberhalb
- Preis erreicht einen bearish HTF POI
- Buyside Liquidity wird gesweept
- deutliche bearish Reaktion
- 15M bearish Engulfing
- bearish Displacement / Structure Shift
- unterhalb liegt relevante offene Sellside Liquidity

DG OS Entwicklung:

WATCH_SELL
→ SELL_CONFIRMATION
→ SELL_READY

Target wird primär aus relevanter Sellside Liquidity / Counter-POIs bestimmt.

**Example 3 — POI without Confirmation**

Context:
- hochwertiger bullish POI wird erreicht
- Kontext ist grundsätzlich interessant
- aber keine valide bullish Confirmation entsteht

DG OS:

WATCH_BUY

NICHT:
BUY_READY

Das System wartet.

**Example 4 — Liquidity Sweep without Setup**

Asia High wird gesweept.

Es existiert jedoch:
- kein relevanter bearish POI
- keine deutliche Reaktion
- keine Confirmation

DG OS:

Liquidity Event registrieren.

STATUS = WAIT

Kein SELL nur wegen des Asia-High-Sweeps.

**Example 5 — Counter-POI as Target**

Ein BUY ist valide.

Oberhalb liegt ein relevanter bearish HTF POI vor einem weiter entfernten Buyside-Liquidity-Level.

DG OS soll den bearish POI als möglichen:
- Reaktionsbereich
- TP
- Mindestziel / Hindernis

berücksichtigen.

Das weiter entfernte Liquidity-Level kann Secondary/Extended Target bleiben.

**Example 6 — Missed Move**

Alle ursprünglichen Bedingungen waren interessant, aber der Markt läuft nach der Confirmation stark weg, ohne einen sinnvollen Entry zu bieten.

DG OS:

STATUS = MISSED / NO_ENTRY

Kein Chasing.
Keine künstliche Entry Zone.

**Example 7 — Mixed HTF Context**

Weekly = bullish
Daily/4H = kurzfristig bearish

Unterhalb befindet sich relevante Sellside Liquidity und ein tieferer bullish HTF POI.

DG OS darf nicht automatisch sagen:
"Weekly bullish → BUY"

Stattdessen:

MACRO BIAS = BULLISH
TRADING CONTEXT = SHORT-TERM BEARISH / MIXED

Mögliche Interpretation:
Korrektur Richtung Sellside Liquidity / HTF POI beobachten.

Noch kein Entry.

**Example 8 — No Trade**

Mehrere kleine FVGs und Order Blocks sind vorhanden.

Aber:
- keine relevante Liquidity Story
- kein hochwertiger HTF POI
- keine klare Confirmation
- kein sinnvolles Target

DG OS:

STATUS = WAIT / LOW_QUALITY

Keine Trade-Idee erzwingen.

**Important:**

Die Beispiele zeigen die DG Decision Pipeline:

Context
→ Liquidity
→ POI
→ Sweep
→ Reaction
→ Confirmation
→ Entry
→ Target

Fehlt ein notwendiger Bestandteil, muss DG OS entsprechend WAIT, WATCH oder AWAITING_DG_RULE verwenden und darf die fehlende Information nicht erfinden.

## 16. DG Edge Cases

**Status:** 🟢 DEFINIERT

DG OS muss auch bei unklaren oder ungewöhnlichen Marktsituationen konservativ und nachvollziehbar reagieren.

Grundprinzip:

Wenn eine Situation nicht eindeutig durch eine definierte DG-Regel abgedeckt ist, darf DG OS keine eigene Trading-Regel erfinden.

Im Zweifel:
WAIT / AWAITING_DG_RULE.

**Conflicting Signals:**

Wenn gleichzeitig bullish und bearish Confluences vorhanden sind, soll DG OS den Konflikt transparent darstellen.

Beispiel:

- Weekly bullish
- 4H bearish
- bullish POI unterhalb
- bearish POI oberhalb
- relevante Liquidity auf beiden Seiten

DG OS darf nicht künstlich eine Richtung erzwingen.

STATUS:
MIXED / WAIT

Bis der Markt durch Liquidity, Reaktion oder Structure mehr Klarheit liefert.

**Multiple POIs:**

Wenn mehrere valide POIs vorhanden sind, soll DG OS sie nicht zu einer künstlichen Zone zusammenfassen.

Jeder POI bleibt separat und behält:

- Timeframe
- Type
- Direction
- Range
- Freshness / Mitigation
- Confluences
- Quality / Score

Der aktuell relevanteste POI darf als PRIMARY POI markiert werden.

Weitere:
SECONDARY POI

**Overlapping POIs:**

Wenn sich beispielsweise:

- Order Block
- FVG
- iFVG
- Breaker

überschneiden, darf DG OS dies als zusätzliche Confluence erkennen.

Die ursprünglichen POI-Typen sollen trotzdem erhalten bleiben.

**POI Invalidation:**

Wenn ein relevanter POI klar invalidiert wird:
STATUS = INVALIDATED

Er darf anschließend nicht weiterhin als aktiver High-Quality-POI verwendet werden.

Falls daraus nach definierten Regeln ein Breaker / iFVG entsteht, wird dieser separat bewertet.

**Liquidity Both Sides:**

Liquidity auf beiden Seiten des Marktes ist normal.

DG OS darf nicht allein aufgrund der Existenz von Buyside und Sellside Liquidity eine Richtung bestimmen.

Relevant sind:

- HTF Context
- bereits genommene Liquidity
- aktuelle Structure
- relevante POIs
- Reaktion
- nächstes plausibles Target

**Sweep without Reaction:**

Wenn relevante Liquidity gesweept wird, aber keine deutliche Reaktion entsteht:

LIQUIDITY_SWEEP = TRUE
CONFIRMATION = FALSE

STATUS = WAIT

Kein Trade erzwingen.

**Reaction without Sweep:**

Wenn ein POI stark reagiert, aber der für das geplante Setup erwartete Liquidity-Kontext fehlt:

REACTION_DETECTED

aber nicht automatisch BUY_READY / SELL_READY.

Falls keine definierte DG-Regel diese Situation abdeckt:
AWAITING_DG_RULE.

**Data Problems:**

Wenn notwendige Daten fehlen, stale sind oder ein Timeframe nicht geladen ist:
STATUS = DATA_NOT_READY

DG OS darf keine Entscheidung auf erfundenen oder veralteten Daten aufbauen.

Market Facts müssen immer echte verfügbare Daten verwenden.

**Market Closed:**

Wenn der relevante Markt geschlossen ist:
MARKET_STATUS = CLOSED

Bestehende Analyse darf angezeigt werden.

Keine neue Live-Confirmation oder Trade-Bereitschaft aus alten Daten erzeugen.

**Duplicate Events:**

DG OS soll dasselbe Market Event nicht wiederholt als neues Event melden.

Beispiel:

Ein Asia High wurde bereits gesweept.

Dieses identische Ereignis soll nicht bei jedem neuen Price Tick erneut als neuer Sweep gemeldet werden.

Alerts sollen eventbasiert und dedupliziert sein.

**Alert Fatigue:**

DG OS soll Gomes nicht mit unwichtigen Meldungen überfluten.

Keine unnötigen Alerts für:

- normales High/Low created
- jede neue FVG
- jeden kleinen Swing
- jeden Price Tick

Priorität für Alerts:

- relevanter Liquidity Sweep
- wichtiger POI nähert sich
- wichtiger POI erreicht
- Reaktion erkannt
- Confirmation entwickelt sich
- Confirmation bestätigt
- BUY_READY / SELL_READY
- Target erreicht
- Setup invalidiert
- wichtige Daten-/Systemprobleme

**Extreme Volatility:**

Bei außergewöhnlich schnellen Bewegungen oder News-Spikes darf DG OS keine Confirmation allein aufgrund der Geschwindigkeit der Bewegung annehmen.

Die normalen DG-Regeln bleiben erforderlich.

**Unknown Situation:**

Wenn DG OS eine Situation nicht eindeutig nach den gespeicherten Regeln bewerten kann:
STATUS = AWAITING_DG_RULE

und im Reason-Feld soll kurz erklärt werden, welche Regel fehlt.

Dadurch können wir das System später gezielt weiter trainieren.

**Important:**

DG OS soll lieber zu wenig als falsche Sicherheit liefern.

Keine erfundenen:
- Biases
- POIs
- Confirmations
- Entries
- Targets
- Trading-Regeln

Market Facts bleiben objektiv.

DG Interpretation erfolgt ausschließlich nach den definierten DG-Regeln.

Wenn keine Regel passt:
WAIT.
