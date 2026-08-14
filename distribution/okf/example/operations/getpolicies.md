---
type: "API Operation"
title: "Published booking and procurement policies"
description: "Returns TempGuru's published minimum-hours, cancellation/rescheduling, no-show backfill, COI/additional-insured, payment, background-check, order-confirmation, quote-response, and public-offer poli..."
method: "GET"
path: "/api/v1/policies"
resource: "https://mcp.tempguru.co/api/v1/policies"
operation_id: "getPolicies"
tags:
  - "Compliance"
---
# Published booking and procurement policies
Returns TempGuru's published minimum-hours, cancellation/rescheduling, no-show backfill, COI/additional-insured, payment, background-check, order-confirmation, quote-response, and public-offer policies. Unsupported values are explicitly marked `confirm_with_coordinator` and never fabricated. Pass an optional topic for one policy; an unknown topic returns a clean expected-miss variant with the available topics.
- **Operation:** `GET https://mcp.tempguru.co/api/v1/policies`
- **Tags:** Compliance
## Parameters

- `topic` (query): Optional policy topic, e.g. offers, payment-terms, or coi-additional-insured.

## Related schemas

- [PoliciesResponse](../schemas/policiesresponse.md)
- [Error](../schemas/error.md)

[All operations](index.md) · [bundle root](../index.md)
