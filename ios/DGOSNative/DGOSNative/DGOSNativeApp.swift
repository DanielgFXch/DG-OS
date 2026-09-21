import SwiftUI
import WebKit
import AppIntents
import UIKit

private enum DGOSConfig {
    static let homeURL = URL(string: "https://danielgfxch.github.io/DG-OS/?native=ios")!
    static let internalHost = "danielgfxch.github.io"
}

@main
struct DGOSNativeApp: App {
    init() {
        DGOSShortcuts.updateAppShortcutParameters()
    }

    var body: some Scene {
        WindowGroup {
            DGOSRootView()
                .preferredColorScheme(.dark)
        }
    }
}

struct DGOSRootView: View {
    @State private var showLaunch = true

    var body: some View {
        ZStack {
            Color(red: 0.015, green: 0.043, blue: 0.075)
                .ignoresSafeArea()

            DGOSWebView(url: DGOSConfig.homeURL)
                .opacity(showLaunch ? 0 : 1)

            if showLaunch {
                JarvisLaunchView()
                    .transition(.opacity.combined(with: .scale(scale: 1.02)))
            }
        }
        .task {
            try? await Task.sleep(nanoseconds: 1_450_000_000)
            withAnimation(.easeInOut(duration: 0.45)) {
                showLaunch = false
            }
        }
    }
}

struct JarvisLaunchView: View {
    @State private var pulse = false
    @State private var rotate = false

    private let cyan = Color(red: 0.18, green: 0.88, blue: 0.94)
    private let violet = Color(red: 0.50, green: 0.36, blue: 0.95)

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.015, green: 0.043, blue: 0.075),
                    Color(red: 0.025, green: 0.032, blue: 0.075)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            Circle()
                .fill(cyan.opacity(0.08))
                .frame(width: pulse ? 260 : 190, height: pulse ? 260 : 190)
                .blur(radius: 24)

            Circle()
                .stroke(
                    AngularGradient(
                        colors: [cyan.opacity(0.15), cyan, violet, cyan.opacity(0.15)],
                        center: .center
                    ),
                    lineWidth: 3
                )
                .frame(width: 154, height: 154)
                .rotationEffect(.degrees(rotate ? 360 : 0))
                .shadow(color: cyan.opacity(0.55), radius: 18)

            Circle()
                .stroke(cyan.opacity(0.28), lineWidth: 1)
                .frame(width: pulse ? 126 : 112, height: pulse ? 126 : 112)

            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white.opacity(0.92),
                            cyan.opacity(0.76),
                            violet.opacity(0.25),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 1,
                        endRadius: 54
                    )
                )
                .frame(width: 108, height: 108)
                .scaleEffect(pulse ? 1.04 : 0.92)

            VStack(spacing: 7) {
                Text("DG")
                    .font(.system(size: 27, weight: .bold, design: .rounded))
                    .tracking(2)
                    .foregroundStyle(Color.white)

                Text("JARVIS")
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .tracking(4)
                    .foregroundStyle(cyan.opacity(0.95))
            }

            VStack {
                Spacer()
                Text("DEINE PERSÖNLICHE ZENTRALE")
                    .font(.system(size: 9, weight: .medium, design: .rounded))
                    .tracking(3)
                    .foregroundStyle(Color.white.opacity(0.45))
                    .padding(.bottom, 54)
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
                pulse = true
            }
            withAnimation(.linear(duration: 2.8).repeatForever(autoreverses: false)) {
                rotate = true
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("DG Jarvis startet")
    }
}

struct DGOSWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true

        let pagePreferences = WKWebpagePreferences()
        pagePreferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences = pagePreferences

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.015, green: 0.043, blue: 0.075, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = true
        webView.customUserAgent = (webView.value(forKey: "userAgent") as? String ?? "") + " DGOSNative/1.0"

        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }

        webView.load(URLRequest(
            url: url,
            cachePolicy: .reloadRevalidatingCacheData,
            timeoutInterval: 30
        ))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            let scheme = url.scheme?.lowercased() ?? ""

            if ["mailto", "tel", "sms", "tg"].contains(scheme) {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            if navigationAction.navigationType == .linkActivated,
               url.host != DGOSConfig.internalHost {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            guard let url = navigationAction.request.url else { return nil }

            if url.host == DGOSConfig.internalHost {
                webView.load(URLRequest(url: url))
            } else {
                UIApplication.shared.open(url)
            }
            return nil
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            showOfflinePage(in: webView)
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            showOfflinePage(in: webView)
        }

        private func showOfflinePage(in webView: WKWebView) {
            let html = """
            <!doctype html>
            <html>
              <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
              <body style="margin:0;background:#04101b;color:#e9fbff;font-family:-apple-system;display:grid;place-items:center;height:100vh;text-align:center;padding:28px;box-sizing:border-box">
                <div>
                  <div style="font-size:42px;margin-bottom:14px">DG</div>
                  <h2 style="margin:0 0 8px">Jarvis ist offline</h2>
                  <p style="opacity:.65;line-height:1.45">Prüfe deine Internetverbindung und öffne DG OS danach erneut.</p>
                </div>
              </body>
            </html>
            """
            webView.loadHTMLString(html, baseURL: nil)
        }
    }
}

struct OpenDGOSIntent: AppIntent {
    static let title: LocalizedStringResource = "DG OS öffnen"
    static let description = IntentDescription("Öffnet deine persönliche DG-OS-Zentrale.")
    static let openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        return .result()
    }
}

struct DGOSShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenDGOSIntent(),
            phrases: [
                "Öffne \(.applicationName)",
                "Starte \(.applicationName)",
                "Zeige \(.applicationName)"
            ],
            shortTitle: "DG OS öffnen",
            systemImageName: "waveform.circle.fill"
        )
    }
}
