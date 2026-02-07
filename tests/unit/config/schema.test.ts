import { describe, expect, test } from "bun:test"
import { ConfigSchema } from "../../../src/config/schema"

describe("ConfigSchema", () => {
	test("empty object gets all defaults", () => {
		const config = ConfigSchema.parse({})
		expect(config.ui.theme).toBe("lazygit")
		expect(config.diff.defaultMode).toBe("unified")
		expect(config.diff.autoSwitchWidth).toBe(120)
		expect(config.ui.showFileTree).toBe(true)
		expect(config.whatsNewDisabled).toBe(false)
	})

	test("partial config merges with defaults", () => {
		const config = ConfigSchema.parse({
			ui: { theme: "opencode" },
		})
		expect(config.ui.theme).toBe("opencode")
		expect(config.diff.defaultMode).toBe("unified")
		expect(config.ui.showFileTree).toBe(true)
	})

	test("partial nested config merges with defaults", () => {
		const config = ConfigSchema.parse({
			diff: { defaultMode: "split" },
		})
		expect(config.diff.defaultMode).toBe("split")
		expect(config.diff.autoSwitchWidth).toBe(120)
	})

	test("existing config with only whatsNewDisabled still works", () => {
		const config = ConfigSchema.parse({ whatsNewDisabled: true })
		expect(config.whatsNewDisabled).toBe(true)
		expect(config.ui.theme).toBe("lazygit")
	})

	test("$schema field is preserved", () => {
		const config = ConfigSchema.parse({
			$schema: "https://kajji.sh/schema.json",
		})
		expect(config.$schema).toBe("https://kajji.sh/schema.json")
	})

	test("invalid theme rejects", () => {
		const result = ConfigSchema.safeParse({
			ui: { theme: "nonexistent" },
		})
		expect(result.success).toBe(false)
	})

	test("invalid diff mode rejects", () => {
		const result = ConfigSchema.safeParse({
			diff: { defaultMode: "side-by-side" },
		})
		expect(result.success).toBe(false)
	})

	test("negative autoSwitchWidth rejects", () => {
		const result = ConfigSchema.safeParse({
			diff: { autoSwitchWidth: -1 },
		})
		expect(result.success).toBe(false)
	})

	test("autoSwitchWidth 0 is valid (disables auto-switch)", () => {
		const config = ConfigSchema.parse({
			diff: { autoSwitchWidth: 0 },
		})
		expect(config.diff.autoSwitchWidth).toBe(0)
	})
})
