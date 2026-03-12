You are generating test mock data for a pub page's command system.

<task>
Read `index.html` in the current directory. Look for a `<script type="application/pub-command-manifest+json">` block.

If there is no command manifest (browser-only page), write `mocks.json` containing just `{}` and you're done.

If there is a manifest, generate realistic mock response data for every function defined in it. Write `mocks.json` with this structure:

```json
{
  "functionName": {
    "returns": "json|text|void",
    "value": <realistic mock response matching the return type>
  }
}
```

### Rules for mock values

- `"returns": "void"` → `"value": null`
- `"returns": "text"` → a realistic text string the tool would produce
- `"returns": "json"` → a realistic JSON object or array the tool would produce
- For list/search commands: generate 5–10 items with plausible names, dates, IDs, snippets
- For detail/get commands: generate one rich, complete object with all fields the UI might use
- For AI/agent commands: generate a realistic natural-language response (2–4 sentences)
- Mock data should exercise the UI meaningfully — vary content lengths, statuses, and states
- Read the JS code to see which fields and properties it accesses on command results — include those fields in your mocks

### Examples

For `gog gmail list`:
```json
{
  "listEmails": {
    "returns": "json",
    "value": [
      {"id": "msg001", "threadId": "t001", "subject": "Q3 Planning Review", "from": "alice@example.com", "date": "2024-03-12T09:30:00Z", "snippet": "Let's discuss the roadmap for next quarter..."},
      {"id": "msg002", "threadId": "t002", "subject": "Deploy checklist", "from": "bob@devops.io", "date": "2024-03-11T14:22:00Z", "snippet": "Please review the staging deploy before merging..."}
    ]
  }
}
```

For an agent summarize command:
```json
{
  "summarize": {
    "returns": "text",
    "value": "The email discusses three key topics: the Q3 roadmap timeline, budget allocation for the new infrastructure project, and hiring priorities for the engineering team."
  }
}
```
</task>

Read the HTML file, then write `mocks.json` using the Write tool.
