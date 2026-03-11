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
4. Agent executors:
   - `executor.kind = "agent"` uses a local agent runtime, not the browser.
   - `provider: "auto"` prefers the current bridge runtime when it supports agent execution, otherwise Claude Code, otherwise OpenClaw.
   - `provider: "claude-code"` requires `claude-code.path` or `CLAUDE_CODE_PATH`.
   - `provider: "openclaw"` requires `openclaw.path` and `openclaw.sessionId`, or the matching environment variables.
