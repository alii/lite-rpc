import { z } from "zod";
import { LiteRPCError, createLiteRPC, type InferMethods } from "../src";

const { group, app } = createLiteRPC<{ executionTime: number }>();

// Groups let you write methods anywhere in your app, and then you
// merge them into a root group
const users = group().add("get-user", z.number(), async ({ params: id }) => {
	if (Math.random() > 0.5) {
		// Simulate an error
		throw new LiteRPCError("INTERNAL_ERROR", "Could not find that user");
	}

	return {
		id,
		name: "Alistair",
	};
});

// Another group, for misc methods.
// You can add as many methods to a group as you want
const misc = group()
	.add("random-number", async () => Math.floor(Math.random() * 10000))
	.add("hello", z.string(), async ({ params: name }) => `Hello, ${name}`)

	// Access context within a method
	.add("info", async ({ context }) => context);

const root = group().merge(users).merge(misc);

export type Root = InferMethods<typeof root>;

const example = app({
	group: root,
	onError: async error => {
		return {
			code: -32000,
			message: error.message,
		};
	},
});

// Process a request, usually you can just pass `req.body`
// (Feel free to loosely validate it with Zod or something beforehand)
const response = await example.request(
	{
		jsonrpc: "2.0",
		method: "delete-user",
		params: 1,
		id: "rpc_sdasdsads",
	},

	// Pass context into the request
	{
		executionTime: Date.now(),
	}
);

if (response && "result" in response) {
	response.result;
} else {
	// Response could be null in the case
	// that the request was a "notification"
	// This is a feature of the JSON-RPC 2.0
	// spec which is a request that needs no reply.

	// In the case of a null response, you should
	// simply end the request if you're using
	// an http server

	response?.error.code;
}
