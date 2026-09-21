# DG OS Hub — einmal verbinden, danach Jarvis verwenden

Der DG OS Hub ist die private Server-Brücke zwischen der Oberfläche und Diensten, die geheime OAuth-Credentials oder dauerhaft laufende Logik benötigen.

## Was über den Hub läuft

| Dienst | Status / Verbindung |
|---|---|
| Google Business | Eine OAuth-Freigabe für Gmail + Google Kalender |
| Google Privat | Eine OAuth-Freigabe für Gmail + Google Kalender |
| Telegram | Server-Umgebungsvariablen |
| Wetter | Direkt über Open-Meteo, kein Login nötig |
| WHOOP | Eigener OAuth-Connector, noch nicht eingerichtet |
| iCloud Kalender | Eigene Apple-Freigabe erforderlich, noch nicht eingerichtet |
| Trading Market Server | Läuft im selben Node-Server, bestehende Trading-Logik bleibt getrennt |

## 1. Hub deployen

Das Repository ist für einen kleinen Always-On Node-Service vorbereitet:

- `npm start` startet `server/index.js`.
- Node 22 oder neuer ist im `package.json` verlangt.
- `railway.json` setzt Startbefehl, Healthcheck `/api/health` und Restart-Policy.

Auf Railway genügt danach grundsätzlich: GitHub-Repository verbinden, Service deployen und die benötigten Environment Variables setzen.

## 2. Basis-Variablen

Der bestehende Market Server benötigt weiterhin:

- `TWELVEDATA_API_KEY`

Für den privaten Jarvis-Hub:

- `DGOS_PUBLIC_BASE_URL=https://<dein-server>`
- `DGOS_APP_URL=https://<dein-server>`
- `DGOS_INTEGRATION_ENCRYPTION_KEY=<32-byte-key>`
- `DGOS_PRIVATE_DATA_DIR=<persistenter-pfad>`

Der Encryption Key gehört nur in die Server-Umgebung und nie in GitHub, DG OS Frontend oder Chat.

## 3. Google Workspace einmal vorbereiten

Im selben Google Cloud Projekt:

1. Gmail API aktivieren.
2. Google Calendar API aktivieren.
3. OAuth Consent Screen konfigurieren.
4. OAuth Client vom Typ **Web application** erstellen.
5. Redirect URI eintragen:
   `https://<dein-server>/api/gmail/oauth/callback`
6. Auf dem Hub setzen:
   - `GOOGLE_GMAIL_CLIENT_ID`
   - `GOOGLE_GMAIL_CLIENT_SECRET`

DG OS fordert nur die benötigten Scopes für Gmail Modify, Calendar Events und die lesbare Kalenderliste.

## 4. Jarvis mit dem Hub verbinden

In DG OS unter **Alles an einem Ort → DG OS Hub** die HTTPS-Adresse des Servers eintragen und **Verbinden** drücken.

DG OS prüft `/api/health`. Erst nach einer gültigen Serverantwort wird die Adresse lokal gespeichert.

## 5. Google-Konten verbinden

Im Hub:

- **Google Business → Verbinden** → exakt `imdanielgomes@gmail.com` freigeben.
- **Google Privat → Verbinden** → exakt `gomesdani1999@gmail.com` freigeben.

Danach stehen mit derselben Verbindung bereit:

- Gmail Inbox, Ungelesen, Suche, Lesen, Senden, Antworten und Newsletter-Papierkorb.
- Google-Kalender im DG-OS-Kalender.
- Neue Termine im primären Business- oder Privat-Google-Kalender.

## 6. Telegram

Auf dem Server:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- optional `TELEGRAM_WEBHOOK_SECRET`

Der Hub-Status zeigt danach Telegram als verbunden.

## Was bewusst nicht automatisch verbunden wird

### WHOOP

WHOOP benötigt eine eigene App im WHOOP Developer Dashboard und OAuth. Dafür werden Client ID, Client Secret und ein Redirect URI benötigt. Diese Verbindung wird nicht simuliert.

### iCloud Kalender

Apple benötigt eine separate Drittanbieter-Autorisierung beziehungsweise – falls diese für den verwendeten Client nicht verfügbar ist – ein App-spezifisches Passwort. Das normale Apple-Account-Passwort darf nicht in DG OS gespeichert werden.

## Grundregel

DG OS zeigt einen Dienst nur als **verbunden**, wenn eine echte Datenquelle oder echte OAuth-/Server-Verbindung vorhanden ist. Keine Dummy-Werte, keine erfundenen Verbindungszustände.
