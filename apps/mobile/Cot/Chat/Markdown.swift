import Foundation

enum MarkdownBlock: Equatable {
    case paragraph(String)
    case heading(level: Int, text: String)
    case code(language: String?, text: String)
    case bullets([String])
    case numbered([String])
    case quote(String)
    case rule
}

/// A small block-level Markdown reader for assistant replies. Inline syntax
/// (bold, links, `code`) is left to `AttributedString`; this only splits the
/// text into the blocks SwiftUI has to lay out itself. It tolerates a
/// half-streamed reply: an unclosed code fence runs to the end.
enum MarkdownParser {
    static func parse(_ source: String) -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        var paragraph: [String] = []
        var bullets: [String] = []
        var numbered: [String] = []
        var quote: [String] = []

        func flush() {
            if !paragraph.isEmpty {
                blocks.append(.paragraph(paragraph.joined(separator: "\n")))
            }
            if !bullets.isEmpty {
                blocks.append(.bullets(bullets))
            }
            if !numbered.isEmpty {
                blocks.append(.numbered(numbered))
            }
            if !quote.isEmpty {
                blocks.append(.quote(quote.joined(separator: "\n")))
            }
            paragraph = []
            bullets = []
            numbered = []
            quote = []
        }

        var lines = source.components(separatedBy: "\n")[...]
        while let line = lines.popFirst() {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("```") {
                flush()
                let language = String(trimmed.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                var code: [String] = []
                while let next = lines.popFirst() {
                    if next.trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                        break
                    }
                    code.append(next)
                }
                blocks.append(.code(
                    language: language.isEmpty ? nil : language,
                    text: code.joined(separator: "\n")
                ))
            } else if trimmed.isEmpty {
                flush()
            } else if let level = headingLevel(trimmed) {
                flush()
                blocks.append(.heading(
                    level: level,
                    text: String(trimmed.drop(while: { $0 == "#" }).dropFirst())
                ))
            } else if ["---", "***", "___"].contains(trimmed) {
                flush()
                blocks.append(.rule)
            } else if let item = bulletItem(trimmed) {
                if bullets.isEmpty {
                    flush()
                }
                bullets.append(item)
            } else if let item = numberedItem(trimmed) {
                if numbered.isEmpty {
                    flush()
                }
                numbered.append(item)
            } else if trimmed.hasPrefix(">") {
                if quote.isEmpty {
                    flush()
                }
                quote.append(String(trimmed.dropFirst()).trimmingCharacters(in: .whitespaces))
            } else {
                if !bullets.isEmpty || !numbered.isEmpty || !quote.isEmpty {
                    flush()
                }
                paragraph.append(trimmed)
            }
        }
        flush()
        return blocks
    }

    private static func headingLevel(_ line: String) -> Int? {
        let hashes = line.prefix { $0 == "#" }.count
        guard (1 ... 6).contains(hashes), line.dropFirst(hashes).first == " " else { return nil }
        return hashes
    }

    private static func bulletItem(_ line: String) -> String? {
        for marker in ["- ", "* ", "+ "] where line.hasPrefix(marker) {
            return String(line.dropFirst(2))
        }
        return nil
    }

    private static func numberedItem(_ line: String) -> String? {
        let digits = line.prefix { $0.isNumber }
        guard !digits.isEmpty, line.dropFirst(digits.count).hasPrefix(". ") else { return nil }
        return String(line.dropFirst(digits.count + 2))
    }
}
