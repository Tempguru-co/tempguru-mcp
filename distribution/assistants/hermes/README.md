# Hermes catalog submission package

Source for NousResearch/hermes-agent PR #39150 (optional-skills/productivity/
event-staffing). Addresses every hermes-sweeper finding: <=60-char description,
human author credit, ## Prerequisites with the MCP config, no UTM params
(repo policy), no reference to companion skills absent from their catalog,
plus the required per-skill test.

To sync: copy SKILL.md to optional-skills/productivity/event-staffing/SKILL.md
and the test to tests/skills/test_event_staffing_skill.py on the PR branch in
the kissmyabs32/hermes-agent fork, then push. Derived from the canonical
content/skills/event-staffing-ordering.md; re-derive (and bump version) when
the canonical skill changes. Version 1.0.4 adds the attributed Hermes endpoint,
the current 12-tool Phase A inventory, conditional explicit-save guidance, and
quote-source fields; re-sync both files to
PR #39150 before requesting another sweeper review.
