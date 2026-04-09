import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { clearAll, seedUser } from "../fixtures/convex";

test.beforeEach(() => {
  clearAll();
});

test.describe("Tunnel lifecycle via HTTP API", () => {
  test("register tunnel returns token", async () => {
    const user = seedUser("Tunnel User");
    const api = new ApiClient({ user });
    const sessionId = "tunnel-session-1";

    await api.agentOnline({ daemonSessionId: sessionId, agentName: "tunnel-agent" });

    const res = await api.registerTunnel({ daemonSessionId: sessionId });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);

    await api.agentOffline({ daemonSessionId: sessionId });
  });

  test("register tunnel fails when host is not online", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    const res = await api.registerTunnel({ daemonSessionId: "no-host" });
    expect(res.status).toBe(409);
  });

  test("validate token succeeds for active tunnel", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });
    const sessionId = "validate-session";

    await api.agentOnline({ daemonSessionId: sessionId, agentName: "v-agent" });
    const { token } = await (await api.registerTunnel({ daemonSessionId: sessionId })).json();

    const res = await api.validateTunnelToken(token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBeTruthy();
    expect(body.hostId).toBeTruthy();

    await api.agentOffline({ daemonSessionId: sessionId });
  });

  test("validate token fails for unknown token", async () => {
    const res = await new ApiClient().validateTunnelToken("nonexistent-token");
    expect(res.status).toBe(401);
  });

  test("validate-daemon returns hostId", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });
    const sessionId = "daemon-validate-session";

    await api.agentOnline({ daemonSessionId: sessionId, agentName: "dv-agent" });

    const res = await api.validateDaemon(sessionId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBeTruthy();
    expect(body.apiKeyId).toBeTruthy();
    expect(body.hostId).toBeTruthy();

    await api.agentOffline({ daemonSessionId: sessionId });
  });

  test("validate-daemon fails when not online", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });

    const res = await api.validateDaemon("not-online-session");
    expect(res.status).toBe(409);
  });

  test("close tunnel succeeds", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });
    const sessionId = "close-session";

    await api.agentOnline({ daemonSessionId: sessionId, agentName: "close-agent" });
    const { token } = await (await api.registerTunnel({ daemonSessionId: sessionId })).json();

    const closeRes = await api.closeTunnel({ daemonSessionId: sessionId });
    expect(closeRes.status).toBe(200);

    const validateRes = await api.validateTunnelToken(token);
    expect(validateRes.status).toBe(401);

    await api.agentOffline({ daemonSessionId: sessionId });
  });

  test("close tunnel is idempotent", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });
    const sessionId = "idempotent-session";

    await api.agentOnline({ daemonSessionId: sessionId, agentName: "idem-agent" });
    await api.registerTunnel({ daemonSessionId: sessionId });

    expect((await api.closeTunnel({ daemonSessionId: sessionId })).status).toBe(200);
    expect((await api.closeTunnel({ daemonSessionId: sessionId })).status).toBe(200);

    await api.agentOffline({ daemonSessionId: sessionId });
  });

  test("registering a new tunnel invalidates the previous one", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });
    const sessionId = "replace-session";

    await api.agentOnline({ daemonSessionId: sessionId, agentName: "replace-agent" });

    const { token: token1 } = await (
      await api.registerTunnel({ daemonSessionId: sessionId })
    ).json();
    const { token: token2 } = await (
      await api.registerTunnel({ daemonSessionId: sessionId })
    ).json();

    expect(token1).not.toBe(token2);

    const res1 = await api.validateTunnelToken(token1);
    expect(res1.status).toBe(401);

    const res2 = await api.validateTunnelToken(token2);
    expect(res2.status).toBe(200);

    await api.agentOffline({ daemonSessionId: sessionId });
  });

  test("validate-daemon and validate-token resolve to same hostId", async () => {
    const user = seedUser();
    const api = new ApiClient({ user });
    const sessionId = "routing-session";

    await api.agentOnline({ daemonSessionId: sessionId, agentName: "routing-agent" });
    const { token } = await (await api.registerTunnel({ daemonSessionId: sessionId })).json();

    const daemonRes = await (await api.validateDaemon(sessionId)).json();
    const tokenRes = await (await api.validateTunnelToken(token)).json();

    expect(daemonRes.hostId).toBe(tokenRes.hostId);

    await api.agentOffline({ daemonSessionId: sessionId });
  });
});
