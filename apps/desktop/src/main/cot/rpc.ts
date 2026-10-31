import { randomUUID } from "node:crypto";

import { WebSocket, type RawData } from "ws";

import { ASSISTANT } from "@cot/shared";

const CALL_TIMEOUT_MS = 30_000;

type RpcFrame = {
  type?: string;
  id?: string;
  success?: boolean;
  done?: boolean;
  result?: unknown;
  error?: string;
};

/** ws hands over a Buffer, a list of fragments or an ArrayBuffer. */
function rawText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  return Buffer.from(new Uint8Array(data)).toString("utf8");
}

/** A refused upgrade means the token is no longer valid. */
export class AuthError extends Error {}

/**
 * Calls AssistantRpc methods over the agent WebSocket, the way the iOS app
 * does: `{type:"rpc", id, method, args}` frames, answered by a frame with the
 * same id. The bearer token goes in the upgrade request's header.
 */
export class RpcSession {
  private readonly pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  private constructor(private readonly socket: WebSocket) {
    socket.on("message", (data) => this.handle(rawText(data)));
    socket.on("close", () => this.failAll(new Error("Connection closed.")));
  }

  static open(origin: string, token: string): Promise<RpcSession> {
    const url = new URL(`/${ASSISTANT.basePath}`, origin);
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    url.searchParams.set("_pk", randomUUID());
    const socket = new WebSocket(url, {
      headers: { authorization: `Bearer ${token}` },
      handshakeTimeout: 10_000
    });
    return new Promise((resolve, reject) => {
      socket.once("open", () => resolve(new RpcSession(socket)));
      socket.once("unexpected-response", (_req, res) => {
        reject(
          res.statusCode === 401 || res.statusCode === 403
            ? new AuthError("Sign in again.")
            : new Error(`The server answered ${res.statusCode}.`)
        );
      });
      socket.once("error", reject);
    });
  }

  call<T>(method: string, ...args: unknown[]): Promise<T> {
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out.`));
      }, CALL_TIMEOUT_MS);
      this.pending.set(id, {
        // Trust boundary: the result's shape is the AssistantRpc contract.
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        }
      });
      this.socket.send(JSON.stringify({ type: "rpc", id, method, args }));
    });
  }

  close() {
    this.socket.close();
  }

  private handle(text: string) {
    let frame: RpcFrame;
    try {
      // Trust boundary: any frame the agent pushes, most of which we ignore.
      frame = JSON.parse(text) as RpcFrame;
    } catch {
      return;
    }
    if (frame.type !== "rpc" || !frame.id) return;
    const call = this.pending.get(frame.id);
    if (!call) return;
    if (frame.success === false) {
      this.pending.delete(frame.id);
      call.reject(new Error(frame.error ?? "Request failed"));
    } else if (frame.done !== false) {
      this.pending.delete(frame.id);
      call.resolve(frame.result);
    }
  }

  private failAll(error: Error) {
    for (const call of this.pending.values()) call.reject(error);
    this.pending.clear();
  }
}
