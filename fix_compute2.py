import re

file_path = "/home/rodrigo/development/tools-service/src/routes/ComputeRoutes.ts"
with open(file_path, "r") as f:
    content = f.read()

# Fix m.JSONPath
content = content.replace("(m: unknown) => m.JSONPath", "(m: unknown) => (m as Record<string, unknown>).JSONPath")

# Fix result.inTimezone
content = content.replace("result.inTimezone", "(result as Record<string, unknown>).inTimezone")

# Fix ...result
content = content.replace("res.json({ operation, ...result });", "res.json({ operation, ...(result as Record<string, unknown>) });")

# Fix JSON.parse(x)
content = content.replace("try { return JSON.parse(x); } catch { return x; }", "try { return JSON.parse(x as string); } catch { return x; }")

# Fix a?.[key] and b?.[key] when a and b are Record<string, unknown> | number | string
content = content.replace("const va = key ? a?.[key] : a;", "const va = key ? (a as Record<string, unknown>)?.[key] : a;")
content = content.replace("const vb = key ? b?.[key] : b;", "const vb = key ? (b as Record<string, unknown>)?.[key] : b;")

# Fix value operators
content = content.replace("value > op.value;", "(value as number) > (op.value as number);")
content = content.replace("value >= op.value;", "(value as number) >= (op.value as number);")
content = content.replace("value < op.value;", "(value as number) < (op.value as number);")
content = content.replace("value <= op.value;", "(value as number) <= (op.value as number);")

# Fix groups push
content = content.replace("groups[k].push(item);", "(groups[k] as unknown[]).push(item);")

# Fix buildTurtleEmbedHtml
content = content.replace("entry.commands", "entry.commands as string[]")

# Fix a - b sort
content = content.replace("=> a - b);", "=> (a as number) - (b as number));")

# Fix schema comparisons
content = content.replace("data.length < schema.minLength", "(data as string).length < (schema.minLength as number)")
content = content.replace("schema.minLength !== undefined", "schema.minLength !== undefined")
content = content.replace("errors.push(`${at}: string length ${data.length} < minLength ${schema.minLength}`)", "errors.push(`${at}: string length ${(data as string).length} < minLength ${schema.minLength}`)")

content = content.replace("data.length > schema.maxLength", "(data as string).length > (schema.maxLength as number)")
content = content.replace("errors.push(`${at}: string length ${data.length} > maxLength ${schema.maxLength}`)", "errors.push(`${at}: string length ${(data as string).length} > maxLength ${schema.maxLength}`)")

content = content.replace("data < schema.minimum", "(data as number) < (schema.minimum as number)")
content = content.replace("data > schema.maximum", "(data as number) > (schema.maximum as number)")

# Fix validateJsonSchema data indexing
content = content.replace("data[key]", "(data as Record<string, unknown>)[key]")
content = content.replace("data[i]", "(data as unknown[])[i]")
content = content.replace("schema.items", "schema.items as Record<string, unknown>")

with open(file_path, "w") as f:
    f.write(content)
