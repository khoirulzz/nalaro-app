# Near real-time mail alerts (R2 events + Cloudflare Queues)

R2 `nalaro-mailbox` emits `PutObject` events on message JSON keys to the `nalaro-mail-events` queue, consumed by the existing `nalaro-notify` Worker. The Worker fetches the *stored* record, checks mailbox allowlist, record status and activation date, then sends FCM. Repeated R2 writes for read/star state are deduplicated via the existing D1 `delivered` table. The existing scheduled cron remains the fallback for missed events and handles new public orders; it is **not** a backup for long outages beyond the polling window.

Security: queue input is never trusted as email content or a push target. The object key must belong to the message namespace and both mailbox and ID must match the R2 record. No public notification endpoint is added.

Latency: Queue delivery is typically faster than the 1-minute Cron, though not guaranteed instantaneous. FCM acceptance is not the same as phone display; background/battery policies still apply.

Queues on Cloudflare Workers Free offers 10,000 combined operations/day; monitor quota. Order notifications still use one-minute Firestore polling because the website's direct atomic Firestore batch should remain unchanged.
