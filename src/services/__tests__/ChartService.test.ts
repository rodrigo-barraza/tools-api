import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderChartPng,
  storeChart,
  getStoredChart,
} from "../ChartService.ts";
import type { ChartConfig } from "../../types/chart.ts";

// ═══════════════════════════════════════════════════════════════
//  renderChartPng — PNG Generation
// ═══════════════════════════════════════════════════════════════

describe("renderChartPng", () => {
  it("renders a bar chart to a PNG buffer", async () => {
    const chartConfig: ChartConfig = {
      type: "bar",
      title: "Monthly Revenue",
      labels: ["Jan", "Feb", "Mar", "Apr"],
      datasets: [
        {
          label: "Revenue",
          data: [1200, 1900, 3000, 2500],
        },
      ],
    };

    const pngBuffer = await renderChartPng(chartConfig);
    expect(pngBuffer).toBeInstanceOf(Buffer);
    expect(pngBuffer.length).toBeGreaterThan(1000);
    // Verify PNG magic bytes
    expect(pngBuffer[0]).toBe(0x89);
    expect(pngBuffer[1]).toBe(0x50); // P
    expect(pngBuffer[2]).toBe(0x4e); // N
    expect(pngBuffer[3]).toBe(0x47); // G
  });

  it("renders a line chart with multiple datasets", async () => {
    const chartConfig: ChartConfig = {
      type: "line",
      title: "Temperature Comparison",
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      datasets: [
        { label: "City A", data: [20, 22, 19, 25, 23] },
        { label: "City B", data: [15, 17, 14, 20, 18] },
      ],
    };

    const pngBuffer = await renderChartPng(chartConfig);
    expect(pngBuffer).toBeInstanceOf(Buffer);
    expect(pngBuffer.length).toBeGreaterThan(1000);
  });

  it("renders a pie chart", async () => {
    const chartConfig: ChartConfig = {
      type: "pie",
      title: "Market Share",
      labels: ["Chrome", "Firefox", "Safari", "Edge"],
      datasets: [
        {
          label: "Share",
          data: [65, 12, 18, 5],
        },
      ],
    };

    const pngBuffer = await renderChartPng(chartConfig);
    expect(pngBuffer).toBeInstanceOf(Buffer);
    expect(pngBuffer.length).toBeGreaterThan(1000);
  });

  it("renders a chart without title", async () => {
    const chartConfig: ChartConfig = {
      type: "bar",
      labels: ["A", "B", "C"],
      datasets: [{ label: "Values", data: [10, 20, 30] }],
    };

    const pngBuffer = await renderChartPng(chartConfig);
    expect(pngBuffer).toBeInstanceOf(Buffer);
    expect(pngBuffer.length).toBeGreaterThan(500);
  });

  it("respects custom colors on datasets", async () => {
    const chartConfig: ChartConfig = {
      type: "bar",
      labels: ["X", "Y"],
      datasets: [
        {
          label: "Custom",
          data: [5, 10],
          backgroundColor: "rgba(255, 0, 0, 0.5)",
          borderColor: "rgba(255, 0, 0, 1)",
        },
      ],
    };

    const pngBuffer = await renderChartPng(chartConfig);
    expect(pngBuffer).toBeInstanceOf(Buffer);
    expect(pngBuffer.length).toBeGreaterThan(500);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Chart Store — Ephemeral Persistence
// ═══════════════════════════════════════════════════════════════

describe("storeChart / getStoredChart", () => {
  it("stores a chart config and retrieves it by ID", async () => {
    const chartConfig: ChartConfig = {
      type: "bar",
      labels: ["A", "B"],
      datasets: [{ label: "Test", data: [1, 2] }],
    };

    const chartId = storeChart(chartConfig);
    expect(typeof chartId).toBe("string");
    expect(chartId.length).toBeGreaterThan(0);

    const retrieved = await getStoredChart(chartId);
    expect(retrieved).toBeTruthy();
    expect(retrieved!.type).toBe("bar");
    expect(retrieved!.datasets[0].data).toEqual([1, 2]);
  });

  it("returns null for nonexistent chart ID", async () => {
    const retrieved = await getStoredChart("nonexistent-id-xyz");
    expect(retrieved).toBeNull();
  });
});
