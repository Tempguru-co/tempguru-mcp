// OpenAPI 3.1 spec for the public REST API at https://mcp.tempguru.co.
//
// Written for AI agents AND developers. Each operation includes a
// "use this when ..." description so agents can pick the right tool from
// the OpenAPI catalog alone, without needing external docs.
//
// The version is pulled from package.json at module load so the spec
// is always in sync with the running deployment.

import pkg from "../../../package.json";
import { RequestQuoteSchema } from "../mcp/quote";
import { getPublishedPolicyTopics } from "../mcp/published-offer";

export function buildOpenApiSpec(now = new Date()) {
  return {
    openapi: "3.1.0",
    info: {
      title: "TempGuru Public Data API",
      version: pkg.version,
      summary:
        "Public event-staffing data for the US and Canada: eight read-only operations plus one opt-in quote-request submission.",
      description: [
        "Public event-staffing data for the US and Canada, served by TempGuru (Temporary Assistance Guru, Inc.). Eight read-only operations plus a single opt-in write operation (`submitQuoteRequest`).",
        "",
        "**No authentication required.** The read endpoints return public data equivalent to what is published on tempguru.co, city footprint, staffing roles, hourly rate ranges, lead-time guidance, and state-level employment compliance summaries.",
        "",
        "**About the rates.** All hourly figures are *all-inclusive W-2 bill rates*: they cover the worker's pay, employer-side payroll taxes (FICA/FUTA/SUTA), workers' compensation insurance, general liability insurance, and dedicated coordinator support. Published hourly bill rates have no add-on fees or invoice-time markup. Rate ranges are *planning estimates*, a real quote requires event specifics and is provided after a quote request is reviewed by a coordinator.",
        "",
        "**About availability.** The `availability` endpoint returns *lead-time guidance based on city tier*, not real-time inventory, confirmed order coverage, a reservation, or a hold on staff. TempGuru's public catalog contains 345 configured US and Canadian market entries; a coordinator confirms coverage and final lead time for the specific order through the standard buyer-submitted quote flow.",
        "",
        "**About quote submission.** `POST /api/v1/quote-requests` is the only write operation in this API. It is opt-in by design: call it only after the user has reviewed the staffing plan and explicitly confirmed they want to submit it. It creates a structured lead for human review, it does **not** reserve staff, guarantee pricing or availability, or create any contract, and **no payment** is required until the user approves the resulting quote. Contact and event details are delivered to TempGuru's CRM or its durable fallback queue and configured notification processor so a coordinator can reply; they are never written to telemetry or analytics.",
        "",
        "**Agent guidance.** This API exists so AI agents and integrators can ground answers about TempGuru in live, structured data instead of scraping web pages. The MCP server at `https://mcp.tempguru.co/mcp` exposes the same public planning data, but its authless `request_quote` tool is intentionally different: it accepts no contact details and returns a prefilled TempGuru form that the buyer submits personally. Do not describe MCP `request_quote` as a lead submission.",
      ].join("\n"),
      contact: {
        name: "Megan Hayward",
        email: "megan@tempguru.co",
        url: "https://tempguru.co",
      },
      license: {
        name: "Public data",
        url: "https://tempguru.co/ai-agents",
      },
      "x-logo": {
        url: "https://mcp.tempguru.co/logo.svg",
        backgroundColor: "#FFFFFF",
        altText: "TempGuru",
      },
    },
    servers: [
      {
        url: "https://mcp.tempguru.co",
        description: "Production",
      },
    ],
    externalDocs: {
      description: "TempGuru AI agent documentation",
      url: "https://tempguru.co/ai-agents",
    },
    tags: [
      {
        name: "Discovery",
        description: "List configured market entries and event staffing roles.",
      },
      {
        name: "Planning",
        description: "Availability lead time and per-role pricing for a specific market.",
      },
      {
        name: "Compliance",
        description: "State compliance plus published booking and procurement policies.",
      },
      {
        name: "Quote Submission",
        description:
          "The API's single write operation: submit a staffing quote request for human review. Opt-in, no reservation, no payment.",
      },
      {
        name: "Operational",
        description: "Service health and metadata.",
      },
    ],
    paths: {
      "/api/v1/cities": {
        get: {
          operationId: "listCities",
          tags: ["Discovery"],
          summary: "List configured market entries",
          description:
            "Use this for the canonical configured market catalog or to filter by state or tier (hub / mid / small). A catalog match determines planning rate and lead-time bands; it does not confirm real-time availability or order coverage. A TempGuru coordinator confirms the specific order after buyer submission.",
          parameters: [
            {
              name: "state",
              in: "query",
              required: false,
              schema: { type: "string" },
              description:
                "Filter by state. Accepts either a 2-letter postal code (e.g., 'CA') or a full state name (e.g., 'California'). US states and Canadian provinces both supported.",
            },
            {
              name: "tier",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["hub", "mid", "small"] },
              description:
                "Filter by market tier. 'hub' = 25 major metros (NYC, LA, Boston, etc.); 'mid' = 128 secondary markets; 'small' = 192 tertiary markets.",
            },
            {
              name: "country",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["US", "CA"] },
              description: "Filter to the United States (`US`) or Canada (`CA`).",
            },
            {
              name: "city",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Switch to a single-city configured-catalog match instead of listing entries. A match is not confirmed order coverage.",
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 345 },
              description: "Maximum list rows returned. The unfiltered endpoint defaults to 100.",
            },
          ],
          responses: {
            "200": {
              description: "Matching cities with tier breakdown.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CitiesResponse" },
                },
              },
            },
            "400": {
              description: "Invalid tier value.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/roles": {
        get: {
          operationId: "listRoles",
          tags: ["Discovery"],
          summary: "List event staffing roles",
          description:
            "Use this when an agent needs TempGuru's complete canonical staffing-role catalog, including Assistant Leads. The returned `slug` values are the keys to use in the pricing and availability endpoints.",
          responses: {
            "200": {
              description: "All TempGuru staffing roles.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/RolesResponse" },
                },
              },
            },
          },
        },
      },
      "/api/v1/availability": {
        get: {
          operationId: "checkAvailability",
          tags: ["Planning"],
          summary: "Lead-time guidance for an event",
          description:
            "Use this when an agent wants to know whether TempGuru can typically staff an event at a given city and date, for example, 'is two weeks enough notice for Dallas?' Returns a recommendation in the set {yes, tight, rush, very-rush} based on the city's market tier and how far out the event is. **This is planning guidance, not a real-time reservation.** A confirmed booking requires a quote request at https://tempguru.co/get-staffing.",
          parameters: [
            {
              name: "city",
              in: "query",
              required: true,
              schema: { type: "string" },
              description:
                "City name (e.g., 'Boston') or slug from /api/v1/cities (e.g., 'boston-event-staffing').",
            },
            {
              name: "date",
              in: "query",
              required: true,
              schema: { type: "string", format: "date" },
              description: "Event date in ISO format (YYYY-MM-DD).",
            },
            {
              name: "role",
              in: "query",
              required: false,
              schema: { type: "string" },
              description:
                "Optional role slug or name. When provided, the response also includes the rate range for that role in the resolved city.",
            },
            {
              name: "headcount",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1 },
              description:
                "Optional headcount for the event. Echoed in the response so agents can include it in downstream quote requests.",
            },
          ],
          responses: {
            "200": {
              description: "Availability guidance for the requested event.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AvailabilityResponse" },
                },
              },
            },
            "400": {
              description: "Missing required parameter or invalid date.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "404": {
              description: "Requested city is not in TempGuru's published footprint.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/pricing": {
        get: {
          operationId: "getRolePricing",
          tags: ["Planning"],
          summary: "All-inclusive hourly rate range for a role in a city",
          description:
            "Use this when an agent needs to quote a price range for a specific role in a specific city, for example, 'what do brand ambassadors cost in Boston?' Returns a `hourly_range_low` / `hourly_range_high` range reflecting event-type and shift variability within that market tier. **All rates are all-inclusive W-2 bill rates** covering worker pay, payroll taxes, workers' comp, liability, and coordinator support. Rate ranges are planning estimates, a real quote requires event specifics.",
          parameters: [
            {
              name: "role",
              in: "query",
              required: true,
              schema: { type: "string" },
              description:
                "Role slug or display name (e.g., 'brand-ambassadors' or 'Brand Ambassadors'). See /api/v1/roles for the canonical list.",
            },
            {
              name: "city",
              in: "query",
              required: true,
              schema: { type: "string" },
              description:
                "City name or slug (e.g., 'Boston' or 'boston-event-staffing'). See /api/v1/cities for the canonical list.",
            },
          ],
          responses: {
            "200": {
              description: "Hourly rate range for the role in the resolved city tier.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PricingResponse" },
                },
              },
            },
            "400": {
              description: "Missing required parameter.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "404": {
              description: "Unknown role or city.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/compliance": {
        get: {
          operationId: "getComplianceByState",
          tags: ["Compliance"],
          summary: "State-level employment compliance summary",
          description:
            "Use this when an agent needs an at-a-glance summary of event staffing compliance for a specific state, minimum wage, weekly and daily overtime thresholds, and state-specific quirks (California meal-break rules, NY spread-of-hours, etc.). Useful for planning multi-state events and for explaining why W-2 staffing matters in jurisdictions with strict labor enforcement. **Informational only, not legal advice.** Consult employment counsel for binding interpretation.",
          parameters: [
            {
              name: "state",
              in: "query",
              required: true,
              schema: { type: "string" },
              description:
                "Two-letter US state code (e.g., 'CA') or full name (e.g., 'California'). All 50 states plus DC supported.",
            },
          ],
          responses: {
            "200": {
              description: "Compliance summary for the requested state.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ComplianceResponse" },
                },
              },
            },
            "400": {
              description: "Missing required parameter.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "404": {
              description: "Unknown state.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/policies": {
        get: {
          operationId: "getPolicies",
          tags: ["Compliance"],
          summary: "Published booking and procurement policies",
          description:
            "Returns TempGuru's published minimum-hours, cancellation/rescheduling, no-show backfill, COI/additional-insured, payment, background-check, order-confirmation, quote-response, and public-offer policies. Unsupported values are explicitly marked `confirm_with_coordinator` and never fabricated. Pass an optional topic for one policy; an unknown topic returns a clean expected-miss variant with the available topics.",
          parameters: [
            {
              name: "topic",
              in: "query",
              required: false,
              schema: {
                type: "string",
                maxLength: 80,
                enum: getPublishedPolicyTopics(now),
              },
              description:
                "Optional canonical policy topic. Choose an enum value; omit for all policies or a broader question.",
            },
          ],
          responses: {
            "200": {
              description: "All policies, one matched policy, or a clean topic-not-found variant.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PoliciesResponse" },
                },
              },
            },
            "400": {
              description: "Policy topic exceeds the 80-character input cap.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/plans/{id}": {
        get: {
          operationId: "getPlan",
          tags: ["Planning"],
          summary: "Restore a saved staffing plan",
          description:
            "Restores a complete, non-PII staffing-plan snapshot created within the last 30 days. Use the plan ID returned by `plan_staffing` or `save_staffing_plan`; never guess or enumerate IDs. The response is never cached and returns a clean not-found variant when the snapshot is absent or expired.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", pattern: "^[A-HJ-NP-Z2-9]{12}$", maxLength: 12 },
              description: "12-character plan ID returned by plan_staffing or save_staffing_plan.",
            },
          ],
          responses: {
            "200": {
              description: "Saved plan or clean not-found/expired guidance.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SavedPlanResponse" },
                },
              },
            },
            "400": {
              description: "Malformed plan reference.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/quote-requests": {
        post: {
          operationId: "submitQuoteRequest",
          tags: ["Quote Submission"],
          summary: "Submit a staffing quote request (the API's only write operation)",
          description:
            "Use this when, and only when, the user has explicitly confirmed they want to submit a staffing request to TempGuru. This is the single write operation in this API; everything else is a read-only lookup. It creates a structured lead for human review, and a human coordinator replies with a quote within one business day (orders confirm within 48 hours of approval). **Opt-in by design:** collect the contact details and the event plan, show the user exactly what will be submitted, and call this once after explicit confirmation, never speculatively. **Not a reservation:** it does not hold staff, guarantee pricing or availability, or create a contract, and **no payment** is required until the user approves the quote. Contact and event details go to TempGuru's CRM or its durable fallback queue and configured notification processor so a coordinator can reply; they are never written to telemetry or analytics. Build the plan first with the read operations (cities, roles, pricing, availability, compliance). Lightly rate limited per source IP, on HTTP 429, respect `Retry-After` and fall back to the form at https://tempguru.co/get-staffing.",
          "x-openai-isConsequential": true,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/QuoteRequestInput" },
              },
            },
          },
          responses: {
            "200": {
              description:
                "Request accepted into TempGuru's CRM or durable intake queue for human review. Relay `message` and `next_steps` to the user.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/QuoteRequestConfirmation" },
                },
              },
            },
            "400": {
              description: "Missing or invalid field (including a malformed contact email).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "403": {
              description:
                "The request carried a browser Origin that is not approved for quote submission.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "413": {
              description: "Request body larger than 64 KB.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "415": {
              description: "The request body is not encoded as application/json.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "429": {
              description:
                "Rate limit exceeded for this source IP. Respect Retry-After, then retry or fall back to https://tempguru.co/get-staffing.",
              headers: {
                "Retry-After": {
                  description: "Seconds until the rate-limit window resets.",
                  schema: { type: "integer" },
                },
              },
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "502": {
              description:
                "TempGuru's CRM could not be reached; the request was NOT recorded. Relay `message`, it contains direct contact fallbacks (email/phone).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/QuoteRequestFailure" },
                },
              },
            },
          },
        },
      },
      "/api/v1/quote-requests/{reference}": {
        get: {
          operationId: "getQuoteStatus",
          tags: ["Quote Submission"],
          summary: "Check quote-request receipt status",
          description:
            "Returns the 90-day non-PII status stub for a TG quote reference. Version 1 reports `received` or `queued`; later CRM states such as quote_sent and won are not exposed yet. A not-found result does not prove the CRM lead is absent.",
          parameters: [
            {
              name: "reference",
              in: "path",
              required: true,
              schema: { type: "string", pattern: "^TG-[A-HJ-NP-Z2-9]{6}$", maxLength: 9 },
              description: "TG reference returned by submitQuoteRequest.",
            },
          ],
          responses: {
            "200": {
              description: "Received/queued status or clean not-found guidance.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/QuoteStatusResponse" },
                },
              },
            },
            "400": {
              description: "Malformed TG quote reference.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/health": {
        get: {
          operationId: "getHealth",
          tags: ["Operational"],
          summary: "Service health probe",
          description:
            "Use this when an agent or monitoring system wants to verify the API is alive and check which version is running. Returns immediately with no caching. Suitable as the target of an api-catalog `status` link (RFC 9727).",
          responses: {
            "200": {
              description: "Service is healthy.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthResponse" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: {
                  type: "string",
                  enum: [
                    "missing_required",
                    "invalid_param",
                    "not_found",
                    "rate_limited",
                    "forbidden",
                  ],
                  description: "Machine-readable error category.",
                },
                message: {
                  type: "string",
                  description: "Human-readable explanation of what went wrong.",
                },
                field: {
                  type: "string",
                  description:
                    "Name of the query parameter or request-body field that triggered the error, when applicable.",
                },
                suggestion: {
                  type: "object",
                  description: "Best-match suggestion when the input didn't resolve to a known entity.",
                  properties: {
                    kind: { type: "string", enum: ["city", "role", "state"] },
                    slug: { type: "string" },
                    name: { type: "string" },
                  },
                },
              },
            },
          },
        },
        City: {
          type: "object",
          required: ["slug", "name", "state", "state_abbr", "country", "tier", "url"],
          properties: {
            slug: { type: "string", example: "boston-event-staffing" },
            name: { type: "string", example: "Boston" },
            state: { type: "string", example: "Massachusetts" },
            state_abbr: { type: "string", example: "MA" },
            country: { type: "string", example: "US" },
            tier: { type: "string", enum: ["hub", "mid", "small"] },
            url: { type: "string", format: "uri", example: "https://tempguru.co/insights/boston-event-staffing" },
          },
        },
        Role: {
          type: "object",
          required: ["slug", "name", "description", "skill_tier", "typical_shift_length_hours", "url"],
          properties: {
            slug: { type: "string", example: "brand-ambassadors" },
            name: { type: "string", example: "Brand Ambassadors" },
            description: { type: "string" },
            skill_tier: { type: "integer", minimum: 1, maximum: 5 },
            typical_shift_length_hours: { type: "integer" },
            url: { type: "string", format: "uri" },
          },
        },
        PriceBand: {
          type: "object",
          required: ["low", "high"],
          properties: {
            low: { type: "number", description: "Lower end of the hourly rate range (USD)." },
            high: { type: "number", description: "Upper end of the hourly rate range (USD)." },
          },
        },
        CitiesResponse: {
          oneOf: [
            { $ref: "#/components/schemas/CitiesListResponse" },
            { $ref: "#/components/schemas/CityCatalogMatchResponse" },
          ],
        },
        CitiesListResponse: {
          type: "object",
          required: [
            "input",
            "total",
            "returned",
            "tier_breakdown",
            "cities",
            "coverage_confirmation_required",
            "catalog_qualification",
          ],
          properties: {
            input: { type: "object", description: "Echo of the query parameters used." },
            total: { type: "integer" },
            returned: { type: "integer" },
            tier_breakdown: {
              type: "object",
              properties: {
                hub: { type: "integer" },
                mid: { type: "integer" },
                small: { type: "integer" },
              },
            },
            cities: { type: "array", items: { $ref: "#/components/schemas/City" } },
            coverage_confirmation_required: { type: "boolean", const: true },
            catalog_qualification: { type: "string" },
            note: { type: "string" },
          },
        },
        CityCatalogMatchResponse: {
          type: "object",
          required: [
            "input",
            "catalog_check",
            "requested",
            "catalog_match",
            "coverage_confirmation_required",
            "catalog_qualification",
            "city",
            "message",
          ],
          properties: {
            input: { type: "object", description: "Echo of the query parameters used." },
            catalog_check: { type: "boolean", const: true },
            requested: { type: "string" },
            catalog_match: {
              type: "boolean",
              description: "True only when the city resolves to a configured catalog entry; not a coverage or availability promise.",
            },
            coverage_confirmation_required: { type: "boolean", const: true },
            catalog_qualification: { type: "string" },
            city: {
              oneOf: [{ $ref: "#/components/schemas/City" }, { type: "null" }],
            },
            suggestion: {
              type: "object",
              required: ["kind", "slug", "name"],
              properties: {
                kind: { type: "string", const: "city" },
                slug: { type: "string" },
                name: { type: "string" },
              },
            },
            message: { type: "string" },
          },
        },
        RolesResponse: {
          type: "object",
          required: ["input", "total", "roles"],
          properties: {
            input: { type: "object" },
            total: { type: "integer" },
            roles: { type: "array", items: { $ref: "#/components/schemas/Role" } },
          },
        },
        AvailabilityResponse: {
          type: "object",
          required: [
            "input",
            "city_found",
            "catalog_match",
            "coverage_confirmation_required",
            "city",
            "state",
            "city_tier",
            "event_date",
            "days_until_event",
            "in_past",
            "typical_lead_time_hours",
            "recommendation",
            "role_found",
            "notes",
          ],
          properties: {
            input: { type: "object" },
            city_found: { type: "boolean", enum: [true] },
            catalog_match: {
              type: "boolean",
              const: true,
              description: "The city resolved to a configured catalog entry; this does not confirm order coverage.",
            },
            coverage_confirmation_required: { type: "boolean", const: true },
            city: { type: "string" },
            state: { type: "string" },
            city_tier: { type: "string", enum: ["hub", "mid", "small"] },
            event_date: { type: "string", format: "date" },
            days_until_event: { type: "integer" },
            in_past: {
              type: "boolean",
              description:
                "True when the requested event date has already passed. Confirm the intended date before planning or quoting.",
            },
            typical_lead_time_hours: { type: "integer" },
            recommendation: {
              type: "string",
              enum: ["yes", "tight", "rush", "very-rush"],
              description:
                "yes = comfortable window; tight = at or near typical lead time; rush = inside lead time; very-rush = <24h.",
            },
            role_found: {
              type: ["boolean", "null"],
              description:
                "null when no role was requested; true when the requested role resolved; false when it did not match the catalog.",
            },
            role_suggestion: {
              type: "object",
              description:
                "Present only when role_found is false and there is one unambiguous nearby catalog match. Confirm before using it.",
              required: ["kind", "slug", "name"],
              properties: {
                kind: { type: "string", const: "role" },
                slug: { type: "string" },
                name: { type: "string" },
              },
            },
            role: {
              nullable: true,
              type: "object",
              properties: {
                name: { type: "string" },
                rate_range_usd: { $ref: "#/components/schemas/PriceBand" },
                all_inclusive: { type: "string" },
              },
            },
            count: { type: "integer", nullable: true },
            notes: { type: "array", items: { type: "string" } },
          },
        },
        PricingResponse: {
          type: "object",
          required: [
            "input",
            "role",
            "role_slug",
            "city",
            "state",
            "city_tier",
            "hourly_range_low",
            "hourly_range_high",
            "currency",
            "all_inclusive",
          ],
          properties: {
            input: { type: "object" },
            role: { type: "string" },
            role_slug: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            city_tier: { type: "string", enum: ["hub", "mid", "small"] },
            hourly_range_low: { type: "number" },
            hourly_range_high: { type: "number" },
            currency: { type: "string", enum: ["USD", "CAD"] },
            all_inclusive: { type: "string" },
            tier_definition: { type: "string" },
            all_tiers_for_context: {
              type: "object",
              properties: {
                small: { $ref: "#/components/schemas/PriceBand" },
                mid: { $ref: "#/components/schemas/PriceBand" },
                hub: { $ref: "#/components/schemas/PriceBand" },
              },
            },
            pricing_notes: { type: "string" },
            role_note: {
              type: "string",
              description:
                "Caveat emitted when the requested phrasing maps to a constrained service, for example security mapping to unarmed Crowd Control rather than licensed guards.",
            },
          },
        },
        ComplianceResponse: {
          type: "object",
          required: [
            "input",
            "state",
            "state_abbr",
            "min_wage_usd",
            "w2_required",
            "overtime_threshold_weekly_hours",
            "unique_rules",
            "data_version",
            "data_current_as_of",
            "currency_note",
            "citation_note",
          ],
          properties: {
            input: { type: "object" },
            state: { type: "string" },
            state_abbr: { type: "string" },
            min_wage_usd: { type: "number" },
            w2_required: { type: "boolean" },
            w2_note: { type: "string" },
            overtime_threshold_weekly_hours: { type: "integer" },
            overtime_threshold_daily_hours: { type: "integer", nullable: true },
            overtime_daily_double_hours: { type: "integer", nullable: true },
            seventh_day_overtime: { type: "boolean" },
            unique_rules: { type: "array", items: { type: "string" } },
            liability_coverage_included: { type: "boolean" },
            workers_comp_included: { type: "boolean" },
            min_wage_as_of: { type: ["string", "null"], format: "date" },
            min_wage_source: { type: ["string", "null"], format: "uri" },
            data_version: { type: "string" },
            data_current_as_of: { type: "string", format: "date" },
            currency_note: { type: "string" },
            citation_note: { type: "string" },
          },
        },
        Policy: {
          type: "object",
          required: [
            "topic",
            "title",
            "confirmed_claims",
            "confirm_with_coordinator",
            "todo_for_megan",
            "sources",
          ],
          properties: {
            topic: { type: "string", enum: getPublishedPolicyTopics(now) },
            title: { type: "string" },
            confirmed_claims: { type: "array", items: { type: "string" } },
            confirm_with_coordinator: { type: "boolean" },
            todo_for_megan: { type: "array", items: { type: "string" } },
            sources: { type: "array", items: { type: "string" } },
            code: { type: "string" },
            discount_percent: { type: "number" },
            cap_usd: { type: "number" },
            expires: { type: "string", format: "date" },
            scope: { type: "string" },
          },
          additionalProperties: false,
        },
        PoliciesResponse: {
          type: "object",
          required: ["input", "status", "policy_found"],
          oneOf: [
            {
              title: "Published policies",
              required: [
                "data_version",
                "updated",
                "scope",
                "policies",
                "todo_for_megan",
                "disclaimer",
              ],
              properties: {
                status: { const: "policies" },
                policy_found: { const: true },
              },
            },
            {
              title: "Policy topic not found",
              required: ["requested", "available_topics", "message"],
              properties: {
                status: { const: "policy_not_found" },
                policy_found: { const: false },
              },
            },
          ],
          properties: {
            input: { type: "object" },
            status: { type: "string", enum: ["policies", "policy_not_found"] },
            policy_found: { type: "boolean" },
            data_version: { type: "string" },
            updated: { type: "string", format: "date" },
            scope: { type: "string" },
            policies: { type: "array", items: { $ref: "#/components/schemas/Policy" } },
            todo_for_megan: { type: "array", items: { type: "string" } },
            disclaimer: { type: "string" },
            requested: { type: "string" },
            available_topics: {
              type: "array",
              items: { type: "string", enum: getPublishedPolicyTopics(now) },
            },
            message: { type: "string" },
          },
        },
        PlanLine: {
          type: "object",
          required: [
            "role",
            "role_slug",
            "headcount",
            "hours_per_shift",
            "days",
            "hourly_range",
            "estimated_total_range",
          ],
          properties: {
            role: { type: "string" },
            role_slug: { type: "string" },
            headcount: { type: "integer" },
            hours_per_shift: { type: "number" },
            days: { type: "integer" },
            hourly_range: { $ref: "#/components/schemas/PriceBand" },
            estimated_total_range: { $ref: "#/components/schemas/PriceBand" },
          },
        },
        PlanSnapshot: {
          type: "object",
          required: [
            "city",
            "event",
            "plan_lines",
            "estimated_total_range",
            "overtime_adjusted_total_range",
            "compliance_jurisdiction",
            "created_at",
            "channel",
            "source",
          ],
          properties: {
            city: {
              type: "object",
              required: ["slug", "name", "state"],
              properties: {
                slug: { type: "string" },
                name: { type: "string" },
                state: { type: "string" },
              },
            },
            event: {
              type: "object",
              required: ["event_date", "event_type", "attendees"],
              properties: {
                event_date: { type: ["string", "null"] },
                event_type: { type: ["string", "null"] },
                attendees: { type: ["integer", "null"] },
              },
            },
            plan_lines: { type: "array", items: { $ref: "#/components/schemas/PlanLine" } },
            estimated_total_range: {
              type: "object",
              required: ["low", "high", "currency", "basis"],
              properties: {
                low: { type: "number" },
                high: { type: "number" },
                currency: { type: "string", enum: ["USD", "CAD"] },
                basis: { type: "string" },
              },
            },
            overtime_adjusted_total_range: {
              anyOf: [
                { type: "null" },
                {
                  type: "object",
                  required: ["low", "high", "currency", "note"],
                  properties: {
                    low: { type: "number" },
                    high: { type: "number" },
                    currency: { type: "string", enum: ["USD", "CAD"] },
                    includes_double_time: { type: "boolean" },
                    note: { type: "string" },
                  },
                },
              ],
            },
            compliance_jurisdiction: { type: ["string", "null"] },
            created_at: { type: "string", format: "date-time" },
            channel: { type: "string", enum: ["mcp", "rest"] },
            source: { type: ["string", "null"] },
          },
        },
        SavedPlanResponse: {
          type: "object",
          required: ["input", "plan_found", "plan_id", "message", "next_steps"],
          properties: {
            input: { type: "object" },
            plan_found: { type: "boolean" },
            plan_id: { type: "string" },
            snapshot: { $ref: "#/components/schemas/PlanSnapshot" },
            continuation: {
              type: "object",
              required: ["form_url", "note"],
              properties: {
                form_url: { type: "string", format: "uri" },
                note: { type: "string" },
              },
            },
            message: { type: "string" },
            next_steps: { type: "array", items: { type: "string" } },
          },
        },
        QuoteRequestInput: {
          description:
            "A buyer-submitted staffing plan plus the contact details a coordinator needs to reply. This REST write schema is intentionally separate from the authless MCP request_quote handoff, which accepts no contact details.",
          ...RequestQuoteSchema.toJSONSchema({ target: "draft-2020-12" }),
        },
        QuoteRequestConfirmation: {
          type: "object",
          required: ["submitted", "plan_linked", "deal_name", "reference", "message", "next_steps"],
          properties: {
            submitted: { type: "boolean", enum: [true] },
            plan_linked: {
              type: "boolean",
              description: "True when the submitted plan_id resolved and its snapshot was attached.",
            },
            deal_name: {
              type: "string",
              description: "Internal name assigned to the lead in TempGuru's CRM.",
              example: "Agent Quote, trade-show · Boston · June 15–17, 2026",
            },
            reference: {
              type: "string",
              pattern: "^TG-[A-HJ-NP-Z2-9]{6}$",
              description: "Quote reference to save and cite when following up.",
            },
            message: {
              type: "string",
              description: "Human-readable confirmation to relay to the user.",
            },
            next_steps: {
              type: "array",
              items: { type: "string" },
              description: "What happens next, relay to the user.",
            },
          },
        },
        QuoteRequestFailure: {
          type: "object",
          required: ["submitted", "error", "message"],
          properties: {
            submitted: { type: "boolean", enum: [false] },
            error: { type: "string", description: "What failed upstream." },
            reference: { type: "string", description: "Reference to cite when following up, when available." },
            message: {
              type: "string",
              description:
                "Fallback instructions with direct TempGuru contact details, relay to the user.",
            },
          },
        },
        QuoteStatusResponse: {
          type: "object",
          required: ["input", "quote_found", "reference", "message", "follow_up"],
          properties: {
            input: { type: "object" },
            quote_found: { type: "boolean" },
            reference: { type: "string" },
            status: { type: "string", enum: ["received", "queued"] },
            created_at: { type: "string", format: "date-time" },
            deal_name: { type: "string" },
            channel: { type: "string", enum: ["mcp", "rest"] },
            message: { type: "string" },
            follow_up: { type: "string" },
          },
        },
        HealthResponse: {
          type: "object",
          required: ["status", "version"],
          properties: {
            status: { type: "string", enum: ["ok"] },
            version: { type: "string" },
          },
        },
      },
    },
  } as const;
}
