---
type: "API Operation"
title: "Restore a saved staffing plan"
description: "Restores a complete, non-PII staffing-plan snapshot created within the last 30 days."
method: "GET"
path: "/api/v1/plans/{id}"
resource: "https://tempguru.co/api/v1/plans/{id}"
operation_id: "getPlan"
tags:
  - "Planning"
---
# Restore a saved staffing plan
Restores a complete, non-PII staffing-plan snapshot created within the last 30 days. Use the plan ID returned by `plan_staffing`; never guess or enumerate IDs. The response is never cached and returns a clean not-found variant when the snapshot is absent or expired.
- **Operation:** `GET https://tempguru.co/api/v1/plans/{id}`
- **Tags:** Planning
## Parameters

- `id` (path, required): 12-character plan ID returned by plan_staffing.

## Related schemas

- [SavedPlanResponse](../schemas/savedplanresponse.md)
- [Error](../schemas/error.md)

[All operations](index.md) · [bundle root](../index.md)
