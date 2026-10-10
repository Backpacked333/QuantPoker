// Draws the link-preview card (public/og-default.png, 1200 × 630) that every
// shared page and profile points at (worker/src/profile.ts). The card is the
// same for everyone, so it shows no numbers that could pass for a player's:
// the player's own name and rating go in the preview's title and text.
//
//   node scripts/og-card.ts
import { chromium } from '@playwright/test'

const CARD = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 1200px; height: 630px; }
  body {
    box-sizing: border-box; padding: 72px 80px;
    display: flex; flex-direction: column; justify-content: space-between;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #e9f3ec;
    background: radial-gradient(ellipse at 30% 20%, #2a6b54 0%, #1c4e3d 45%, #123629 100%);
  }
  .brand { font-size: 40px; font-weight: 700; letter-spacing: -0.5px; }
  .brand span { color: #c4e6a8; }
  h1 { margin: 0; max-width: 940px; font-size: 76px; line-height: 1.05; letter-spacing: -1.5px; }
  .row { display: flex; gap: 24px; }
  .chip { padding: 18px 26px; border-radius: 18px;
    background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.18); }
  .chip b { display: block; font-size: 38px; white-space: nowrap; }
  .chip small { display: block; margin-top: 6px; font-size: 20px; color: #a9c6b6; white-space: nowrap; }
</style></head><body>
  <div class="brand">Quant<span>Poker</span></div>
  <h1>Rated heads-up poker, measured honestly.</h1>
  <div class="row">
    <div class="chip"><b>Rating ± RD</b><small>Glicko-2, uncertainty always shown</small></div>
    <div class="chip"><b>Accuracy</b><small>vs. a model opponent, not a solver</small></div>
    <div class="chip"><b>Luck out</b><small>all-ins settled at equity</small></div>
  </div>
</body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(CARD)
await page.screenshot({
  path: new URL('../public/og-default.png', import.meta.url).pathname,
  type: 'png',
})
await browser.close()
console.log('public/og-default.png written')
