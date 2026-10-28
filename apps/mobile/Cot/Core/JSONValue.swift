import Foundation

/// Any JSON document. Chat messages stay in this form so that what the app
/// sends back to the server keeps every field the AI SDK put there, including
/// ones this app doesn't render.
enum JSONValue: Codable, Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = try .object(container.decode([String: JSONValue].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case let .bool(value): try container.encode(value)
        case let .number(value): try container.encode(value)
        case let .string(value): try container.encode(value)
        case let .array(value): try container.encode(value)
        case let .object(value): try container.encode(value)
        }
    }

    static func parse(_ text: String) -> JSONValue? {
        try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))
    }

    /// Encodes any `Encodable` (e.g. a settings patch) as a JSON value.
    static func encoding(_ value: some Encodable) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
    }

    func decoded<T: Decodable>(as type: T.Type = T.self) throws -> T {
        try JSONDecoder().decode(type, from: JSONEncoder().encode(self))
    }

    func serialized() -> String {
        guard let data = try? JSONEncoder().encode(self) else { return "null" }
        return String(decoding: data, as: UTF8.self)
    }

    subscript(key: String) -> JSONValue? {
        if case let .object(object) = self {
            return object[key]
        }
        return nil
    }

    var string: String? {
        if case let .string(value) = self {
            return value
        }
        return nil
    }

    var bool: Bool? {
        if case let .bool(value) = self {
            return value
        }
        return nil
    }

    var number: Double? {
        if case let .number(value) = self {
            return value
        }
        return nil
    }

    var array: [JSONValue]? {
        if case let .array(value) = self {
            return value
        }
        return nil
    }

    var object: [String: JSONValue]? {
        if case let .object(value) = self {
            return value
        }
        return nil
    }

    /// Sets a key on an object value; does nothing on other cases.
    mutating func set(_ key: String, _ value: JSONValue) {
        if case var .object(object) = self {
            object[key] = value
            self = .object(object)
        }
    }
}
