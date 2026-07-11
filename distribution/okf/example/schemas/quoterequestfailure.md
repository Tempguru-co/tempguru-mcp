---
type: "Schema"
title: "QuoteRequestFailure"
---
# QuoteRequestFailure
Schema `QuoteRequestFailure`.
## Properties

- `submitted` (boolean, required)
- `error` (string, required): What failed upstream.
- `reference` (string): Reference to cite when following up, when available.
- `message` (string, required): Fallback instructions with direct TempGuru contact details, relay to the user.

[All schemas](index.md) · [bundle root](../index.md)
