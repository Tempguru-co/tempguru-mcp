---
type: "API Operation"
title: "List event staffing roles"
description: "Use this when an agent needs TempGuru's complete canonical staffing-role catalog, including Assistant Leads."
method: "GET"
path: "/api/v1/roles"
resource: "https://tempguru.co/api/v1/roles"
operation_id: "listRoles"
tags:
  - "Discovery"
---
# List event staffing roles
Use this when an agent needs TempGuru's complete canonical staffing-role catalog, including Assistant Leads. The returned `slug` values are the keys to use in the pricing and availability endpoints.
- **Operation:** `GET https://tempguru.co/api/v1/roles`
- **Tags:** Discovery

## Related schemas

- [RolesResponse](../schemas/rolesresponse.md)

[All operations](index.md) · [bundle root](../index.md)
