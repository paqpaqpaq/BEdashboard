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

## Version 6.7 — annual settlement rates

- EB, belastingvermindering and netbeheer are keyed per calendar year from one
  table (`EB_JAAR`, `VER_JAAR`, `NET_JAAR`, overridable in Financieel settings).
  Legacy cards (`bereken`, Voorschot & verrekening) and Financieel share them.
- Defaults were checked against one Balans Stroom jaarafrekening (Enexis,
  21-10-2025 t/m 21-10-2026): vermindering, netbeheer and leveringskosten match
  to the cent. That invoice showed extra "Netcorrectie" lines (July–October 2026)
  whose relation to dashboard results is not yet verified; do not claim otherwise.
- 2027 EB/vermindering are Belastingplan 2027 values, pending parliament.
  Enexis 2027 netbeheer was not yet set; an empty year falls back to the general amount.

## Version 6.7.1 — TenneT details in €/kWh

- An earlier 6.7.1 (Coulomb out-of-range recalibration) was pushed without the
  user's go-ahead and reverted in cd5fb4f. The published 6.7.1 contains only the
  €/kWh presentation change in the TenneT Details block. Push only with the
  user's explicit approval for that specific release.

## Version 6.8 — imbalance prices without Balans

- From 17-11-2026 00:00 `current-prices` only carries the applied price for
  quarters with battery activity; `settlement_prices_api`,
  `afrr_activated_energy_api` and `results_summary_api` return 403, and
  `current-prices` rejects ranges older than ~27 h. Verified live 18-11-2026.
- Missing `onbalans_import/export` are filled from a localStorage cache
  (`be_onbalans_tenergy_v1`): Tenergy minute data (last minute per quarter) and
  TenneT settlement-prices for quarters listed in `be_onbalans_vraag_v1`.
  Precedence: Balans' own value > TenneT > Tenergy closed > Tenergy running.
  Never overwrite a Balans value; mark filled rows with `beOnbalansBron`.
- Fetching runs in the userscript/extension world (`src/tenergy.js`, TenneT in
  `afrr-market.js`); the MAIN-world dashboard only reads the cache.
- BIDs: `bid_fallback` still appears briefly at the start of a quarter before
  `confirmed` replaces it; capture is live-only. `confirmed` afrr values are the
  settled price, not the bid.

## Version 6.8.1 — regulation-state quarter price, TenneT settlement removed

- TenneT settlement-prices: timestamps and date_from/date_to are Dutch local
  time (no offset); publication lags >1 h; key limit 25/day, 5/min, 1/s
  (x-ratelimit headers, 18-11-2026). The 6.8 official fill was removed.
- Tenergy quarter price follows the regulation state from per-minute activation
  in the Tenergy table (`be_onbalans_tenergy_act_v1`, ≥10 of 15 minutes):
  −1 → min, +1 → max, 2 → afnemen max / invoeden min, 0 or no data → last minute.
  Checked 18-11 14:30: 5.79 €/MWh, equal to a forum user's aFRR settlement.
  Against TenneT on 17-11, last-minute values matched only 5 of 10 quarters.

## Version 6.8.2 — memory leak, BID recovery reach

- Never put a `segment` option (not even a static object) on datasets with many
  points: Chart.js `_computeSegments` then runs per point with two
  `JSON.stringify` calls on every update. On `soc-chart` (Coulomb line ~14k
  points, Balans updates every second) this was ~30,000 stringify/s and grew the
  tab to 3–4 GB in Safari within hours. Our datasets set `segment=false`, which
  also blocks inherited segment options. Measured live 19-11-2026: 300k → ~12k
  stringify per 10 s.
- BID recovery only requests the last 26 h (`RECOVERY_REACH`); a 400 response
  postpones that day by 24 h instead of retrying every 5 min.

## Version 6.8.3 — EPEX fill for missing day-ahead quotes

- From 20-11-2026 `current-prices` returns `day_ahead_import: null` (and
  `day_ahead_afrr_import: null` for mixed quarters) for planned import quarters.
  At the user's explicit request (21-11-2026) `BEDayAhead` fills only these nulls,
  only for planned import quarters, with the public Nord Pool NL day-ahead price
  (€/MWh ÷ 1000, kept 14 days in `be_epex_kwartier_v1`). Mixed quarters use the
  EPEX price too (user's choice). Never overwrite a Balans value; filled rows
  carry `beDayAheadBron: 'epex'` and get a purple plug badge in the top chart
  only. Equality of Balans' dynamic price with raw EPEX was not verified.
- The Coulomb line reuses its point array between Balans' per-second updates
  (`chart.$beMeasuredCache`, keyed by result identity and 5-minute range).

## Version 6.8.3.1 — immediate price labels

- Balans' customerCurrentPrices rebuilds its labels only on its own 15 s refresh
  or a quarter change, so after load/zoom it draws "Import —" for ~15–20 s. The
  label bridge replaces exactly "Import —" with our known all-in price (plus the
  plug badge for EPEX-filled quarters). The bridge also wraps fillText on the
  first draw (`beAllinLabelWrap`). Horizontal labels get the badge below.
- Earlier measurements that forced `chart.update()` hid this delay; reproduce
  with a plain reload instead.

- 6.8.3.2: the schema price (#flow-grid-price) shows the same purple plug via CSS ::after on `data-be-epex`, not an emoji.

## Version 6.8.3.4 — update banner

- The page cannot fetch GitHub (Balans CSP blocks connect-src); the userscript world
  fetches the raw meta.js hourly via GM (`@connect raw.githubusercontent.com`) into
  `be_update_check_v1` + event `be-update-check`; the page shows a banner when newer.
  The extension has no fetcher yet, so no banner there.
