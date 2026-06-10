import { executeLogoProgram } from "../LogoInterpreterService.ts";

const testCases = [
  {
    name: "Simple square",
    code: "repeat 4 [fd 100 rt 90]",
    expectedCommandsMin: 8,
  },
  {
    name: "Star pattern (setpencolor + repeat)",
    code: "setpencolor 1 repeat 180 [fd 500 bk 500 rt 2]",
    expectedCommandsMin: 360,
  },
  {
    name: "Nested repeat",
    code: "repeat 4 [repeat 34 [fd 12 rt 10] rt 90]",
    expectedCommandsMin: 260,
  },
  {
    name: "Variable assignment and usage",
    code: 'make "x 100 fd :x rt 90 fd :x',
    expectedCommandsMin: 3,
  },
  {
    name: "FOR loop with float step",
    code: "for [ i 0.01 4 0.05 ] [ repeat 180 [ fd :i rt 1 ] ]",
    expectedCommandsMin: 1000,
  },
  {
    name: "Random colors (2000 iterations)",
    code: "repeat 2000 [pu home seth random 361 setpencolor random 15 fd 40 pd fd random 200]",
    expectedCommandsMin: 5000,
  },
  {
    name: "Procedure definition (Koch snowflake)",
    code: `
to side :size :level
ifelse :level = 0
  [ fd :size ]
  [ side :size / 3 :level - 1
    lt 60
    side :size / 3 :level - 1
    rt 120
    side :size / 3 :level - 1
    lt 60
    side :size / 3 :level - 1
  ]
end
setpencolor 3
lt 30
repeat 3 [side 250 4 rt 120]
    `,
    expectedCommandsMin: 200,
  },
  {
    name: "Setpensize",
    code: "setpensize 4 fd 100",
    expectedCommandsMin: 2,
  },
  {
    name: "RGB color",
    code: "setpencolor [255 100 50] fd 100",
    expectedCommandsMin: 2,
  },
  {
    name: "Palette color number",
    code: "setpencolor 7 fd 50",
    expectedCommandsMin: 2,
  },
  {
    name: "IF conditional",
    code: "make \"x 5 if :x > 3 [fd 100]",
    expectedCommandsMin: 1,
  },
  {
    name: "IFELSE conditional",
    code: 'make "x 2 ifelse :x > 3 [fd 100] [bk 50]',
    expectedCommandsMin: 1,
  },
  {
    name: "Recursive procedure with OUTPUT",
    code: `
to fib :n
ifelse :n < 2 [output :n] [output (fib :n - 1) + (fib :n - 2)]
end
fd fib 8
    `,
    expectedCommandsMin: 1,
  },
  {
    name: "Circle command",
    code: "setpencolor 6 circle 50",
    expectedCommandsMin: 2,
  },
  {
    name: "REPCOUNT in repeat",
    code: "repeat 10 [fd repcount * 10 rt 36]",
    expectedCommandsMin: 20,
  },
];

let passedCount = 0;
let failedCount = 0;

for (const testCase of testCases) {
  const result = executeLogoProgram(testCase.code, { canvasWidth: 800, canvasHeight: 600 });

  const passed = result.success && result.commands.length >= testCase.expectedCommandsMin;

  if (passed) {
    passedCount++;
    console.log(`✅ ${testCase.name} — ${result.commands.length} commands in ${result.executionTimeMs}ms`);
  } else {
    failedCount++;
    console.log(`❌ ${testCase.name}`);
    if (!result.success) {
      console.log(`   Error: ${result.error}`);
    } else {
      console.log(`   Expected ≥${testCase.expectedCommandsMin} commands, got ${result.commands.length}`);
    }
  }
}

console.log(`\n${"═".repeat(50)}`);
console.log(`Results: ${passedCount} passed, ${failedCount} failed, ${testCases.length} total`);
if (failedCount > 0) process.exit(1);
