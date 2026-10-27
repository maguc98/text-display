// WebFilePicker.swift
// 接管 WKWebView 的 <input type="file">：
//   · accept 含 image  → 直接弹出系统相册（PHPicker），不再出现「照片图库 / 拍照 / 选取文件」菜单
//   · 其他（音频、歌词等）→ 弹出系统文件选择器（UIDocumentPicker），避免音频 / LRC 导入被一起拦坏
// 说明：WKUIDelegate 的 runOpenPanelWith 在 iOS 上需要 iOS 18.4+；更低系统不会走到这里，系统菜单照旧。

import UIKit
import WebKit
import PhotosUI
import UniformTypeIdentifiers

final class WebFilePicker: NSObject, PHPickerViewControllerDelegate, UIDocumentPickerDelegate {

    private var completion: (([URL]?) -> Void)?
    private let lock = NSLock()

    /// completionHandler 只能调用一次：统一从这里出口
    private func finish(_ urls: [URL]?) {
        let c = completion
        completion = nil
        c?(urls)
    }

    func present(from vc: UIViewController,
                 webView: WKWebView,
                 multiple: Bool,
                 completion: @escaping ([URL]?) -> Void) {
        finish(nil)                       // 上一次还没回调的，先按取消处理
        self.completion = completion

        // 前端在点击前把 input 的 accept 记在 window.__lastFileAccept 里（见 boot.js 的小段脚本）
        webView.evaluateJavaScript("window.__lastFileAccept||''") { [weak self, weak vc] result, _ in
            guard let self = self, let vc = vc else { return }
            let accept = ((result as? String) ?? "").lowercased()
            if accept.isEmpty || accept.contains("image") {
                self.showPhotos(from: vc, multiple: multiple)
            } else {
                self.showDocuments(from: vc, accept: accept, multiple: multiple)
            }
        }
    }

    // MARK: - 相册（PHPicker，无需相册权限）
    private func showPhotos(from vc: UIViewController, multiple: Bool) {
        var cfg = PHPickerConfiguration()
        cfg.filter = .images
        cfg.selectionLimit = multiple ? 0 : 1
        let picker = PHPickerViewController(configuration: cfg)
        picker.delegate = self
        vc.present(picker, animated: true)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard !results.isEmpty else { finish(nil); return }   // 取消 / 下滑关闭

        var urls = [URL?](repeating: nil, count: results.count)
        let group = DispatchGroup()
        for (i, r) in results.enumerated() {
            let provider = r.itemProvider
            guard let type = provider.registeredContentTypes.first(where: { $0.conforms(to: .image) }) else { continue }
            group.enter()
            // 系统给的 url 在这个回调结束后就会被删掉，必须在回调里复制走
            provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { [weak self] url, _ in
                defer { group.leave() }
                guard let self = self, let url = url, let copy = Self.copyToTemp(url) else { return }
                self.lock.lock(); urls[i] = copy; self.lock.unlock()
            }
        }
        group.notify(queue: .main) { [weak self] in
            let out = urls.compactMap { $0 }
            self?.finish(out.isEmpty ? nil : out)
        }
    }

    // MARK: - 文件选择器（音频 / 歌词等）
    private func showDocuments(from vc: UIViewController, accept: String, multiple: Bool) {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: Self.contentTypes(from: accept), asCopy: true)
        picker.allowsMultipleSelection = multiple
        picker.delegate = self
        vc.present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        finish(urls.isEmpty ? nil : urls)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finish(nil)
    }

    // MARK: - 工具
    /// 把 accept（"audio/*,.mp3" / ".lrc,.txt" 等）转成 UTType 列表；解析不出来就放开成任意文件
    private static func contentTypes(from accept: String) -> [UTType] {
        var out: [UTType] = []
        for raw in accept.split(separator: ",") {
            let s = raw.trimmingCharacters(in: .whitespaces)
            if s == "audio/*" { out.append(.audio) }
            else if s == "image/*" { out.append(.image) }
            else if s == "video/*" { out.append(.movie) }
            else if s.hasPrefix("."), let t = UTType(filenameExtension: String(s.dropFirst())) { out.append(t) }
            else if let t = UTType(mimeType: s) { out.append(t) }
        }
        return out.isEmpty ? [.data] : out
    }

    /// 复制到临时目录（每次一个独立子目录，避免同名覆盖），网页才读得到
    private static func copyToTemp(_ src: URL) -> URL? {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let dst = dir.appendingPathComponent(src.lastPathComponent)
            try FileManager.default.copyItem(at: src, to: dst)
            return dst
        } catch {
            return nil
        }
    }
}

// MARK: - 接入方式
// 这个文件现在只含 WebFilePicker 类本身，不再依赖不存在的 ViewController，可以单独编译。
// 接入（在创建 WKWebView 的那个类里，具体位置要看 TextDisplayApp.swift）：
//   1) 持有一个实例：      let filePicker = WebFilePicker()
//   2) 给 WKWebView 设置： webView.uiDelegate = <实现了 WKUIDelegate 的对象>
//   3) 在 WKUIDelegate 里实现（iOS 18.4+ 才会被系统调用）：
//        @available(iOS 18.4, *)
//        func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
//                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
//            filePicker.present(from: <当前最上层的 UIViewController>, webView: webView,
//                               multiple: parameters.allowsMultipleSelection, completion: completionHandler)
//        }
