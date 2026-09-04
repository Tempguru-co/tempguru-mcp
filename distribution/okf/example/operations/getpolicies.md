---
type: "API Operation"
title: "Published booking and procurement policies"
description: "Returns TempGuru's published minimum-hours, cancellation/rescheduling, replacement and backfill, COI/additional-insured, payment, background-check, order-confirmation, quote-response, and public-of..."
method: "GET"
path: "/api/v1/policies"
resource: "https://mcp.tempguru.co/api/v1/policies"
operation_id: "getPolicies"
tags:
  - "Compliance"
---
# Published booking and procurement policies
Returns TempGuru's published minimum-hours, cancellation/rescheduling, replacement and backfill, COI/additional-insured, payment, background-check, order-confirmation, quote-response, and public-offer policies. Unsupported values are explicitly marked `confirm_with_coordinator` and never fabricated. Pass an optional topic for one policy; an unknown topic returns a clean expected-miss variant with the available topics.
- **Operation:** `GET https://mcp.tempguru.co/api/v1/policies`
- **Tags:** Compliance
## Parameters

- `topic` (query): Optional canonical policy topic. Choose an enum value; omit for all policies or a broader question.

## Related schemas

- [PoliciesResponse](../schemas/policiesresponse.md)
- [Error](../schemas/error.md)

[All operations](index.md) · [bundle root](../index.md)
