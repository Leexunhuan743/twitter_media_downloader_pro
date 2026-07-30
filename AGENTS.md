# Before starting work

- Run `lat search` to find sections relevant to your task. Read them to understand the design intent before writing code.
- Run `lat expand` on user prompts to expand any `[[refs]]` — this resolves section names to file locations and provides context.

# Post-task checklist (REQUIRED — do not skip)

After EVERY task, before responding to the user:

- [ ] Update `lat.md/` if you added or changed any functionality, architecture, tests, or behavior
- [ ] Run `lat check` — all wiki links and code refs must pass
- [ ] Do not skip these steps. Do not consider your task done until both are complete.

---

# What is lat.md?

This project uses [lat.md](https://www.npmjs.com/package/lat.md) to maintain a structured knowledge graph of its architecture, design decisions, and test specs in the `lat.md/` directory. It is a set of cross-linked markdown files that describe **what** this project does and **why** — the domain concepts, key design decisions, business logic, and test specifications. Use it to ground your work in the actual architecture rather than guessing.

# Commands

```bash
lat init                     # initialize lat.md/ in a new project
lat locate "Section Name"    # find a section by name (exact, fuzzy)
lat section "file#Section"   # show a section with content, outgoing refs, and incoming refs
lat refs "file#Section"      # find references; add --scope=md|code|md+code to narrow
lat search "natural language" # semantic search; use --limit N to tune result count
lat search                   # build/update the embedding index without querying
lat expand "user prompt text" # expand [[refs]] to resolved locations; use --stdin for pipes
lat reindex                  # rebuild embeddings; use --local or --remote to switch backend
lat config                   # show the lat config file path
lat mcp                      # start MCP server (stdio) for AI agent tool access
lat check                    # validate all; subcommands: md, code-refs, index, sections
```

Run `lat --help` for all options, `lat <command> --help` per command.

### Command behavior notes

- Prefer the installed `lat --help`, upstream `lat.md/cli.md`, and source code over generated templates when they conflict; templates can lag current implementation.
- `lat check` without a subcommand runs `md`, `code-refs`, `index`, and `sections`.
- `lat refs --scope=md` checks markdown wiki links, `--scope=code` checks `@lat` comments, and `--scope=md+code` checks both.
- `lat locate` and `lat expand` are exploratory and may use fuzzy matching. Do not treat a fuzzy result as a valid link until `lat check` accepts it.

### MCP (Model Context Protocol)

`lat mcp` starts an MCP server (stdio transport) with 6 tools: `lat_locate`, `lat_section`, `lat_search`, `lat_expand`, `lat_check`, `lat_refs`. Configure it in your agent's MCP settings to avoid manual CLI fallback. See the [upstream CLI docs](https://github.com/1st1/lat.md/blob/main/lat.md/cli.md).

### Semantic search and embeddings

According to the upstream `lat.md/cli.md` design notes and current source, `lat search` works offline by default using a bundled local embedding model. Do not tell the user that an API key is required just because semantic search is involved.

Hosted embeddings are optional. For higher-quality remote embeddings, configure an OpenAI (`sk-...`) or Vercel AI Gateway (`vck_...`) key via `LAT_LLM_KEY`, `LAT_LLM_KEY_FILE`, `LAT_LLM_KEY_HELPER`, or the config file shown by `lat config`. Use `lat reindex --local` to force the offline model or `lat reindex --remote` to use the hosted backend.

Normal `lat search` creates or updates the generated index at `lat.md/.cache/vectors.db`; `lat reindex` is the explicit full rebuild and backend-switch command. Once an index records a model, that model is authoritative: if the current environment cannot serve it, fix the key or run `lat reindex --local` / `lat reindex --remote` instead of silently changing backends.

If `lat search` fails, report the actual error and fall back to `lat locate`, `lat section`, and direct file reads rather than guessing.

---

# Quickstart: Add a new section

1. Create or edit a file in `lat.md/` (e.g. `lat.md/feature-x.md`)
2. Add a `# Title` and a one-paragraph description (≤250 chars)
3. Link to it from the index `lat.md/lat.md` with `- [[feature-x]] — description`
4. Cross-link from related sections with `[[feature-x#SectionName]]`
5. Run `lat check` — fix any broken links

# CI Integration

`lat check` should be part of CI to prevent drift. Current `.github/workflows/go.yml` only builds release binaries — add a `lat check` step if you enable CI for PRs.

# Syntax primer

- **Section ids**: `lat.md/path/to/file#Heading#SubHeading` — full form uses project-root-relative path (e.g. `lat.md/tests/search#RAG Replay Tests`). Short form uses bare file name when unique (e.g. `search#RAG Replay Tests`, `cli#search#Indexing`).
- **Wiki links**: `[[target]]` or `[[target|alias]]` — cross-references between sections. `[[foo]]` links to file `foo.md`; it does not search headings. `[[foo#Bar#Baz]]` must include the exact heading chain. Local-only heading links such as `[[#Bar]]` are invalid.
- **Source code links**: Wiki links in `lat.md/` files can reference functions, classes, constants, and methods in TypeScript/JavaScript/Python/Rust/Go/C files. Use the full path: `[[src/config.ts#getConfigDir]]`, `[[src/server.ts#App#listen]]` (class method), `[[lib/utils.py#parse_args]]`, `[[src/lib.rs#Greeter#greet]]` (Rust impl method), `[[src/app.go#Greeter#Greet]]` (Go method), `[[src/app.h#Greeter]]` (C struct). `lat check` validates these exist.
- **Code refs**: `// @lat: [[section-id]]` (JS/TS/Rust/Go/C) or `# @lat: [[section-id]]` (Python) — ties source code to concepts

# Index rules

Every directory under `lat.md/` needs a same-name index file with a bullet list of visible files and subdirectories. The root index is `lat.md/lat.md`; a subdirectory such as `lat.md/api/` needs `lat.md/api/api.md`. Entries use `- [[name]] — description` and omit `.md`.

Only Markdown belongs in `lat.md/`. Generated or editor-only files such as `.cache`, `.obsidian`, and canvases must be ignored by `lat.md/.gitignore`.

# Test specs

Key tests can be described as sections in `lat.md/` files (e.g. `tests.md`). Add frontmatter to require that every leaf section is referenced by a `// @lat:` or `# @lat:` comment in test code:

```markdown
---
lat:
  require-code-mention: true
---
# Tests

Authentication and authorization test specifications.

## User login

Verify credential validation and error handling for the login endpoint.

### Rejects expired tokens
Tokens past their expiry timestamp are rejected with 401, even if otherwise valid.

### Handles missing password
Login request without a password field returns 400 with a descriptive error.
```

Every section MUST have a description — at least one sentence explaining what the test verifies and why. Empty sections with just a heading are not acceptable. (This is a specific case of the general leading paragraph rule below.)

Each test in code should reference its spec with exactly one comment placed next to the relevant test — not at the top of the file:

```python
# @lat: [[tests#User login#Rejects expired tokens]]
def test_rejects_expired_tokens():
    ...

# @lat: [[tests#User login#Handles missing password]]
def test_handles_missing_password():
    ...
```

Do not duplicate refs. One `@lat:` comment per spec section, placed at the test that covers it. `lat check` will flag any spec section not covered by a code reference, and any code reference pointing to a nonexistent section.

# Section structure

Every section in `lat.md/` **must** have a leading paragraph — at least one sentence immediately after the heading, before any child headings or other block content. The first paragraph must be ≤250 characters (excluding `[[wiki link]]` content). This paragraph serves as the section's overview and is used in search results, command output, and RAG context — keeping it concise guarantees the section's essence is always captured.

```markdown
# Good Section

Brief overview of what this section documents and why it matters.

More detail can go in subsequent paragraphs, code blocks, or lists.

## Child heading

Details about this child topic.
```

```markdown
# Bad Section

## Child heading

Details about this child topic.
```

The second example is invalid because `Bad Section` has no leading paragraph. `lat check` validates this rule and reports errors for missing or overly long leading paragraphs.
