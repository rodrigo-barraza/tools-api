#!/usr/bin/env python3
"""
Fix TS2339 errors caused by narrow object literal types.

Reads tsc output, identifies lines where properties are assigned to
objects that TypeScript inferred with a narrow type, and adds
Record<string, any> annotations.
"""
import re
import subprocess
import sys
from collections import defaultdict

# Run tsc and collect errors
result = subprocess.run(
    ["npx", "tsc", "--noEmit"],
    capture_output=True, text=True, cwd="/home/rodrigo/development/tools-service"
)

# Parse TS2339 errors: Property 'X' does not exist on type 'Y'.
errors = defaultdict(list)
for line in (result.stdout + result.stderr).splitlines():
    m = re.match(r"(.+)\((\d+),\d+\): error TS2339: Property '(\w+)' does not exist on type '(.+)'", line)
    if m:
        filepath, lineno, prop, on_type = m.groups()
        errors[filepath].append({
            "line": int(lineno),
            "prop": prop,
            "type": on_type,
        })

# For each file, find the object initialization and add Record<string, any>
fixes_applied = 0
for filepath, errs in sorted(errors.items()):
    try:
        with open(filepath, "r") as f:
            lines = f.readlines()
    except FileNotFoundError:
        continue

    # Group by error type to find common objects
    type_groups = defaultdict(list)
    for err in errs:
        type_groups[err["type"]].append(err)

    modified = False
    for err_type, err_list in type_groups.items():
        if err_type in ("{}", "unknown", "Router"):
            continue  # Already handled

        # Find the variable declaration that creates this narrow type
        # The error lines reference property access — we need to find
        # the `const x = { ... }` or `const x = { prop: val }` that TS
        # inferred with the narrow type.
        err_lines = sorted(set(e["line"] for e in err_list))
        first_err = min(err_lines)

        # Search backwards from the first error line for a `const/let X = {` pattern
        for i in range(first_err - 2, max(0, first_err - 30), -1):
            if i >= len(lines):
                continue
            line_content = lines[i]
            # Match: const/let varName = { or const/let varName: SomeType = {
            init_match = re.match(r'^(\s+)(const|let)\s+(\w+)\s*=\s*\{', line_content)
            if init_match and "Record<string, any>" not in line_content:
                indent, keyword, varname = init_match.groups()
                # Verify this variable is used in the error lines
                var_used = False
                for el in err_lines:
                    if el - 1 < len(lines):
                        if varname + "." in lines[el - 1]:
                            var_used = True
                            break
                if var_used:
                    # Add Record<string, any> type annotation
                    new_line = line_content.replace(
                        f"{keyword} {varname} = {{",
                        f"{keyword} {varname}: Record<string, any> = {{"
                    )
                    if new_line != line_content:
                        lines[i] = new_line
                        modified = True
                        fixes_applied += 1
                    break

    if modified:
        with open(filepath, "w") as f:
            f.writelines(lines)
        print(f"  Fixed: {filepath}")

print(f"\nTotal fixes applied: {fixes_applied}")
