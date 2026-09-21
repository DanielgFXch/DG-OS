# DG OS WHOOP Integration

## Ziel

WHOOP wird als persönliche Gesundheitsquelle in Jarvis eingebunden. Nach einmaliger OAuth-Freigabe lädt DG OS die wichtigsten WHOOP-v2-Daten automatisch.

## Angezeigte Daten

- Schlafdauer
- Sleep Performance
- Schlaf-Effizienz
- Schlaf-Konsistenz
- REM-, Tief- und Leichtschlaf
- Schlafbedarf
- Atemfrequenz
- Schlafzyklen und Störungen
- Recovery Score
- HRV
- Ruhepuls
- SpO₂
- Hauttemperatur
- Tages-Strain
- Energie/Kalorien
- letzte Workouts mit Strain und Herzfrequenz
- Profil- und Körpermessdaten, soweit von WHOOP geliefert

## OAuth

WHOOP-App:

- Client ID: öffentlich, kann serverseitig über `WHOOP_CLIENT_ID` überschrieben werden.
- Client Secret: **nur** `WHOOP_CLIENT_SECRET` auf dem privaten DG-OS-Server.
- Redirect URI:
  `https://danielgfxch.github.io/DG-OS/whoop-callback.html`

Angeforderte Scopes:

- `offline`
- `read:recovery`
- `read:cycles`
- `read:sleep`
- `read:workout`
- `read:profile`
- `read:body_measurement`

`offline` ist nötig, damit WHOOP einen Refresh Token ausstellt. WHOOP rotiert Refresh Tokens; DG OS speichert deshalb nach jedem Refresh immer den neuesten Token verschlüsselt.

## Sicherheit

- Client Secret wird nie im Browser gespeichert.
- Access-/Refresh-Tokens werden nur serverseitig verarbeitet.
- Persistente WHOOP-Tokens liegen AES-256-GCM-verschlüsselt unter `DGOS_PRIVATE_DATA_DIR`.
- Die Verschlüsselung nutzt `DGOS_INTEGRATION_ENCRYPTION_KEY`.
- Gesundheitsdaten-Endpunkte sind same-origin und benötigen zusätzlich eine signierte HttpOnly-WHOOP-Sitzung.
- Die öffentliche Callback-Seite entfernt den einmaligen Authorization Code sofort aus der Browser-History und leitet ihn nur an den gespeicherten privaten DG-OS-Server weiter.
- Disconnect ruft den WHOOP-Revoke-Endpunkt auf und entfernt lokale Tokens.

## Supabase Connector

Ab v0.47.1 braucht WHOOP keinen Railway-/Always-On-Server mehr. Ein separates Supabase-Projekt `DG-OS` hostet die Edge Function `whoop`.

Der einzige manuelle Secret-Wert ist:

```
WHOOP_CLIENT_SECRET=<secret from WHOOP Developer Dashboard>
```

Dieses Secret wird direkt in Supabase unter **Edge Functions → Secrets** gespeichert und nie in GitHub oder im Browser abgelegt.

Die öffentliche Connector-Basis ist:

`https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/whoop`

## Verbindungsablauf

1. In Supabase einmal `WHOOP_CLIENT_SECRET` als Edge Function Secret hinterlegen.
2. Auf GitHub Pages unter **Gesundheit** auf **WHOOP verbinden**.
3. WHOOP Login/Freigabe bestätigen.
4. WHOOP leitet zur bestehenden GitHub-Pages-Callback-URL zurück.
5. Die Callback-Seite gibt Code + State an die Supabase Edge Function weiter.
6. Supabase tauscht den Code gegen WHOOP Access-/Refresh-Token und speichert diese verschlüsselt.
7. Jarvis erhält nur eine zufällige Session und lädt danach die echten WHOOP-Daten direkt über Supabase.

## API

Private DG-OS-Routen:

- `GET /api/whoop/status`
- `GET /api/whoop/oauth/start`
- `GET /api/whoop/oauth/callback`
- `GET /api/whoop/summary`
- `POST /api/whoop/disconnect`

WHOOP v2 wird verwendet; v1-Webhooks werden nicht benötigt.
