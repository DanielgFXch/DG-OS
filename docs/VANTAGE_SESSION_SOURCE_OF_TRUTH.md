# DG Jarvis · Session-Grenzen aus Daniels TradingView „Sessionz“

**Referenz:** Nutzer-Screenshots vom 16.10.2026: TradingView XAUUSD (VANTAGE), „Sessionz“-Einstellungen. **Noch keine live-geschaltete Synchronisation**; das ist die geprüfte Spezifikation für die Vantage-Bridge.

## Exakt sichtbare Chart-Einstellungen

- Symbol: `VANTAGE:XAUUSD`
- Zeitzone des **Sessionz-Indikators**: **GMT Offset +2 Stunden**, ausdrücklich **fester GMT-Offset**, **nicht** automatisch `Europe/Zurich`.
- **Asia:** `00:00–06:00` GMT+2 (orange)
- **London:** `08:00–12:00` GMT+2 (blau)
- **New York:** `14:00–22:00` GMT+2 (grün)

**Die Werte oben sind die beobachteten Einstellungen des ALTEN Sessionz-Indikators**, nicht die künftig gewünschte Zeitzonendefinition des Jarvis.

## Von Daniel bestätigte Jarvis-Zeitzonendefinition (16.10.2026)

**Automatisch Sommer- und Winterzeit über IANA `Europe/Zurich`, kein manuelles GMT-Offset-Umschalten.** Die sichtbaren Session-Zeitfenster sind vorerst Schweizer *Ortszeit*:

| Session | Europe/Zurich-Ortszeit | Im Sommer (CEST/UTC+2) | Im Winter (CET/UTC+1) |
|---|---|---|---|
| Asia | 00:00–06:00 | 22:00 (UTC-Vortag) – 04:00 UTC | 23:00 (UTC-Vortag) – 05:00 UTC |
| London | 08:00–12:00 | 06:00–10:00 UTC | 07:00–11:00 UTC |
| New York | 14:00–22:00 | 12:00–20:00 UTC | 13:00–21:00 UTC |

**Technische Vorgabe:** Session-Grenzen direkt in der Pine Script Bridge mit `Europe/Zurich` als IANA-Zeitzone berechnen (z. B. `time(timeframe.period, session, 'Europe/Zurich')`), nicht mit einer fest eingetragenen Anzahl Stunden gegenüber UTC. Der alte Indikator mit fixem `GMT Offset (Stunden)=2` wird im Schweizer Winter **nicht** automatisch umstellen; die neue Bridge soll diese Schwäche korrigieren.

Grenzen start-inklusive, ende-exklusive; Session-Day für Asia basiert auf dem **Schweizer Kalendertag** (auch bei vorherigem UTC-Datum). Pro Session neue High-/Low-Accumulatoren. Keine Auswertung von Kerzen außerhalb der betreffenden Fenster. In den Umstellungswochen DST-Grenzen und Session-Tageswechsel gegen historische Chartdaten prüfen.

**Nuance New York:** Zürich und New York stellen nicht am gleichen Datum die Uhren um. Ein fixes Schweizer Zeitfenster 14:00–22:00 entspricht in den Übergangswochen nicht durchgehend denselben Wall-Street-Lokalstunden. V1 übernimmt genau Daniels freigegebene *Schweizer* Zeitfenster. Falls er später marktortsgebundene Session-Opens statt fixer Schweizer Zeiten möchte, muss das separat und ausdrücklich spezifiziert werden.

### WICHTIG: Kein stilles Zusammenlegen mit bestehender UTC-Engine

Die heutige `marketBrain.js`-Konfiguration hat `Asia 00–08 UTC`, `London 08–16 UTC` und `NY 13–21 UTC`. `trading-intelligence.js` nutzt dieselben Legacy-Fenster. **Diese entsprechen NICHT den Screenshots**. Daten daraus dürfen nicht als Session Highs/Lows nach Daniels Sessionz-Definition bezeichnet werden.

Die Snapshot-/Telegram-HTF-Zonen aus bestehenden TwelveData-Daten sind ebenfalls **nicht automatisch** deckungsgleich mit `VANTAGE:XAUUSD`. Vor einer Behauptung, Jarvis sehe Daniels Chart, muss die TradingView-Bridge mit derselben Feedquelle verifiziert sein.

### Sommerzeit-Entscheidung

**Festgelegt:** Die neue Bridge verwendet automatisch `Europe/Zurich` (CEST im Sommer, CET im Winter). Kein fixes GMT+2 das ganze Jahr. Der bestehende „Sessionz“-Screenshot zeigt lediglich die aktuelle Sommer-Konfiguration des Drittindikators.

## Für den ersten echten Datenabgleich

1. TradingView-Bridge auf dem echten `VANTAGE:XAUUSD`-Chart liest zeitbasierte High-/Low-Werte **innerhalb der exakt eingestellten Session-Fenster**. Tageswechsel und grenzgenaue Wick-Extrema im Replay prüfen.
2. Vorerst lokale/geschützte Testübertragung mit Webhook. Bestehender `dgos-tradingview`-Empfänger akzeptiert nur `*_TOUCHED`/`*_SWEPT` und **keine** Session-High/Low-Snapshot-Events. Erst sichere Schema-Erweiterung, idempotente Persistenz, Auth und eigene Validierung bauen, ehe snapshots angenommen werden.
3. Jeden Snapshot eindeutig kennzeichnen: Symbol-Provider `VANTAGE:XAUUSD`, Session, `Europe/Zurich` plus tatsächlichen UTC-Offset, Session-Tag, Session-Start/-Ende, genaues high/low, Zustand `FORMING` oder `FINAL`, Zeitstempel und Erkennungsquelle `TRADINGVIEW_INDICATOR`.
4. Eine laufende Session hat **vorläufige** High/Low; die Werte werden erst nach Schluss **FINAL**. Übertragene Werte sind zunächst `INDICATOR_REPORTED`, bis gegen denselben Feed verifiziert.
5. `TOUCHED`, `TAKEN` und `SWEPT` sind verschieden; Sweep benötigt einen nach Daniels Regeln bestätigten Rücklauf bzw. Reaktion. Niemals aus einem reinen Wick-Bruch sofort BUY/SELL folgern.
6. Keine automatischen Orders, keine erdachten Preislevel, keine Änderung an `rules/strategy.md`.

## Scope

Die Uhrzeiten für Telegram-London-/NY-Berichte sind **noch nicht vereinbart**. HTF BUY-/SELL-Zonen dürfen nur auf 1H/4H/Daily basieren, Session H/L kommen zusätzlich aus den genannten Session-Fenstern; 5M/Sekundenchart kann Transport/Monitoring unterstützen, wird dadurch aber kein HTF-POI.
