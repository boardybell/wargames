# Build decisions locked with Bond, 2026-11-17

Read alongside requirements.md. These answers override any open question in the prompt.

1. OpenAI lane: no API key. Use the codex CLI (codex-cli 0.155.1, authed via the local
   ChatGPT app) for art direction drafting, artwork critique, and screenshot review.
   Image generation: codex cannot generate images, so renders come from the local
   Darkroom/ComfyUI stack (FastAPI :8190 wrapping ComfyUI :8189, models on Extreme Pro)
   with codex providing the written briefs and the review passes. Joshua's voice renders
   through a local speech engine with narrow-band post-processing. If any lane proves
   unavailable, ship the playable site plus the handoff bundle the prompt specifies and
   say exactly which review actually ran.

2. Deployment: create public repo boardybell/wargames, GitHub Actions Pages workflow,
   live at https://boardybell.github.io/wargames/ before the build is called done.

3. Pipeline: full deep-project decomposition, then deep-plan and deep-implement per
   split in manifest dependency order.

4. Reference screenshot: supplied. planning/reference/crt-reference.jpg is the anchor
   for the terminal glass. Electric blue dot-matrix glyphs on navy-black, thin luminous
   white border, left-aligned column, generous vertical rhythm between the greeting,
   the question, and the three numbered choices.

House rules that apply to this project: no em-dashes anywhere, register the local
preview service in ~/mainframe/services.json, no heredocs in shell commands.
