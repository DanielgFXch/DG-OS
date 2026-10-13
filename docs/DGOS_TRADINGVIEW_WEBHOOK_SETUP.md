# DG OS → TradingView: echter Webhook-Test

Status: **Webhook-Empfänger in Supabase vorbereitet; ohne eigenen geheimen Schlüssel bewusst GESPERRT.** Noch kein aktiver TradingView-Alarm und noch keine automatische Jarvis-Auswertung. Die bestehenden TwelveData-/H1-Funktionen bleiben unverändert.

## Warum dieser Weg?

Die DG-OS-Seite auf GitHub Pages ist statisch und kann selbst keine TradingView-POST-Anfragen empfangen. Deshalb verwenden wir die **bereits aktive DG-OS-Supabase-Instanz** in Frankfurt (Projekt-Ref `jzvnmhfhyvmmbontsoej`). Kein neuer Always-On-Server für diesen ersten Alarmtest nötig.

1. TradingView-Indikator erkennt **nach seiner eigenen nachweisbaren Logik** z. B. London High genommen.
2. Ein **TradingView-Alert** sendet gültiges JSON als POST via HTTPS.
3. Die Supabase Edge Function `dgos-tradingview` prüft getrennten geheimen Schlüssel, Symbol, Timeframe, Preis, Zeit und Eventtyp.
4. Sie speichert das Ergebnis privat und nur als **INDICATOR_REPORTED**, mit Duplikatschutz. Dieser Status ist keine von Jarvis bestätigte Markt-Tatsache, kein Entry und keine automatische Order.
5. **Späterer Schritt:** Der private DG-OS-Reader prüft die Authentisierung des Nutzers und zeigt echte empfangene Alerts im Trading-Bereich und Jarvis. Das ist aktuell **noch nicht implementiert**.

## Einmalige Einrichtung (bei dir)

**A. Eigenen Webhook-Schlüssel setzen:**
- Öffne `https://supabase.com/dashboard/project/jzvnmhfhyvmmbontsoej/settings/functions` (oder im Dashboard unter Edge Functions → Secrets).
- Lege `DGOS_TRADINGVIEW_WEBHOOK_SECRET` als neuen Secret-Namen an.
- Der Wert muss ein zufällig generierter Schlüssel mit mindestens 32 Zeichen sein. Behandle ihn wie ein Passwort. **Nicht in GitHub committen, nicht in Screenshots teilen und nicht hier in den Chat kopieren.**
- Ohne dieses Secret antwortet der Empfänger immer mit HTTP 503. Das ist gewollt.

**B. TradingView vorbereiten:**
- Aktiviere 2-Faktor-Authentifizierung; TradingView setzt dies für Webhook-Alerts voraus.
- Öffne XAUUSD auf TradingView. Nutze deinen eigenen Indikator **DG Smart Money Liquidity** (bisheriger favorisierter Stand V2.0.1), sobald seine Alert-Bedingungen tatsächlich implementiert und getestet sind.
- Erstelle einen Alarm mit passender *echter* Bedingung, z. B. `LONDON_HIGH_SWEPT`. **Nur auswählen, wenn diese Bedingung im Pine-Code tatsächlich vorhanden ist; niemals einen gewöhnlichen Preisalert fälschlich als Sweep senden.**
- Aktiviere in den Alert-Benachrichtigungen die Webhook-URL:
  `https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/dgos-tradingview`
- Im Feld **Message** (JSON) gib ein, und ersetze den Geheimschlüssel **nur in der TradingView-UI**:

```json
{
  "secret": "DEIN_EIGENER_LANGER_ZUFAELLIGER_SCHLUESSEL",
  "symbol": "{{ticker}}",
  "timeframe": "{{interval}}",
  "eventType": "LONDON_HIGH_SWEPT",
  "price": "{{close}}",
  "level": 0,
  "timestamp": "{{time}}",
  "detector": "DG Smart Money Liquidity"
}
```

