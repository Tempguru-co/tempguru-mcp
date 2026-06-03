// GET /.well-known/api-catalog
// RFC 9727 API catalog. Points service-desc at our OpenAPI spec,
// service-doc at the developer-facing AI docs page on tempguru.co,
// and status at the health endpoint.

export async function GET() {
  const linkset = {
    linkset: [
      {
        anchor: "https://mcp.tempguru.co/",
        "service-desc": [
          {
            href: "https://mcp.tempguru.co/openapi.json",
            type: "application/openapi+json",
          },
        ],
        "service-doc": [
          {
            href: "https://tempguru.co/ai",
          },
        ],
        status: [
          {
            href: "https://mcp.tempguru.co/api/v1/health",
          },
        ],
      },
    ],
  };

  return new Response(JSON.stringify(linkset, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/linkset+json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}
