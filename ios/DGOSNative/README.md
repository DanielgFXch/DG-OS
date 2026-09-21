# DG OS Native — iPhone/iPad Shell

This folder contains the native SwiftUI shell for DG OS.

## What it does

- Installs as a real iOS/iPadOS app named **DG OS**.
- Loads the existing live DG OS at `https://danielgfxch.github.io/DG-OS/`.
- Uses a persistent `WKWebView` data store so DG OS sessions survive normal app restarts.
- Shows a native animated **DG JARVIS** orb while the app starts.
- Registers **DG OS öffnen** through Apple's App Intents / App Shortcuts system.
- Keeps Telegram, Supabase, WHOOP and all DG OS logic on the existing backend. This shell does not duplicate trading logic.

## Install on Daniel's iPhone

1. Install the current Xcode from the Mac App Store.
2. In Xcode, sign in with your Apple Account under **Xcode > Settings > Accounts**.
3. Open `ios/DGOSNative/DGOSNative.xcodeproj`.
4. Click the **DGOSNative** project, then target **DGOSNative > Signing & Capabilities**.
5. Enable **Automatically manage signing** and select your Team / Personal Team.
6. Connect the iPhone to the Mac and trust the computer if requested.
7. Choose Daniel's iPhone as the run destination at the top of Xcode.
8. Press **Run ▶︎**.
9. DG OS is now a native app on the iPhone.

If Xcode reports that the bundle identifier is already used, change
`ch.danielgfx.dgos` under **Signing & Capabilities > Bundle Identifier**
to a unique value such as `ch.danielgfx.dgos.daniel`.

## Voice trigger

After the native app is installed:

1. Open **Settings > Accessibility > Vocal Shortcuts / Stimmkurzbefehle**.
2. Add a new vocal shortcut.
3. Select the native action **DG OS öffnen** or the system action **Open App > DG OS**.
4. Record the phrase **Jarvis**.

Result: saying **Jarvis** can launch the native DG OS app instead of Safari.

The app also registers the App Shortcut phrases "Öffne DG OS", "Starte DG OS" and "Zeige DG OS".

## Xcode project fallback

A `project.yml` is included as a source-of-truth fallback. If the checked-in
`.xcodeproj` ever needs regeneration and XcodeGen is installed:

```bash
cd ios/DGOSNative
xcodegen generate
```

## Signing note

A free Apple Account can be used with Xcode's **Personal Team** for personal
device testing. Apple requires free-provisioned apps to be re-provisioned
periodically. A paid Apple Developer Program membership is needed for normal
long-term distribution through TestFlight/App Store.

## Native shell rules

- Never put API secrets, WHOOP secrets, Telegram bot tokens or Supabase service keys in this iOS target.
- Do not reimplement or alter DG trading rules in the native shell.
- The web application remains the source of truth for DG OS business logic.
