# DG OS Google Workspace Center

## Ziel

DG OS nutzt pro Google-Konto **eine gemeinsame OAuth-Freigabe für Gmail + Google Kalender**. Dadurch bleiben Business und Privat getrennt, aber Jarvis muss nicht zwei verschiedene Google-Verbindungen verwalten.

Google-Konten:

- **Business:** \`imdanielgomes@gmail.com\`
- **Privat:** \`gomesdani1999@gmail.com\`

Die Maildaten werden nur über den servergehosteten DG-OS-Build verarbeitet. GitHub Pages bleibt eine statische Vorschau und enthält weder Google Client Secret noch OAuth-/Refresh-Tokens.

## Funktionen

- Posteingang direkt in DG OS
- Ungelesene E-Mails
- Gmail-Suche
- E-Mail öffnen
- Neue E-Mail senden
- Antworten im bestehenden Thread
- Newsletter-Ansicht
- Mehrfachauswahl von Newslettern
- Bewusstes Verschieben in den Gmail-Papierkorb
- Google-Kalender automatisch im DG-OS-Kalender anzeigen
- Neue Termine wahlweise lokal, in Business Google oder Privat Google erstellen

Es gibt **keine automatische Löschung** und **keine permanente Delete-API**. "Löschen" bedeutet in DG OS immer \`messages.trash\`: die Nachricht landet zuerst im Gmail-Papierkorb.

## Newsletter-Erkennung

DG OS erfindet keine Klassifikation. Eine Mail wird in der Newsletter-Ansicht gezeigt, wenn mindestens ein nachvollziehbares Signal vorhanden ist:

- Gmail-Label \`CATEGORY_PROMOTIONS\`
- Header \`List-Unsubscribe\`
- Header \`List-Id\`
- Header \`Precedence: bulk\` oder \`Precedence: list\`

Die Erkennung ist bewusst als Filterhilfe gebaut, nicht als automatische Löschregel.

## Sicherheitsmodell

- OAuth läuft serverseitig.
- Das Google Client Secret steht nur in Server-Umgebungsvariablen.
- Refresh-Tokens werden mit AES-256-GCM verschlüsselt gespeichert.
- Der Schlüssel liegt nur serverseitig in \`DGOS_INTEGRATION_ENCRYPTION_KEY\` (mit \`DGOS_GMAIL_ENCRYPTION_KEY\` als altem Fallback).
- Die Token-Datei liegt unter \`DGOS_PRIVATE_DATA_DIR\` und ist gitignored.
- Nach erfolgreicher Google-Anmeldung wird nur ein signiertes \`HttpOnly\`-Session-Cookie gesetzt.
- Mail-Endpunkte haben **kein** \`Access-Control-Allow-Origin: *\`; sie sind bewusst same-origin.
- Die öffentlichen Market-API-Endpunkte bleiben davon getrennt.
- Nach OAuth wird die von Google gemeldete E-Mail-Adresse gegen das gewählte DG-OS-Konto geprüft. Ein anderes Google-Konto wird abgelehnt.

## Google Cloud Einrichtung

1. Google Cloud Projekt anlegen oder ein bestehendes Projekt verwenden.
2. Gmail API **und** Google Calendar API aktivieren.
3. OAuth Consent Screen konfigurieren.
4. OAuth 2.0 Client vom Typ **Web application** erstellen.
5. Als Authorized redirect URI eintragen:

   \`https://<DEIN-DG-OS-SERVER>/api/gmail/oauth/callback\`

6. Auf dem DG-OS-Server setzen:

   - \`GOOGLE_GMAIL_CLIENT_ID\`
   - \`GOOGLE_GMAIL_CLIENT_SECRET\`
   - \`DGOS_PUBLIC_BASE_URL=https://<DEIN-DG-OS-SERVER>\`
   - \`DGOS_APP_URL=https://<DEIN-DG-OS-SERVER>\`
   - \`DGOS_INTEGRATION_ENCRYPTION_KEY=<32-byte-key>\`
   - \`DGOS_PRIVATE_DATA_DIR=<persistentes-volume-verzeichnis>\`

7. Einen 32-Byte-Schlüssel lokal generieren, z. B.:

   \`openssl rand -hex 32\`

8. Den servergehosteten DG-OS-Build öffnen und Business bzw. Privat mit Google verbinden.

## Scopes

DG OS fordert für Google Workspace nur die für die gewünschten Funktionen benötigten Scopes:

- \`https://www.googleapis.com/auth/gmail.modify\` — Gmail lesen, schreiben/senden und verändern, aber keine sofortige permanente Löschung.
- \`https://www.googleapis.com/auth/calendar.events\` — Termine lesen und bearbeiten.
- \`https://www.googleapis.com/auth/calendar.calendarlist.readonly\` — die vorhandenen Google-Kalender auflisten.

Der deutlich weitergehende Gmail-Vollzugriff \`https://mail.google.com/\` und der Calendar-Vollzugriff \`https://www.googleapis.com/auth/calendar\` werden bewusst **nicht** verwendet.

## Betrieb auf GitHub Pages

GitHub Pages kann keine geheimen serverseitigen OAuth-Credentials halten. Darum:

- direkte Gmail-Links funktionieren weiterhin;
- die interne Mailansicht zeigt ehrlich an, dass der sichere Server benötigt wird;
- wenn in DG OS bereits eine Always-On-Server-URL gespeichert ist, kann die Oberfläche direkt zur sicheren Server-Version wechseln.

## Test

Ohne echte Google-Credentials können die reinen Helper/Filter lokal getestet werden:

\`node server/lib/gmailIntegration.test.js\`

Der Test prüft unter anderem Newsletter-Kriterien, sichere Plain-Text-Aufbereitung und RFC822-Erstellung fürs Senden.


## DG OS Hub im Jarvis-Interface

Ab v0.43.0 gibt es unter **Alles an einem Ort** einen eigenen **DG OS Hub**. Der Hub ist die Brücke zwischen der statischen Oberfläche und dem sicheren serverseitigen Jarvis-Teil.

Ablauf:

1. DG OS Server öffentlich über HTTPS deployen.
2. Die Server-Adresse, z. B. \`https://dein-dg-os-server.example\`, im Feld **DG OS Hub** eintragen.
3. **Verbinden** drücken.
4. DG OS prüft \`/api/health\`. Nur wenn dort eine gültige DG-OS-Serverantwort kommt, wird die Adresse lokal gespeichert.
5. Klickt man danach auf Business oder Privat, kann GitHub Pages zur sicheren Server-Version wechseln und das gewählte Postfach direkt weiterreichen.
6. In der Server-Version einmal **Mit Google verbinden** wählen und das exakte Gmail-Konto freigeben.

Das Mailfenster wird innerhalb von DG OS angezeigt. Gmail selbst wird nicht eingebettet; Nachrichten werden über die Gmail API geladen, damit Google-Credentials und Tokens nicht im statischen Frontend liegen.


## Kalenderverhalten ab v0.44.0

Sobald Business oder Privat mit der neuen Google-Workspace-Freigabe verbunden ist:

- DG OS lädt die sichtbaren Google-Termine für den aktuell angezeigten Kalenderzeitraum.
- Google-Termine werden zusammen mit lokalen Terminen dargestellt und als Google-Quelle markiert.
- Im Dialog **+ Termin** wird das entsprechende Google-Konto automatisch als Ziel freigeschaltet.
- Neue Google-Termine werden im primären Kalender des ausgewählten Kontos gespeichert.
- Alte OAuth-Tokens aus einer reinen Gmail-Freigabe zeigen `Kalender neu freigeben`; eine erneute Google-Freigabe ergänzt die Calendar-Scopes.
