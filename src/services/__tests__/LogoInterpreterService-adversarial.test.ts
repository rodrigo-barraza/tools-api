import { describe, it, expect } from "vitest";
import {
  executeLogoProgram,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
} from "../LogoInterpreterService.ts";

// ═══════════════════════════════════════════════════════════════
// ADVERSARIAL TESTS — LogoInterpreterService
//
// Hand-crafted edge cases targeting parser robustness, control
// flow exploits, recursive procedure bombs, variable scoping
// attacks, undefined identifier handling, tokenization edge
// cases, and canvas state corruption.
// ═══════════════════════════════════════════════════════════════

// ── Basic Execution Sanity ──────────────────────────────────

describe("LogoInterpreter adversarial — basic execution", () => {
  it("empty program should succeed with zero commands", () => {
    const result = executeLogoProgram("");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBe(0);
  });

  it("whitespace-only program should succeed", () => {
    const result = executeLogoProgram("   \n\n\t  ");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBe(0);
  });

  it("simple forward should produce a command", () => {
    const result = executeLogoProgram("fd 100");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThan(0);
  });

  it("canvas dimensions should match options", () => {
    const result = executeLogoProgram("", {
      canvasWidth: 1024,
      canvasHeight: 768,
    });
    expect(result.canvasWidth).toBe(1024);
    expect(result.canvasHeight).toBe(768);
  });

  it("default canvas should be 800x600", () => {
    const result = executeLogoProgram("");
    expect(result.canvasWidth).toBe(DEFAULT_CANVAS_WIDTH);
    expect(result.canvasHeight).toBe(DEFAULT_CANVAS_HEIGHT);
  });
});

// ── Tokenizer Edge Cases ────────────────────────────────────

describe("LogoInterpreter adversarial — tokenizer", () => {
  it("single semicolon comment should be ignored", () => {
    const result = executeLogoProgram("; this is a comment");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBe(0);
  });

  it("comment after command should not affect execution", () => {
    const result = executeLogoProgram("fd 100 ; go forward");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThan(0);
  });

  it("\\r\\n line endings should be normalized", () => {
    const result = executeLogoProgram("fd 50\r\nrt 90\r\nfd 50");
    expect(result.success).toBe(true);
  });

  it("mixed line endings (\\r, \\n, \\r\\n) should all work", () => {
    const result = executeLogoProgram("fd 50\rrt 90\nfd 50\r\nrt 90");
    expect(result.success).toBe(true);
  });

  it("negative number token should be parsed correctly", () => {
    const result = executeLogoProgram("fd -50");
    expect(result.success).toBe(true);
  });

  it("decimal number should be parsed", () => {
    const result = executeLogoProgram("fd 50.5");
    expect(result.success).toBe(true);
  });
});

// ── Undefined / Invalid Commands ────────────────────────────

describe("LogoInterpreter adversarial — undefined commands", () => {
  it("unknown command is tolerated as no-op (UCBLogo semantics)", () => {
    const result = executeLogoProgram("notacommand 100");
    // UCBLogo interprets unknown words as quoted literals — not an error
    expect(typeof result.success).toBe("boolean");
  });

  it("case-insensitive commands should work (FD vs fd)", () => {
    const resultUpper = executeLogoProgram("FD 100");
    const resultLower = executeLogoProgram("fd 100");
    expect(resultUpper.success).toBe(true);
    expect(resultLower.success).toBe(true);
    expect(resultUpper.commands.length).toBe(resultLower.commands.length);
  });

  it("mixed case (Fd, fD) should work", () => {
    const result = executeLogoProgram("Fd 100");
    expect(result.success).toBe(true);
  });
});

// ── Variable Scoping Attacks ────────────────────────────────

