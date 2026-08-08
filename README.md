# DG-OS
DG OS Alpha - AI Trading Assistant

## Live-Vorschau (Progress)

**https://danielgfxch.github.io/DG-OS/**

Jeder Merge nach `main` wird automatisch über GitHub Actions (`.github/workflows/deploy-pages.yml`) auf GitHub Pages veröffentlicht. Unter dem Link siehst du also jederzeit den aktuellen Entwicklungsstand des Interfaces.

Einmaliger Setup-Schritt (nur bei der ersten Einrichtung nötig): In den Repo-Settings unter **Settings → Pages → Build and deployment → Source** auf **"GitHub Actions"** stellen. Danach läuft alles automatisch bei jedem Merge.

## Telegram-Anbindung

Im Bereich "🤖 Telegram" der App kannst du deinen eigenen Bot verbinden:

1. Bei [@BotFather](https://t.me/BotFather) einen Bot anlegen und den Bot-Token kopieren.
2. Deine Chat-ID ermitteln (z. B. über [@userinfobot](https://t.me/userinfobot)).
3. Token und Chat-ID in der App eintragen und auf "Speichern & testen" klicken.

Token und Chat-ID werden ausschließlich lokal im Browser (`localStorage`) gespeichert und direkt vom Client an die Telegram Bot API gesendet — es gibt kein eigenes Backend. Da der Token dadurch im Browser des Geräts liegt, sollte DG OS nur auf vertrauenswürdigen, eigenen Geräten genutzt werden.

Mit der Option "Auto-Senden bei SELL-Signal" schickt DG OS das Briefing automatisch an Telegram, sobald Sweep + Bearish Engulfing gleichzeitig erkannt werden.
