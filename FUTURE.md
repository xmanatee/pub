# Publish Platform — Future Plans

## Agent Identity & Contact Layer

Allow users to store contact/identity information on their profile, turning Publish into an identity resolution layer for AI agents.

### Use Case

User tells their AI agent:
> "I want to schedule something with Zhenya."

The agent can:
1. Look up "Zhenya" in the Publish platform contact registry
2. Find Zhenya's profile with linked social accounts (Telegram, Instagram, email, phone)
3. Discover Zhenya's own AI agent endpoint
4. Communicate with Zhenya's agent to negotiate/schedule

### Data Model Extension

```typescript
// New table: user profiles with contact information
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
    value: v.string(),        // @username, email, phone, URL
    isPublic: v.boolean(),    // visible to other users/agents
    isVerified: v.boolean(),  // verified ownership
  })),
  agentEndpoint: v.optional(v.string()), // URL where agent can be reached
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .searchIndex("search_name", { searchField: "displayName" }),
```

### API Extensions

- `GET /api/v1/contacts/search?q=zhenya` — Search by name/handle
- `GET /api/v1/contacts/:userId` — Get public profile
- `POST /api/v1/contacts/resolve` — Resolve a contact by identifier (e.g. Telegram handle → agent endpoint)
- `POST /api/v1/agent/message` — Send a message to another user's agent

### Agent-to-Agent Protocol

Define a simple protocol for inter-agent communication:

```json
{
  "from": "user_id_sender",
  "to": "user_id_receiver",
  "type": "scheduling_request",
  "payload": {
    "action": "schedule_meeting",
    "proposed_times": ["2025-01-20T10:00:00Z", "2025-01-20T14:00:00Z"],
    "topic": "Project discussion"
  }
}
```

### Web App Extensions

- Profile settings page where users add/edit contact information
- Contact directory (searchable)
- Agent configuration (set agent endpoint URL)
- Incoming agent requests queue

### CLI Extensions

```bash
# Search for a contact
publish contacts search "Zhenya"

# Get agent endpoint for a user
publish contacts resolve --telegram @zhenya

# Send a message to another user's agent
publish agent message USER_ID --type scheduling_request --payload '...'
```

### Privacy Considerations

- All contact info marked as public/private per field
- Agent endpoint access requires mutual consent (both users must have profiles)
- Rate limiting on search and resolve endpoints
- Ability to block specific users/agents

### Implementation Order

1. User profile data model and basic CRUD
2. Profile settings UI in dashboard
3. Contact search API
4. Agent endpoint registration
5. Agent-to-agent messaging protocol
6. CLI commands for contacts
7. Verification flows for linked accounts
