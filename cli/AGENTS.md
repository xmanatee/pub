# CLI

The CLI owns the local operator experience for publishing, live sessions,
configuration, daemon lifecycle, bridge coordination, and tunnel startup.

## Guidelines

- Keep local setup and runtime state explicit, inspectable, and recoverable.
- Preserve the boundary between command handling, configuration resolution,
  daemon runtime, bridge delivery, signaling, and tunnel proxying.
- Route daemon-dependent behavior through the existing runtime abstractions
  instead of coupling commands directly to daemon internals.
- Keep provider selection and runtime capability detection configuration-driven.
- Maintain standalone distribution behavior without assuming a development
  checkout is available at runtime.
- Prefer clear failures over silent fallbacks for startup, bridge, signaling,
  and delivery paths.
- Keep public command behavior aligned with agent-facing guidance and release
  metadata when it changes.
