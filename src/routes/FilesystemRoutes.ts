import { Request, Response, Router } from "express";
import { agenticGetDirectoryTree } from "../services/AgenticFileService.ts";
import { agenticHandler } from "../utilities.ts";

const router = Router();

router.get(
  "/list",
  agenticHandler(async (request: Request) => {
    const { path: directoryPath, depth } = request.query;
    if (!directoryPath || typeof directoryPath !== "string") {
      return { error: "Query parameter 'path' is required" };
    }
    const maxDepth = depth ? Math.min(parseInt(depth as string, 10), 5) : 2;
    return agenticGetDirectoryTree(directoryPath, maxDepth);
  }),
);

export default router;
