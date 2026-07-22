import { Router, type Request, type Response } from "express";
import { getDb } from "../lib/db.js";
import { generateFingerprint } from "../lib/fingerprint.js";

const SANDBOX_LIMIT = 10;
const ALLOWED_STATUSES = new Set(["sandbox", "open_source"]);

interface TrackBody {
  workspaceId: string;
  errorType: string;
  message: string;
  stackTrace: string;
}

function isTrackBody(body: unknown): body is TrackBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.workspaceId === "string" &&
    b.workspaceId.length > 0 &&
    typeof b.errorType === "string" &&
    typeof b.message === "string" &&
    typeof b.stackTrace === "string"
  );
}

const router = Router();

/** POST /api/v1/track — ingest errors under Open Source sandbox privacy boundaries. */
router.post("/api/v1/track", async (req: Request, res: Response) => {
  try {
    if (!isTrackBody(req.body)) {
      res.status(400).json({
        error:
          "Invalid body. Required: { workspaceId, errorType, message, stackTrace }",
      });
      return;
    }

    const { workspaceId, errorType, message, stackTrace } = req.body;
    const db = getDb();

    // 1. Workspace must exist and be a trackable sandbox / OSS tenant
    const { data: workspace, error: workspaceError } = await db
      .from("workspaces")
      .select("id, status, lifetime_unique_bugs, stripe_payment_method_attached")
      .eq("id", workspaceId)
      .maybeSingle();

    if (workspaceError) {
      res.status(500).json({ error: workspaceError.message });
      return;
    }

    if (!workspace) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    if (!ALLOWED_STATUSES.has(String(workspace.status))) {
      res.status(403).json({ error: "Workspace is not eligible for error tracking" });
      return;
    }

    // 2. Fingerprint + sandbox rule
    const fingerprint = generateFingerprint(errorType, stackTrace);
    const now = new Date().toISOString();

    const { data: existing, error: lookupError } = await db
      .from("bug_signatures")
      .select("id, total_occurrences")
      .eq("workspace_id", workspaceId)
      .eq("signature_hash", fingerprint)
      .maybeSingle();

    if (lookupError) {
      res.status(500).json({ error: lookupError.message });
      return;
    }

    // Known signature: allow through, increment only
    if (existing) {
      const { error: updateError } = await db
        .from("bug_signatures")
        .update({
          total_occurrences: (existing.total_occurrences ?? 0) + 1,
          last_seen_at: now,
        })
        .eq("id", existing.id);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      res.status(200).json({
        status: "logged",
        duplicate: true,
        fingerprint,
      });
      return;
    }

    // Brand-new signature: enforce sandbox (no DB writes on lock)
    const lifetimeUniqueBugs = workspace.lifetime_unique_bugs ?? 0;
    const cardAttached = workspace.stripe_payment_method_attached === true;

    if (lifetimeUniqueBugs >= SANDBOX_LIMIT && !cardAttached) {
      res.status(402).json({
        error:
          "Sandbox limit reached (10 bugs). Please attach a payment method to log new signatures.",
        locked: true,
      });
      return;
    }

    const sandboxUsed = lifetimeUniqueBugs + 1;

    const { error: insertError } = await db.from("bug_signatures").insert({
      workspace_id: workspaceId,
      signature_hash: fingerprint,
      error_type: errorType,
      message,
      stack_trace: stackTrace,
      total_occurrences: 1,
      first_seen_at: now,
      last_seen_at: now,
    });

    if (insertError) {
      res.status(500).json({ error: insertError.message });
      return;
    }

    const { error: counterError } = await db
      .from("workspaces")
      .update({ lifetime_unique_bugs: sandboxUsed })
      .eq("id", workspaceId);

    if (counterError) {
      res.status(500).json({ error: counterError.message });
      return;
    }

    res.status(201).json({
      status: "created",
      duplicate: false,
      fingerprint,
      sandboxUsed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected server error";
    res.status(500).json({ error: msg });
  }
});

export default router;
