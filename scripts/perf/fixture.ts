import { createHash } from "node:crypto"
import {
    closeSync,
    cpSync,
    existsSync,
    lstatSync,
    mkdirSync,
    openSync,
    readFileSync,
    readlinkSync,
    readdirSync,
    readSync,
    realpathSync,
    writeFileSync,
} from "node:fs"
import { isAbsolute, join, relative, resolve } from "node:path"
import type { FixtureManifest } from "./types"

export function hash(value: string | Uint8Array): string {
    return createHash("sha256").update(value).digest("hex")
}

// Hash working files (including ignored files) without following symlinks.
// This runs only during preparation/validation, outside all measured intervals.
export function fingerprintTree(repository: string): string {
    const digest = createHash("sha256")
    const buffer = Buffer.alloc(65536)
    const walk = (directory: string) => {
        for (const name of readdirSync(directory).sort()) {
            if (directory === repository && (name === ".git" || name === ".jj")) continue
            const path = join(directory, name)
            const stat = lstatSync(path)
            const type = stat.isSymbolicLink()
                ? "link"
                : stat.isDirectory()
                  ? "directory"
                  : stat.isFile()
                    ? "file"
                    : "unsupported"
            digest.update(JSON.stringify([relative(repository, path), type, stat.mode & 0o777]))
            if (type === "link") digest.update(JSON.stringify(readlinkSync(path)))
            else if (type === "directory") walk(path)
            else if (type === "file") {
                digest.update(`${stat.size}:`)
                const fd = openSync(path, "r")
                try {
                    let size: number
                    while ((size = readSync(fd, buffer, 0, buffer.length, null)) > 0)
                        digest.update(buffer.subarray(0, size))
                } finally {
                    closeSync(fd)
                }
            } else throw new Error(`Unsupported fixture entry: ${path}`)
        }
    }
    walk(repository)
    // Include local configuration which can alter command behavior.
    for (const path of [".git/config", ".jj/repo/config.toml", ".jj/repo/store/git_target"]) {
        if (existsSync(join(repository, path))) digest.update(readFileSync(join(repository, path)))
    }
    return digest.digest("hex")
}

export function command(cwd: string, args: string[], env?: Record<string, string>): string {
    const result = Bun.spawnSync(args, {
        cwd,
        env: { ...process.env, ...env },
        stdout: "pipe",
        stderr: "pipe",
    })
    if (!result.success)
        throw new Error(`${args[0]} ${args[1]} failed: ${result.stderr.toString().trim()}`)
    return result.stdout.toString().trim()
}

export const controlledConfig = {
    autoUpdatesDisabled: true,
    whatsNewDisabled: true,
    ui: { themeMode: "dark" },
    diff: { layout: "unified", engine: "textual", wrap: true },
}

export function benchmarkEnv(home: string): Record<string, string> {
    return {
        HOME: home,
        XDG_CONFIG_HOME: join(home, ".config"),
        XDG_STATE_HOME: join(home, ".local/state"),
        XDG_CACHE_HOME: join(home, ".cache"),
        JJ_CONFIG: join(home, "jj.toml"),
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: join(home, "gitconfig"),
        GIT_CONFIG_COUNT: "2",
        GIT_CONFIG_KEY_0: "core.fsmonitor",
        GIT_CONFIG_VALUE_0: "false",
        GIT_CONFIG_KEY_1: "core.hooksPath",
        GIT_CONFIG_VALUE_1: "/dev/null",
        NODE_ENV: "production",
        KAJJI_PROFILE: "0",
        KAJJI_TRACE: "",
        GH_TOKEN: "",
        GITHUB_TOKEN: "",
        GH_CONFIG_DIR: join(home, "gh"),
    }
}

export function createHome(path: string, config = controlledConfig) {
    mkdirSync(join(path, ".config/kajji"), { recursive: true })
    writeFileSync(join(path, ".config/kajji/config.json"), JSON.stringify(config))
    writeFileSync(
        join(path, "jj.toml"),
        '[user]\nname = "Kajji Benchmark"\nemail = "benchmark@example.invalid"\n[fsmonitor]\nbackend = "none"\n[revsets]\nlog = "ancestors(@)"\n',
    )
    writeFileSync(join(path, "gitconfig"), "")
    return benchmarkEnv(path)
}

// Reject repositories whose metadata would still point at the original after
// copying (linked workspaces, worktrees, alternates, external Git stores).
export function assertSelfContained(repository: string) {
    const root = realpathSync(repository)
    const inside = (path: string) => {
        const rel = relative(root, realpathSync(path))
        return rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel)
    }
    const inspect = (path: string) => {
        if (!existsSync(path)) return
        if (lstatSync(path).isSymbolicLink())
            throw new Error(`Metadata symlink is not supported: ${path}`)
        if (lstatSync(path).isDirectory()) {
            for (const name of readdirSync(path)) inspect(join(path, name))
        }
    }
    if (!existsSync(join(root, ".jj/repo/store/git_target")))
        throw new Error("Expected a standalone Git-backed jj repository")
    inspect(join(root, ".jj"))
    inspect(join(root, ".git"))
    if (existsSync(join(root, ".git")) && !lstatSync(join(root, ".git")).isDirectory())
        throw new Error("Linked Git worktrees are not supported")
    const store = join(root, ".jj/repo/store")
    const git = resolve(store, readFileSync(join(store, "git_target"), "utf8").trim())
    if (!inside(git))
        throw new Error("External Git stores are not supported; prepare a standalone copy first")
    if (isAbsolute(readFileSync(join(store, "git_target"), "utf8").trim()))
        throw new Error("Absolute git_target is not safe to copy")
    if (existsSync(join(git, "objects/info/alternates")))
        throw new Error("Git object alternates are not safe to copy")
}

