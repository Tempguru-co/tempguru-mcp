import { buildStaffingPlan, type PlanRoleInput } from "@/lib/mcp/plan-staffing";
import {
  queryAvailability,
  queryCities,
  queryPolicies,
  queryRolePricing,
  queryRoles,
  queryStateCompliance,
  type CityTier,
} from "@/lib/mcp/queries";

const A2A_VERSION = "1.0";

type JsonRecord = Record<string, unknown>;
type JsonRpcId = string | number | null;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown, max = 200): string | undefined {
  return typeof value === "string" && value.trim() && value.length <= max
    ? value.trim()
    : undefined;
}

function optionalPositiveInteger(value: unknown, max: number): number | undefined {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= max
    ? Number(value)
    : undefined;
}

function rpcHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  };
}

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  field?: string,
  status = 400,
) {
  const reason = new Map<number, string>([
    [-32001, "TASK_NOT_FOUND"],
    [-32003, "PUSH_NOTIFICATION_NOT_SUPPORTED"],
    [-32004, "UNSUPPORTED_OPERATION"],
    [-32005, "CONTENT_TYPE_NOT_SUPPORTED"],
    [-32009, "VERSION_NOT_SUPPORTED"],
  ]).get(code);
  const data = [
    ...(reason
      ? [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason,
            domain: "a2a-protocol.org",
          },
        ]
      : []),
    ...(field
      ? [
          {
            "@type": "type.googleapis.com/google.rpc.BadRequest",
            fieldViolations: [{ field, description: message }],
          },
        ]
      : []),
  ];
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code, message, ...(data.length ? { data } : {}) },
    }),
    { status, headers: rpcHeaders() },
  );
}

function notificationResponse() {
  return new Response(null, { status: 204, headers: rpcHeaders() });
}

function agentMessage(id: JsonRpcId, contextId: string, text: string, data: unknown) {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      result: {
        message: {
          messageId: crypto.randomUUID(),
          contextId,
          role: "ROLE_AGENT",
          parts: [
            { text, mediaType: "text/plain" },
            { data, mediaType: "application/json" },
          ],
        },
      },
    }),
    { status: 200, headers: rpcHeaders() },
  );
}

function parsePlanRoles(value: unknown): PlanRoleInput[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 50) return undefined;
  const roles: PlanRoleInput[] = [];
  for (const item of value) {
    if (!isRecord(item)) return undefined;
    const role = optionalString(item.role, 80);
    const headcount = optionalPositiveInteger(item.headcount, 10_000);
    if (!role || !headcount) return undefined;
    const hours = item.hours_per_shift === undefined
      ? undefined
      : typeof item.hours_per_shift === "number" && item.hours_per_shift > 0 && item.hours_per_shift <= 24
        ? item.hours_per_shift
        : null;
    const days = item.days === undefined
      ? undefined
      : optionalPositiveInteger(item.days, 365) ?? null;
    if (hours === null || days === null) return undefined;
    roles.push({
      role,
      headcount,
      ...(hours ? { hours_per_shift: hours } : {}),
      ...(days ? { days } : {}),
    });
  }
  return roles;
}

function runPlan(input: JsonRecord) {
  const city = optionalString(input.city, 120);
  if (!city) return { error: "input.city is required and must be a string" } as const;
  const roles = parsePlanRoles(input.roles);
  if (input.roles !== undefined && !roles) {
    return {
      error:
        "input.roles must be an array of {role, headcount, hours_per_shift?, days?}",
    } as const;
  }
  const eventDate = optionalString(input.event_date, 40);
  const eventType = optionalString(input.event_type, 80);
  const attendees = input.attendees === undefined
    ? undefined
    : optionalPositiveInteger(input.attendees, 5_000_000);
  if (input.attendees !== undefined && !attendees) {
    return { error: "input.attendees must be a positive integer" } as const;
  }
  const description = optionalString(input.description, 2000);
  return {
    result: buildStaffingPlan({
      city,
      ...(eventDate ? { event_date: eventDate } : {}),
      ...(eventType ? { event_type: eventType } : {}),
      ...(attendees ? { attendees } : {}),
      ...(roles ? { roles } : {}),
      ...(description ? { description } : {}),
    }),
  } as const;
}

