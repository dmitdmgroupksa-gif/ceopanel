# Durar Masagh mobile client

Expo/React Native client for the existing bilingual portal on iOS and Android.
Set `EXPO_PUBLIC_CEOPANEL_URL` to the deployed CEO Panel HTTPS origin and run `npm start`.

The app opens the dashboard workspace. Native ERP reads do not require an AI
model; the assistant destination is optional. Android's hardware Back button
navigates WebView history before leaving the app.
ERP sessions remain inside the platform WebView's HttpOnly cookie storage. Server secrets
are never included in this app. External HTTPS links open in the device browser.

Field drafts and photos use the portal's IndexedDB outbox in the same WebView. Each
submission has a stable UUID and must pass current user, company, source, and approval
checks on reconnection. A saved draft is not an ERP transaction. Sign back in as its owner
before submitting. Device camera support and Realtime microphone support must be tested
on the supported iOS/Android versions before distribution.

`npm run typecheck` checks the source; `npm run export` validates native JavaScript bundles.
Signed application builds and App Store/Play Store distribution require the company's
developer accounts and signing credentials; neither has been supplied.
