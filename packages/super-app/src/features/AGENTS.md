# Feature Modules

Feature modules are intended to be self-contained slices of the live app.
Adding a feature should usually be additive and should follow the neighboring
feature examples.

## Guidelines

- Keep feature-specific UI, server access, browser-only integrations,
  credentials, and daemon-routed commands inside the owning feature boundary.
- Do not import across sibling feature modules; promote shared behavior to a
  shared layer only when more than one feature genuinely needs it.
- Keep user credentials in the app's configuration flow rather than process
  environment.
- Expose new features through the existing routing and navigation conventions
  without adding central plumbing unless the architecture requires it.
- Prefer thin browser wrappers and server-side access through existing shared
  utilities.