function runLookup(action: string, input: JsonRecord) {
  switch (action) {
    case "catalog":
    case "coverage": {
      const city = optionalString(input.city, 120);
      if (!city) return { error: "input.city is required for a catalog match" } as const;
      return { result: queryCities({ city }) } as const;
    }
    case "cities": {
      const tierRaw = optionalString(input.tier, 20);
      const tier = tierRaw && ["hub", "mid", "small"].includes(tierRaw)
        ? (tierRaw as CityTier)
        : undefined;
      if (tierRaw && !tier) return { error: "input.tier must be hub, mid, or small" } as const;
      const limit = input.limit === undefined
        ? undefined
        : optionalPositiveInteger(input.limit, 1000);
      if (input.limit !== undefined && !limit) {
        return { error: "input.limit must be an integer from 1 to 1000" } as const;
      }
      return {
        result: queryCities({
          ...(optionalString(input.state, 80) ? { state: optionalString(input.state, 80) } : {}),
          ...(optionalString(input.country, 40) ? { country: optionalString(input.country, 40) } : {}),
          ...(tier ? { tier } : {}),
          ...(limit ? { limit } : {}),
        }),
      } as const;
    }
    case "roles":
      return { result: queryRoles() } as const;
    case "availability": {
      const city = optionalString(input.city, 120);
      const date = optionalString(input.date, 40);
      if (!city || !date) {
        return { error: "input.city and input.date are required for availability" } as const;
      }
      const headcount = input.headcount === undefined
        ? undefined
        : optionalPositiveInteger(input.headcount, 10_000);
      if (input.headcount !== undefined && !headcount) {
        return { error: "input.headcount must be a positive integer" } as const;
      }
      return {
        result: queryAvailability({
          city,
          date,
          ...(optionalString(input.role, 80) ? { role: optionalString(input.role, 80) } : {}),
          ...(headcount ? { headcount } : {}),
        }),
      } as const;
    }
    case "pricing": {
      const city = optionalString(input.city, 120);
      const role = optionalString(input.role, 80);
      if (!city || !role) return { error: "input.city and input.role are required for pricing" } as const;
      return { result: queryRolePricing({ city, role }) } as const;
    }
    case "compliance": {
      const state = optionalString(input.state, 80);
      if (!state) return { error: "input.state is required for compliance" } as const;
      return { result: queryStateCompliance({ state }) } as const;
    }
    case "policies":
      return {
        result: queryPolicies(
          optionalString(input.topic, 120) ? { topic: optionalString(input.topic, 120) } : {},
        ),
      } as const;
    default:
      return {
        error:
          "action must be one of: catalog, cities, roles, availability, pricing, compliance, policies (coverage is a legacy alias for catalog)",
      } as const;
  }
}

const HELP = {
  protocolVersion: A2A_VERSION,
  instructions:
    "Send a message with one application/json data part. Use {skillId:'event-staffing-plan',input:{...}} or {skillId:'event-staffing-lookup',action:'catalog|cities|roles|availability|pricing|compliance|policies',input:{...}}. Catalog matches and availability responses are planning guidance; a coordinator confirms order coverage.",
  examples: [
    {
      skillId: "event-staffing-plan",
      input: {
        city: "Austin",
        event_date: "2026-10-15",
        roles: [{ role: "brand-ambassadors", headcount: 4 }],
      },
    },
    {
      skillId: "event-staffing-lookup",
      action: "pricing",
      input: { city: "Miami", role: "registration-staff" },
    },
  ],
  qualification:
    "Plans and rates are estimates, availability is guidance, and no A2A call reserves staff or submits contact details.",
};

