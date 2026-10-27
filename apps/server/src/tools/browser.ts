import puppeteer from "@cloudflare/puppeteer";

/** Page text longer than this is cut so one page can't flood the context. */
const MAX_TEXT = 8000;

export interface PageSnapshot {
  url: string;
  title: string;
  text: string;
}

/**
 * Opens a page in Cloudflare Browser Rendering and returns its visible text.
 * The browser closes after each call, so nothing stays open between turns.
 */
type PageGlobals = { document: { body: { innerText: string } | null } };

export async function browsePage(env: Env, url: string): Promise<PageSnapshot> {
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const title = await page.title();
    // Runs inside the page. The Worker is compiled without the DOM lib, so
    // describe the one global this callback reads.
    const text = await page.evaluate(
      () =>
        (globalThis as unknown as PageGlobals).document.body?.innerText ?? ""
    );
    return {
      url: page.url(),
      title,
      text:
        text.length > MAX_TEXT
          ? `${text.slice(0, MAX_TEXT)}\n…(truncated, ${text.length} chars total)`
          : text
    };
  } finally {
    await browser.close();
  }
}
