import { describe, expect, it, vi } from "vitest";
import { connectTerminal, type TerminalApi, type TerminalOutput } from "./terminal";

function mockApi() {
  return {
    profiles: vi.fn().mockResolvedValue([]), open: vi.fn().mockResolvedValue("pty-1"),
    read: vi.fn<() => Promise<TerminalOutput>>().mockResolvedValue({ type: "exit", code: 0 }),
    write: vi.fn().mockResolvedValue(undefined), resize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  } satisfies TerminalApi;
}

describe("PTY connection lifecycle", () => {
  it("closes a process whose startup resolves after unmount", async () => {
    const api = mockApi();
    let resolve!: (value: string) => void;
    api.open.mockReturnValue(new Promise<string>(done => { resolve = done; }));
    const connection = connectTerminal(api, "cmd", 80, 24, async () => {}, vi.fn());
    connection.dispose(); resolve("late"); await connection.ready;
    expect(api.close).toHaveBeenCalledExactlyOnceWith("late");
    expect(api.read).not.toHaveBeenCalled();
  });

  it("waits for terminal parsing before pulling more output and preserves bytes", async () => {
    const api = mockApi();
    api.read.mockResolvedValueOnce({ type: "data", bytes: [0xe2, 0x82] })
      .mockResolvedValueOnce({ type: "data", bytes: [0xac] });
    let release!: () => void;
    const output = vi.fn().mockImplementationOnce(() => new Promise<void>(done => { release = done; }))
      .mockResolvedValue(undefined);
    const ended = vi.fn();
    const connection = connectTerminal(api, "cmd", 80, 24, output, ended);
    await vi.waitFor(() => expect(output).toHaveBeenCalledTimes(1));
    expect(api.read).toHaveBeenCalledTimes(1); release(); await connection.ready;
    expect(output.mock.calls.map(c => Array.from(c[0]))).toEqual([[0xe2, 0x82], [0xac]]);
    expect(ended).toHaveBeenCalledWith("Shell beendet (Exit 0)");
    expect(api.close).toHaveBeenCalledTimes(1);
  });

  it("orders input, chunks paste, resizes, and isolates connections", async () => {
    const api = mockApi();
    let finish!: (value: TerminalOutput) => void;
    api.read.mockReturnValue(new Promise<TerminalOutput>(done => { finish = done; }));
    const connection = connectTerminal(api, "cmd", 80, 24, async () => {}, vi.fn());
    await vi.waitFor(() => expect(api.read).toHaveBeenCalled());
    connection.write("a".repeat(9000)); connection.write("ö"); connection.resize(100, 40);
    await vi.waitFor(() => expect(api.write).toHaveBeenCalledTimes(3));
    expect(api.write.mock.calls.map(c => c[1].length)).toEqual([8192, 808, 2]);
    expect(api.resize).toHaveBeenLastCalledWith("pty-1", 100, 40);
    connection.dispose(); finish({ type: "exit", code: 0 }); await connection.ready;
  });

  it("reports startup failure and never sends input to a missing shell", async () => {
    const api = mockApi(); api.open.mockRejectedValue(new Error("Cannot launch local shell"));
    const ended = vi.fn();
    const connection = connectTerminal(api, "cmd", 80, 24, async () => {}, ended);
    connection.write("echo test"); await connection.ready;
    expect(ended).toHaveBeenCalledWith(expect.stringContaining("Cannot launch"));
    expect(api.write).not.toHaveBeenCalled();
  });
});
