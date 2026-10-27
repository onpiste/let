/** What a client sees of the user's Telegram bot. The token never leaves the server. */
export type TelegramStatus =
  | { configured: false }
  | {
      configured: true;
      botUsername: string;
      webhookSet: boolean;
      linked: boolean;
      /** Open in Telegram and press Start to claim the bot (until linked). */
      claimUrl: string | null;
    };
