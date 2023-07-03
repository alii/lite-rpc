# lite-rpc

Micro transportless JSON-RPC framework aimed for use with TypeScript

### Basic Usage

`yarn add lite-rpc`

```typescript
import { LiteRPCError, createLiteRPC, type InferApp } from "lite-rpc";

const app = createLiteRPC()
	.add("delete-user", async (id: number) => {
		const user = await db.getUser(id);

		if (!user) {
			throw new LiteRPCError("INTERNAL_ERROR", "Could not find that user");
		}

		await user.delete();
	})
	.add("random-number", async () => Math.floor(Math.random() * 10000));

const otherApp = createLiteRPC().add("hello", async (name: string) => `Hello, ${name}`);

const final = otherApp.merge(app);

// Later on in your code, however you want to do a trarnsport

expressApp.post("/rpc", async (req, res) => {
	const result = await final.process(req.body);

	// Result is null if the rpc request was a notification
	// See JSON-RPC 2.0 spec for more info about notifications
	if (result === null) {
		res.end();
		return;
	}

	res.json(result);
});
```
