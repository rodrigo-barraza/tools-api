// ─── Bounded Output Accumulator ─────────────────────────────
// Collects subprocess/interpreter output under a byte budget,
// preferring the TAIL of the stream: for build/test logs the
// failures are at the end, so when the budget is exceeded we
// keep a small head (context: the command banner, first errors)
// and a large tail, dropping the middle. The truncation marker
// states exactly how much was omitted so the model knows the
// output is incomplete and roughly how incomplete.

function countNewlines(buffer: Buffer): number {
  let count = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 10) count++;
  }
  return count;
}

export class OutputAccumulator {
  private headChunks: Buffer[] = [];
  private headLength = 0;
  private tailChunks: Buffer[] = [];
  private tailLength = 0;
  private droppedBytes = 0;
  private droppedLines = 0;
  totalBytes = 0;

  private readonly headBudget: number;
  private readonly tailBudget: number;

  constructor(maxBytes: number, headRatio = 0.1) {
    this.headBudget = Math.floor(maxBytes * headRatio);
    this.tailBudget = Math.max(maxBytes - this.headBudget, 1);
  }

  append(data: Buffer | string): void {
    let chunk = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf-8");
    this.totalBytes += chunk.length;

    if (this.headLength < this.headBudget) {
      const wanted = this.headBudget - this.headLength;
      const headPart = chunk.subarray(0, wanted);
      this.headChunks.push(headPart);
      this.headLength += headPart.length;
      if (chunk.length <= wanted) return;
      chunk = chunk.subarray(wanted);
    }

    this.tailChunks.push(chunk);
    this.tailLength += chunk.length;

    while (this.tailLength > this.tailBudget && this.tailChunks.length > 1) {
      const dropped = this.tailChunks.shift() as Buffer;
      this.tailLength -= dropped.length;
      this.droppedBytes += dropped.length;
      this.droppedLines += countNewlines(dropped);
    }

    // A single chunk larger than the whole tail budget: trim its start
    if (this.tailLength > this.tailBudget) {
      const only = this.tailChunks[0];
      const excess = this.tailLength - this.tailBudget;
      const droppedPart = only.subarray(0, excess);
      this.droppedBytes += excess;
      this.droppedLines += countNewlines(droppedPart);
      this.tailChunks[0] = only.subarray(excess);
      this.tailLength -= excess;
    }
  }

  get truncated(): boolean {
    return this.droppedBytes > 0;
  }

  toString(): string {
    const head = Buffer.concat(this.headChunks).toString("utf-8");
    const tail = Buffer.concat(this.tailChunks).toString("utf-8");
    if (!this.truncated) return head + tail;

    const marker =
      `\n... [output truncated: ${this.droppedBytes.toLocaleString("en-US")} bytes` +
      ` (~${this.droppedLines.toLocaleString("en-US")} lines) omitted from the middle` +
      ` of ${this.totalBytes.toLocaleString("en-US")} total bytes;` +
      ` showing the first ${this.headLength.toLocaleString("en-US")}` +
      ` and last ${this.tailLength.toLocaleString("en-US")} bytes] ...\n`;
    return head + marker + tail;
  }
}
