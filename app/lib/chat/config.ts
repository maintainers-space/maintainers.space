// Connection info for the Colibri AppView that powers the Chat tab.
//
// Colibri's own client pins itself to `127.0.0.1:8000` whenever `import.meta.env.DEV`
// is set, bypassing PDS-proxying and did:web resolution entirely (see their
// "Dev mode is not production" docs) — the same shortcut is taken here. A real
// deployment resolves `APPVIEW_DID`'s did:web document instead of hardcoding
// an origin; that's a follow-up once this instance has a real domain.

export const APPVIEW_DID = 'did:web:localhost%3A8000'
export const APPVIEW_URL = 'http://localhost:8000'

/** did:web fragment identifying the AppView's XRPC service, per the Colibri spec. */
export const APPVIEW_SERVICE_ID = `${APPVIEW_DID}#colibri_appview`
