import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { clearAll, seedUser } from "../fixtures/convex";

test.beforeEach(() => {
  clearAll();
});

test.describe("Agent presence via HTTP API", () => {
  test("agent goes online", async () => {
    const user = seedUser("Agent User");
    const api = new ApiClient({ user });

    const res = await api.agentOnline({
      daemonSessionId: "session-1",
      agentName: "test-agent",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.online).toBe(true);
  });

  test("heartbeat succeeds when online", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.agentOnline({ daemonSessionId: "hb-session", agentName: "hb-agent" });
    expect((await api.agentHeartbeat({ daemonSessionId: "hb-session" })).status).toBe(200);
  });

  test("agent goes offline", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    await api.agentOnline({ daemonSessionId: "off-session", agentName: "off-agent" });
    expect((await api.agentOffline({ daemonSessionId: "off-session" })).status).toBe(200);
  });

  test("heartbeat fails when not online", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    const res = await api.agentHeartbeat({ daemonSessionId: "no-session" });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: "presence_not_online",
    });
  });

  test("online rejects a second fresh host for the same API key", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    expect((await api.agentOnline({ daemonSessionId: "one", agentName: "one" })).status).toBe(200);

    const res = await api.agentOnline({ daemonSessionId: "two", agentName: "two" });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: "presence_api_key_in_use",
    });

    await api.agentOffline({ daemonSessionId: "one" });
  });

  test("online → offline → online again", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    expect((await api.agentOnline({ daemonSessionId: "t-1", agentName: "t" })).status).toBe(200);
    expect((await api.agentOffline({ daemonSessionId: "t-1" })).status).toBe(200);
    expect((await api.agentOnline({ daemonSessionId: "t-2", agentName: "t2" })).status).toBe(200);

    // Cleanup
    await api.agentOffline({ daemonSessionId: "t-2" });
  });
});
