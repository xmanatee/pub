import { expect, type Locator, type Page } from "@playwright/test";
import type { CliFixture } from "../fixtures/cli";

export async function retryWrite(
  fixture: CliFixture,
  message: string,
  maxAttempts = 10,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      fixture.write(message);
      return;
    } catch (e) {
      if (i === maxAttempts - 1 || !String(e).includes("not ready yet")) throw e;
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
}

export async function waitForConnection(page: Page) {
  const textbox = page.getByRole("textbox", { name: "Message" });
  const connectButton = page.getByRole("button", { name: "Connect agent" });
  const reconnectButton = page.getByRole("button", { name: "Reconnect" });
  const sendButton = page.getByLabel("Send message");
  const dismissButton = page.getByRole("button", { name: "Dismiss", exact: true });
  const statusButton = page.getByRole("button", { name: "Toggle control bar", exact: true });
  const switchHereButton = page.getByRole("button", { name: "Switch here" });
  const reclaimButton = page.getByRole("button", { name: /^Reclaim/ });
  const deadline = Date.now() + 90_000;
  const isVisible = async (locator: Locator) => locator.isVisible().catch(() => false);
  const isEnabled = async (locator: Locator) => locator.isEnabled().catch(() => false);

  // Wait for the control bar to appear (any recognizable element).
  // Use .first() to avoid strict-mode violations when multiple elements match.
  await expect(
    textbox
      .or(connectButton)
      .or(reconnectButton)
      .or(dismissButton)
      .or(statusButton)
      .or(switchHereButton)
      .or(reclaimButton)
      .first(),
  ).toBeVisible({ timeout: 60_000 });

  while (Date.now() < deadline) {
    // Dismiss fullscreen prompt if it covers the control bar.
    if (await isVisible(dismissButton)) {
      await dismissButton.dispatchEvent("click");
      await page.waitForTimeout(500);
      continue;
    }

    // Expand collapsed control bar.
    if (await isVisible(statusButton)) {
      if (!(await isVisible(textbox)) && !(await isVisible(connectButton))) {
        await statusButton.dispatchEvent("click");
        await page.waitForTimeout(500);
        continue;
      }
    }

    // Takeover: click "Switch here" or "Reclaim" to take over the connection.
    if (await isVisible(switchHereButton)) {
      await switchHereButton.click();
      await page.waitForTimeout(2_000);
      continue;
    }
    if (await isVisible(reclaimButton)) {
      if (await isEnabled(reclaimButton)) {
        await reclaimButton.click();
        await page.waitForTimeout(2_000);
      } else {
        await page.waitForTimeout(2_000);
      }
      continue;
    }

    if (await isVisible(connectButton)) {
      await expect(connectButton).toBeEnabled();
      await connectButton.dispatchEvent("click");
    }

    if (await isVisible(reconnectButton)) {
      await expect(reconnectButton).toBeEnabled();
      await reconnectButton.dispatchEvent("click");
    }

    if (await isVisible(textbox)) {
      await textbox.fill("_");
      if (!(await isVisible(sendButton)) || (await isEnabled(sendButton))) {
        await textbox.fill("");
        return;
      }
    }

    await page.waitForTimeout(1_000);
  }

  throw new Error(
    `Live connection did not become ready. textbox=${await isVisible(textbox)} connect=${await isVisible(connectButton)} reconnect=${await isVisible(reconnectButton)} send=${await isVisible(sendButton)}`,
  );
}

export async function sendChat(page: Page, text: string) {
  const textbox = page.getByRole("textbox", { name: "Message" });
  const sendButton = page.getByLabel("Send message");
  await expect(textbox).toBeVisible({ timeout: 60_000 });
  await textbox.fill(text);
  await expect(sendButton).toBeVisible({ timeout: 60_000 });
  await expect(sendButton).toBeEnabled({ timeout: 60_000 });
  await sendButton.dispatchEvent("click");
}

export const AUTO_INVOKE_HTML = `<!DOCTYPE html>
<html>
<head><title>Auto Command</title></head>
<body>
  <div id="auto-result">pending</div>
  <button id="run-cmd" onclick="runCommand()">Run</button>
  <div id="btn-result">waiting</div>
  <script type="application/pub-command-manifest+json">
  {
    "manifestId": "auto-cmd",
    "functions": [
      {
        "name": "cwd",
        "description": "Returns the current working directory",
        "returns": "text",
        "executor": { "kind": "shell", "script": "pwd" }
      }
    ]
  }
  </script>
  <script>
    pub.command('cwd', {}).then(function(r) {
      document.getElementById('auto-result').textContent = 'cwd: ' + r;
    }).catch(function(e) {
      document.getElementById('auto-result').textContent = 'error: ' + e.message;
    });
    function runCommand() {
      pub.command('cwd', {}).then(function(r) {
        document.getElementById('btn-result').textContent = 'btn: ' + r;
      }).catch(function(e) {
        document.getElementById('btn-result').textContent = 'error: ' + e.message;
      });
    }
  </script>
</body>
</html>`;

export const MULTI_AUTO_INVOKE_HTML = `<!DOCTYPE html>
<html>
<head><title>Multi Auto Command</title></head>
<body>
  <div id="result-a">pending-a</div>
  <div id="result-b">pending-b</div>
  <button id="run-cmd" onclick="runCommand()">Run</button>
  <div id="btn-result">waiting</div>
  <script type="application/pub-command-manifest+json">
  {
    "manifestId": "multi-cmd",
    "functions": [
      {
        "name": "cwd",
        "returns": "text",
        "executor": { "kind": "shell", "script": "pwd" }
      },
      {
        "name": "whoami",
        "returns": "text",
        "executor": { "kind": "shell", "script": "whoami" }
      }
    ]
  }
  </script>
  <script>
    pub.command('cwd', {}).then(function(r) {
      document.getElementById('result-a').textContent = 'cwd: ' + r;
    }).catch(function(e) {
      document.getElementById('result-a').textContent = 'error-a: ' + e.message;
    });
    pub.command('whoami', {}).then(function(r) {
      document.getElementById('result-b').textContent = 'user: ' + r;
    }).catch(function(e) {
      document.getElementById('result-b').textContent = 'error-b: ' + e.message;
    });
    function runCommand() {
      pub.command('cwd', {}).then(function(r) {
        document.getElementById('btn-result').textContent = 'btn: ' + r;
      }).catch(function(e) {
        document.getElementById('btn-result').textContent = 'error: ' + e.message;
      });
    }
  </script>
</body>
</html>`;
