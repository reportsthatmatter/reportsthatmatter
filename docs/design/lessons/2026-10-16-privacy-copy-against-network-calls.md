---
theme: Public highlights feed design (2026-10-16, bght.10)
---
- **Check what a page promises about privacy against the network calls the page's scripts make** (2026-10-16, bght.10, design agent) The /highlights byline said "Kept in this browser · never sent to us" while every Save posts the selected words to `/api/mark`, and `marks.exact` is client-supplied and unverified, so a public page that printed it would print whatever a script posted. Found only by reading `share.js` against `highlights.ts` and `parseMarkPayload`. Proposal: bght.10.4 fixes the copy and adds an opt-out; bght.10.2 verifies words against the report before anything is public; a browser check in verify.sh that asserts which requests Save and Copy link make would keep copy and behaviour in step. [status: proposed]
