import re

file_path = "/home/rodrigo/development/tools-service/src/routes/ComputeRoutes.ts"
with open(file_path, "r") as f:
    content = f.read()

# Dynamic imports
content = content.replace("lazyImport<typeof import(\"date-fns\")>(\"date-fns\", (m: any) => m as typeof import(\"date-fns\"));", "lazyImport<typeof import(\"date-fns\")>(\"date-fns\", (m: unknown) => m as typeof import(\"date-fns\"));")
content = content.replace("lazyImport<typeof import(\"date-fns-tz\")>(\"date-fns-tz\", (m: any) => m as typeof import(\"date-fns-tz\"));", "lazyImport<typeof import(\"date-fns-tz\")>(\"date-fns-tz\", (m: unknown) => m as typeof import(\"date-fns-tz\"));")
content = content.replace("lazyImport<typeof import(\"jsonpath-plus\").JSONPath>(\"jsonpath-plus\", (m: any) => (m as { JSONPath: typeof import(\"jsonpath-plus\").JSONPath }).JSONPath);", "lazyImport<typeof import(\"jsonpath-plus\").JSONPath>(\"jsonpath-plus\", (m: unknown) => (m as { JSONPath: typeof import(\"jsonpath-plus\").JSONPath }).JSONPath);")
# Wait, let's just do simple regex replacements
content = re.sub(r"\(m: any\)", "(m: unknown)", content)

content = content.replace("Record<string, any>", "Record<string, unknown>")

content = content.replace("let result: any;", "let result: unknown;")

content = content.replace(".map((x: any)", ".map((x: unknown)")
content = content.replace("sort((a: any, b: any)", "sort((a: Record<string, unknown> | number | string, b: Record<string, unknown> | number | string)")

content = content.replace(".filter((item: any)", ".filter((item: Record<string, unknown>)")
content = content.replace(".map((item: any)", ".map((item: Record<string, unknown>)")

content = content.replace("let hash: any;", "let hash: string | Buffer;")
content = content.replace(".filter((h: any)", ".filter((h: string)")

content = content.replace("const matches: any[] = [];", "const matches: Record<string, unknown>[] = [];")
content = content.replace("let match: any;", "let match: RegExpExecArray | null;")

content = content.replace("(_: any, hex: any)", "(_: string, hex: string)")
content = content.replace("(_: any, dec: any)", "(_: string, dec: string)")
content = content.replace("(c: any) => {", "(c: string) => {")
content = content.replace(".map((b: any)", ".map((b: string)")
content = content.replace(".map((c: any)", ".map((c: string)")

content = content.replace("buildTurtleEmbedHtml(commands: any, options: Record<string, unknown> = {})", "buildTurtleEmbedHtml(commands: string[], options: Record<string, unknown> = {})")

content = content.replace("parseCronField(field: any, { min, max }: any)", "parseCronField(field: string, { min, max }: { min: number, max: number })")
content = content.replace(".sort((a: any, b: any) => a - b)", ".sort((a: number, b: number) => a - b)")

content = content.replace("explainCronField(values: any, fieldIdx: any)", "explainCronField(values: number[], fieldIdx: number)")
content = content.replace(".map((v: any, i: any) => v - values[i])", ".map((v: number, i: number) => v - values[i])")
content = content.replace(".every((d: any)", ".every((d: number)")
content = content.replace(".map((v: any) => MONTH_NAMES[v])", ".map((v: number) => MONTH_NAMES[v])")
content = content.replace(".map((v: any) => DAY_NAMES[v])", ".map((v: number) => DAY_NAMES[v])")

content = content.replace("getNextCronExecutions(parsed: any, count: any, fromDate: any)", "getNextCronExecutions(parsed: number[][], count: number, fromDate: Date)")
content = content.replace("const results: any[] = [];", "const results: Date[] = [];")

content = content.replace(".map((f: any, i: any)", ".map((f: string, i: number)")
content = content.replace(".map((vals: any, i: any)", ".map((vals: number[], i: number)")
content = content.replace(".filter((e: any)", ".filter((e: string)")
content = content.replace(".map((name: any, i: any)", ".map((name: string, i: number)")
content = content.replace(".map((d: any)", ".map((d: Date)")
content = content.replace("new Promise<void>((resolve: any)", "new Promise<void>((resolve: () => void)")

content = content.replace("validateJsonSchema(data: any, schema: any, path: any = \"\", errors: any = [])", "validateJsonSchema(data: unknown, schema: Record<string, unknown>, path: string = \"\", errors: string[] = [])")

content = content.replace("const validationErrors: any[] = [];", "const validationErrors: string[] = [];")
content = content.replace("const result: any = await processImage", "const result = await processImage")

content = content.replace("reduce((acc: any, item: any)", "reduce((acc: number, item: Record<string, unknown>)")

with open(file_path, "w") as f:
    f.write(content)
