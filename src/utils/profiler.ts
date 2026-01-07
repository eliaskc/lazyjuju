import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export const PROFILE_ENABLED = process.env.KAJJI_PROFILE === "1"
export const NO_PASSTHROUGH = process.env.KAJJI_NO_PASSTHROUGH === "1"
export const NO_SYNTAX = process.env.KAJJI_NO_SYNTAX === "1"

const TEST_NAME = process.env.KAJJI_PROFILE_NAME || "default"
const PROFILE_DIR = join(process.cwd(), ".kajji-profiles")
const PROFILE_FILE = join(PROFILE_DIR, `${TEST_NAME}-${Date.now()}.log`)

let initialized = false

function ensureDir() {
	if (initialized) return
	try {
		mkdirSync(PROFILE_DIR, { recursive: true })
		const header = [
			`# Kajji Profile: ${TEST_NAME}`,
			`# Started: ${new Date().toISOString()}`,
			`# NO_PASSTHROUGH: ${NO_PASSTHROUGH}`,
			`# NO_SYNTAX: ${NO_SYNTAX}`,
			"#",
			"",
		].join("\n")
		writeFileSync(PROFILE_FILE, header)
		initialized = true
	} catch {
		// silent fail
	}
}

export function profileLog(label: string, data?: Record<string, unknown>) {
	if (!PROFILE_ENABLED) return

	ensureDir()

	const timestamp = performance.now().toFixed(2)
	const msg = data
		? `[${timestamp}ms] ${label}: ${JSON.stringify(data)}`
		: `[${timestamp}ms] ${label}`

	try {
		appendFileSync(PROFILE_FILE, `${msg}\n`)
	} catch {
		// silent fail
	}

	console.error(`[PROFILE] ${msg}`)
}

export function profile(label: string) {
	if (!PROFILE_ENABLED) return () => {}
	const start = performance.now()
	return (extra?: string) => {
		const ms = (performance.now() - start).toFixed(2)
		profileLog(label, { ms: Number(ms), ...(extra ? { extra } : {}) })
	}
}

let renderStart: number | null = null
let renderCount = 0

export function markRenderStart(component: string) {
	if (!PROFILE_ENABLED) return
	renderStart = performance.now()
	renderCount++
	profileLog(`render-start:${component}`, { renderCount })
}

export function markRenderEnd(component: string, lineCount?: number) {
	if (!PROFILE_ENABLED || renderStart === null) return
	const ms = performance.now() - renderStart
	profileLog(`render-end:${component}`, {
		ms: Number(ms.toFixed(2)),
		renderCount,
		...(lineCount !== undefined ? { lines: lineCount } : {}),
	})
	renderStart = null
}
