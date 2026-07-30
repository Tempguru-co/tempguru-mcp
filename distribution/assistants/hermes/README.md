# Hermes catalog submission package

Source for NousResearch/hermes-agent PR #39150 (optional-skills/productivity/
event-staffing). Addresses every hermes-sweeper finding: <=60-char description,
human author credit, ## Prerequisites with the MCP config, no UTM params
(repo policy), no reference to companion skills absent from their catalog,
plus the required per-skill test.

To sync: copy SKILL.md to optional-skills/productivity/event-staffing/SKILL.md
and the test to tests/skills/test_event_staffing_skill.py on the PR branch in
the kissmyabs32/hermes-agent fork, then push. Derived from the canonical
content/skills/event-staffing-ordering.md; re-derive when the canonical skill
changes. The current package documents the attributed Hermes endpoint, the
12-tool inventory (10 read-only, 2 non-contact persistence writes),
conditional explicit-save guidance, and the non-PII buyer form handoff; re-sync
both files to
PR #39150 before requesting another sweeper review.
