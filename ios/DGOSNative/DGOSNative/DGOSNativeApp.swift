import SwiftUI
import WebKit
import AppIntents
import UIKit

private enum DGOSConfig {
    static let homeURL = URL(string: "https://danielgfxch.github.io/DG-OS/?native=ios")!
    static let internalHost = "danielgfxch.github.io"
    static let whoopOAuthHosts: Set<String> = [
        "jzvnmhfhyvmmbontsoej.supabase.co",
        "api.prod.whoop.com"
    ]

    static func shouldStayInApp(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https", let host = url.host?.lowercased() else { return false }
        return host == internalHost || whoopOAuthHosts.contains(host) || host.hasSuffix(".whoop.com")
    }
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
    @State private var reverseRotate = false

    private let cyan = Color(red: 0.41, green: 0.97, blue: 1.00)
    private let teal = Color(red: 0.27, green: 0.91, blue: 0.85)
    private let violet = Color(red: 0.55, green: 0.47, blue: 1.00)

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.005, green: 0.016, blue: 0.032),
                    Color(red: 0.010, green: 0.035, blue: 0.060),
                    Color(red: 0.014, green: 0.018, blue: 0.050)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            RadialGradient(
                colors: [cyan.opacity(0.12), Color.clear],
                center: UnitPoint(x: 0.52, y: 0.38),
                startRadius: 8,
                endRadius: 330
            )
            .ignoresSafeArea()

            RadialGradient(
                colors: [violet.opacity(0.08), Color.clear],
                center: UnitPoint(x: 0.80, y: 0.18),
                startRadius: 10,
                endRadius: 280
            )
            .ignoresSafeArea()

            Canvas { context, size in
                let spacing: CGFloat = 22
                for x in stride(from: CGFloat(0), through: size.width, by: spacing) {
                    for y in stride(from: CGFloat(0), through: size.height, by: spacing) {
                        let fade = max(0.12, 1.0 - abs((y / max(size.height, 1)) - 0.42))
                        let rect = CGRect(x: x, y: y, width: 1.1, height: 1.1)
                        context.fill(Path(ellipseIn: rect), with: .color(cyan.opacity(0.11 * fade)))
                    }
                }
            }
            .ignoresSafeArea()
            .opacity(0.82)

            Circle()
                .fill(cyan.opacity(0.10))
                .frame(width: pulse ? 330 : 250, height: pulse ? 330 : 250)
                .blur(radius: 42)

            Circle()
                .stroke(cyan.opacity(0.10), lineWidth: 1)
                .frame(width: 230, height: 230)

            Circle()
                .trim(from: 0.04, to: 0.82)
                .stroke(
                    AngularGradient(
                        colors: [Color.clear, cyan, teal, Color.clear, violet, Color.clear],
                        center: .center
                    ),
                    style: StrokeStyle(lineWidth: 2.2, lineCap: .round)
                )
                .frame(width: 194, height: 194)
                .rotationEffect(.degrees(rotate ? 360 : 0))
                .shadow(color: cyan.opacity(0.42), radius: 15)

            Circle()
                .trim(from: 0.12, to: 0.92)
                .stroke(
                    AngularGradient(
                        colors: [violet.opacity(0.8), Color.clear, cyan.opacity(0.8), Color.clear],
                        center: .center
                    ),
                    style: StrokeStyle(lineWidth: 1, dash: [2, 7])
                )
                .frame(width: 168, height: 168)
                .rotationEffect(.degrees(reverseRotate ? -360 : 0))
                .shadow(color: violet.opacity(0.25), radius: 12)

            Circle()
                .stroke(cyan.opacity(0.22), lineWidth: 1)
                .frame(width: pulse ? 140 : 128, height: pulse ? 140 : 128)

            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white.opacity(0.96),
                            cyan.opacity(0.86),
                            teal.opacity(0.34),
                            violet.opacity(0.20),
                            Color(red: 0.02, green: 0.10, blue: 0.17).opacity(0.16)
                        ],
                        center: UnitPoint(x: 0.42, y: 0.36),
                        startRadius: 1,
                        endRadius: 66
                    )
                )
                .overlay(
                    Circle()
                        .stroke(cyan.opacity(0.58), lineWidth: 1)
                )
                .frame(width: 116, height: 116)
                .scaleEffect(pulse ? 1.035 : 0.94)
                .shadow(color: cyan.opacity(0.46), radius: 26)
                .shadow(color: violet.opacity(0.16), radius: 48)

            VStack(spacing: 7) {
                Text("DG")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .tracking(2.5)
                    .foregroundStyle(Color.white)
                    .shadow(color: cyan.opacity(0.18), radius: 12)

                Text("JARVIS")
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .tracking(4.5)
                    .foregroundStyle(cyan.opacity(0.96))
            }

            VStack {
                Spacer()
                HStack(spacing: 7) {
                    Circle()
                        .fill(teal)
                        .frame(width: 4, height: 4)
                        .shadow(color: teal, radius: 6)
                    Text("SYSTEM ONLINE")
                        .font(.system(size: 8, weight: .medium, design: .rounded))
                        .tracking(2.8)
                        .foregroundStyle(Color.white.opacity(0.46))
                }
                .padding(.bottom, 55)
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 1.15).repeatForever(autoreverses: true)) {
                pulse = true
            }
            withAnimation(.linear(duration: 4.8).repeatForever(autoreverses: false)) {
                rotate = true
            }
            withAnimation(.linear(duration: 7.6).repeatForever(autoreverses: false)) {
                reverseRotate = true
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
               !DGOSConfig.shouldStayInApp(url) {
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

            if DGOSConfig.shouldStayInApp(url) {
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
