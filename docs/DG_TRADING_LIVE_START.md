# DG OS Trading Brain: Von Code zur echten Live-Überwachung

**Stand: 5. November 2026.** Die Trading-Engine, die Session-Uhr und historische TwelveData-Abfragen sind im Code vorhanden. Eine dauerhaft laufende DG-OS-Serverinstanz wurde in den verbundenen Render-Diensten **nicht** vorgefunden. Dieses Repository allein oder GitHub Pages kann keine kontinuierliche TwelveData-WebSocket-Verbindung halten.

## Bereits umgesetzt

- `trading-session-clock.js`: echte UTC-Zeitfenster Asia (00–08), London (08–16), New York (13–21), Überlappung und sekündlicher Countdown; keine erfundenen Kurswerte.
- `marketBrain.js` / `trading-intelligence.js`: echte Strategieregeln, Candle- und Liquiditätslogik, aber nur so gut wie die tatsächlich eingespeisten Kursdaten.
- `server/index.js`: ein bereits gebauter Node-Server mit REST + TwelveData-WebSocket, der dieselbe Market-Brain-Engine nutzt.
- `.github/workflows/market-data.yml`: wiederkehrende GitHub-Actions-Snapshots, **nicht** dauerhaft Live-Streaming.
- `app.js`: verbindet sich über `localStorage['dgos.marketServerUrl']` nur zu einer **konfigurierten** HTTPS-Server-URL. Ohne URL zeigt die Trading-Karte bewusst „Brain offline“.
- `render.yaml`: sicherer Startplan für einen eigenen Render Web Service im Frankfurter Rechenzentrum, unabhängig von ZSO- und Signal-Hub-Apps.

## Der eine notwendige Betriebs-Schritt

**Nicht ohne Zustimmung ausführen:** Der Render-`starter`-Plan ist kostenpflichtig; ein Render-Blueprint stellt **erst nach manueller Anwendung** einen solchen Dienst bereit. Das Vorbereiten und Committen von `render.yaml` bucht keinen Dienst.

Nach Freigabe:

1. In Render einen neuen **Blueprint** aus dem GitHub-Repository `DanielgFXch/DG-OS` mit `render.yaml` erstellen.
2. In der Render-Secrets-Einrichtung `TWELVEDATA_API_KEY` eingeben. Den Schlüssel **nicht** im Chat, in GitHub oder in Screenshot veröffentlichen. Der GitHub-Actions-Secretwert kann nicht automatisch in Render kopiert werden.
3. Warten, bis der Node-Server die H1- und weiteren Candle-Daten geladen hat. `https://<dein-server>.onrender.com/api/health` kontrollieren: tatsächlicher WebSocket-Zustand und Candle-Freshness müssen plausibel sein; HTTP 200 **allein** ist kein Marktdatenbeweis.
4. `/api/market/XAUUSD` und `/api/brain/XAUUSD` prüfen, inklusive fehlender Teil-Timeframes, Quelle und Zeitstempel.
5. Die HTTPS-Adresse in DG OS unter **Trading → XAUUSD Live → Always-On Server verbinden** eintragen. Dadurch wird sie **auf diesem Gerät** in `dgos.marketServerUrl` gespeichert; andere Geräte benötigen die URL separat.
6. Unter laufendem Markt mindestens einen tatsächlichen TwelveData-Tick + H1-/Session-Candle-Wechsel verifizieren, damit „Brain online“ nicht nur eine statische UI-Anzeige ist.

Die unterstützten Candle-Abstände und Tick-Latenz hängen zusätzlich vom **TwelveData-Tarif** ab. M1/M5 und sofortige Sweeps erfordern den entsprechenden Feed und konkrete bestätigte DG-Regeln; ein H1-Schluss kann intrabar keine Tick-Reihenfolge beweisen.

## TradingView ist separat

Der sichere TradingView-Empfänger `dgos-tradingview` in Supabase ist vorbereitet, aber TradingView-Alerts müssen im eigenen Account eingerichtet und die erforderlichen Secrets gesetzt sein. **Der Node-Endpunkt `/api/tradingview/webhook` ist weiterhin nur ein 501-Stub.** Ein erfolgreicher TwelveData-Server bedeutet daher **nicht**, dass TradingView oder Live-Pushs bereits funktionieren.

## Abnahme

Ein funktionsfähiger Betrieb gilt erst dann als bestätigt, wenn:
- Der gehostete Node-Dienst wirklich läuft (nicht im Schlafmodus);
- Ein aktueller echter Tick und seine Quelle sichtbar sind;
- `/api/brain/XAUUSD` echte eingelesene Candles statt leere Daten enthält;
- DG OS den marktdatenbasierten Status **nachweislich** anzeigt;
- ein neuer Session-Event an einem echten, geschlossenen Level korrekt erkannt und nicht vorzeitig als bestätigter Trade markiert wird.

**Kosten:** Keine Render-Kosten durch diese Datei. Ein kostenpflichtiger Always-On-Dienst wird erst nach ausdrücklicher Zustimmung angelegt.
