import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("config updates preserve detail reads and unrelated view overrides", async () => {
    // Config paths are fixed at module load. Use a private process/home rather
    // than writing the user's config or changing globals in other unit tests.
    const home = await mkdtemp(join(tmpdir(), "kajji-config-details-"))
    try {
        const child = Bun.spawn(
            [
                process.execPath,
                "--preload",
                Bun.resolveSync("@opentui/solid/preload", import.meta.dir),
                join(import.meta.dir, "fixtures/config-detail-refresh.tsx"),
            ],
            {
                env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") },
                stdout: "pipe",
                stderr: "pipe",
                timeout: 10_000,
            },
        )
        const [exitCode, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
        ])
        expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" })
        expect(stdout).toContain("config detail checks passed")
    } finally {
        await rm(home, { recursive: true, force: true })
    }
}, 15_000)
