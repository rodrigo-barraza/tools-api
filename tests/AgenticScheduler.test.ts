import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import {
  agenticScheduleCreate,
  agenticScheduleList,
  agenticScheduleDelete,
  agenticTriggerFire,
} from "../src/services/AgenticSchedulerService.ts";

describe("AgenticSchedulerService — Unit Tests", () => {
  it("agenticScheduleCreate successfully posts task data to Prism", async () => {
    const mockCreatedTask = { id: "task-123", name: "Daily Audit" };
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockCreatedTask,
    } as Response);

    const result = await agenticScheduleCreate({
      project: "finance-agent",
      name: "Daily Audit",
      prompt: "Analyze latest transactions",
      type: "once",
    });

    expect(fetchSpy).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.schedule).toEqual(mockCreatedTask);

    fetchSpy.mockRestore();
  });

  it("agenticScheduleCreate returns validation error if project is missing", async () => {
    const result = await agenticScheduleCreate({
      name: "Daily Audit",
      prompt: "Analyze latest transactions",
    });
    expect(result.error).toContain("'project' is required");
  });

  it("agenticScheduleCreate returns validation error if name is missing", async () => {
    const result = await agenticScheduleCreate({
      project: "finance-agent",
      prompt: "Analyze latest transactions",
    });
    expect(result.error).toContain("'name' is required");
  });

  it("agenticScheduleCreate returns validation error if prompt is missing", async () => {
    const result = await agenticScheduleCreate({
      project: "finance-agent",
      name: "Daily Audit",
    });
    expect(result.error).toContain("'prompt' is required");
  });

  it("agenticScheduleList successfully fetches list of scheduled tasks", async () => {
    const mockTasksList = [
      { id: "task-1", name: "Task 1" },
      { id: "task-2", name: "Task 2" },
    ];
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockTasksList,
    } as Response);

    const result = await agenticScheduleList("finance-agent");

    expect(fetchSpy).toHaveBeenCalled();
    expect(result.total).toBe(2);
    expect(result.schedules).toEqual(mockTasksList);

    fetchSpy.mockRestore();
  });

  it("agenticScheduleList returns validation error if project is missing", async () => {
    const result = await agenticScheduleList("");
    expect(result.error).toContain("'project' is required");
  });

  it("agenticScheduleDelete successfully sends DELETE to Prism", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const result = await agenticScheduleDelete("finance-agent", "task-123");

    expect(fetchSpy).toHaveBeenCalled();
    expect(result.deleted).toBe(true);
    expect(result.scheduleId).toBe("task-123");

    fetchSpy.mockRestore();
  });

  it("agenticScheduleDelete returns validation error if inputs are missing", async () => {
    const result = await agenticScheduleDelete("", "task-123");
    expect(result.error).toContain("'project' is required");

    const result2 = await agenticScheduleDelete("finance-agent", "");
    expect(result2.error).toContain("'scheduleId' is required");
  });

  it("agenticTriggerFire successfully triggers a task", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ fired: true }),
    } as Response);

    const result = await agenticTriggerFire("finance-agent", "custom-trigger", {
      data: 42,
    });

    expect(fetchSpy).toHaveBeenCalled();
    expect(result.fired).toBe(true);
    expect(result.trigger).toBe("custom-trigger");

    fetchSpy.mockRestore();
  });

  it("agenticTriggerFire returns validation error if inputs are missing", async () => {
    const result = await agenticTriggerFire("", "custom-trigger");
    expect(result.error).toContain("'project' is required");

    const result2 = await agenticTriggerFire("finance-agent", "");
    expect(result2.error).toContain("'triggerName' is required");
  });
});

