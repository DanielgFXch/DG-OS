# DG OS · Jarvis Outfit / Wetter-Begleiter

## Verhalten
- Datenquelle: bestehende **Open-Meteo Forecast API**, bisheriger Ort **Oetwil am See (47.27, 8.72)**. Kein GPS, keine Browserstandort-Berechtigung, keine neuen API-Schlüssel. Der Ort ist **nicht automatisch der aktuelle Aufenthaltsort**.
- Neu: aktuelle Wetterdaten und stündliche Modellprognose für **heute und morgen** (gefühlte Temperatur, tatsächliche Temperatur, Regenwahrscheinlichkeit, Wettercode, Wind in km/h, UV-Index).
- Von den verbleibenden Stunden werden Morgen (06–11), Nachmittag (12–17), Abend (18–23) getrennt bewertet. Nach sehr spätem Tagesende kann die Karte auf morgen wechseln. Sommerlich vs. mehrere Schichten vs. Winterjacke ergibt sich aus den verbleibenden gefühlten Temperaturen, Niederschlag und Wind/UV. Der Modus **„Ich friere schnell“** verschiebt nur die Kleidungsgrenzen um 3 Grad, **nicht** die angezeigten Mess-/Modellwerte. Diese Präferenz ist lokal im Browser hinterlegt.
- Auf **Heute** wird nach einem erfolgreichen Wetterabruf eine kurze Jarvis-Empfehlung angezeigt; Tippen öffnet den Wetterberater in Jarvis.
- Auf **Jarvis** erscheint ein kompakter Wetter-/Kleidungsblock mit Tagesverlauf, Tipps, Aktualisierung und „Jarvis fragen“.
- Per Sprache/Text: „Wie soll ich mich heute anziehen?“, „Brauche ich eine Jacke?“, „Wird es regnen?“ oder „Wie wird das Wetter morgen?“. Die Antwort läuft durch den **bestehenden** Jarvis-Antwortkanal: hörbar, wenn „Antworten vorlesen“ aktiviert ist.
- Im bestehenden **Tagesbriefing** erscheint der Kleidungstipp zusätzlich zu Terminen, Aufgaben und Einkäufen.
- Sichtbare Karte aktualisiert sich mit dem vorhandenen **10-Minuten-Wetterrefresh**, wenn DG OS offen und sichtbar ist; auch beim erneuten Öffnen des Browsers nach kurzer Pause. Risiken/Empfehlungen werden nur bei tatsächlich neuen Daten geändert.

## Wichtige Grenzen
- Kein automatisches Push aufs gesperrte iPhone und keine Benachrichtigungen, wenn DG OS geschlossen ist. Solche proaktiven Nachrichten benötigen ein separates geplantes Backend **und ausdrückliche Freigabe**.
- Wetterprognosen sind Modellwerte und keine Garantie. Bei fehlenden, unvollständigen oder älter als 90 Minuten datierten Modellen erscheint eine Fehlermeldung **statt einer erfundenen Kleidungsempfehlung**.
- Unverändert: DG OS Trading, Academy, Supabase-Personal-Daten, Cartesia, Telegram-Kopplung und Einkaufslistenlogik. Keine Lovable Credits.
- Die finale Bildschirm- und Voice-Freigabe braucht einen praktischen iPhone-Test des Eigentümers.

## Automatische Tests
`node scripts/test-jarvis-weather-outfit.js` überprüft kühle Morgen + warme Nachmittage, Schauer, Schneefall, Wind, UV, Sommer, Kälteempfindlichkeit, korrekte heute-/morgen-Datumsgrenzen in Europe/Zurich, alte/kaputte Prognosen, Text-/Sprachintegration, Homepage-Anzeige, Tagesbriefing und den iPhone-Offline-Cache. Die bestehende GitHub-Workflow-Matrix muss zusätzlich vollständig grün sein.
