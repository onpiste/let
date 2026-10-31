import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

import {
  AUTH_ROUTES,
  NATIVE_AUTH_PARAMS,
  type NativeTokenRequest,
  type NativeTokenResponse
} from "@cot/shared";

const TIMEOUT_MS = 5 * 60_000;
const DONE_PAGE =
  "<!doctype html><meta charset=utf-8><title>Cot Desktop</title><body style='font:16px system-ui;margin:3rem'>Signed in. You can close this tab and return to Cot Desktop.";

const base64Url = (b: Buffer) => b.toString("base64url");

/**
 * Native sign-in with a loopback redirect (RFC 8252) and PKCE, the same
 * contract as the iOS app: open /auth/login in the browser, catch the code on
 * 127.0.0.1, and trade it plus the verifier for a bearer token.
 */
export async function signIn(
  origin: string,
  openBrowser: (url: string) => void
): Promise<NativeTokenResponse> {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());

  const listener = createServer();
  const port = await new Promise<number>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      if (address && typeof address !== "string") resolve(address.port);
      else reject(new Error("Could not open a sign-in port."));
    });
  });

  try {
    const code = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Sign-in timed out.")),
        TIMEOUT_MS
      );
      listener.on("request", (req, res) => {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
        const got = url.searchParams.get(NATIVE_AUTH_PARAMS.code);
        if (url.pathname !== "/callback" || !got) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(DONE_PAGE);
        clearTimeout(timer);
        resolve(got);
      });
      const login = new URL(AUTH_ROUTES.login, origin);
      login.searchParams.set(
        NATIVE_AUTH_PARAMS.redirectUri,
        `http://127.0.0.1:${port}/callback`
      );
      login.searchParams.set(NATIVE_AUTH_PARAMS.codeChallenge, challenge);
      openBrowser(login.toString());
    });

    const body: NativeTokenRequest = { code, codeVerifier: verifier };
    const res = await fetch(new URL(AUTH_ROUTES.token, origin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Sign-in was refused (${res.status}).`);
    // Trust boundary: the Worker's JSON.
    return (await res.json()) as NativeTokenResponse;
  } finally {
    listener.close();
  }
}
