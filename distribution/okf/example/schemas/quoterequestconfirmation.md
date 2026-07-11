---
type: "Schema"
title: "QuoteRequestConfirmation"
---
# QuoteRequestConfirmation
Schema `QuoteRequestConfirmation`.
## Properties

- `submitted` (boolean, required)
- `plan_linked` (boolean, required): True when the submitted plan_id resolved and its snapshot was attached.
- `deal_name` (string, required): Internal name assigned to the lead in TempGuru's CRM.
- `reference` (string, required): Quote reference to save and cite when following up.
- `message` (string, required): Human-readable confirmation to relay to the user.
- `next_steps` (array, required): What happens next, relay to the user.

[All schemas](index.md) · [bundle root](../index.md)
