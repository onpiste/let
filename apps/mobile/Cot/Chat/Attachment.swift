import Foundation
import UIKit
import UniformTypeIdentifiers

/// A file the user attached to a message (mirrors apps/web/src/lib/attachments.ts).
/// Text files travel inline as text, which every model reads; images and PDFs
/// travel as file parts, which only some models understand.
struct Attachment: Identifiable, Equatable {
    enum Failure: LocalizedError {
        case unsupported(String)
        case tooLarge

        var errorDescription: String? {
            switch self {
            case .unsupported(let name): "\(name): only text, image and PDF files are supported."
            case .tooLarge: "Attachments are limited to 1 MB per message."
            }
        }
    }

    /// One Durable Object row holds a whole chat message and is capped at 2 MB.
    static let maxTotalBytes = 1_000_000

    let id = UUID()
    let name: String
    let size: Int
    let part: JSONValue

    static func make(name: String, data: Data) throws -> Attachment {
        let type = UTType(filenameExtension: (name as NSString).pathExtension)
        if type?.conforms(to: .text) == true || type?.conforms(to: .json) == true {
            let body = String(decoding: data, as: UTF8.self)
            return Attachment(
                name: name, size: body.utf8.count,
                part: .object([
                    "type": .string("text"),
                    "text": .string("<file name=\"\(name)\">\n\(body)\n</file>"),
                ]))
        }
        let mediaType = type?.preferredMIMEType ?? ""
        guard mediaType.hasPrefix("image/") || mediaType == "application/pdf" else {
            throw Failure.unsupported(name)
        }
        return file(name: name, mediaType: mediaType, data: data)
    }

    /// Photos are re-encoded as JPEG: models rarely read HEIC, and it is smaller.
    static func photo(data: Data) throws -> Attachment {
        guard let jpeg = UIImage(data: data)?.jpegData(compressionQuality: 0.8) else {
            throw Failure.unsupported("Photo")
        }
        return file(name: "photo.jpg", mediaType: "image/jpeg", data: jpeg)
    }

    private static func file(name: String, mediaType: String, data: Data) -> Attachment {
        Attachment(
            name: name, size: data.count,
            part: .object([
                "type": .string("file"),
                "mediaType": .string(mediaType),
                "filename": .string(name),
                "url": .string("data:\(mediaType);base64,\(data.base64EncodedString())"),
            ]))
    }

    /// Throws if the files together are too large to store in one message.
    static func check(_ attachments: [Attachment]) throws {
        if attachments.reduce(0, { $0 + $1.size }) > maxTotalBytes { throw Failure.tooLarge }
    }
}
