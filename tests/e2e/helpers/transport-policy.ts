const PROXY_URL = "http://localhost:3212";

export async function setTransportPolicy(policy: "relay" | "all"): Promise<void> {
  const res = await fetch(`${PROXY_URL}/admin/transport-policy`, {
    method: "PUT",
    body: policy,
  });
  if (!res.ok) throw new Error(`Failed to set transport policy: ${await res.text()}`);
}
