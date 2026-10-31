import type { DesktopState, LinkView, TunnelView } from "../shared/api";
import type { Policy } from "./bridge/policy";
import { startBridge, type Bridge } from "./bridge/server";
import type { Activity } from "./bridge/tools/define";
import { signIn } from "./cot/auth";
import { registerBridge, unregisterBridge } from "./cot/register";
import { AuthError } from "./cot/rpc";
import type { JsonStore } from "./json-store";
import { Tunnel } from "./tunnel";
import { newSecret, type Vault } from "./vault";

export type Prefs = {
  /** The Cot deployment to sign in to. */
  origin: string;
  /** Public hostname of a named tunnel, if used. */
  tunnelHost: string;
};

export type ControllerDeps = {
  vault: Vault;
  policy: JsonStore<Policy>;
  prefs: JsonStore<Prefs>;
  computerName: string;
  openBrowser: (url: string) => void;
  cloudflared: () => Promise<string>;
  onChange: (state: DesktopState) => void;
};

const ACTIVITY_MAX = 100;

/** Owns the bridge, the tunnel and the link to the owner's Cot account. */
export class Controller {
  private bridge: Bridge | null = null;
  private readonly tunnel: Tunnel;
  private tunnelView: TunnelView = { status: "off" };
  private link: LinkView = { status: "idle" };
  private needsSignIn = false;
  private activity: Activity[] = [];
  private registeredFor: string | null = null;
  private registering = false;
  private registerAgain = false;

  constructor(private readonly deps: ControllerDeps) {
    this.tunnel = new Tunnel((state) => {
      this.tunnelView = state;
      this.emit();
      if (state.status === "up") void this.register();
    }, deps.cloudflared);
  }

  async start() {
    this.bridge = await startBridge({
      policy: this.deps.policy,
      secret: () => this.deps.vault.get().mcpSecret,
      onActivity: (entry) => {
        this.activity = [entry, ...this.activity].slice(0, ACTIVITY_MAX);
        this.emit();
      }
    });
    this.startTunnel();
    this.emit();
  }

  async stop() {
    this.tunnel.stop();
    await this.bridge?.close();
  }

  state(): DesktopState {
    const { vault, policy, prefs } = this.deps;
    const data = vault.get();
    return {
      origin: prefs.get().origin,
      user: data.user ?? null,
      needsSignIn: this.needsSignIn || !this.tokenValid(),
      tunnel: this.tunnelView,
      link: this.link,
      policy: policy.get(),
      activity: this.activity,
      tunnelHost: prefs.get().tunnelHost,
      hasTunnelToken: Boolean(data.tunnelToken),
      platform: process.platform
    };
  }

  /** The URL to paste into Cot by hand, when auto-registration isn't used. */
  mcpUrl(): string | null {
    if (this.tunnelView.status !== "up") return null;
    return `${this.tunnelView.url}/mcp/${this.deps.vault.get().mcpSecret}`;
  }

  async signIn() {
    const { prefs, vault, openBrowser } = this.deps;
    const result = await signIn(prefs.get().origin, openBrowser);
    vault.update({
      token: result.token,
      tokenExpiresAt: result.expiresAt,
      user: result.user
    });
    this.needsSignIn = false;
    this.emit();
    await this.register(true);
  }

  async signOut() {
    const { vault, prefs } = this.deps;
    const { token, serverId } = vault.get();
    if (token && serverId) {
      await unregisterBridge({
        origin: prefs.get().origin,
        token,
        id: serverId
      }).catch(() => {});
    }
    vault.update({
      token: undefined,
      tokenExpiresAt: undefined,
      user: undefined,
      serverId: undefined
    });
    this.registeredFor = null;
    this.link = { status: "idle" };
    this.emit();
  }

  async rotateSecret() {
    this.deps.vault.update({ mcpSecret: newSecret() });
    await this.register(true);
  }

  setPolicy(patch: Partial<Policy>) {
    this.deps.policy.update(patch);
    this.emit();
  }

  setOrigin(origin: string) {
    this.deps.prefs.update({ origin: origin.trim().replace(/\/+$/, "") });
    this.emit();
  }

  setTunnel(host: string, token: string) {
    this.deps.prefs.update({ tunnelHost: host.trim() });
    this.deps.vault.update({ tunnelToken: token.trim() || undefined });
    this.registeredFor = null;
    this.startTunnel();
    this.emit();
  }

  private startTunnel() {
    if (!this.bridge) return;
    const token = this.deps.vault.get().tunnelToken;
    this.tunnel.start({
      port: this.bridge.port,
      token,
      host: this.deps.prefs.get().tunnelHost
    });
  }

  private tokenValid(): boolean {
    const { token, tokenExpiresAt } = this.deps.vault.get();
    return Boolean(token) && (tokenExpiresAt ?? 0) * 1000 > Date.now();
  }

  /** Points Cot at the current tunnel URL; calls made meanwhile are merged. */
  private async register(force = false) {
    if (this.registering) {
      this.registerAgain = true;
      return;
    }
    const url = this.mcpUrl();
    const { token, serverId } = this.deps.vault.get();
    if (!url || !token || !this.tokenValid()) return;
    if (!force && this.registeredFor === url) return;
    this.registering = true;
    this.link = { status: "registering" };
    this.emit();
    try {
      const id = await registerBridge({
        origin: this.deps.prefs.get().origin,
        token,
        name: `${this.deps.computerName} (Cot Desktop)`,
        url,
        previousId: serverId ?? null
      });
      this.deps.vault.update({ serverId: id });
      this.registeredFor = url;
      this.link = { status: "registered" };
    } catch (error) {
      if (error instanceof AuthError) this.needsSignIn = true;
      this.link = { status: "error", error: String(error) };
    } finally {
      this.registering = false;
      this.emit();
      if (this.registerAgain) {
        this.registerAgain = false;
        void this.register();
      }
    }
  }

  private emit() {
    this.deps.onChange(this.state());
  }
}
