import { LiteRPCError, createLiteRPC, type InferApp } from "../src";

const app = createLiteRPC().add("get-user", async (id: number) => {
	if (Math.random() > 0.5) {
		return {
			id,
			name: "Alistair",
		};
	} else {
		throw new LiteRPCError("INTERNAL_ERROR", "Could not find that user");
	}
});

const app2 = createLiteRPC()
	.add("delete-user", async (id: number) => {
		if (Math.random() > 0.5) {
			// return { id, deleted: true };
		} else {
			throw new LiteRPCError("INTERNAL_ERROR", "Could not find that user");
		}
	})
	.add("random-number", async () => Math.floor(Math.random() * 10000));

const final = app.merge(app2);

export type App = InferApp<typeof final>;

// Process a request, usually you can just pass `req.body`
// (Feel free to loosely validate it with Zod or something beforehand)
const response = await final.process({
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
