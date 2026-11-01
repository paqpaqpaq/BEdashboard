# Release compatibility

- The userscript name is permanently `Balansenergie All-in`, with namespace
  `paq.balansenergie`. Never append a version to the name. Change `@version`
  and displayed/exported versions instead. Keep the stable update/download URLs.
- TenneT private settings use `be-afrr-market-settings-v1`. The userscript's
  version-independent, origin-local recovery copy uses `be_tennet_connection_v1`.
  Preserve both identifiers and migrate existing credentials automatically.
  A renamed/new script must recover the same key, environment, enabled state
  and request-planner scope. Empty defaults must never erase an existing key.
- Only the user's explicit `Sleutel wissen` action revokes a saved key. Keep the
  revisioned deletion marker so older installations cannot restore a revoked key.
- Never embed a real API key in source, releases, diagnostics, DOM events or exports.
  Userscripts recovery storage is local browser-origin storage; extension keys
  remain exclusively in the extension's private storage.
- Keep current JS, TXT, metadata, extension and visible/exported version strings
  synchronized. Earlier published release artifacts are immutable.

## Day-ahead pricing from 6.6

- Select dynamic import only for exact import quarters in `dayAheadPlans`.
  Quote presence alone is insufficient. Preserve per-quarter planning context
  in the source archive, reload cache and provisional calculation.
- Use `day_ahead_import` or, with aFRR import, `day_ahead_afrr_import` exactly
  as provided. The mixed price is indicative; do not invent a weighted price.
- Unknown planning or a missing planned price must not fall back to imbalance,
  an old market observation or a price carried from another quarter. Export
  remains independent; unavailable values stay null, including in the graph.
- Rebuild provisional amounts from older price models before counting them.
  Preserve raw measurements and official results; valid results-v2 day amounts
  always override a local estimate for that date.

## Version 6.5 — scroll preservation, reported 27 October 2026

- Background refreshes must preserve the user's scroll position with the TenneT
  chart both expanded and collapsed. The reported symptom was a jump back toward
  this panel within approximately five seconds after scrolling to the bottom.
- The SVG refresh previously emptied its plot before reading layout dimensions.
  Version 6.5 builds the replacement while the old SVG remains in place and swaps
  them in one DOM mutation, avoiding a temporary drop in page height.
- The TenneT host uses `overflow-anchor:none` so its changing contents are not
  selected as the browser's scroll anchor, including while its graph is collapsed.
- Normal refreshes do not move the mounted host or focus an element. The original
  collapsed-chart symptom has not been reproduced in a live browser; do not claim
  that emptying the SVG alone explained that part of the report.
