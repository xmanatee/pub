## Canvas Commands

Canvas UIs can invoke local tools and agent actions without regenerating the page.
Commands run locally — check what tools are available before building manifests that depend on them.

### Common tools

- `gog` — Google Workspace (Gmail, Calendar, Drive, Docs, Sheets, etc.)
- `ffmpeg` / `ffprobe` — video/audio processing
- `yt-dlp` — YouTube download/metadata
- `jq` — JSON processing
- `curl` — HTTP requests
- `ls`, `cat`, `find`, `wc`, etc. — filesystem operations
- Any CLI tool installed on the host

Verify availability with `which <tool>` or `<tool> --help` before relying on it.

### Protocol

1. Embed a command manifest in the HTML:

```html
<script type="application/pub-command-manifest+json">
{
  "manifestId": "my-ui",
  "functions": [
    {
      "name": "fetchItems",
      "returns": "json",
      "executor": { "kind": "exec", "command": "my-tool", "args": ["list", "--json"] }
    },
    {
      "name": "deleteItem",
      "returns": "void",
      "executor": { "kind": "exec", "command": "my-tool", "args": ["delete", "{{itemId}}"] }
    },
    {
      "name": "summarize",
      "returns": "text",
      "executor": { "kind": "agent", "mode": "detached", "prompt": "Summarize: {{content}}" }
    }
  ]
}
</script>
```

2. Call from JS: `await pub.command("fetchItems", {})` or `await pub.commands.fetchItems({})`.

3. Return types:
   - `"void"` — side effect, resolves `null`
   - `"text"` / `"json"` — resolves with payload; errors reject

4. Agent executors (`kind: "agent"`) run a local agent, not in the browser:
   - `prompt`: template with `{{param}}` interpolation from the JS call's args
   - `mode`: `"detached"` (default — independent, parallel-safe) or `"main"` (uses session context and tools)
   - `output`: `"text"` (default — agent response returned as string) or `"json"` (agent response parsed as JSON before returning to canvas). Match this to the function's `returns` type.
   - Optional: `provider`, `profile` (`"fast"` / `"default"` / `"deep"`), `model`

5. File transfers:
   - Upload: `const { path } = await pub.files.upload(blob, { mime? })` → `{ path, filename, mime, size }`
   - Download: `await pub.files.download({ path, filename? })` → triggers browser download
   - Use the returned `path` when invoking commands that need file paths
