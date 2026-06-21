# Verification

The mandatory verification gate:

```bash
./init.sh
```

On Windows (PowerShell):

```powershell
.\init.ps1
```

Customize these scripts for your stack.  Always keep
`python harness.py validate` as the **first step** so schema
invariants are checked before any build or test step.

## Gate Steps

`init.sh` and `init.ps1` run:

1. `python harness.py validate`
2. `npm ci`, when `package-lock.json` exists
3. `npm run lint`, when a lint script exists
4. `npm run build`, when a build script exists
5. `npm test`, when a test script exists

The repository currently has harness files even if the application scaffold is
not present. The scripts skip missing Node package files so the setup harness
can still validate cleanly before the app code is generated.

## Project-Specific Checks

- `vault-engine` file mutation, lock handling, manifest writes, and human-edit
  conflict routing need focused automated tests when changed.
- Context loader changes need tests proving nested `AGENTS.md` rules inherit and
  merge correctly.
- AI generation flows need deterministic verification before any LLM judge is
  used.
- Numerical solver output must be checked by a convergence script, not by an LLM.
- Reviewer model providers must differ from generator providers.
- Search watcher changes must prove indexing is incremental and does not trigger
  a full-vault rescan for ordinary edits.

## Environment Checks

- Ollama should be installed and running when local embeddings or local
  generation are exercised.
- Cloud provider features require the relevant Anthropic or OpenAI API keys in
  the local environment.
- The local MCP endpoint is expected at `http://localhost:3742/mcp` when the
  engine is running.
