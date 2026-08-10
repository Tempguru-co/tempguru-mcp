---
type: "Schema"
title: "CityCatalogMatchResponse"
---
# CityCatalogMatchResponse
Schema `CityCatalogMatchResponse`.
## Properties

- `input` (object, required): Echo of the query parameters used.
- `catalog_check` (boolean, required)
- `requested` (string, required)
- `catalog_match` (boolean, required): True only when the city resolves to a configured catalog entry; not a coverage or availability promise.
- `coverage_confirmation_required` (boolean, required)
- `catalog_qualification` (string, required)
- `city` (any, required)
- `suggestion` (object)
- `message` (string, required)

[All schemas](index.md) · [bundle root](../index.md)