describe("AgenticScheduler — Route Integration Tests", () => {
  let expressApp: any;

  beforeAll(async () => {
    const { default: router } = await import("../src/routes/AgenticRoutes.ts");
    expressApp = createTestApp("/agentic", router);
  });

  it("POST /agentic/scheduled-task/create creates schedule", async () => {
    const mockCreatedTask = { id: "task-999" };
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockCreatedTask,
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/scheduled-task/create")
      .send({
        project: "test-proj",
        name: "test-task",
        prompt: "do a test",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.schedule).toEqual(mockCreatedTask);

    fetchSpy.mockRestore();
  });

  it("POST /agentic/scheduled-task/list returns list of scheduled tasks", async () => {
    const mockTasksList = [{ id: "task-999", name: "test-task" }];
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockTasksList,
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/scheduled-task/list")
      .send({
        project: "test-proj",
      });

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.schedules).toEqual(mockTasksList);

    fetchSpy.mockRestore();
  });

  it("POST /agentic/scheduled-task/delete deletes task", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/scheduled-task/delete")
      .send({
        project: "test-proj",
        scheduleId: "task-999",
      });

    expect(response.status).toBe(200);
    expect(response.body.deleted).toBe(true);

    fetchSpy.mockRestore();
  });

  it("POST /agentic/scheduled-task/trigger fires trigger", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ fired: true }),
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/scheduled-task/trigger")
      .send({
        project: "test-proj",
        triggerName: "trigger-999",
        payload: { test: true },
      });

    expect(response.status).toBe(200);
    expect(response.body.fired).toBe(true);

    fetchSpy.mockRestore();
  });

  it("POST /agentic/schedule/create invokes create alias", async () => {
    const mockCreatedTask = { id: "task-888" };
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockCreatedTask,
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/schedule/create")
      .send({
        project: "test-proj",
        name: "test-task-legacy",
        prompt: "do a legacy test",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.schedule).toEqual(mockCreatedTask);

    fetchSpy.mockRestore();
  });

  it("POST /agentic/schedule/list invokes list alias", async () => {
    const mockTasksList = [{ id: "task-888", name: "test-task-legacy" }];
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockTasksList,
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/schedule/list")
      .send({
        project: "test-proj",
      });

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.schedules).toEqual(mockTasksList);

    fetchSpy.mockRestore();
  });

  it("POST /agentic/schedule/delete invokes delete alias", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/schedule/delete")
      .send({
        project: "test-proj",
        scheduleId: "task-888",
      });

    expect(response.status).toBe(200);
    expect(response.body.deleted).toBe(true);

    fetchSpy.mockRestore();
  });

  it("POST /agentic/trigger/fire invokes trigger fire alias", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ fired: true }),
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/trigger/fire")
      .send({
        project: "test-proj",
        triggerName: "trigger-888",
        payload: { test: true },
      });

    expect(response.status).toBe(200);
    expect(response.body.fired).toBe(true);

    fetchSpy.mockRestore();
  });
});

// ─── Username Forwarding — Unit Tests ─────────────────────────────────────────
// Verifies that the proxy functions forward the real username to Prism's
// x-username header instead of hardcoding "system". This was the root cause
// of cron job sessions being invisible in /chat.

describe("AgenticSchedulerService — Username Forwarding", () => {
  it("agenticScheduleCreate forwards explicit username in x-username header", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "task-forwarded" }),
    } as Response);

    await agenticScheduleCreate(
      { project: "test-proj", name: "Test Task", prompt: "do something", type: "once" },
      "rodrigo",
    );

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("rodrigo");

    fetchSpy.mockRestore();
  });

  it("agenticScheduleCreate falls back to 'system' when username is omitted", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "task-fallback" }),
    } as Response);

    await agenticScheduleCreate({
      project: "test-proj",
      name: "Fallback Task",
      prompt: "fallback test",
      type: "once",
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("system");

    fetchSpy.mockRestore();
  });

  it("agenticScheduleList forwards explicit username in x-username header", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    await agenticScheduleList("test-proj", undefined, "rodrigo");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("rodrigo");

    fetchSpy.mockRestore();
  });

  it("agenticScheduleList falls back to 'system' when username is omitted", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    await agenticScheduleList("test-proj");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("system");

    fetchSpy.mockRestore();
  });

  it("agenticScheduleDelete forwards explicit username in x-username header", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    await agenticScheduleDelete("test-proj", "task-123", "rodrigo");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("rodrigo");

    fetchSpy.mockRestore();
  });

  it("agenticScheduleDelete falls back to 'system' when username is omitted", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    await agenticScheduleDelete("test-proj", "task-123");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("system");

    fetchSpy.mockRestore();
  });

  it("agenticTriggerFire forwards explicit username in x-username header", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ fired: true }),
    } as Response);

    await agenticTriggerFire("test-proj", "my-trigger", {}, "rodrigo");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("rodrigo");

    fetchSpy.mockRestore();
  });

  it("agenticTriggerFire falls back to 'system' when username is omitted", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ fired: true }),
    } as Response);

    await agenticTriggerFire("test-proj", "my-trigger", {});

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("system");

    fetchSpy.mockRestore();
  });
});

