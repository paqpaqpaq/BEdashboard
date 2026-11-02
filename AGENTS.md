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

## Version 6.6.1 — forecast planning and unavailable result months

- User authorized publication of 6.6.1, then explicitly instructed pushing the
  update despite the unavailable browser/API inspection. The public price and
  annotation JS were byte-identical on 1 November at 13:19 Netherlands time.
  Authenticated API contents could not be inspected; do not claim otherwise.
- The blue future SOC follows successive movements of the native Balans SOC p50
  dataset, anchored at the latest fresh measured Coulomb SOC. This includes the
  planning already shown by Balans without inventing dispatch API fields. It is
  a relative SOC forecast, not a new Ah integration from planned power. Actual
  measured history and the voltage-profile Coulomb counter are unchanged.
- Read only native SOC p50, even when hidden; exclude own datasets. Align samples
  with the existing ISO forecast slots and interpolate the native baseline at
  the measured timestamp. Clamp each increment at 5–100%; never carry fictitious
  reserve/debt past a clamp. Do not add PV/usage again to the native net forecast.
- Missing native baselines use the existing PV/usage fallback. Nulls/time gaps
  inside a usable p50 forecast remain gaps. Native saturation can hide dispatch
  beyond its bounds; do not claim to recover such unavailable energy volumes.
- Only HTTP 400 with API error.code=period_not_available is a neutral unprocessed
  month. Other 400/auth/429 errors stay visible, and real missing/partial data
  keep their warning. No hardcoded date or processing delay. Track errors per
  month and clear them after a successful automatic reload; official results
  always override local estimates.

## Version 6.6.2 — presentation precision and source revisions

- All-in applies to valid import/export prices regardless of a provisional
  approximation marker. DOM/canvas amounts and tooltips must use full-precision
  same-quarter API quotes, not rounded native label text. The native text/title
  must be restored when all-in is disabled; repeated refreshes must not apply
  taxes twice. A missing quote stays pending, never a guessed all-in amount.
- Forecast sample counts alone do not establish time alignment. Validate native
  timestamps/labels against the forecast slots; reject explicit mismatches and
  clear old own datasets when the grid is not usable. Clock-only labels cannot
  prove an absolute date: validate the whole clock sequence and preserve this
  limitation rather than claiming absolute-date verification from HH:mm alone.
- Explicit unknown planning windows and withdrawn day-ahead quotes must update
  affected archived quarters and the status of provisional day amounts. A
  network failure alone must not erase a valid archived result. Preserve raw
  meter data and valid partial results; official results remain authoritative.

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
