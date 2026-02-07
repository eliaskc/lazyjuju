import { z } from "zod"

const SCHEMA_URL = "https://kajji.sh/schema.json"

export const UiSchema = z.object({
	theme: z
		.enum(["lazygit", "opencode"])
		.default("lazygit")
		.describe("Color theme"),
	showFileTree: z
		.boolean()
		.default(true)
		.describe("Show files as tree (false for flat list)"),
})

export const DiffSchema = z.object({
	defaultMode: z
		.enum(["unified", "split"])
		.default("unified")
		.describe("Default diff view mode"),
	autoSwitchWidth: z
		.number()
		.int()
		.min(0)
		.default(120)
		.describe(
			"Auto-switch to split view above this terminal width (0 to disable)",
		),
	wrap: z.boolean().default(true).describe("Wrap long lines in diff view"),
})

export const ConfigSchema = z
	.object({
		$schema: z
			.string()
			.optional()
			.describe("JSON Schema reference for editor autocomplete"),

		ui: UiSchema.optional()
			.default({ theme: "lazygit", showFileTree: true })
			.describe("UI settings"),

		diff: DiffSchema.optional()
			.default({ defaultMode: "unified", autoSwitchWidth: 120, wrap: true })
			.describe("Diff display settings"),

		whatsNewDisabled: z
			.boolean()
			.default(false)
			.describe("Disable the what's new screen on updates"),
	})
	.describe("kajji configuration")

export type AppConfig = z.infer<typeof ConfigSchema>

export { SCHEMA_URL }
