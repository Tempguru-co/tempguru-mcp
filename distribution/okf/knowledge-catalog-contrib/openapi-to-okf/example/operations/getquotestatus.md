---
type: "API Operation"
title: "Check quote-request receipt status"
description: "Returns the 90-day non-PII status stub for a TG quote reference."
method: "GET"
path: "/api/v1/quote-requests/{reference}"
resource: "https://tempguru.co/api/v1/quote-requests/{reference}"
operation_id: "getQuoteStatus"
tags:
  - "Quote Submission"
---
# Check quote-request receipt status
Returns the 90-day non-PII status stub for a TG quote reference. Version 1 reports `received` or `queued`; later CRM states such as quote_sent and won are not exposed yet. A not-found result does not prove the CRM lead is absent.
- **Operation:** `GET https://tempguru.co/api/v1/quote-requests/{reference}`
- **Tags:** Quote Submission
## Parameters

- `reference` (path, required): TG reference returned by submitQuoteRequest.

## Related schemas

- [QuoteStatusResponse](../schemas/quotestatusresponse.md)
- [Error](../schemas/error.md)

[All operations](index.md) · [bundle root](../index.md)
