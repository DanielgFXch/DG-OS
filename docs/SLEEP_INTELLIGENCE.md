# DG OS · WHOOP Sleep Intelligence

## Umfang

Das bestehende WHOOP-Modul unter **Gesundheit** bleibt erhalten. Zusätzlich zeigt das Premium-Dashboard:

- Vergleich letzte Nacht vs. vorherige Nacht: Schlafdauer, Leistung, Effizienz und Recovery.
- Geschätzter Schlafbeginn und Aufwachzeit, Schlafbedarf und Wachphasen.
- Leicht-, Tief-, REM-Schlaf und Wachzeit als segmentierte Übersicht.
- 7-Nächte-Mittelwerte für Schlafdauer, Leistung, HRV und Ruhepuls.
- Verlauf für 7/30/90 Nächte mit Schlafdauer, HRV, kleinen Tageslisten und erklärenden Hinweisen.

**Einschlafdauer** (Minuten zwischen «ins Bett» und «eingeschlafen») kann aus WHOOP Sleep Start allein **nicht** verlässlich bestimmt werden. Ein optionales Bettgeh-Protokoll wäre dafür nötig. Schlafphasen sind Schätzwerte.

## Quelle / Datenschutz

- Der Client sendet **ausschliesslich** den bestehenden WHOOP-Sitzungstoken an den bereits eingerichteten WHOOP-Supabase-Connector.
- Neu: GET /functions/v1/whoop/history?days=7|30|90, mit bestehender validSession-Prüfung.
- Der Connector liest paginierte WHOOP-v2-Schlaf- und Recovery-Daten; OAuth-Secret, Refresh-Token und Datenbank-Service-Key verlassen den Server nicht.
- Es werden **keine persönlichen WHOOP-CSV-Daten oder Gesundheitswerte in das öffentliche GitHub-Repository geschrieben**.
- In diesem Schritt **keine neue Datenbanktabelle**, keine zusätzliche Synchronisationsautomatik; die Daten werden erst beim Laden gelesen und nicht permanent in DG OS gespeichert.
- Kein Eingriff in Trading-, Voice-, Academy- oder andere Projekte. Keine Lovable Credits.

## Inbetriebnahme

1. Die WHOOP Edge Function mit der zu dieser Änderung gehörigen index.ts-Version im **bestehenden** Supabase-Projekt jzvnmhfhyvmmbontsoej veröffentlichen. Vorher die vorhandene Version und Secrets abgleichen. verify_jwt=false beibehalten: die Funktion übernimmt bereits die eigene Sitzungsautorisierung und muss vor WHOOP-OAuth-Aktivierung unauthentifizierte Aufrufe annehmen.
2. Frontend-Änderung nach Review auf main übernehmen und GitHub-Pages-Deployment prüfen.
3. Mit einem bereits autorisierten WHOOP-Gerät unter **Gesundheit** öffnen. Zeitraum 7/30/90 testen, mit Logout / abgelaufener Session testen.
4. Die Daten mit WHOOP appseitig abgleichen; bei fehlender Recovery — statt 0 anzeigen.

## Checks

- npm run test:sleep – Datenberechnungen, Differenzen, fehlende Werte.
- API: GET /history ohne Token muss 401 zurückgeben; mit gültigem WHOOP Session Bearer-Token nur persönliche WHOOP-Daten.
- WHOOP APIs: max. 25 Datensätze/Seite, Pagination mit nextToken und next_token.
- Kein manueller Export-Upload notwendig für die letzten 90 Tage, sofern WHOOP die Daten per OAuth bereitstellt.

## Nächste Ausbaustufe (separater Sicherheitsreview)

Historische WHOOP-CSV-Importe (z. B. vollständiger Export seit Mai 2025), nächtlicher Synchronisationsjob und private Supabase-RLS-Tabelle. Dafür explizite Einwilligung, Datenaufbewahrung und Löschfunktion einplanen.
