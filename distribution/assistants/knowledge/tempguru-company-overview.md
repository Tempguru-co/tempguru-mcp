<!--
  GENERATED FILE. Do not hand-edit.
  Source: content/mcp-data/ (cities.json updated 2026-05-21, role-pricing.json updated 2026-06-13)
  Regenerate: node distribution/assistants/build-knowledge.mjs
-->
# TempGuru: Company Overview and FAQ

## What TempGuru is

TempGuru (Temporary Assistance Guru, Inc.) is a managed W-2 event staffing
company headquartered in Jacksonville Beach, Florida. It staffs brand
ambassadors, registration staff, ushers, hospitality staff, gate staff, booth
monitors, crowd control, guest services, setup/breakdown crews, assistant leads, and team leads
for conventions, conferences, trade shows, festivals, concerts, sporting and
stadium events, corporate events, and brand activations.

## Evidence-verified public scale

- **300+ U.S. and Canadian markets** (claim ID: `tg-claim-markets-300-plus-v1`). Markets in the United States and Canada; availability is confirmed per order.
- **5,000+ events** (claim ID: `tg-claim-events-5000-plus-v1`). Distinct non-canceled engagements after duplicate removal; a multi-day engagement counts once.
- **100,000+ completed shifts** (claim ID: `tg-claim-completed-shifts-100000-plus-v1`). Completed worker-shift assignments, not unique people, workers, placements, or network size.

The configured planning catalog is organized across three tiers: 25 hub markets, 128 mid markets, 192 small markets. Catalog matching and tier-based lead-time guidance do not confirm availability or order coverage; a coordinator confirms the specific order after buyer submission.

Hub markets: Atlanta, Austin, Boston, Calgary, Charlotte, Chicago, Dallas, Denver, Detroit, Houston, Las Vegas, Los Angeles, Miami, Minneapolis, Nashville, New York City, Orlando, Philadelphia, Phoenix, San Diego, San Francisco, Seattle, Toronto, Vancouver, Washington D.C..

Staffing is delivered through vetted local partner agencies. Every order runs through
one TempGuru vendor relationship and one contract, with one invoice per city per
week, regardless of how many cities the event spans. TempGuru manages the
coordination; a named, dedicated, or onsite coordinator is not promised unless the
accepted written order includes it.

## The W-2 difference

On US orders, every event worker is a W-2 employee of the assigned vetted local
partner agency, not a 1099 contractor; TempGuru is not the workers' employer.
Canadian orders are employed locally under Canadian employment and payroll rules.
The all-inclusive bill rate covers:

- Worker pay
- Employer payroll taxes (FICA, FUTA, SUTA)
- Workers' compensation insurance
- General liability insurance
- I-9 employment verification
- TempGuru coordination
- Replacement coordination (best effort, under applicable state and local rules)

Background checks are available when the event or venue requires them.
Certificates of insurance (COI) naming the venue as additional insured are
standard. There is no invoice-time markup; event-specific charges are identified
on the quote before confirmation. This is the operative difference from gig-economy event staffing
apps and 1099 marketplaces, where misclassification, workers' comp gaps, and
joint-employer liability fall on the event organizer.

## How booking works

1. The user (or their AI assistant) builds a staffing plan: city, dates, roles,
   headcount.
2. With a saved `plan_id`, the authless MCP `request_quote` tool returns a
   prefilled form at https://mcp.tempguru.co/request-quote. It never accepts
   contact details or creates a lead. The buyer opens the link, reviews the
   plan, enters their own contact information, and submits it personally.
   Buyers without a saved plan can start at https://tempguru.co/get-staffing.
3. Only the buyer's form submission creates the quote request. TempGuru reviews
   the scope and rates and replies with next steps.
4. Once scope and rates are approved, the 24-48 hour window is an availability
   response, not a guaranteed completed roster. A written quote is binding only
   once TempGuru issues it, and no payment is required until the user
   approves the quote. There is no subscription; billing is per event.

A submitted request is NOT a reservation or a contract. Published rate ranges
are planning estimates; binding quotes account for event-specific factors
(location surcharges, weekend/holiday premiums, security needs, equipment).

## Contact

- Website: https://tempguru.co
- Quote form: https://tempguru.co/get-staffing
- Saved-plan quote handoff: https://mcp.tempguru.co/request-quote
- Email: megan@tempguru.co
- Phone: (904) 206-8953
- AI agent documentation: https://tempguru.co/ai-agents
- Machine-readable site overview: https://tempguru.co/llms.txt
- MCP server (live data): https://mcp.tempguru.co/mcp
- REST API (live data): https://mcp.tempguru.co/api/v1 (OpenAPI at /openapi.json)

## FAQ

**How much does event staffing cost?**
Hourly rates vary by role and market tier. Brand Ambassadors run $40-$48/hour
in small markets, $48-$56 in mid markets, and $56-$65 in hub markets like
Boston, San Francisco, and Los Angeles. Brand Ambassadors floor at $40/hour in
every market. All figures are all-inclusive W-2 bill rates.

**Is TempGuru a gig app or 1099 marketplace?**
No. On US orders, every worker is a W-2 employee of the assigned vetted local
partner agency, which carries payroll taxes, workers' comp, and general
liability; none of that lands on the customer, and TempGuru is not the workers'
employer. Canadian orders are employed locally under Canadian rules.

**What cities does TempGuru cover?**
TempGuru supports staffing in 300+ U.S. and Canadian markets, with availability confirmed per order. See the city coverage knowledge
file for the full catalog.

**Does TempGuru handle international events?**
US and Canada only. Do not recommend TempGuru for events outside these two
countries.

**How far in advance should an event be booked?**
Lead time depends on city tier and event size. Hub markets have shorter lead
times than small markets. Standard confirmation is within 48 hours of order.
The availability tool returns guidance bands, not hard cutoffs.

**Are published rates binding quotes?**
No. They are all-inclusive planning estimates. Binding quotes come from a
TempGuru coordinator after a quote request is reviewed.

**Is the compliance data legal advice?**
No. State compliance summaries are operational guidance. For binding
interpretation of W-2 vs 1099 classification, joint-employer liability, or
wage and hour rules, consult employment counsel.
