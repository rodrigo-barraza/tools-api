import type { ToolParameterProperty } from "../../types/tools.ts";

export function cached(provider: string, intervalMs: number) {
  return {
    type: "cached" as const,
    provider,
    intervalSeconds: Math.round(intervalMs / 1000),
  };
}

export function onDemand(provider: string) {
  return { type: "onDemand" as const, provider };
}

export function staticDataset(name: string) {
  return { type: "static" as const, provider: "internal", dataset: name };
}

export function compute(name: string) {
  return { type: "compute" as const, provider: "internal", runtime: name };
}

export function fieldsParam(
  translate: (key: string, variables?: Record<string, string>) => string,
  fieldEnum: string[]
) {
  return {
    fields: {
      type: "string",
      description: translate("common.params.fields", { fields: fieldEnum.join(", ") }),
    },
  };
}
