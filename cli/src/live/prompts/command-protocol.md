## Canvas Commands

Canvas UIs can invoke local tools and agent actions without regenerating the page.
Commands run locally — check what tools are available before building manifests that depend on them.

### Tools

Pick the right tool for the task. Any CLI available on the host can be used as a command executor.

Common: `gog` (Google Workspace), `gh` (GitHub), `curl`/`wget` (HTTP), `jq` (JSON), `sqlite3` (SQL), `python3` (scripting/math/data), `node` (JS), `ffmpeg`/`ffprobe` (audio/video), `imagemagick`/`convert` (images), `yt-dlp` (YouTube), `pandoc` (document conversion), `ls`/`cat`/`find`/`grep`/`awk`/`sed` (filesystem/text).

Verify with `which <tool>` before depending on it.

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

5. Host file access via `/__pub_files__/` URLs (standard HTTP semantics):
   - **Read**: `<img src="/__pub_files__/tmp/chart.png">`, `fetch("/__pub_files__/path")`, `<video src="/__pub_files__/path">`
   - **Write**: `fetch("/__pub_files__/tmp/output.png", { method: "PUT", body: blob })`
   - **Delete**: `fetch("/__pub_files__/tmp/output.png", { method: "DELETE" })`
   - **Download**: `<a href="/__pub_files__/path/to/file" download="filename.ext">Download</a>`
   - Works with `<img>`, `<video>`, `<audio>`, `<source>`, CSS `url()`, `fetch()`, etc.
   - Files are streamed on demand — no size limit. Video seeking works (Range request support).
   - Paths must be absolute (e.g., `/home/user/file.mp4` or `/tmp/output.png`)