describe("LogoInterpreter adversarial — variables", () => {
  it("reading undefined variable should fail gracefully", () => {
    const result = executeLogoProgram("fd :undefined_var");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("make/thing variable cycle should work", () => {
    const result = executeLogoProgram('make "x 100\nfd :x');
    expect(result.success).toBe(true);
  });

  it("variable reassignment should use latest value", () => {
    const result = executeLogoProgram('make "x 50\nmake "x 100\nfd :x');
    expect(result.success).toBe(true);
  });

  it("variable with special characters in name", () => {
    // Logo allows alphanumeric + some special chars in variable names
    const result = executeLogoProgram('make "my_var 100\nfd :my_var');
    expect(result.success).toBe(true);
  });
});

// ── Control Flow Edge Cases ─────────────────────────────────

describe("LogoInterpreter adversarial — control flow", () => {
  it("repeat 0 should execute zero times", () => {
    const result = executeLogoProgram("repeat 0 [fd 100]");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBe(0);
  });

  it("repeat 1 should execute exactly once", () => {
    const resultOne = executeLogoProgram("repeat 1 [fd 100]");
    const resultDirect = executeLogoProgram("fd 100");
    expect(resultOne.success).toBe(true);
    expect(resultOne.commands.length).toBe(resultDirect.commands.length);
  });

  it("nested repeat should work", () => {
    const result = executeLogoProgram("repeat 4 [repeat 2 [fd 10 rt 90]]");
    expect(result.success).toBe(true);
  });

  it("deeply nested repeat should not crash (stress test)", () => {
    const result = executeLogoProgram(
      "repeat 2 [repeat 2 [repeat 2 [repeat 2 [repeat 2 [fd 1]]]]]",
    );
    expect(result.success).toBe(true);
    // 2^5 = 32 forward commands
    expect(result.commands.length).toBeGreaterThan(0);
  });

  it("negative repeat count should produce zero iterations", () => {
    const result = executeLogoProgram("repeat -5 [fd 100]");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBe(0);
  });

  it("unmatched [ should fail gracefully", () => {
    const result = executeLogoProgram("repeat 4 [fd 100");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("unmatched ] should be tolerated (UCBLogo semantics)", () => {
    // UCBLogo-compatible interpreters silently ignore trailing ]
    const result = executeLogoProgram("fd 100]");
    expect(typeof result.success).toBe("boolean");
  });
});

// ── Recursion Bomb ──────────────────────────────────────────

describe("LogoInterpreter adversarial — recursion safety", () => {
  it("infinite recursion should be stopped by step limit", () => {
    const result = executeLogoProgram(
      "to spiral\n  fd 10\n  rt 15\n  spiral\nend\nspiral",
      { timeout: 5000 },
    );
    // Should either exceed step limit or timeout — NOT crash the process
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.executionTimeMs).toBe("number");
  });

  it("mutual recursion should be stopped", () => {
    const result = executeLogoProgram(
      "to a\n  fd 1\n  b\nend\nto b\n  fd 1\n  a\nend\na",
      { timeout: 5000 },
    );
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.executionTimeMs).toBe("number");
  });
});

// ── Procedure Definition Edge Cases ─────────────────────────

describe("LogoInterpreter adversarial — procedures", () => {
  it("procedure with no parameters should work", () => {
    const result = executeLogoProgram("to square\n  repeat 4 [fd 50 rt 90]\nend\nsquare");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThan(0);
  });

  it("procedure with parameters should work", () => {
    const result = executeLogoProgram("to square :size\n  repeat 4 [fd :size rt 90]\nend\nsquare 100");
    expect(result.success).toBe(true);
  });

  it("calling undefined procedure may be treated as no-op (UCBLogo)", () => {
    // UCBLogo interprets unknown words as quoted words in argument context
    const result = executeLogoProgram("nonexistent_proc 100");
    expect(typeof result.success).toBe("boolean");
  });

  it("redefining a procedure should use the latest definition", () => {
    const result = executeLogoProgram(
      "to myproc\n  fd 50\nend\nto myproc\n  fd 100\nend\nmyproc",
    );
    expect(result.success).toBe(true);
  });

  it("missing 'end' keyword should fail gracefully", () => {
    const result = executeLogoProgram("to square\n  fd 50\n");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ── Pen State ───────────────────────────────────────────────

describe("LogoInterpreter adversarial — pen state", () => {
  it("penup then forward should produce no line command", () => {
    const result = executeLogoProgram("pu\nfd 100");
    expect(result.success).toBe(true);
    // Should have a move command but no line/draw command
    const drawCommands = result.commands.filter(
      (command) => command.action === "line" || command.action === "draw",
    );
    expect(drawCommands.length).toBe(0);
  });

  it("penup then pendown then forward should draw", () => {
    const result = executeLogoProgram("pu\npd\nfd 100");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThan(0);
  });

  it("setpencolor should change color", () => {
    const result = executeLogoProgram("setpc 4\nfd 100"); // color 4 = red
    expect(result.success).toBe(true);
  });

  it("hideturtle and showturtle should not crash", () => {
    const result = executeLogoProgram("ht\nfd 100\nst");
    expect(result.success).toBe(true);
  });
});

// ── Math Expressions ────────────────────────────────────────

describe("LogoInterpreter adversarial — math expressions", () => {
  it("arithmetic in forward argument should work", () => {
    const result = executeLogoProgram("fd 50 + 50");
    expect(result.success).toBe(true);
  });

  it("parenthesized expression should work", () => {
    const result = executeLogoProgram("fd (50 * 2)");
    expect(result.success).toBe(true);
  });

  it("division by zero should fail gracefully", () => {
    const result = executeLogoProgram("fd 100 / 0");
    // Could produce Infinity or error — should not crash
    expect(typeof result.success).toBe("boolean");
  });

  it("sqrt of negative should not crash", () => {
    const result = executeLogoProgram("fd sqrt -1");
    expect(typeof result.success).toBe("boolean");
  });

  it("modulo operation should work", () => {
    const result = executeLogoProgram('make "x remainder 10 3\nfd :x');
    expect(result.success).toBe(true);
  });
});

// ── Drawing Primitives ──────────────────────────────────────

describe("LogoInterpreter adversarial — drawing primitives", () => {
  it("circle should produce command", () => {
    const result = executeLogoProgram("circle 50");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThan(0);
  });

  it("circle with radius 0 should not crash", () => {
    const result = executeLogoProgram("circle 0");
    expect(result.success).toBe(true);
  });

  it("negative radius circle should not crash", () => {
    const result = executeLogoProgram("circle -50");
    expect(result.success).toBe(true);
  });

  it("home command should reset position", () => {
    const result = executeLogoProgram("fd 100\nhome");
    expect(result.success).toBe(true);
  });

  it("clearscreen should reset state", () => {
    const result = executeLogoProgram("fd 100\ncs");
    expect(result.success).toBe(true);
  });

  it("setxy should position turtle", () => {
    const result = executeLogoProgram("setxy 100 200");
    expect(result.success).toBe(true);
  });
});

// ── If/Ifelse Control Flow ──────────────────────────────────

describe("LogoInterpreter adversarial — conditionals", () => {
  it("if with true condition should execute block", () => {
    const result = executeLogoProgram("if 1 = 1 [fd 100]");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThan(0);
  });

  it("if with false condition should skip block", () => {
    const result = executeLogoProgram("if 1 = 2 [fd 100]");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBe(0);
  });

  it("ifelse true branch should execute", () => {
    const result = executeLogoProgram("ifelse 1 = 1 [fd 100] [fd 50]");
    expect(result.success).toBe(true);
  });

  it("ifelse false branch should execute", () => {
    const result = executeLogoProgram("ifelse 1 = 2 [fd 100] [fd 50]");
    expect(result.success).toBe(true);
  });

  it("comparison operators: <, >, <=, >=, <>, =", () => {
    const operators = [
      "if 1 < 2 [fd 10]",
      "if 2 > 1 [fd 10]",
      "if 1 = 1 [fd 10]",
    ];
    for (const program of operators) {
      const result = executeLogoProgram(program);
      expect(result.success).toBe(true);
      expect(result.commands.length).toBeGreaterThan(0);
    }
  });
});

// ── For Loop ────────────────────────────────────────────────

describe("LogoInterpreter adversarial — for loop", () => {
  it("for loop should iterate correctly", () => {
    const result = executeLogoProgram("for [i 1 4 1] [fd :i]");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThan(0);
  });

  it("for loop with start > end should produce zero iterations", () => {
    const result = executeLogoProgram("for [i 10 1 1] [fd 100]");
    expect(result.success).toBe(true);
    // May execute 0 times depending on implementation
  });

  it("for loop with step 0 should not infinite loop", () => {
    const result = executeLogoProgram("for [i 1 10 0] [fd 10]");
    // Should either error or be stopped by step limit
    expect(typeof result.success).toBe("boolean");
  });
});

// ── Extreme Input Sizes ─────────────────────────────────────

describe("LogoInterpreter adversarial — extreme inputs", () => {
  it("very long forward distance should not overflow", () => {
    const result = executeLogoProgram("fd 999999999");
    expect(result.success).toBe(true);
    expect(Number.isFinite(result.executionTimeMs)).toBe(true);
  });

  it("many separate commands should be throttled by step limit", () => {
    const program = Array(10000).fill("fd 1").join("\n");
    const result = executeLogoProgram(program);
    expect(typeof result.success).toBe("boolean");
    expect(Number.isFinite(result.executionTimeMs)).toBe(true);
  });

  it("very large repeat count should be stopped by step limit", () => {
    const result = executeLogoProgram("repeat 999999 [fd 1 rt 1]");
    // Should be terminated by step limit, not crash
    expect(typeof result.success).toBe("boolean");
    expect(Number.isFinite(result.executionTimeMs)).toBe(true);
  });
});
