# DG-OS
DG OS Alpha - AI Trading Assistant

Projektvision & Leitplanken: [`docs/VISION.md`](docs/VISION.md).
Daniels Trading-Regelwerk (Grundlage der Entscheidungslogik): [`rules/strategy.md`](rules/strategy.md).

## Live-Vorschau (Progress)

**https://danielgfxch.github.io/DG-OS/**

Jeder Merge nach `main` wird automatisch über GitHub Actions (`.github/workflows/deploy-pages.yml`) auf GitHub Pages veröffentlicht. Unter dem Link siehst du also jederzeit den aktuellen Entwicklungsstand des Interfaces.

Einmaliger Setup-Schritt (nur bei der ersten Einrichtung nötig): In den Repo-Settings unter **Settings → Pages → Build and deployment → Source** auf **"GitHub Actions"** stellen. Danach läuft alles automatisch bei jedem Merge.

## Telegram-Anbindung

Im Bereich "🤖 Telegram" der App kannst du deinen eigenen Bot verbinden:

1. Bei [@BotFather](https://t.me/BotFather) einen Bot anlegen und den Bot-Token kopieren.
2. Deine Chat-ID ermitteln (z. B. über [@userinfobot](https://t.me/userinfobot)).
3. Token und Chat-ID in der App eintragen und auf "Speichern & testen" klicken.

Token und Chat-ID werden ausschließlich lokal im Browser (`localStorage`) gespeichert und direkt vom Client an die Telegram Bot API gesendet — es gibt kein eigenes Backend. Da der Token dadurch im Browser des Geräts liegt, sollte DG OS nur auf vertrauenswürdigen, eigenen Geräten genutzt werden.

Mit der Option "Auto-Senden bei SELL-Signal" schickt DG OS das Briefing automatisch an Telegram, sobald Sweep + Bearish Engulfing gleichzeitig erkannt werden.

### DG OS Chat — mit dem Bot reden (braucht den Always-On Server)

Zusätzlich zu den Push-Alerts kannst du dem Bot direkt Fragen schreiben ("Gomez, wie sieht der Markt aus?", "wie sieht die Liquidity aus?", "was ist mein Ziel?") und bekommst eine Antwort, die ausschließlich aus den echten, aktuellen DG Trading Brain V1 Daten gebaut wird (`marketBrain.js`'s `answerMarketQuestion()`) — kein LLM-Call, keine erfundene Markteinschätzung. Fragen zu News/Weltlage/Fundamentaldaten beantwortet DG OS ehrlich mit `DATA_SOURCE_NOT_CONNECTED` (Kapitel 14), solange keine echte News-Quelle angebunden ist.

Das braucht den [Always-On Market Server](docs/ALWAYS_ON_SERVER.md) (nicht die statische GitHub-Pages-Seite). Einmaliger Setup, sobald der Server läuft:

1. Auf Railway (oder wo auch immer der Server läuft) die Umgebungsvariablen `TELEGRAM_BOT_TOKEN` und `TELEGRAM_CHAT_ID` setzen (eigene Werte, unabhängig von den GitHub-Actions-Secrets gleichen Namens). Optional zusätzlich `TELEGRAM_WEBHOOK_SECRET` (ein selbst gewähltes Geheimwort) für zusätzliche Absicherung.
2. Einmalig lokal ausführen, um Telegram die Server-URL mitzuteilen:
   ```
   TELEGRAM_BOT_TOKEN=... node scripts/setTelegramWebhook.js https://<deine-server-url> [dasselbe TELEGRAM_WEBHOOK_SECRET, falls gesetzt]
   ```
3. Fertig — Nachrichten an den Bot werden ab sofort beantwortet.

Aus Datenschutzgründen antwortet DG OS Chat ausschließlich auf Nachrichten aus der konfigurierten `TELEGRAM_CHAT_ID` — ist sie nicht gesetzt, antwortet der Bot niemandem (fail closed, nie ein öffentlicher Bot mit echten Marktdaten).

## Live-Marktdaten (XAUUSD)

Die Karte "XAUUSD Live" zeigt echten Kurs, Daily Open/High/Low und Change – gespeist über [TwelveData](https://twelvedata.com/) (kostenloser Tarif reicht).

Setup:

1. Kostenlosen Account bei [twelvedata.com](https://twelvedata.com/) anlegen und den API-Key aus dem Dashboard kopieren.
2. Im Repo unter **Settings → Secrets and variables → Actions → New repository secret** ein Secret `TWELVEDATA_API_KEY` mit diesem Key anlegen.
3. Unter **Actions → "Update Market Data" → Run workflow** einmal manuell auslösen, um die Anbindung zu testen.

Der Workflow (`.github/workflows/market-data.yml`) läuft danach automatisch alle 15 Minuten, holt den aktuellen XAUUSD-Kurs und deployed ihn direkt zu GitHub Pages (`data/market.json`) – ohne Git-Commits, damit die Historie sauber bleibt. Solange kein `TWELVEDATA_API_KEY` hinterlegt ist oder die Daten älter als 45 Minuten sind, bleibt die App ehrlich bei "OFFLINE DEMO" statt erfundene Zahlen zu zeigen.

### Echtes Echtzeit-Update (WebSocket-Stream)

Der 15-Minuten-Takt ist das technische Maximum für einen zuverlässigen GitHub-Actions-Cronjob. Für wirklich sekundengenaue Live-Preise gibt es zusätzlich einen WebSocket-Stream direkt im Browser:

1. In der Karte "XAUUSD Live" deinen TwelveData-API-Key (denselben wie oben) in das Feld "TwelveData API Key" eintragen und auf "Live-Stream verbinden" klicken.
2. Der Preis aktualisiert sich danach in Echtzeit, solange die Seite geöffnet ist.

**Bewusster Trade-off:** Der Key liegt dabei sichtbar im Browser-Code (jeder mit Zugriff auf die Seite könnte ihn im DevTools-Netzwerktab sehen). Bei einem kostenlosen Account ohne Zahlungsdaten ist das Risiko gering – im schlimmsten Fall nutzt jemand das Kontingent mit. Der Key wird nur lokal im Browser (`localStorage`) gespeichert, nie committet. Bricht die Verbindung ab, versucht DG OS automatisch mehrfach neu zu verbinden und fällt danach ehrlich auf die 15-Minuten-JSON-Daten zurück.