export async function POST(request: Request) {
  const requestedVersion =
    request.headers.get("a2a-version") ??
    new URL(request.url).searchParams.get("A2A-Version") ??
    "0.3";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Invalid JSON payload");
  }
  if (!isRecord(body)) return rpcError(null, -32600, "Request payload validation error");
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpcError(null, -32600, "Request payload validation error");
  }
  const hasId = Object.hasOwn(body, "id");
  if (
    hasId &&
    typeof body.id !== "string" &&
    typeof body.id !== "number" &&
    body.id !== null
  ) {
    return rpcError(null, -32600, "Request payload validation error", "id");
  }
  const id = hasId ? (body.id as JsonRpcId) : null;
  const finish = (response: Response) => (hasId ? response : notificationResponse());
  if (requestedVersion !== A2A_VERSION) {
    return finish(rpcError(
      id,
      -32009,
      `A2A protocol version ${requestedVersion} is not supported; use ${A2A_VERSION}`,
      undefined,
      400,
    ));
  }
  if (
    body.method === "SendStreamingMessage" ||
    body.method === "SubscribeToTask" ||
    body.method === "GetExtendedAgentCard"
  ) {
    return finish(rpcError(
      id,
      -32004,
      "The requested operation is not supported by this agent; use SendMessage",
    ));
  }
  if (
    body.method === "CreateTaskPushNotificationConfig" ||
    body.method === "GetTaskPushNotificationConfig" ||
    body.method === "ListTaskPushNotificationConfigs" ||
    body.method === "DeleteTaskPushNotificationConfig"
  ) {
    return finish(rpcError(id, -32003, "Push notifications are not supported by this agent"));
  }
  if (body.method !== "SendMessage") {
    return finish(rpcError(id, -32601, "Method not found"));
  }
  if (!isRecord(body.params) || !isRecord(body.params.message)) {
    return finish(rpcError(id, -32602, "params.message is required", "params.message"));
  }
  const message = body.params.message;
  if (
    !optionalString(message.messageId, 200) ||
    message.role !== "ROLE_USER" ||
    !Array.isArray(message.parts) ||
    message.parts.length === 0
  ) {
    return finish(rpcError(
      id,
      -32602,
      "message must have messageId, ROLE_USER, and at least one part",
      "params.message",
    ));
  }
  if (message.taskId !== undefined) {
    const taskId = optionalString(message.taskId, 200);
    if (!taskId) {
      return finish(rpcError(id, -32602, "message.taskId must be a non-empty string", "params.message.taskId"));
    }
    return finish(rpcError(id, -32001, `Task ${taskId} was not found`));
  }
  if (message.contextId !== undefined && !optionalString(message.contextId, 200)) {
    return finish(rpcError(
      id,
      -32602,
      "message.contextId must be a non-empty string",
      "params.message.contextId",
    ));
  }
  const contextId = optionalString(message.contextId, 200) ?? crypto.randomUUID();
  const parts = message.parts as unknown[];
  const dataParts: JsonRecord[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!isRecord(part)) {
      return finish(rpcError(
        id,
        -32602,
        "Each message part must be an object",
        `params.message.parts[${index}]`,
      ));
    }
    if (part.mediaType !== undefined && typeof part.mediaType !== "string") {
      return finish(rpcError(
        id,
        -32602,
        "Part mediaType must be a string",
        `params.message.parts[${index}].mediaType`,
      ));
    }
    const hasData = Object.hasOwn(part, "data");
    const hasText = Object.hasOwn(part, "text");
    const unsupportedContentFields = ["raw", "url", "file"].filter((field) =>
      Object.hasOwn(part, field),
    );
    const hasUnsupportedContent = unsupportedContentFields.length > 0;
    if (Number(hasData) + Number(hasText) + unsupportedContentFields.length !== 1) {
      return finish(rpcError(
        id,
        -32602,
        "Each part must contain exactly one supported content field",
        `params.message.parts[${index}]`,
      ));
    }
    const expectedMediaType = hasData ? "application/json" : hasText ? "text/plain" : null;
    if (
      expectedMediaType === null ||
      (part.mediaType !== undefined && part.mediaType !== expectedMediaType)
    ) {
      return finish(rpcError(
        id,
        -32005,
        `Content type ${String(part.mediaType ?? "for this part")} is not supported; use application/json data or text/plain text`,
        `params.message.parts[${index}].mediaType`,
      ));
    }
    if (hasText && typeof part.text !== "string") {
      return finish(rpcError(
        id,
        -32602,
        "Text part content must be a string",
        `params.message.parts[${index}].text`,
      ));
    }
    if (hasData) {
      if (!isRecord(part.data)) {
        return finish(rpcError(
          id,
          -32602,
          "Data part content must be an object for TempGuru skills",
          `params.message.parts[${index}].data`,
        ));
      }
      dataParts.push(part);
    }
  }
  if (dataParts.length > 1) {
    return finish(rpcError(
      id,
      -32602,
      "Send exactly one application/json data part",
      "params.message.parts",
    ));
  }
  const dataPart = dataParts[0];
  if (!dataPart || !isRecord(dataPart.data)) {
    return finish(agentMessage(
      id,
      contextId,
      "TempGuru's A2A endpoint is ready. Send one application/json data part to execute a planning or lookup skill.",
      HELP,
    ));
  }
  const payload = dataPart.data;
  const skillId = optionalString(payload.skillId, 100);
  const input = isRecord(payload.input) ? payload.input : {};
  const execution = skillId === "event-staffing-plan"
    ? runPlan(input)
    : skillId === "event-staffing-lookup"
      ? runLookup(optionalString(payload.action, 40) ?? "", input)
      : { error: "skillId must be event-staffing-plan or event-staffing-lookup" } as const;
  if ("error" in execution && typeof execution.error === "string") {
    return finish(rpcError(id, -32602, execution.error, "params.message.parts.data"));
  }
  return finish(agentMessage(
    id,
    contextId,
    "TempGuru completed the requested repository-backed staffing operation. Treat pricing as an estimate and availability as guidance.",
    { skillId, result: execution.result },
  ));
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, A2A-Version, A2A-Extensions",
      "Access-Control-Max-Age": "86400",
    },
  });
}
