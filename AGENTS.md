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
