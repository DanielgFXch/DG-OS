# DG OS Jarvis · Clean Command Center (Oktober 2026)

## Ziel und Benutzeroberfläche

Die bisherige Jarvis-Seite hatte zahlreiche separate grosse Module, bevor der iPhone-Besitzer seinen Tagesplan sehen konnte. Die neue Version priorisiert:

1. **Sprechen:** vertrauter Jarvis-Orb, deutlich kompakter auf dem iPhone. Darunter eine klare Anweisung: tippen, sprechen, erneut tippen.
2. **Direktaktionen:** Mein Tag, Einkaufsliste, Gedächtnis, Foto. Jede Kachel löst eine echte bestehende Aktion aus, kein Beispiel-Button.
3. **Sprachantwort:** gut sichtbarer Schalter unmittelbar unter dem Orb; synchron zum originalen Voice-Studio-Checkbox-Wert. Der explizite Nutzerwunsch „Antworten vorlesen“ wird nie heimlich aktiviert.
4. **Befehl schreiben:** identisches `jarvisLifeCommandForm`, unverändertes Sprach-/Task-Handling und Auth.
5. **Heute:** kompakte Aufgaben-/Termin-/Rechnungs-/Inbox-Zähler und das bestehende Jarvis-Brain mit Tabs für Tagesplan/Gedächtnis.
6. **Weitere Aktionen:** die unveränderten Briefing-/Termin-/Organizer-Buttons in einem ausklappbaren Bereich.
7. **Stimme und Geräte:** das ursprüngliche komplette Voice-Studio sowie Telegram-Gerätekopplung sind bei Bedarf aufklappbar. Wenn eine Kopplung benötigt wird, öffnet sich der Bereich automatisch.
8. **Obsidian:** bleibt als optionale Integration unverändert.

## Technische Kompatibilität

`jarvis-dashboard.js` läuft **nach** `personal.js`, `jarvis-voice.js`, `jarvis-brain.js` und `jarvis-device-pairing.js`. Das Modul verschiebt nur EXISTIERENDE DOM-Knoten; die ursprünglichen Event-Listener, Gerätesitzung, TTS-Stimme, Foto-Eingabe, Gedächtnis-Tabs und Aufgaben-APIs bleiben dieselben.

Es verändert keine Supabase-Tabellen, keine Zahlungsfunktionen und keine Trading-Strategie.

Die bestehende statische Beschriftung „ONLINE“ war irreführend: Sie sagt jetzt „PRÜFEN“, bis das Kopplungs-Widget tatsächlich „VERBUNDEN“ meldet. Gezielte Schnellaktionen sind echte Navigation und Wiederverwendung vorhandener Widgets:
- **Mein Tag / Gedächtnis:** klicken vorhandene `[data-jb-tab]`-Buttons.
- **Einkaufsliste:** öffnet `personalPrivate` und aktiviert `[data-private-tab="shopping"]`.
- **Foto:** aktiviert das bestehende iPhone-Foto-Dateieingabefeld.
- **Sprachausgabe:** synchronisiert mit `jvEnabled` (persistiert ausschliesslich in vorhandener Voice-Logik).

Wenn das Modul ausfällt, bleibt die vorherige HTML-Seite einschliesslich Voice Console sichtbar. Die neue CSS greift nur mit `.jarvis-dashboard-ready` in bestehende Komponenten ein. Der PWA-Cache wurde auf `dgos-personal-shell-40` angehoben.

## Prüfungen

`node scripts/test-jarvis-dashboard.js` führt die umsortierte Dashboard-Logik in einem lokalen, isolierten DOM-Shim aus (ohne externe Pakete) und prüft: Originalknoten, Sprachschalter, Kopplung, Tagesplan, Einkauf, Gedächtnis, Foto, optionale Aktionen und die responsive CSS-/PWA-Anbindung.

Die bestehende GitHub Actions Testmatrix überprüft auch Voice, Foto, Planner, Social, Trading und Integration Hub. Technische Tests ersetzen **nicht** die Bedienungsprüfung in echtem iPhone Safari / Home-Screen-PWA. Für die Endabnahme die Seite in Safari hart neu laden und jede Aktion einmal manuell testen. Es wird nichts bezahlt oder gehandelt.

