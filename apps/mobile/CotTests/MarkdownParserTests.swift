@testable import Cot
import XCTest

final class MarkdownParserTests: XCTestCase {
    func testBlocks() {
        let blocks = MarkdownParser.parse(
            """
            # Title

            Some **bold** text
            on two lines.

            - one
            - two

            1. first
            2. second

            ```swift
            let x = 1
            ```
            """
        )
        XCTAssertEqual(
            blocks,
            [
                .heading(level: 1, text: "Title"),
                .paragraph("Some **bold** text\non two lines."),
                .bullets(["one", "two"]),
                .numbered(["first", "second"]),
                .code(language: "swift", text: "let x = 1")
            ]
        )
    }

    func testTable() {
        let blocks = MarkdownParser.parse(
            """
            Intro

            | Name | Qty |
            | :--- | ---: |
            | **a** | 1 |
            | b \\| c | 2 |

            After
            """
        )
        XCTAssertEqual(
            blocks,
            [
                .paragraph("Intro"),
                .table(header: ["Name", "Qty"], rows: [["**a**", "1"], ["b | c", "2"]]),
                .paragraph("After")
            ]
        )
    }

    func testPipeLineWithoutDelimiterIsAParagraph() {
        XCTAssertEqual(
            MarkdownParser.parse("| a | b |"),
            [.paragraph("| a | b |")]
        )
    }

    func testUnclosedFenceRunsToTheEnd() {
        XCTAssertEqual(
            MarkdownParser.parse("```\nlet x"),
            [.code(language: nil, text: "let x")]
        )
    }
}
