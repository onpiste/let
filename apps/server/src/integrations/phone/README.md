# Phone calls (spike)

Call a Twilio number and talk to your assistant. Each spoken turn runs in
the chat in use, with your model, memory and tools, so the call appears in
that chat in the web and iOS apps.

**Status: spike.** One deployment-level number reaches one account, and
callers are recognised by caller ID only. Before this ships for everyone it
moves to per-user numbers on the settings page (like the Telegram bot) and
adds a PIN, since caller ID can be spoofed.

## How a call flows

1. Twilio POSTs the number's "A call comes in" webhook to
   `/messengers/phone/answer`. `twilio.ts` checks `X-Twilio-Signature` and
   that the caller is in `PHONE_CALLERS`, then returns TwiML that streams
   the call to `/messengers/phone/stream/<CallSid>/<token>`. The token is an
   HMAC of the call id, so only this call can open that stream.
2. The SDK's `TwilioAdapter` (`@cloudflare/voice-twilio`) takes the
   WebSocket, turns 8 kHz mulaw into 16 kHz PCM and bridges it to a
   `VoiceCall` agent named after the call.
3. `VoiceCall` (`withVoice` from `agents/voice`) does speech to text
   (Workers AI Flux), turn detection and barge-in. Each turn goes to
   `Assistant.voiceTurn`, which runs it in the current `Chat` on Think's
   `voice` channel: shorter spoken answers, no tools that need approval.
4. The reply text streams back over DO RPC, is cut into sentences and
   spoken by Workers AI Aura 2 as raw PCM (`pcm-tts.ts`). Talking over the
   assistant cancels the stream, which stops the chat's turn.

| File             | What it holds                                                     |
| ---------------- | ----------------------------------------------------------------- |
| `config.ts`      | The secrets that turn phone calls on                              |
| `twilio-auth.ts` | Twilio webhook signatures and per-call stream tokens              |
| `twilio.ts`      | The answer webhook and the media stream route                     |
| `voice-call.ts`  | `VoiceCall` Durable Object: the voice pipeline for one call       |
| `pcm-tts.ts`     | Workers AI text to speech as raw PCM (the adapter can't take MP3) |

The chat side is `agents/think/voice-turn.ts` and `Chat.voiceTurn`.

## Setup

1. Buy a voice number in Twilio.
2. From `apps/server`, set three secrets (`.dev.vars` locally):
   - `TWILIO_AUTH_TOKEN`: the account's auth token.
   - `PHONE_ACCOUNT`: the Google account id of the assistant that answers
     (the `id` in `/auth/me` when signed in).
   - `PHONE_CALLERS`: comma-separated E.164 numbers allowed to call.
3. In the number's settings, set "A call comes in" to Webhook, HTTP POST,
   `https://<your domain>/messengers/phone/answer`.

Without the three secrets both routes answer 404.

## Known limits

- English only: Flux (speech to text) and Aura 2 (speech) are English
  models on Workers AI. Other languages need another provider
  (`WorkersAINova3STT` takes a language; speech would need e.g. ElevenLabs).
- `agents/voice` and the Twilio adapter (0.1.x) are beta.
- No outbound calls, voicemail detection, transfer or recording notice yet.
- Not measured yet: end-of-speech to first audio on a real call.
