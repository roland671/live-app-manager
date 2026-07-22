import "dotenv/config";

const ENDPOINT = "http://localhost:4000/api/v1/track";

/** Open Source test tenant — must exist in `workspaces` with status = 'open_source'. */
const TEST_WORKSPACE_ID =
  process.env.TEST_WORKSPACE_ID ?? "00000000-0000-4000-8000-000000000001";

async function main(): Promise<void> {
  console.log(`Gate test → ${ENDPOINT}`);
  console.log(`Workspace  → ${TEST_WORKSPACE_ID} (open_source)\n`);

  for (let i = 1; i <= 12; i++) {
    const payload = {
      workspaceId: TEST_WORKSPACE_ID,
      errorType: "TypeError",
      message: `Gate test unique bug #${i}`,
      stackTrace: [
        `TypeError: Gate test unique bug #${i}`,
        `    at simulateBug${i} (/app/src/demo/bug-${i}.ts:${10 + i}:1)`,
        `    at Object.<anonymous> (/app/src/demo/runner.ts:1:1)`,
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
      i <= 10 ? "expect 201 Created" : "expect 402 Payment Required";

    console.log(`--- Bug ${i}/12 (${expected}) ---`);
    console.log(`Status: ${res.status}`);
    console.log(`Body:   ${JSON.stringify(body, null, 2)}\n`);
  }

  console.log("Done. Bugs 1–10 should be 201; bugs 11–12 should be 402.");
}

main().catch((err) => {
  console.error("Gate test failed:", err);
  process.exit(1);
});
