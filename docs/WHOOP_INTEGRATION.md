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

## Server-Variablen

Mindestens:

```
WHOOP_CLIENT_SECRET=<secret from WHOOP Developer Dashboard>
WHOOP_REDIRECT_URI=https://danielgfxch.github.io/DG-OS/whoop-callback.html
DGOS_PUBLIC_BASE_URL=https://<your-private-dgos-server>
DGOS_APP_URL=https://<your-private-dgos-server>
DGOS_INTEGRATION_ENCRYPTION_KEY=<32-byte key>
DGOS_PRIVATE_DATA_DIR=<persistent directory>
```

`WHOOP_CLIENT_ID` ist optional, solange die im Projekt hinterlegte öffentliche DG-OS-Client-ID verwendet wird.

## Verbindungsablauf

1. Auf GitHub Pages unter **Gesundheit** auf **WHOOP verbinden**.
2. DG OS öffnet über den privaten Server den WHOOP OAuth Login.
3. WHOOP fragt nach der Freigabe der ausgewählten Scopes.
4. WHOOP leitet zur registrierten GitHub-Pages-Callback-URL zurück.
5. Die Callback-Seite leitet Code + State an den privaten DG-OS-Server weiter.
6. Der Server tauscht den Code gegen Access-/Refresh-Token.
7. Danach öffnet sich die servergehostete DG-OS-Oberfläche und lädt die echten WHOOP-Daten.

## API

Private DG-OS-Routen:

- `GET /api/whoop/status`
- `GET /api/whoop/oauth/start`
- `GET /api/whoop/oauth/callback`
- `GET /api/whoop/summary`
- `POST /api/whoop/disconnect`

WHOOP v2 wird verwendet; v1-Webhooks werden nicht benötigt.
