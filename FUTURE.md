# Future Plans

## Contact and Agent Identity Layer

Goal: let users publish a searchable contact profile so agents can resolve a person to a trusted contact channel or agent endpoint.

## Primary Use Case

User asks their agent: "Schedule with Zhenya."

Agent workflow:
1. Search contacts by name/handle.
2. Resolve the matched profile.
3. Discover available channels (Telegram, email, etc.) and optional agent endpoint.
4. Send a structured request to the remote agent endpoint when available.

## Proposed Data Model

```ts
userProfiles: defineTable({
  userId: v.id("users"),
  displayName: v.string(),
  bio: v.optional(v.string()),
  contacts: v.array(v.object({
    type: v.union(
      v.literal("telegram"),
      v.literal("instagram"),
      v.literal("email"),
      v.literal("phone"),
      v.literal("github"),
      v.literal("twitter"),
      v.literal("website"),
      v.literal("agent_endpoint"),
    ),
    value: v.string(),
    isPublic: v.boolean(),
    isVerified: v.boolean(),
  })),
  agentEndpoint: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .searchIndex("search_name", { searchField: "displayName" });
```

## Proposed API Surface

- `GET /api/v1/contacts/search?q=<query>`
- `GET /api/v1/contacts/:userId`
- `POST /api/v1/contacts/resolve`
- `POST /api/v1/agent/message`

## Agent-to-Agent Message Shape

```json
{
  "from": "user_id_sender",
  "to": "user_id_receiver",
  "type": "scheduling_request",
  "payload": {
    "action": "schedule_meeting",
    "proposed_times": ["2026-01-20T10:00:00Z", "2026-01-20T14:00:00Z"],
    "topic": "Project discussion"
  }
}
```

## Product Additions

- Profile settings for contact fields and visibility.
- Contact directory search.
- Agent endpoint registration.
- Inbox for incoming agent requests.
- CLI contact/resolve/message commands.

## Privacy and Abuse Controls

- Field-level visibility (`isPublic`).
- Verified ownership per contact method (`isVerified`).
- Consent gate before cross-agent messaging.
- Rate limits on search and resolve.
- Blocklist support.

## Suggested Delivery Order

1. `userProfiles` schema + CRUD.
2. Dashboard profile settings UI.
3. Contact search/resolve APIs.
4. Agent endpoint registration.
5. Agent-to-agent messaging endpoint.
6. CLI contact commands.
7. Verification flows.

## Runtime TODO

- CLI update check so every `pub` command can warn when a newer version exists.
- Daemon update-awareness: stop for upgrade only after configured idle time.
