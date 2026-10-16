# DG Jarvis Vantage Bridge V1 — Inbetriebnahme & Verifikation

**Status:** Feature-Branch / Draft-PR. Tests der Eventvalidierung bestanden, aber noch KEIN echter TradingView-/Vantage-Live-Test und KEINE Freigabe von automatischen Telegram-HTF-Berichten.

## Ziel: exakt Daniels Chart, nicht TwelveData als Ersatz

**Feed:** `VANTAGE:XAUUSD` im TradingView-Chart, auf **5 Minuten oder kleiner** (Sekundenchart unterstützt), nicht Heikin Ashi/Renko.

**Schweizer Zeitzone** `Europe/Zurich` mit DST-Automatik:
- Asia `00:00–06:00`
- London `08:00–12:00`
- New York `14:00–22:00`

**Quelle:** `tradingview/DG_Jarvis_Vantage_Bridge_V1.pine`.
- Berechnet laufende Session-Highs/Lows aus den Chartkerzen und sendet `FORMING`-Snapshots alle 15 Minuten (optional).
- Sendet je Session einen `FINAL`-Snapshot nach dem Sessionende.
- Verwendet `request.security(syminfo.tickerid, "60"/"240"/"D", [time[1], open[1], high[1], low[1], close[1]], lookahead=barmerge.lookahead_on)` für **abgeschlossene** 1H/4H/D-Kerzen. Weder FVGs noch Order Blocks werden in dieser ersten Bridge automatisch erfunden oder aus der LTF-Ansicht erraten.
- Pine Alert läuft nur bei aktivierter Freigabe, passendem Symbol und privatem Schlüssel `>=32` Zeichen. Alle Alerts sind reine Beobachtungen, keine Trade-Ausführung.

## 1. Supabase (DG-OS aktives Projekt, NICHT der inaktive Jarvis-Test)

Projekt: `jzvnmhfhyvmmbontsoej`.

1. DB-Migration `supabase/migrations/20261016190000_dgos_vantage_snapshots.sql` auf dem **aktiven DG OS**-Projekt anwenden.
2. `supabase/functions/dgos-vantage-bridge/index.ts` als Edge Function `dgos-vantage-bridge` deployen, `verify_jwt=false` (TradingView kann keine Supabase-OAuth-Header senden; die Function erzwingt stattdessen ein separates 32+-Zeichen-Geheimnis).
3. In den **Supabase Edge Function Secrets** `DGOS_TRADINGVIEW_WEBHOOK_SECRET` mit einem sicheren langen, zufälligen Schlüssel konfigurieren. Das Secret kann mit dem bestehenden, separaten TradingView-Receiver geteilt werden; nicht in GitHub/Chat oder Screenshots einfügen.
4. Endpoint: `https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/dgos-vantage-bridge`.
5. Die Tabelle `public.dgos_vantage_snapshots` ist mit RLS geschützt; kein Zugriff durch `anon` oder `authenticated`. Nur der Edge-Function-Service-Key schreibt. **Nicht** die RLS-Regeln abschalten oder den Service-Role-Key in TradingView eintragen.

Wenn Secret/Migration/Funktion fehlen, bleibt der neue Transport bewusst inaktiv.

## 2. TradingView

1. `VANTAGE:XAUUSD` in TradingView öffnen, normalen Candlestick-Chart (5 Minuten oder Sekundenchart).
2. Pine Editor → vollständigen Code aus `tradingview/DG_Jarvis_Vantage_Bridge_V1.pine` einfügen → speichern → zum Chart hinzufügen.
3. Einstellungen des Bridge-Indikators öffnen; den identischen geheimen Schlüssel **ausschliesslich dort** als Eingabe hinzufügen. **Niemals** einen echten Schlüssel in öffentlich veröffentlichten Pine-Code oder einen Chat schreiben.
4. **Webhook-Ereignisse aktivieren** erst nach dem Supabase-Deployment einschalten.
5. TradingView 2FA aktivieren. Einen neuen Alarm auf diesem Indikator erstellen:
   - Condition: `Any alert() function call` / `Beliebiger alert()-Funktionsaufruf`.
   - Webhook URL: `https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/dgos-vantage-bridge`
   - Script baut das JSON dynamisch; **keinen separaten statischen JSON-Body** über den Alert erzwingen.
   - Möglichst ohne Alarm-Zeitende, abhängig von Abo.
6. TradingView speichert eine Kopie der Scriptinputs beim Erstellen des Alerts. Nach Symbol-/Timeframe-/Key-/Sessionänderungen **Alarm neu erstellen**.
7. Pine/TV-Editor zuerst kompilieren. Kein Pine-Compiler in GitHub CI: Code-Test ≠ Pine-Compiler-Test.

## 3. Live-Test / Gleichheit mit TradingView

1. Bei laufender Asia/London/NY-Session auf den ersten `FORMING`-Snapshot warten; TradingView-Alert-Log soll HTTP 200 zeigen.
2. In Supabase `public.dgos_vantage_snapshots` die aktuellsten Einträge kontrollieren:
   `event_type`, `symbol`, `session_name`, `session_day`, `phase`, `high_price`, `low_price`, `timeframe`, `event_at`.
3. TradingView-Werte **von VANTAGE** vergleichen. Erst die fixierten `FINAL`-Session-Highs/-Lows nach Session-Ende mit den historischen Wick-Extrema vergleichen. DST/Grenzkerzen beachten.
4. Den nächsten `HTF_BAR_CLOSED`-Eintrag gegen die zugehörige bestätigte 1H/4H/Daily-Kerze vergleichen (Open, High, Low, Close). Die Millisekunden `candleStartMs` gehören zum Öffnungszeitpunkt der *bereits geschlossenen* HTF-Kerze.
5. Nachgewiesene Unterschiede nicht still korrigieren: Charttyp, Sekunden-/5m-Kerzenbasis, Handelspausen, Session-Cutoff und Quelle untersuchen.
6. Keine neuen HTF-Zonenberichte einschalten, solange Jarvis im bisherigen Teil noch **TwelveData** als POI-Datenbasis verwendet. **Die Vantage-Bridge transportiert zunächst Marktbeobachtungen und Kerzen.** Eine anschliessende private Reader-/HTF-POI-Engine muss diese Daten erst verifiziert konsumieren.

**Grenzen:** TradingView-Webhooks sind zeitpunktbasierte Events, **kein** allgemeiner visueller Zugriff auf alle manuellen Zeichnungen. Eine Snapshot-Bridge ist **kein vollständiger historischer Backfill**. Jarvis' vollständige Vantage-HTF-Zonenerkennung und Telegram-Zonenberichte bleiben Folgeschritte. Keine automatischen Orders.

## Sicherheit & Test

`node scripts/test-vantage-bridge.js` testet Token, RLS-DDL, ungültigen Provider, veraltete/futuristische Zeitstempel, kaputte Preisranges/OHLC, FORMING/FINAL/HTF-Kerzen, 15-Minuten-Deduplizierung und Persistenzfehler.

**NICHT in Produktion deployt:** neue Migration, Funktion, Bridge-Script oder Webhook-Alert. Vor Release Tests und Datenabgleich abschliessen.