**Wichtig zur Beispielvorlage:** Den optionalen Platzhalter `"level": 0` **komplett entfernen**, solange dein Indikator den echten London-High-Wert nicht als Alert-Variable bereitstellt. 0 wäre keine valide Preisinformation. `eventType` muss genau zur gewählten Alarmbedingung passen. `{{time}}` ist die Kerzen-Öffnungszeit, nicht die tatsächliche Zustellzeit. Wir erfassen zusätzlich die Empfangszeit im Backend.

Der Empfänger akzeptiert als **Transport**, nicht als bestätigte DG-Bewertung, diese Ereignisse:
`ASIA_HIGH_TOUCHED`, `ASIA_LOW_TOUCHED`, `ASIA_HIGH_SWEPT`, `ASIA_LOW_SWEPT`, `LONDON_HIGH_TOUCHED`, `LONDON_LOW_TOUCHED`, `LONDON_HIGH_SWEPT`, `LONDON_LOW_SWEPT`, `NY_HIGH_TOUCHED`, `NY_LOW_TOUCHED`, `NY_HIGH_SWEPT`, `NY_LOW_SWEPT`.

**C. Empfänger prüfen:**
- Wenn ein echter TradingView-Alarm auslöst, überprüfe im TradingView-Alarmprotokoll den **Webhook-Status** (erwartet HTTP 200).
- Überprüfe anschliessend in der privaten Supabase-Tabelle `public.dgos_tradingview_events` das Ereignis. Die Tabelle hat aktivierte RLS, es gibt **keinen öffentlichen Browser-Lesezugriff**.
- Doppelte Zustellungen mit derselben Symbol/Eventtyp/Timeframe/Zeit-Kombination werden einmalig gespeichert. Ohne Echtzeit-Alert keine neue Zeile.

## Sicherheits- und Qualitätsregeln

- Separates 32+-Zeichen-Secret statt TradingView-Login/Passwort.
- Keine Schreibrechte für `anon`/`authenticated` auf die Event-Tabelle. Nur Edge Function mit serverseitigem Service-Role-Key.
- JSON-Limit 4 KB, Allowlist für 12 Session-Eventtypen, nur XAUUSD, validierte Barzeit und Preis, HTTP 503 bei fehlender Konfiguration.
- Kein offenes Order-API. Keine Webhook-Nachricht autorisiert einen Trade.
- TradingView ist ein **Event-Lieferant**, nicht der direkte Live-Stream sämtlicher Chartkerzen. Der Webhook meldet nur konfigurierte Alarmereignisse.
- TradingView kann Zustellungen verzögern/verfehlen. Der neue Transport ist kein garantierter tickgenauer Datenfeed.
- **DG Smart Money Liquidity** ist die Quelle der Alert-Bedingungen. Wenn sein Pine-Code bestimmte Events noch nicht sendet, muss der **vollständige** Code zuerst entsprechend erweitert werden. Keine generische Sweep-Annahme.
- Nach erfolgreichem Empfang folgt der authentisierte DG-OS-Reader für Jarvis inklusive Zeitstempel, Herkunft und Aussage `VON TRADINGVIEW GEMELDET` bis der TwelveData-Candlefeed eine unabhängige Prüfung erlaubt.

## Technische Dateien

- `supabase/migrations/20261013100000_dgos_tradingview_events.sql` — private Tabelle mit Idempotenzschlüssel.
- `supabase/functions/dgos-tradingview/index.ts` — gesicherter, fail-closed Empfänger.
- `scripts/test-tradingview-webhook.js` — HTTP-Status/Auth/Replay/Privacy-Tests.
- `.github/workflows/tradingview-webhook.yml` — Test vor Release.

**Einzige notwendige Freigaben vor dem ersten funktionierenden Alarm:** das neue Supabase-Secret im richtigen DG-OS-Projekt setzen und bei TradingView einen Alert mit tatsächlich passender Pine-Bedingung einrichten. Bestehende DG Trading-Regeln, Jarvis, WHOOP und andere Apps bleiben unverändert.
