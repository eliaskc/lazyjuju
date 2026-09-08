import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { Jj, JjLive } from "../../../src/commander/jj"
import { AppProcessLive } from "../../../src/process/app-process"

test("PR bases use remote positions and ignore local-only bookmarks", async () => {
    const root = await mkdtemp(join(tmpdir(), "kajji-pr-base-"))
    const cwd = join(root, "work")
    const env = { ...process.env, JJ_CONFIG: "", JJ_USER: "Test", JJ_EMAIL: "test@example.com" }
    const run = (executable: string, args: string[], directory = cwd) => {
        const result = Bun.spawnSync([executable, ...args], { cwd: directory, env })
        if (result.exitCode !== 0) throw new Error(result.stderr.toString())
    }
    try {
        run("git", ["init", "--bare", join(root, "remote")], root)
        run("jj", ["git", "init", cwd], root)
        run("jj", ["git", "remote", "add", "origin", join(root, "remote")])
        run("jj", ["describe", "-m", "main"])
        run("jj", ["bookmark", "create", "main"])
        run("jj", ["git", "push", "--bookmark", "main"])
        run("jj", ["new", "main", "-m", "release"])
        run("jj", ["bookmark", "create", "release/1"])
        run("jj", ["git", "push", "--bookmark", "release/1"])
        run("jj", ["new", "release/1", "-m", "local work"])
        run("jj", ["bookmark", "create", "local-only"])
        run("jj", ["new", "-m", "feature"])
        run("jj", ["bookmark", "create", "feature"])
        const bases = () =>
            Effect.runPromise(
                Jj.use((jj) =>
                    jj.nearestRemoteAncestorBookmarkNames("feature", "origin", { cwd }),
                ).pipe(Effect.provide(JjLive), Effect.provide(AppProcessLive)),
            )
        expect(await bases()).toEqual(["release/1"])
        // Move the local release bookmark off the ancestor path without pushing it.
        run("jj", ["new", "main", "-m", "release elsewhere"])
        run("jj", ["bookmark", "set", "release/1", "-r", "@", "--allow-backwards"])
        expect(await bases()).toEqual(["release/1"])
    } finally {
        await rm(root, { recursive: true, force: true })
    }
}, 30_000)
