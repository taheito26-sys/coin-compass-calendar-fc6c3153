import { Hono } from "hono";
import type { Env } from "./types";
import { corsMiddleware } from "./middleware/cors";
import assetsRoute from "./routes/assets";
import pricesRoute from "./routes/prices";
import marketDataRoute from "./routes/market-data";
import transactionsRoute from "./routes/transactions";
import trackingRoute from "./routes/tracking";
import importedFilesRoute from "./routes/imported-files";
import preferencesRoute from "./routes/preferences";
import importRoute from "./routes/import";
import { pollPrices } from "./cron/poll-prices";

const app = new Hono<{ Bindings: Env }>();

// Global CORS
app.use("*", corsMiddleware);

// Routes
app.route("/api/assets", assetsRoute);
app.route("/api/prices", pricesRoute);
app.route("/api/market-data", marketDataRoute);
app.route("/api/transactions", transactionsRoute);
app.route("/api/tracking-preferences", trackingRoute);
app.route("/api/imported-files", importedFilesRoute);
app.route("/api/preferences", preferencesRoute);
app.route("/api/import", importRoute);

// Health check
app.get("/api/status", async (c) => {
  const raw = await c.env.PRICE_KV.get("prices:latest");
  const latest = raw ? JSON.parse(raw) : null;
  return c.json({
    ok: !!latest,
    lastUpdate: latest?.ts || null,
    ageMs: latest ? Date.now() - latest.ts : null,
  });
});

// 404
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      pollPrices(env).catch((err) => console.error("[cryptotracker] price poll failed:", err.message)),
    );
  },
};