export interface FixtureOptions {
    commits: number
    bookmarks: number
    files: number
    diffFiles: number
    diffLines: number
}

export function prepareFixture(
    directory: string,
    options: FixtureOptions,
    source?: string,
    revision?: string,
): FixtureManifest {
    const root = resolve(directory)
    if (existsSync(root)) throw new Error(`Fixture destination already exists: ${root}`)
    if (source) {
        const rel = relative(realpathSync(source), root)
        if (!rel.startsWith("../") && rel !== ".." && !isAbsolute(rel))
            throw new Error("Fixture destination must be outside the source repository")
        assertSelfContained(source)
    }
    mkdirSync(root, { recursive: true, mode: 0o700 })
    const env = createHome(join(root, "setup-home"))
    const repository = join(root, "repo")
    if (source) {
        // No jj or Git command runs against the source. Include uncommitted and
        // ignored files: their snapshot cost is part of the real workload.
        cpSync(resolve(source), repository, {
            recursive: true,
            dereference: false,
            preserveTimestamps: true,
            errorOnExist: true,
            force: false,
        })
        assertSelfContained(repository)
        command(repository, ["jj", "status"], env)
    } else {
        mkdirSync(repository)
        command(repository, ["git", "init", "-b", "main"], env)
        const chunks: string[] = []
        const data = (value: string) => `data ${Buffer.byteLength(value)}\n${value}\n`
        const file = (name: string, value: string) => `M 100644 inline ${name}\n${data(value)}`
        for (let index = 0; index < options.commits; index++) {
            chunks.push(
                `commit refs/heads/main\nmark :${index + 1}\ncommitter Kajji Benchmark <benchmark@example.invalid> ${1700000000 + index} +0000\n${data(`benchmark revision ${String(index).padStart(5, "0")}`)}`,
            )
            if (index) chunks.push(`from :${index}\n`)
            if (!index) {
                for (let f = 0; f < options.files; f++)
                    chunks.push(file(`tracked/module-${f}.ts`, `export const value${f} = ${f}\n`))
            }
            chunks.push(
                file(
                    "history.ts",
                    Array.from(
                        { length: 150 },
                        (_, line) => `export const revision${line} = "${index}-${line}"\n`,
                    ).join(""),
                ),
            )
            if (index === options.commits - 1) {
                for (let f = 0; f < options.diffFiles; f++) {
                    chunks.push(
                        file(
                            `large/diff-${f}.ts`,
                            Array.from(
                                { length: options.diffLines },
                                (_, line) =>
                                    `export const marker${line} = { file: ${f}, line: ${line}, text: "benchmark content ${"x".repeat(line % 13 === 0 ? 160 : 15)}" }\n`,
                            ).join(""),
                        ),
                    )
                }
            }
            chunks.push("\n")
        }
        for (let index = 0; index < options.bookmarks; index++) {
            const target = 1 + (index % (options.commits - 1))
            const name = `bench-${String(index).padStart(5, "0")}`
            chunks.push(`reset refs/heads/${name}\nfrom :${target}\n\n`)
            chunks.push(`reset refs/remotes/origin/${name}\nfrom :${target}\n\n`)
        }
        const imported = Bun.spawnSync(["git", "fast-import", "--quiet"], {
            cwd: repository,
            env: { ...process.env, ...env },
            stdin: Buffer.from(chunks.join("")),
            stdout: "pipe",
            stderr: "pipe",
        })
        if (!imported.success) throw new Error(imported.stderr.toString())
        command(repository, ["git", "reset", "--hard", "main"], env)
        command(repository, ["jj", "git", "init", "--colocate"], env)
        command(repository, ["jj", "--ignore-immutable", "edit", "main"], env)
    }
    if (revision) command(repository, ["jj", "--ignore-immutable", "edit", "--", revision], env)
    const operation = command(
        repository,
        ["jj", "--ignore-working-copy", "op", "log", "--limit", "1", "--no-graph", "-T", "id"],
        env,
    )
    const workingCopy = command(
        repository,
        ["jj", "--ignore-working-copy", "log", "-r", "@", "--no-graph", "-T", "commit_id"],
        env,
    )
    const settings: Record<string, string | number> = source
        ? { sourcePathHash: hash(realpathSync(source)) }
        : { ...options }
    const treeHash = fingerprintTree(repository)
    const manifest: FixtureManifest = {
        version: 1,
        id: hash(JSON.stringify({ operation, workingCopy, treeHash, settings })),
        kind: source ? "copy" : "synthetic",
        operation,
        workingCopy,
        treeHash,
        settings,
    }
    writeFileSync(join(root, "fixture.json"), JSON.stringify(manifest, null, 2) + "\n", {
        mode: 0o600,
    })
    return manifest
}

export function loadFixture(root: string): FixtureManifest {
    const fixture = JSON.parse(readFileSync(join(root, "fixture.json"), "utf8")) as FixtureManifest
    if (fixture.version !== 1 || !fixture.id || !fixture.operation || !fixture.treeHash)
        throw new Error("Invalid fixture manifest; prepare a new fixture")
    assertSelfContained(join(root, "repo"))
    if (fingerprintTree(join(root, "repo")) !== fixture.treeHash)
        throw new Error(
            "Fixture files changed; prepare a new fixture instead of reusing its identity",
        )
    return fixture
}
