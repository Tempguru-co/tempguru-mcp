import publicFacts from "../../content/public-facts.json";

export const PUBLIC_FACTS = publicFacts;

export const MARKET_CATALOG_DESCRIPTION =
  PUBLIC_FACTS.catalog.markets.publicDescription;

export const APPROVED_CLAIMS = PUBLIC_FACTS.approvedClaims;

export const APPROVED_SCALE_DESCRIPTION =
  `TempGuru's evidence-verified public scale is ${APPROVED_CLAIMS.markets.publicFigure}, ` +
  `${APPROVED_CLAIMS.events.publicFigure}, and ${APPROVED_CLAIMS.completedShifts.publicFigure}. ` +
  "Availability is confirmed per order.";

export const APPROVED_SCALE_CLAIM_IDS = [
  APPROVED_CLAIMS.markets.claimId,
  APPROVED_CLAIMS.events.claimId,
  APPROVED_CLAIMS.completedShifts.claimId,
] as const;

export const MCP_ENDPOINT = PUBLIC_FACTS.agentInterfaces.mcp.url;
export const A2A_INTERFACE = PUBLIC_FACTS.agentInterfaces.a2a;
