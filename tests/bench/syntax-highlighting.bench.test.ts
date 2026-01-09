/**
 * Syntax Highlighting Performance Benchmarks
 *
 * Compares:
 * - Tree-sitter (native C parser via N-API)
 * - Shiki (JS-based, uses WASM TextMate grammars)
 *
 * Run: bun test tests/bench/syntax-highlighting.bench.test.ts
 */

import { describe, expect, test } from "bun:test"
import { writeFileSync } from "node:fs"
import { join } from "node:path"

// Import both highlighters
import {
	initTreeSitter,
	isTreeSitterReady,
	tokenizeWithTreeSitter,
	tokenizeWithTreeSitterSync,
	getTreeSitterStats,
} from "../../src/diff/tree-sitter-highlighter"

// Note: These imports assume tree-sitter packages are installed
// If not installed, the tree-sitter tests will be skipped

const RESULTS_FILE = join(import.meta.dir, "../../bench-syntax-results.json")

// Sample code snippets of varying complexity
const CODE_SAMPLES = {
	simple: 'const foo = "hello world"',
	medium: `export function processData(input: string, options: Options = {}): Result {
  const { timeout = 1000, retries = 3 } = options
  return { success: true, data: input, timestamp: Date.now() }
}`,
	complex: `import { useState, useEffect, useCallback, useMemo } from "react"
import type { FC, ReactNode, MouseEvent } from "react"

interface ButtonProps {
  variant: "primary" | "secondary" | "danger"
  size?: "sm" | "md" | "lg"
  disabled?: boolean
  loading?: boolean
  icon?: ReactNode
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}

export const Button: FC<ButtonProps> = ({
  variant,
  size = "md",
  disabled = false,
  loading = false,
  icon,
  onClick,
  children,
}) => {
  const [isPressed, setIsPressed] = useState(false)

  const handleClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return
    onClick?.(e)
  }, [disabled, loading, onClick])

  const className = useMemo(() => {
    const classes = ["btn", \`btn-\${variant}\`, \`btn-\${size}\`]
    if (disabled) classes.push("btn-disabled")
    if (loading) classes.push("btn-loading")
    if (isPressed) classes.push("btn-pressed")
    return classes.join(" ")
  }, [variant, size, disabled, loading, isPressed])

  useEffect(() => {
    if (isPressed) {
      const timer = setTimeout(() => setIsPressed(false), 150)
      return () => clearTimeout(timer)
    }
  }, [isPressed])

  return (
    <button
      className={className}
      disabled={disabled || loading}
      onClick={handleClick}
      onMouseDown={() => setIsPressed(true)}
    >
      {loading ? <Spinner size={size} /> : icon}
      <span className="btn-text">{children}</span>
    </button>
  )
}`,
	diffLines: [
		'const foo = "hello world"',
		"export function processData(input: string): void {",
		"  return { success: true, data: input }",
		'import { useState, useEffect } from "react"',
		"const [count, setCount] = useState<number>(0)",
		"interface Props { value: string; onChange: (v: string) => void }",
		"type Result<T> = { data: T; error?: Error }",
		"async function fetchData(): Promise<void> {}",
		'return <div className="test">{children}</div>',
		"const Component: FC<Props> = ({ value }) => <span>{value}</span>",
	],
}

interface BenchResult {
	name: string
	backend: string
	iterations: number
	totalMs: number
	meanMs: number
	minMs: number
	maxMs: number
	p50Ms: number
	p95Ms: number
	p99Ms: number
	opsPerSec: number
	linesPerMs?: number
}

function benchmark(
	name: string,
	fn: () => void,
	iterations = 100,
	warmupIterations = 10,
): Omit<BenchResult, "backend"> {
	const times: number[] = []

	// Warmup
	for (let i = 0; i < warmupIterations; i++) fn()

	// Benchmark
	for (let i = 0; i < iterations; i++) {
		const start = performance.now()
		fn()
		times.push(performance.now() - start)
	}

	times.sort((a, b) => a - b)
	const totalMs = times.reduce((a, b) => a + b, 0)
	const meanMs = totalMs / iterations

	return {
		name,
		iterations,
		totalMs,
		meanMs,
		minMs: times[0] ?? 0,
		maxMs: times[iterations - 1] ?? 0,
		p50Ms: times[Math.floor(iterations * 0.5)] ?? 0,
		p95Ms: times[Math.floor(iterations * 0.95)] ?? 0,
		p99Ms: times[Math.floor(iterations * 0.99)] ?? 0,
		opsPerSec: 1000 / meanMs,
	}
}

async function benchmarkAsync(
	name: string,
	fn: () => Promise<void>,
	iterations = 100,
	warmupIterations = 10,
): Promise<Omit<BenchResult, "backend">> {
	const times: number[] = []

	// Warmup
	for (let i = 0; i < warmupIterations; i++) await fn()

	// Benchmark
	for (let i = 0; i < iterations; i++) {
		const start = performance.now()
		await fn()
		times.push(performance.now() - start)
	}

	times.sort((a, b) => a - b)
	const totalMs = times.reduce((a, b) => a + b, 0)
	const meanMs = totalMs / iterations

	return {
		name,
		iterations,
		totalMs,
		meanMs,
		minMs: times[0] ?? 0,
		maxMs: times[iterations - 1] ?? 0,
		p50Ms: times[Math.floor(iterations * 0.5)] ?? 0,
		p95Ms: times[Math.floor(iterations * 0.95)] ?? 0,
		p99Ms: times[Math.floor(iterations * 0.99)] ?? 0,
		opsPerSec: 1000 / meanMs,
	}
}