// ─── Username Forwarding — Route Integration Tests ────────────────────────────
// Verifies the full chain: x-username header on the incoming request flows
// through the route handler into the proxy function and onto the outbound
// HTTP call to prism-service.

describe("AgenticScheduler Routes — Username Forwarding", () => {
  let expressApp: any;

  beforeAll(async () => {
    const { default: router } = await import("../src/routes/AgenticRoutes.ts");
    expressApp = createTestApp("/agentic", router);
  });

  it("POST /agentic/scheduled-task/create forwards x-username header to Prism", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "task-user-test" }),
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/scheduled-task/create")
      .set("x-username", "rodrigo")
      .send({ project: "test-proj", name: "User Task", prompt: "test prompt" });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("rodrigo");

    fetchSpy.mockRestore();
  });

  it("POST /agentic/scheduled-task/create falls back to 'system' without x-username", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "task-no-user" }),
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/scheduled-task/create")
      .send({ project: "test-proj", name: "No User Task", prompt: "test" });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("system");

    fetchSpy.mockRestore();
  });

  it("POST /agentic/scheduled-task/list forwards x-username header to Prism", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/scheduled-task/list")
      .set("x-username", "rodrigo")
      .send({ project: "test-proj" });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("rodrigo");

    fetchSpy.mockRestore();
  });

  it("POST /agentic/scheduled-task/delete forwards x-username header to Prism", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/scheduled-task/delete")
      .set("x-username", "rodrigo")
      .send({ project: "test-proj", scheduleId: "task-123" });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("rodrigo");

    fetchSpy.mockRestore();
  });

  it("POST /agentic/scheduled-task/trigger forwards x-username header to Prism", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ fired: true }),
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/scheduled-task/trigger")
      .set("x-username", "rodrigo")
      .send({ project: "test-proj", triggerName: "my-trigger" });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("rodrigo");

    fetchSpy.mockRestore();
  });

  it("POST /agentic/schedule/create (legacy) forwards x-username header to Prism", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "legacy-task" }),
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/schedule/create")
      .set("x-username", "rodrigo")
      .send({ project: "test-proj", name: "Legacy Task", prompt: "legacy" });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("rodrigo");

    fetchSpy.mockRestore();
  });

  it("POST /agentic/schedule/list (legacy) forwards x-username header to Prism", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/schedule/list")
      .set("x-username", "rodrigo")
      .send({ project: "test-proj" });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("rodrigo");

    fetchSpy.mockRestore();
  });

  it("POST /agentic/schedule/delete (legacy) forwards x-username header to Prism", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/schedule/delete")
      .set("x-username", "rodrigo")
      .send({ project: "test-proj", scheduleId: "task-legacy" });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("rodrigo");

    fetchSpy.mockRestore();
  });

  it("POST /agentic/trigger/fire (legacy) forwards x-username header to Prism", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ fired: true }),
    } as Response);

    const response = await request(expressApp)
      .post("/agentic/trigger/fire")
      .set("x-username", "rodrigo")
      .send({ project: "test-proj", triggerName: "legacy-trigger" });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchOptions] = fetchSpy.mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-username"]).toBe("rodrigo");

    fetchSpy.mockRestore();
  });
});
