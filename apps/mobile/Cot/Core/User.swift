import Foundation

/// `User` and the native token exchange from @cot/shared (user.ts).
struct User: Codable, Equatable {
    let id: String
    let email: String
    let name: String
    let picture: String?

    var firstName: String {
        name.split(separator: " ").first.map(String.init) ?? name
    }
}

struct NativeTokenRequest: Encodable {
    let code: String
    let codeVerifier: String
}

struct NativeTokenResponse: Decodable {
    let token: String
    /// Unix seconds; sign in again after this.
    let expiresAt: Double
    let user: User
}