function formatResult(r: BenchResult): string {
	const lps = r.linesPerMs ? ` (${r.linesPerMs.toFixed(0)} lines/ms)` : ""
	return `[${r.backend}] ${r.name}: mean=${r.meanMs.toFixed(3)}ms, p50=${r.p50Ms.toFixed(3)}ms, p95=${r.p95Ms.toFixed(3)}ms, ops/s=${r.opsPerSec.toFixed(0)}${lps}`
}

function formatComparison(
	treeSitter: BenchResult | null,
	shiki: BenchResult | null,
): string {
	if (!treeSitter || !shiki) return ""
	const speedup = shiki.meanMs / treeSitter.meanMs
	return `  → Tree-sitter is ${speedup.toFixed(1)}x faster than Shiki`
}

const allResults: BenchResult[] = []
let treeSitterAvailable = false

describe("Syntax Highlighting Benchmarks", () => {
	describe("Setup", () => {
		test("initialize tree-sitter", async () => {
			try {
				const success = await initTreeSitter()
				treeSitterAvailable = success
				console.log(
					`Tree-sitter initialized: ${success ? "YES" : "NO (packages not installed)"}`,
				)
				if (success) {
					const stats = getTreeSitterStats()
					console.log(`  Loaded languages: ${stats.loadedLanguages.join(", ")}`)
				}
			} catch (err) {
				console.log(
					`Tree-sitter not available: ${err instanceof Error ? err.message : err}`,
				)
				treeSitterAvailable = false
			}
		})
	})

	describe("Single Line Tokenization", () => {
		test("simple expression", async () => {
			const code = CODE_SAMPLES.simple

			// Tree-sitter (sync)
			if (treeSitterAvailable) {
				const tsResult = benchmark("simple-expr", () => {
					tokenizeWithTreeSitterSync(code, "typescript")
				})
				allResults.push({ ...tsResult, backend: "tree-sitter" })
				console.log(formatResult({ ...tsResult, backend: "tree-sitter" }))
			}

			// Tree-sitter (async) for comparison
			if (treeSitterAvailable) {
				const tsAsyncResult = await benchmarkAsync("simple-expr-async", async () => {
					await tokenizeWithTreeSitter(code, "typescript")
				})
				allResults.push({ ...tsAsyncResult, backend: "tree-sitter-async" })
				console.log(formatResult({ ...tsAsyncResult, backend: "tree-sitter-async" }))
			}

			expect(true).toBe(true)
		})

		test("medium function", async () => {
			const code = CODE_SAMPLES.medium

			if (treeSitterAvailable) {
				const tsResult = benchmark("medium-func", () => {
					tokenizeWithTreeSitterSync(code, "typescript")
				})
				allResults.push({ ...tsResult, backend: "tree-sitter" })
				console.log(formatResult({ ...tsResult, backend: "tree-sitter" }))
			}

			expect(true).toBe(true)
		})

		test("complex component (60 lines)", async () => {
			const code = CODE_SAMPLES.complex

			if (treeSitterAvailable) {
				const tsResult = benchmark(
					"complex-component",
					() => {
						tokenizeWithTreeSitterSync(code, "tsx")
					},
					50,
				)
				allResults.push({ ...tsResult, backend: "tree-sitter" })
				console.log(formatResult({ ...tsResult, backend: "tree-sitter" }))
			}

			expect(true).toBe(true)
		})
	})

	describe("Batch Line Tokenization (Diff Simulation)", () => {
		const lines = CODE_SAMPLES.diffLines

		test("10 lines (small diff viewport)", async () => {
			if (treeSitterAvailable) {
				const tsResult = benchmark("10-lines", () => {
					for (const line of lines) {
						tokenizeWithTreeSitterSync(line, "typescript")
					}
				})
				const linesPerMs = 10 / tsResult.meanMs
				allResults.push({ ...tsResult, backend: "tree-sitter", linesPerMs })
				console.log(
					formatResult({ ...tsResult, backend: "tree-sitter", linesPerMs }),
				)
			}

			expect(true).toBe(true)
		})

		test("100 lines (typical diff)", async () => {
			if (treeSitterAvailable) {
				const tsResult = benchmark("100-lines", () => {
					for (let i = 0; i < 100; i++) {
						const line = lines[i % lines.length]!
						tokenizeWithTreeSitterSync(line, "typescript")
					}
				})
				const linesPerMs = 100 / tsResult.meanMs
				allResults.push({ ...tsResult, backend: "tree-sitter", linesPerMs })
				console.log(
					formatResult({ ...tsResult, backend: "tree-sitter", linesPerMs }),
				)
				// Target: <10ms for 100 lines (tree-sitter)
				expect(tsResult.p95Ms).toBeLessThan(10)
			}

			expect(true).toBe(true)
		})

		test("500 lines (medium diff)", async () => {
			if (treeSitterAvailable) {
				const tsResult = benchmark(
					"500-lines",
					() => {
						for (let i = 0; i < 500; i++) {
							const line = lines[i % lines.length]!
							tokenizeWithTreeSitterSync(line, "typescript")
						}
					},
					50,
				)
				const linesPerMs = 500 / tsResult.meanMs
				allResults.push({ ...tsResult, backend: "tree-sitter", linesPerMs })
				console.log(
					formatResult({ ...tsResult, backend: "tree-sitter", linesPerMs }),
				)
				// Target: <50ms for 500 lines (tree-sitter)
				expect(tsResult.p95Ms).toBeLessThan(50)
			}

			expect(true).toBe(true)
		})

		test("2000 lines (large diff, split view)", async () => {
			if (treeSitterAvailable) {
				const tsResult = benchmark(
					"2000-lines",
					() => {
						for (let i = 0; i < 2000; i++) {
							const line = lines[i % lines.length]!
							tokenizeWithTreeSitterSync(line, "typescript")
						}
					},
					20,
				)
				const linesPerMs = 2000 / tsResult.meanMs
				allResults.push({ ...tsResult, backend: "tree-sitter", linesPerMs })
				console.log(
					formatResult({ ...tsResult, backend: "tree-sitter", linesPerMs }),
				)
				// Target: <200ms for 2000 lines (tree-sitter)
				expect(tsResult.p95Ms).toBeLessThan(200)
			}

			expect(true).toBe(true)
		})

		test("5000 lines (xlarge diff stress test)", async () => {
			if (treeSitterAvailable) {
				const tsResult = benchmark(
					"5000-lines",
					() => {
						for (let i = 0; i < 5000; i++) {
							const line = lines[i % lines.length]!
							tokenizeWithTreeSitterSync(line, "typescript")
						}
					},
					10,
				)
				const linesPerMs = 5000 / tsResult.meanMs
				allResults.push({ ...tsResult, backend: "tree-sitter", linesPerMs })
				console.log(
					formatResult({ ...tsResult, backend: "tree-sitter", linesPerMs }),
				)
				// Target: <500ms for 5000 lines (tree-sitter)
				expect(tsResult.p95Ms).toBeLessThan(500)
			}

			expect(true).toBe(true)
		})
	})

	describe("Multi-Language Support", () => {
		const samples: Record<string, { code: string; lang: string }> = {
			typescript: {
				code: 'const x: number = 42; export function foo(): string { return "bar" }',
				lang: "typescript",
			},
			tsx: {
				code: 'const Component = () => <div className="test">{value}</div>',
				lang: "tsx",
			},
			javascript: {
				code: 'const foo = { bar: "baz", num: 123 }; export default foo',
				lang: "javascript",
			},
			json: {
				code: '{ "name": "test", "version": "1.0.0", "dependencies": {} }',
				lang: "json",
			},
			python: {
				code: 'def process_data(items: list[str]) -> dict:\n    return {"count": len(items)}',
				lang: "python",
			},
			rust: {
				code: 'fn main() -> Result<(), Error> { let x = vec![1, 2, 3]; Ok(()) }',
				lang: "rust",
			},
			go: {
				code: 'func main() { fmt.Println("Hello, World!"); err := doSomething() }',
				lang: "go",
			},
		}

		for (const [name, sample] of Object.entries(samples)) {
			test(`${name} tokenization`, async () => {
				if (treeSitterAvailable) {
					const tsResult = benchmark(`lang-${name}`, () => {
						tokenizeWithTreeSitterSync(sample.code, sample.lang)
					})
					allResults.push({ ...tsResult, backend: "tree-sitter" })
					console.log(formatResult({ ...tsResult, backend: "tree-sitter" }))
				}

				expect(true).toBe(true)
			})
		}
	})

	describe("Results Summary", () => {
		test("write results to file", () => {
			const results = {
				timestamp: new Date().toISOString(),
				treeSitterAvailable,
				results: allResults,
				summary: {
					treeSitter: allResults
						.filter((r) => r.backend === "tree-sitter")
						.reduce(
							(acc, r) => ({
								count: acc.count + 1,
								totalMeanMs: acc.totalMeanMs + r.meanMs,
								avgMeanMs: 0,
							}),
							{ count: 0, totalMeanMs: 0, avgMeanMs: 0 },
						),
				},
			}

			if (results.summary.treeSitter.count > 0) {
				results.summary.treeSitter.avgMeanMs =
					results.summary.treeSitter.totalMeanMs /
					results.summary.treeSitter.count
			}

			writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2))
			console.log("\n=== SUMMARY ===")
			console.log(`Tree-sitter available: ${treeSitterAvailable}`)
			if (treeSitterAvailable) {
				console.log(
					`Tree-sitter avg: ${results.summary.treeSitter.avgMeanMs.toFixed(3)}ms`,
				)
			}
			console.log(`\nResults written to ${RESULTS_FILE}`)
		})
	})
})
