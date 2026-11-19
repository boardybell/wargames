# Discovery: lane probes and rungs

The human-readable mirror of `media/discovery.json`. Machines read the JSON;
this file is the narrative. Every probe run appends a dated entry below with
the media class it tested, the rung it recorded, and the provenance block if
rung 1 was granted. The JSON is authoritative; if the two ever disagree, trust
the JSON and fix this file.

The escalation ladder, for reference:

- Rung 1: codex exec emits image files directly, provenance checklist passes.
- Rung 2: semi-automated ChatGPT.app handoff; the consolidated paste file is
  the primary path. Rung 2 cannot pin the model tier.
- Rung 3: the handoff bundle ships with placeholders and the README says so.

## Probe history

### 2026-11-19T00:21:39.738Z - image-generate (stage A)

- Rung recorded: 1
- Notes: rung 1 confirmed via codex-direct
- Provenance: png 1536x1024, sanity pass
