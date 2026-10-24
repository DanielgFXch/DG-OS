# DG Jarvis — HTF Zone Intelligence (London & New York)

**Stand:** Implementierung auf Feature-Branch, **nicht live aktiviert**.

## Ziel
- Nur XAUUSD; relevante Zonen nur aus **1H (H1), 4H, Daily**.
- Weekly bleibt HTF-Kontext; **keine MT-Fenster und keine 1/3/5/15M-Zonen**.
- Telegram-Bericht zeigt echte exakte **Unter-/Obergrenze** (2 Nachkommastellen), Zone-Typ (FVG/Order Block), Timeframe, Frische/Qualität, belegbare positive DG-Begründungen und tatsächliche Überlappungen anderer HTF-Zonen.
- Je max. 2 qualifizierte SELL- und BUY-Zonen (vorhandene DG Quality `high` oder `medium`). Keine Low-Quality-/mitigierten Zonen oder synthetischen Zahlen.
- Kurs nur wenn frisch; ansonsten explizit "nicht zuverlässig verfügbar".
- Bei fehlenden hochwertigen Zonen wird ehrlich **keine Zone erkannt** gemeldet. Bericht ist **kein Entry-Signal**.
- Die aktuellen Daten/Filter stammen unverändert aus `marketBrain.js` `generateMarketReport()` (`freshBullishPOIs`, `freshBearishPOIs`). Keine Tradingstrategie geändert.

## Konfiguration auf dem vorhandenen Always-On Node-DG-OS-Service
Vor Freigabe des Systems Server, TwelveData und Telegram-Verbindung tatsächlich testen.
```sh
DGOS_HTF_ZONE_BRIEFINGS_ENABLED=true
DGOS_HTF_LONDON_TIME=08:50
DGOS_HTF_NEW_YORK_TIME=13:50
```
Beides sind **editierbare Vorschlagszeiten**, keine verbindlich bestätigten Handelszeiten. Zeitzone immer `Europe/Zurich` mit automatischem DST-Wechsel.

Berichte laufen Montag bis Freitag, im 20-Minuten-Fenster nach Sollzeit; bei verspätetem Serverstart abseits dieses Fensters kein verspäteter Spam. Pro Tag/Session wird nur ein bestätigter Telegram-Versand als `htf-YYYY-MM-DD-session` in der vorhandenen `sessionOpenStore` festgehalten. Bei ausfallenden Daten wird ohne erfundene Levels gewartet; kein unbegrenztes Nachholen.

**Bestehende alte Asia/London/NY-Zonenberichte** werden nur dann ersetzt/deaktiviert, wenn das neue Feature eingeschaltet ist. Der übrige Jarvis, TradingView-Webhooks und das reguläre Morning Briefing bleiben unverändert.

## Noch NICHT in diesem Change enthalten
- Automatischer Alarm bei POI-Touch oder Session-Liquidity-Sweep. Das benötigt eine eigene überprüfte Event-Pipeline / TradingView-Alarmregeln und Zustellung an Telegram.
- Keine Echtzeit-Validierung mit echten historischen oder live TwelveData-Daten in diesem PR; Unit Tests prüfen Formatter, Filter und Zeitzonen-Scheduler mit synthetischen Daten.
- Kein direkter Pine-/TradingView-Zugriff oder automatische Trades.
- Vor Go-live tatsächliche Server-/Telegram-Deploybarkeit und Qualität der HTF-Level anhand Charts verifizieren.

## Unit Tests
`node --test server/lib/htfZoneBriefing.test.js` — Level-Parsing, Ausschluss LTF/low/mitigiert, kein Fake-Level, Überlappung, Zeitzonen/Sommerzeit, Deduplizierung, Datenfrische.
