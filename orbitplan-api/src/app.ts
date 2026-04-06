import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { prisma } from "./lib/prisma.js";
import { requireAuth } from "./middleware/auth.js";
import authRouter from "./routes/auth.js";
import integrationsRouter from "./routes/integrations.js";
import meetingsRouter from "./routes/meetings.js";
import { env } from "./config/env.js";

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("tiny"));

  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: "ok", database: "up" });
    } catch (error) {
      res.status(503).json({
        status: "degraded",
        database: "down",
        error: error instanceof Error ? error.message : "Database unavailable",
      });
    }
  });

  app.use("/api", authRouter);
  app.use("/api", integrationsRouter);
  app.use("/api", requireAuth, meetingsRouter);

  return app;
};
