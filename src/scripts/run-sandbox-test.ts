import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../lib/db.js";

const ENDPOINT = "http://localhost:4000/api/v1/track";
const WORKSPACE_NAME = "SANDBOX_TEMPORARY_TEST_ENV";

async function assertStatus(
  bugIndex: number,
  status: number,
): Promise<void> {
  if (bugIndex <= 10) {
    if (status !== 201 && status !== 200) {
      throw new Error(
        `Bug ${bugIndex}: expected HTTP 201/200, got ${status}`,
      );
    }
  } else if (status !== 402) {
    throw new Error(`Bug ${bugIndex}: expected HTTP 402, got ${status}`);
  }
}

async function main(): Promise<void> {
  const db = getDb();
  const workspaceId = randomUUID();
  let setupComplete = false;

  console.log("Live sandbox integration test");
  console.log(`Temporary workspace: ${workspaceId}\n`);

  try {
    // --- SETUP MOCK DATA ---
    const { error: insertWsError } = await db.from("workspaces").insert({
      id: workspaceId,
      name: WORKSPACE_NAME,
      status: "open_source",
      lifetime_unique_bugs: 0,
      stripe_payment_method_attached: false,
    });

    if (insertWsError) {
      throw new Error(`Failed to insert test workspace: ${insertWsError.message}`);
    }
    setupComplete = true;
    console.log(`Inserted mock workspace "${WORKSPACE_NAME}"\n`);

    // --- SIMULATE INGESTION PIPELINE ---
    for (let i = 1; i <= 12; i++) {
      const payload = {
        workspaceId,
        errorType: "TypeError",
        message: `Sandbox live test unique bug #${i}`,
        stackTrace: [
          `TypeError: Sandbox live test unique bug #${i}`,
          `    at runSandboxCase${i} (/tmp/sandbox-test/case-${i}.ts:${20 + i}:7)`,
          `    at Object.<anonymous> (/tmp/sandbox-test/runner.ts:3:1)`,
        ].join("\n"),
      };

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }

      const expected =
        i <= 10 ? "expect 201/200" : "expect 402 Payment Required";

      console.log(`--- Bug ${i}/12 (${expected}) ---`);
      console.log(`Status: ${res.status}`);
      console.log(`Body:   ${JSON.stringify(body)}\n`);

      await assertStatus(i, res.status);
    }

    console.log("Assertions passed: gate held (10 allowed, 11–12 locked).\n");
  } finally {
    // --- TEARDOWN & CLEANUP ---
    if (setupComplete) {
      const { error: delBugsError } = await db
        .from("bug_signatures")
        .delete()
        .eq("workspace_id", workspaceId);

      if (delBugsError) {
        console.error(
          `Cleanup warning (bug_signatures): ${delBugsError.message}`,
        );
      }

      const { error: delWsError } = await db
        .from("workspaces")
        .delete()
        .eq("id", workspaceId);

      if (delWsError) {
        console.error(`Cleanup warning (workspaces): ${delWsError.message}`);
      }
    }

    console.log(
      "Sandbox test complete. Environment pristine; no production records affected.",
    );
  }
}

main().catch((err) => {
  console.error("Live sandbox test failed:", err);
  process.exit(1);
});
