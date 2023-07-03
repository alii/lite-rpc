# lite-rpc

Micro transportless JSON-RPC framework aimed for use with TypeScript

### Basic Usage

`yarn add lite-rpc`

```typescript
import { LiteRPCError, app, group } from "lite-rpc";

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

// Later on in your code, however you want to do a transport (this is an example with HTTP)
expressApp.post("/rpc", async (req, res) => {
	const result = await example.request(req.body);

	// Result is null if the rpc request was a notification
	// See JSON-RPC 2.0 spec for more info about notifications
	if (result === null) {
		res.end();
		return;
	}

	res.json(result);
});
```
