import SwiftUI
import WebKit

@main
struct TextDisplayApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    var body: some View {
        LocalWebView()
            .ignoresSafeArea()
            .statusBarHidden(true)
    }
}

struct LocalWebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true

        // 移除了之前可能导致崩溃的 WebGL 强制开启代码

        // 音乐目录：启动时确保 Documents/Music 存在（有了它，「文件」App 里才会出现本 App 的文件夹），
        // 并把读取入口交给网页（window.webkit.messageHandlers.yiuMusic，网页端见 APP/ios-music.js）
        MusicBridge.ensureMusicDir()
        configuration.userContentController.addScriptMessageHandler(MusicBridge.shared, contentWorld: .page, name: "yiuMusic")

        let webView = WKWebView(frame: .zero, configuration: configuration)

        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

// MARK: - Documents/Music 读取桥
// 网页（file:// 页面）不能直接读 App 的 Documents，所以由原生来读，通过带回复的消息交给网页。
// 请求格式：window.webkit.messageHandlers.yiuMusic.postMessage({op: ..., ...}) 返回 Promise。
//   op = "list"                         → {files: [{name, size, dir}]}
//   op = "text", name                   → {text}            （LRC 等文本；依次尝试 UTF-8 / UTF-16(带BOM) / GB18030）
//   op = "read", name, offset, length   → {data(base64), size}  （按块读音频，网页拼成 Blob）
// 只允许访问 Music 目录下的文件名（不接受带 / 的路径）。
final class MusicBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let shared = MusicBridge()
    private let queue = DispatchQueue(label: "yiu.music.bridge", qos: .userInitiated)

    static var musicDir: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Music", isDirectory: true)
    }

    static func ensureMusicDir() {
        try? FileManager.default.createDirectory(at: musicDir, withIntermediateDirectories: true)
    }

    private struct BridgeError: Error { let message: String }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let body = message.body as? [String: Any], let op = body["op"] as? String else {
            replyHandler(nil, "bad request")
            return
        }
        queue.async {
            var value: Any? = nil
            var errorText: String? = nil
            do {
                switch op {
                case "list": value = try Self.list()
                case "text": value = try Self.text(body)
                case "read": value = try Self.read(body)
                default: throw BridgeError(message: "unknown op")
                }
            } catch let e as BridgeError {
                errorText = e.message
            } catch {
                errorText = error.localizedDescription
            }
            DispatchQueue.main.async { replyHandler(value, errorText) }
        }
    }

    // 只接受纯文件名，不允许 / 和 ..
    private static func resolve(_ body: [String: Any]) throws -> URL {
        guard let name = body["name"] as? String, !name.isEmpty,
              !name.contains("/"), name != ".", name != ".." else {
            throw BridgeError(message: "bad name")
        }
        return musicDir.appendingPathComponent(name)
    }

    private static func list() throws -> [String: Any] {
        ensureMusicDir()
        let keys: [URLResourceKey] = [.isDirectoryKey, .fileSizeKey]
        let urls = try FileManager.default.contentsOfDirectory(at: musicDir,
                                                               includingPropertiesForKeys: keys,
                                                               options: [.skipsHiddenFiles])
        let files: [[String: Any]] = urls.map { u in
            let v = try? u.resourceValues(forKeys: Set(keys))
            return ["name": u.lastPathComponent,
                    "size": v?.fileSize ?? 0,
                    "dir": v?.isDirectory ?? false]
        }
        return ["files": files]
    }

    private static func text(_ body: [String: Any]) throws -> [String: Any] {
        let data = try Data(contentsOf: try resolve(body))
        var s: String? = String(data: data, encoding: .utf8)
        if s == nil, data.count >= 2, (data[0] == 0xFF && data[1] == 0xFE) || (data[0] == 0xFE && data[1] == 0xFF) {
            s = String(data: data, encoding: .utf16)
        }
        if s == nil {
            let gb = String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(
                CFStringEncoding(CFStringEncodings.GB_18030_2000.rawValue)))
            s = String(data: data, encoding: gb)
        }
        return ["text": s ?? String(decoding: data, as: UTF8.self)]
    }

    private static func read(_ body: [String: Any]) throws -> [String: Any] {
        let url = try resolve(body)
        let offset = (body["offset"] as? NSNumber)?.uint64Value ?? 0
        let length = max(1, min((body["length"] as? NSNumber)?.intValue ?? 3_145_728, 8_388_608))
        let fh = try FileHandle(forReadingFrom: url)
        defer { try? fh.close() }
        let size = try fh.seekToEnd()
        var chunk = Data()
        if offset < size {
            try fh.seek(toOffset: offset)
            chunk = try fh.read(upToCount: length) ?? Data()
        }
        return ["data": chunk.base64EncodedString(), "size": Int(size)]
    }
}
