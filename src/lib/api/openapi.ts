// OpenAPI 3.1 spec for the public REST API at https://mcp.tempguru.co.
//
// Written for AI agents AND developers. Each operation includes a
// "use this when ..." description so agents can pick the right tool from
// the OpenAPI catalog alone, without needing external docs.
//
// The version is pulled from package.json at module load so the spec
// is always in sync with the running deployment.

import pkg from "../../../package.json";

export function buildOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "TempGuru Public Data API",
      version: pkg.version,
      summary: "Read-only public data for event staffing in the US and Canada.",
      description: [
        "Read-only public data for event staffing in the US and Canada, served by TempGuru (Temporary Assistance Guru, Inc.).",
        "",
        "**No authentication required.** All endpoints return public data equivalent to what is published on tempguru.co — city footprint, staffing roles, hourly rate ranges, lead-time guidance, and state-level employment compliance summaries.",
        "",
        "**About the rates.** All hourly figures are *all-inclusive W-2 bill rates*: they cover the worker's pay, employer-side payroll taxes (FICA/FUTA/SUTA), workers' compensation insurance, general liability insurance, and dedicated coordinator support. No additional per-shift fees, no hidden booking charges, no markup at invoice time. Rate ranges are *planning estimates* — a real quote requires event specifics and is provided through https://tempguru.co/get-staffing.",
        "",
        "**About availability.** The `availability` endpoint returns *lead-time guidance based on city tier*, not a real-time reservation or hold on staff. TempGuru staffs to demand from a 100,000+ W-2 worker network across 300+ markets; bookings are confirmed through the standard quote-and-confirmation flow, not via this API.",
        "",
        "**Agent guidance.** This API exists so AI agents and integrators can ground answers about TempGuru in live, structured data instead of scraping web pages. Combine it with the MCP server at `https://mcp.tempguru.co/mcp` if your agent stack speaks Model Context Protocol — the two surfaces expose the same data through different transports.",
      ].join("\n"),
      contact: {
        name: "Megan Hayward",
        email: "megan@tempguru.co",
        url: "https://tempguru.co",
      },
      license: {
        name: "Public read-only data",
        url: "https://tempguru.co/ai",
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
      url: "https://tempguru.co/ai",
    },
    tags: [
      {
        name: "Discovery",
        description: "List cities and roles TempGuru serves.",
      },
      {
        name: "Planning",
        description: "Availability lead time and per-role pricing for a specific market.",
      },
      {
        name: "Compliance",
        description: "State-level employment compliance summaries for event staffing decisions.",
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
          summary: "List cities TempGuru serves",
          description:
            "Use this when an agent needs the canonical list of cities where TempGuru has a dedicated market presence, or wants to filter by state or by tier (hub / mid / small). Tier classification is used everywhere else in the API to determine lead times and rate bands.",
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
                "Filter by market tier. 'hub' = 25 major metros (NYC, LA, Boston, etc.); 'mid' = 129 secondary markets; 'small' = 191 tertiary markets.",
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
            "Use this when an agent needs the canonical list of roles TempGuru staffs (brand ambassadors, registration, hospitality, setup, ushers, gate, crowd control, guest services, booth monitors, team leads). The returned `slug` values are the keys to use in the pricing and availability endpoints.",
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
            "Use this when an agent wants to know whether TempGuru can typically staff an event at a given city and date — for example, 'is two weeks enough notice for Dallas?' Returns a recommendation in the set {yes, tight, rush, very-rush} based on the city's market tier and how far out the event is. **This is planning guidance, not a real-time reservation.** A confirmed booking requires a quote request at https://tempguru.co/get-staffing.",
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
            "Use this when an agent needs to quote a price range for a specific role in a specific city — for example, 'what do brand ambassadors cost in Boston?' Returns a `hourly_range_low` / `hourly_range_high` range reflecting event-type and shift variability within that market tier. **All rates are all-inclusive W-2 bill rates** covering worker pay, payroll taxes, workers' comp, liability, and coordinator support. Rate ranges are planning estimates — a real quote requires event specifics.",
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
            "Use this when an agent needs an at-a-glance summary of event staffing compliance for a specific state — minimum wage, weekly and daily overtime thresholds, and state-specific quirks (California meal-break rules, NY spread-of-hours, etc.). Useful for planning multi-state events and for explaining why W-2 staffing matters in jurisdictions with strict labor enforcement. **Informational only — not legal advice.** Consult employment counsel for binding interpretation.",
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
                  enum: ["missing_required", "invalid_param", "not_found"],
                  description: "Machine-readable error category.",
                },
                message: {
                  type: "string",
                  description: "Human-readable explanation of what went wrong.",
                },
                field: {
                  type: "string",
                  description: "Name of the query parameter that triggered the error, when applicable.",
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
          type: "object",
          required: ["input", "total", "tier_breakdown", "cities"],
          properties: {
            input: { type: "object", description: "Echo of the query parameters used." },
            total: { type: "integer" },
            tier_breakdown: {
              type: "object",
              properties: {
                hub: { type: "integer" },
                mid: { type: "integer" },
                small: { type: "integer" },
              },
            },
            cities: { type: "array", items: { $ref: "#/components/schemas/City" } },
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
            "city",
            "state",
            "city_tier",
            "event_date",
            "days_until_event",
            "typical_lead_time_hours",
            "recommendation",
            "notes",
          ],
          properties: {
            input: { type: "object" },
            city_found: { type: "boolean", enum: [true] },
            city: { type: "string" },
            state: { type: "string" },
            city_tier: { type: "string", enum: ["hub", "mid", "small"] },
            event_date: { type: "string", format: "date" },
            days_until_event: { type: "integer" },
            typical_lead_time_hours: { type: "integer" },
            recommendation: {
              type: "string",
              enum: ["yes", "tight", "rush", "very-rush"],
              description:
                "yes = comfortable window; tight = at or near typical lead time; rush = inside lead time; very-rush = <24h.",
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
            unique_rules: { type: "array", items: { type: "string" } },
            liability_coverage_included: { type: "boolean" },
            workers_comp_included: { type: "boolean" },
            citation_note: { type: "string" },
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
