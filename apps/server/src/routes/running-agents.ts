/**
 * Running Agents routes - HTTP API for tracking active agent executions
 */

import { Router, type Request, type Response } from "express";
import type { AutoModeService } from "../services/auto-mode-service.js";

export function createRunningAgentsRoutes(autoModeService: AutoModeService): Router {
  const router = Router();

  // Get all running agents
  router.get("/", async (_req: Request, res: Response) => {
    try {
      const runningAgents = autoModeService.getRunningAgents();
      const status = autoModeService.getStatus();

      res.json({
        success: true,
        runningAgents,
        totalCount: runningAgents.length,
        autoLoopRunning: status.autoLoopRunning,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
