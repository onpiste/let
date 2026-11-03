# Phone answering (spike)

Your assistant picks up the calls you miss. Forward unanswered calls from
your own phone to a Twilio number; the assistant answers as your
receptionist, takes a message, and when the caller hangs up you get a push
and Telegram notice plus the summary and transcript in the chat you use.

The caller is someone else, so the receptionist is deliberately limited: it
has no tools and none of your memory, chats, calendar or email. All it can
do is take a message, so nothing a caller says can read or change your data.

**Status: spike.** One number per deployment answers for one account. Before
it ships for everyone it moves to per-user setup on the settings page (like
the Telegram bot).

## How a call flows

1. Someone calls your phone; you don't pick up (or are busy or out of
   signal), and your carrier forwards the call to the Twilio number.
2. Twilio POSTs `/messengers/phone/answer`. `twilio.ts` checks
   `X-Twilio-Signature`, hands the caller's number (`From`, which survives
   forwarding) to the call's `VoiceCall`, and returns TwiML that streams the
   audio to `/messengers/phone/stream/<CallSid>/<token>`. The token is an
   HMAC of the call id, so only this call can open that stream.
3. The SDK's `TwilioAdapter` (`@cloudflare/voice-twilio`) bridges the stream
   to `VoiceCall` (`withVoice` from `agents/voice`): speech to text with
   Workers AI Flux, turn detection, barge-in.
4. Each turn asks your `Assistant` for the next line through `PhoneLine`,
   which runs your model (your settings and key, counted against your
   message limits) with the receptionist prompt. Replies are spoken by
   Workers AI Aura 2 as raw PCM (`pcm-tts.ts`).
5. When the call ends, `PhoneLine.ended` summarizes the transcript (no tools,
   like the email triage), posts it to the chat in use and notifies you.

| File              | What it holds                                                     |
| ----------------- | ----------------------------------------------------------------- |
| `config.ts`       | The secrets that turn answering on                                |
| `twilio-auth.ts`  | Twilio webhook signatures and per-call stream tokens              |
| `twilio.ts`       | The answer webhook and the media stream route                     |
| `voice-call.ts`   | `VoiceCall` Durable Object: the voice pipeline for one call       |
| `line.ts`         | `PhoneLine`: the assistant's side (replies, hand-over, notices)   |
| `receptionist.ts` | The receptionist prompt, its replies and the call summary         |
| `pcm-tts.ts`      | Workers AI text to speech as raw PCM (the adapter can't take MP3) |

## Setup

1. Buy a voice number in Twilio.
2. From `apps/server`, set two secrets (`.dev.vars` locally):
   - `TWILIO_AUTH_TOKEN`: the account's auth token (Console → Account Info).
   - `PHONE_ACCOUNT`: the Google account id of the assistant that answers
     (the `id` in `/auth/me` when signed in).
3. In the number's settings, set "A call comes in" to Webhook, HTTP POST,
   `https://<your domain>/messengers/phone/answer`.
4. On your own phone, forward unanswered calls to the Twilio number
   (conditional call forwarding). Most US carriers take these from the
   dialer, with `+1NUMBER` being the Twilio number:
   - AT&T, T-Mobile and other GSM carriers: `**004*+1NUMBER#` forwards when
     you don't answer, are busy or unreachable; `##004#` turns it off. Or
     `**61*+1NUMBER**20#` for no answer only, after 20 seconds.
   - Verizon: `*71` followed by the number; `*73` turns it off.
     Codes vary by carrier and plan; check yours if one doesn't work.

Without both secrets the routes answer 404.

## Known limits

- English only: Flux (speech to text) and Aura 2 (speech) are English
  models on Workers AI. Other languages need another provider.
- The adapter doesn't hang up when the agent ends a call, so the caller
  hangs up; past 12 caller turns the receptionist just says goodbye.
- Every caller is answered, spam included, and each reply counts against
  the owner's message limits.
- No transfer to you for urgent calls, voicemail detection or SMS yet.
- `agents/voice` and the Twilio adapter (0.1.x) are beta.
- Not measured yet: end-of-speech to first audio on a real call.
