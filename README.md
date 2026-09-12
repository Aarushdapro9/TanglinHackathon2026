# CodeRat

CodeRat turns an engineering style guide into measurable, reviewable code-compliance work.

The app is deliberately local-first. Paste a Markdown or plain-text guide, add code from a repository, and CodeRat maps **style guide → rules → violations → transformations → verification**. It does not execute imported code.

## Run

Open `index.html` in a modern browser. No build step or dependency installation is required.

## Use

1. On **Style guide**, paste a guide or load a `.md` / `.txt` file. CodeRat extracts executable rule candidates.
2. On **Repository**, paste code, choose a filename, and select **Analyze codebase**.
3. Review the dashboard, rule-level findings, proposed change, unified diff, and verification ledger.

Current enforcement is intentionally conservative: `snake_case` function names and `console.log` removal can be proposed automatically; length and architecture rules are surfaced for AI-assisted or human review. Tests, linters, and type checks are clearly marked as not run because browser-based analysis must not execute untrusted repository code.

## Architecture

- `app.js` — rule extraction, analysis, conservative planning, diff generation, and UI state
- `index.html` — engineering-tool workflow surface
- `styles.css` — responsive dashboard styling
- `tests/rule-engine.test.js` — executable specification for extraction and scanning (run with a recent Node.js installation)

The bundled `code-refactoring-skill/` repository remains untouched and informs the refactoring catalog and safety model used by CodeRat.

## Limitations / next steps

This MVP accepts pasted files one at a time and uses deterministic rule extraction rather than an LLM. A production version should add sandboxed archive/repository ingestion, a server-side LLM rule normalizer, AST-aware multi-language transformations, isolated verification workers, persistent reports, and optional GitHub branch/PR creation.
