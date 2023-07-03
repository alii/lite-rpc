import { LiteRPCError, app, group } from "../src";

// Groups let you write methods anywhere in your app, and then you
// merge them into a root group
const users = group().add("get-user", async (id: number) => {
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
	.add("hello", async (name: string) => `Hello, ${name}`);

const example = app({
	group: group().merge(users).merge(misc),
	onError: async error => {
		return {
			code: -32000,
			message: error.message,
		};
	},
});

// Process a request, usually you can just pass `req.body`
// (Feel free to loosely validate it with Zod or something beforehand)
const response = await example.request({
	jsonrpc: "2.0",
	method: "delete-user",
	params: 1,
	id: "rpc_sdasdsads",
});

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
