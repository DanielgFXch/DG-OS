# DG OS · WHOOP dauerhaft verbunden (Oktober 2026)

## Ergebnis
Die WHOOP-Verbindung und die verschlüsselten Zugangsdaten bleiben zentral auf dem **bestehenden Supabase-Projekt**. Der OAuth-Flow fordert bereits den WHOOP-Scope `offline` an. Durch regelmässiges Erneuern rotiert WHOOP sowohl Access- als auch Refresh-Token; die neuesten verschlüsselten Tokens werden wieder in Supabase abgelegt. WHOOP beschreibt ausdrücklich die Gefahr, dass parallele Refresh-Aufrufe denselben Token ungültig machen.

Die WHOOP-Session für dieses DG-OS-Gerät ist **180 Tage ab der letzten bestätigten Aktivität** gültig. Wenn sie abgelaufen ist, wird WHOOP nach Möglichkeit **ohne erneuten WHOOP-Login** über die bereits verbundene Telegram-Gerätesitzung wiederhergestellt. Löscht der Benutzer iPhone-Safari-/PWA-Daten oder verliert die Geräteverbindung, ist eine neue Geräteverbindung beziehungsweise einmalige Autorisierung nötig.

## Implementierung
- Nicht destruktive DB-Migration `20261010230000_whoop_refresh_lease.sql`: `refresh_lock_id` und `refresh_lock_until` an der bestehenden Tabelle `dgos_whoop_tokens`. Kein Token und keine Sitzung wird ersetzt, ausgelesen oder gelöscht.
- Supabase `whoop` Edge Function: 26-Sekunden-Lease wird in der Datenbank exklusiv und atomar beansprucht. Während ein Isolate die Tokens erneuert, warten weitere bis zur abgeschlossenen, **persistierten** Rotation. Bei HTTP-Fehler/Timeout wird die Lease entfernt; eine blockierte Lease läuft automatisch aus.
- Browser: Bei 502/503, Netzwerkausfall oder WHOOP-Rate-Limit **„WHOOP verbunden – momentan keine Synchronisierung“**, statt ohne Grund eine erneute WHOOP-Anmeldung zu starten. Nur wenn der Besitzer-Session-Token selbst 401 zurückgibt, wird er aus dem lokalen Gerät entfernt. Bei einer nachweislich abgelehnten Refresh-Token-Authentifizierung (WHOOP 400/401) erscheint **„WHOOP erneut autorisieren“**.
- `check()` single-flight gegen doppelte, gleichzeitige Aufrufe. Stale OAuth-Handoff-Claims werden entsorgt, sobald eine bestätigte WHOOP-Sitzung vorhanden ist. Bei Wiederöffnen der Seite werden WHOOP-Daten neu geprüft.
- Neuer Frontend-/PWA-Cache Version 42.

## Grenzen & Privatsphäre
- **Keine endlose Login-Garantie**: WHOOP kann Zugriff widerrufen, Refresh-Token ungültig machen oder eine neue Autorisierung verlangen. Dann ist **ein einmaliger Reconnect** nötig. WHOOP-Daten dürfen nicht angezeigt werden, wenn weder eine berechtigte WHOOP-Sitzung noch eine authentifizierte Telegram-Gerätekopplung besteht.
- Health-Routen bleiben geschützt. Private Token-Cipher, Access-Token, Health-Daten und Passwörter werden **nicht** im Repo oder im Browsercode gespeichert; nur der bereits existierende zufällige Besitzer-Sitzungs-Token befindet sich im lokalen Browser-Speicher.
- Offenes DG OS aktualisiert alle zehn Minuten. Geschlossene App wird **nicht** dauerhaft im Hintergrund ausgeführt; WHOOP synchronisiert beim erneuten Öffnen.
- Die bestehende Datenbank enthielt bei der Umstellung einen verschlüsselten WHOOP-Token. Ein neuer Browser-Refresh / ein echter WHOOP-API-Datenabruf muss auf dem iPhone getestet werden. Ein vorher bereits ungültig gewordener WHOOP Refresh-Token lässt sich durch Code allein nicht reparieren.

## Regression
`node scripts/test-whoop-persistence.js` überprüft: bereits gültige WHOOP-Session und kurzzeitigen Sync-Ausfall, Wiederherstellung über gültige Telegram-Gerätesitzung, das Entfernen eines abgelaufenen OAuth-Handoffs, manuelle Neuautorisierung nur bei nachweislich invalidem WHOOP-Token, exklusive Token-Rotationssperre und nicht destruktive Migration.

Das Deployment der **Produktions-Edge-Function** erfolgt vor dem Merge; GitHub `main` wird erst nach vollständigen CI-Tests aktualisiert. Änderungen nur an DG OS / WHOOP, keine Lovable Credits und keine Trading-Strategieänderungen.
