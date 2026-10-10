# DG Trading Brain · Session Intelligence (Read-only)

## Ziel
Das bestehende DG Trading Brain für XAUUSD zeigt zusätzliche, **belegte** Session-Fakten an: Asia-Range, London nimmt Asia High/Low, Rückkehr in die Asia-Range, NY-Kontext, Macro (Monthly/Weekly), Medium/Trading (Daily/4H), H1-Struktur und den bewusst **nicht automatisiert bestätigten** Inducement-Kontext.

## Verbindliche Regeln
- `rules/strategy.md` Kapitel **1**: Macro Monthly/Weekly; Trading-Bias Daily/4H. Ein Konflikt ist legitim und erzeugt nicht automatisch einen Entry.
- Kapitel **2**: Liquidity → Sweep / Reaction → POI → Confirmation → Entry. Ein Sweep ist *niemals* selbst ein Entry.
- Kapitel **13**: Asia High/Low und London-Abholung sind Kontext; nicht selbständige Buy/Sell-Regeln. Die Session-Zeiten stammen unverändert aus dem bestehenden `marketBrain.js` / Server: Asia 00–08 UTC, London 08–16 UTC, NY 13–21 UTC.
- **Inducement:** Eine interne Swing-Liquidität darf ohne weitere, explizite DG-Regel nie als bestätigtes Inducement ausgegeben werden. Anzeige `AWAITING_DG_RULE` bis Nutzer die konkreten Kriterien klärt und genehmigt.

## Datenbeweis statt Scheinpräzision
Das neue Pure-Module `trading-intelligence.js`:
- Verwendet die echten chronologisch gelieferten H1-OHLC-Bars vom Always-On Market Server (`/api/market/XAUUSD`, in `marketServerState.candles['1h']`), ggf. H1-Historie aus einem wirklichen Baseline-Snapshot, soweit vorhanden.
- Nur abgeschlossene H1-Candles werden ausgewertet; unvollständige/veraltete Daten führen zu `DATA_NOT_READY` oder `HISTORICAL`.
- Eine Asia-Range erfordert acht vollständig vorliegende H1-Stunden 00–07 UTC. Fehlende Stunden => keine abgeleiteten High/Low.
- `TAKEN_NO_RETURN` bezeichnet Überschreiten eines Levels in einer abgeschlossenen London-H1-Kerze, **ohne** späteren H1-Schlusskurs zurück im Bereich.
- `RETURN_INSIDE` bezeichnet Überschreiten und mindestens einen H1-Schlusskurs zurück innerhalb der Asia-Range. Dies ist eine **beobachtete H1-Rückkehr**, keine vollständige nach DG-Confirmation bestätigte Umkehr und kein Entry.
- Wenn London das Asia High und Low **in derselben H1-Candle** nimmt, bleibt die genaue intrabar-Reihenfolge `UNKNOWN_SAME_H1_CANDLE`. Keine erfundene Reihenfolge/Signale.
- NY-Kontext beruht auf abgeschlossenen NY-H1-Kerzen und den nachweisbaren London-Ereignissen. Eventuelle Highs/Lows sind als vorläufig markiert, solange die Session nicht vollständig ist.
- Preiswerte sind nur real beobachtete Extremwerte, keine fiktiven Chancen-/CRV-/Confidence-Zahlen.
- Macro/Medium Werte und H1 Struktur sind aus der bereits bestehenden `htfContext` / `structure.h1` Berechnung **übernommen**. Es gibt keine neue Bias-Mischung, keine neuen Gewichte und keine Änderungen am DG Entry-/Risk-Modul.

## Technische Architektur
- `trading-intelligence.js`: Pure UMD (Browser + Node) für H1-Evidence, keine Nebenwirkungen.
- `server/marketState.js`: fügt `sessionIntelligence` read-only zu `GET /api/brain/XAUUSD` hinzu, falls die Always-On Server-Version aktualisiert/deployed wird. Bestehender `marketBrain.js` und `rules/strategy.md` bleiben unangetastet.
- `trading-intelligence-ui.js` und `trading-intelligence.css`: Trading Command Center Premium-Panel. Browser kann vorübergehend selbst die identische Pure-Engine rechnen, wenn Server noch keine `sessionIntelligence` ausliefert.
- Kein Autotrading, keine neuen Telegram-Pushes, keine Änderung an der Strategie.
- Der Always-On Server ist in der vorhandenen Codebasis **optional**; ist er nicht verbunden und gibt es keine historischen H1-Daten, zeigt die UI ehrlich **DATEN FEHLEN**, keine Richtung.

## Nächste DG-Definition mit Nutzer abstimmen
Konkrete Kriterien für *Micro/Medium/Macro Inducement* inklusive Timeframes, interner vs. externer Liquidität, Sweep/Displacement/Structure-Voraussetzungen und Invalidierung sind ein offener Trainingsbaustein. Erst nach dokumentierter Nutzerbestätigung implementieren wir eine automatische Inducement-Klassifikation.

## Test
`node scripts/test-session-intelligence.js` testet vollständige/unvollständige Asia-Ranges, Level Taken vs. H1 Return Inside, beide Seiten in derselben H1, unvollständige H1-Candles, stale data, Macro-/Medium-Konflikt und Integration. Historische, fest kodierte OHLC-Werte werden ausschliesslich als **Test-Fixtures** genutzt und gelangen nie als echte Marktdaten in die App.
