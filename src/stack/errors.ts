import { Schema } from "effect"

export class StackDiscoveryError extends Schema.TaggedError<StackDiscoveryError>()(
    "StackDiscoveryError",
    {
        message: Schema.String,
    },
) {}
