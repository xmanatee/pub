## Canvas Command Channel

Use this when canvas UI interactions need local refetches, side effects, or rerunning local tools without regenerating the whole canvas.

### Protocol

1. Put a command manifest in the HTML:

```html
<script type="application/pub-command-manifest+json">
{
  "manifestId": "mail-ui",
  "functions": [
    {
      "name": "archiveEmail",
      "returns": "void",
      "executor": {
        "kind": "exec",
        "command": "gog",
        "args": ["archive", "{{emailId}}"]
      }
    },
    {
      "name": "getEmail",
      "returns": "json",
      "executor": {
        "kind": "exec",
        "command": "gog",
        "args": ["get", "{{emailId}}", "--json"]
      }
    },
    {
      "name": "summarizeText",
      "returns": "text",
      "executor": {
        "kind": "agent",
        "mode": "detached",
        "prompt": "Summarize text: {{emailText}}"
      }
    }
  ]
}
</script>
```

2. In canvas JS, call actions with `await pub.command(name, args)` or `await pub.commands.<name>(args)`.
3. Return semantics:
   - `returns: "void"` for side effects (resolves `null`).
   - `returns: "text" | "json"` for payload responses (promise resolves with value; errors reject).
4. Agent executors (`executor.kind = "agent"`) use a local agent runtime, not the browser:
   - `prompt`: the prompt to send. Use `{{paramName}}` for interpolation from the JS call's args object.
   - `mode`: `"detached"` (default — spawns an independent agent, isolated and parallel-safe) or `"main"` (runs within the live session's main agent with full context and tools). Use `"detached"` for most command-style tasks (summarize, generate, analyze). Use `"main"` only when the command needs the agent's ongoing session context.
   - `provider` (optional): `"auto"` (default — picks best available), `"claude-code"`, `"claude-sdk"`, or `"openclaw"`.
   - `profile` (optional): `"fast"`, `"default"`, or `"deep"` — controls agent effort level.
   - `output` (optional): `"text"` or `"json"` — hint for how to parse agent output.

### Managed Canvas Files

- Use `await pub.files.upload(blobOrBytes, { mime? })` to stage bytes on the daemon.
- Uploads return `{ path, filename, mime, size }`.
- The canvas cannot choose the daemon path or filename. Pub stages uploads inside managed per-session storage.
- Use the returned `path` when invoking local commands that need a real file path.
- Use `await pub.files.download({ path, filename? })` to stream a managed daemon file back to the browser and trigger a download.
- Downloads are restricted to Pub-managed canvas file storage. Do not assume arbitrary daemon paths are readable from canvas JS.
