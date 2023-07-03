import { RPCErrorCodes, type RPCErrorCode } from "./errors.ts";

export type RootJSONValue<T> = T | Array<T> | { [key in PropertyKey]: T };
export type JSONValue = RootJSONValue<string | boolean | number | null>;
export type JSONStringifiableValue = RootJSONValue<JSONValue | Date>;

export type AnyParams = [] | [params: JSONValue];

export interface Parsable<Out> {
	parse: (value: unknown) => Out;
}

export type MethodHandlerData<Context, Params> = {
	context: Context;
	params: Params;
};

export interface Method<
	Context,
	Name extends string,
	R extends JSONStringifiableValue,
	Params extends JSONValue = never
> {
	handler: (data: MethodHandlerData<Context, Params>) => Promise<R>;
	schema: Parsable<Params>;
	name: Name;
}

export type AnyMethod = Method<any, string, any, any>;

export type RPCId = `rpc_${string}`;

export type RPCErrorData = {
	code: RPCErrorCode;
	message: string;
};

export type RPCRequest = {
	jsonrpc: "2.0";
	id?: RPCId;
	params?: JSONValue;
	method: string;
};

export type RPCErroredResult = { id: RPCId; error: RPCErrorData };
export type RPCSuccessfulResult<T> = { id: RPCId; result: T };
export type RPCResult<T> = RPCErroredResult | RPCSuccessfulResult<T>;

export type InferMethods<T extends LiteRPCGroup<any, AnyMethod[]>> = {
	[Key in T["methods"][number]["name"]]: {
		params: Parameters<
			Extract<T["methods"][number], { name: Key }>["handler"]
		>[0] extends MethodHandlerData<any, infer P>
			? P
			: never;

		result: Awaited<ReturnType<Extract<T["methods"][number], { name: Key }>["handler"]>>;
	};
};

export function reply<X, T extends RPCResult<X>>(result: T) {
	return {
		jsonrpc: "2.0" as const,
		...result,
	};
}

export class LiteRPCError extends Error {
	public readonly code: number;

	constructor(
		code: keyof typeof RPCErrorCodes | RPCErrorCode,
		public override readonly message: string
	) {
		const resolved = typeof code === "string" ? RPCErrorCodes[code] : code;

		if (resolved < -32099 || resolved > -32000) {
			throw new Error("Invalid error code");
		}

		super(message);

		this.code = resolved;
	}
}

/**
 * Process an RPC Request
 * @param request The RPC Request (usually this will just be request.body)
 * @param app The app instance to find a method from
 * @returns
 */
export async function process<Context>(
	request: RPCRequest,
	app: LiteRPCApp<Context>,
	...[context]: Context extends null ? [] : [context: Context]
): Promise<RPCResult<any> | null> {
	const method = app.config.group.methods.find(p => p.name === request.method);

	if (method === undefined) {
		if (request.id) {
			return reply({
				id: request.id,
				error: {
					code: RPCErrorCodes.METHOD_NOT_FOUND,
					message: "Method not found",
				},
			});
		}

		return null;
	}

	const params = method.schema.parse(request.params);

	const run = method.handler({
		params,
		context,
	});

	if (request.id === undefined) {
		try {
			await run;
		} catch {
			// Shouldn't do anything here - this is considered a failed "notification"
			// Which is part of the JSON-RPC spec. See 4.1 of the 2.0 spec
			// > "The Client would not be aware of any errors"
		}

		return null;
	}

	try {
		const result = await run;

		return reply({
			id: request.id,
			result,
		});
	} catch (e: unknown) {
		if (e instanceof LiteRPCError) {
			return reply({
				id: request.id,
				error: {
					code: e.code,
					message: e.message,
				},
			});
		}

		if (e instanceof Error) {
			const error = await app.config.onError(e);

			return reply({
				id: request.id,
				error,
			});
		}

		return reply({
			id: request.id,
			error: {
				code: RPCErrorCodes.INTERNAL_ERROR,
				message: "Something went wrong",
			},
		});
	}
}

export interface LiteRPCGroup<Context, M extends Array<AnyMethod>> {
	/**
	 * Attach a new method to this app
	 * @param name The name of the method
	 * @param handler A handler for this method to run when called. This handler may only accept 0-1 arguments, and no more.
	 * @returns A method instance
	 */
	add: <
		Name extends string,
		Params extends JSONValue = null,
		R extends JSONStringifiableValue | void = void
	>(
		name: Name,
		...args: Params extends null
			? [handler: (data: MethodHandlerData<Context, Params>) => Promise<R>]
			: [
					schema: Parsable<Params>,
					handler: (data: MethodHandlerData<Context, Params>) => Promise<R>
			  ]
	) => LiteRPCGroup<Context, [...M, Method<Context, Name, R extends void ? null : R, Params>]>;

	/**
	 * Array of all attached methods
	 */
	methods: M;

	merge: <N extends Array<AnyMethod>>(
		group: LiteRPCGroup<Context, N>
	) => LiteRPCGroup<Context, [...M, ...N]>;
}

export interface LiteRPCApp<Context> {
	config: LiteRPCAppConstructorOptions<Context>;

	/**
	 * Process an RPC request on a given app instance
	 * @param request The RPC Request to process
	 * @returns An RPC Result, or null if the request is considered a "notification"
	 */
	request: (
		request: RPCRequest,
		...context: Context extends null ? [] : [context: Context]
	) => Promise<RPCResult<any> | null>;
}

export interface LiteRPCAppConstructorOptions<Context> {
	onError: (value: Error) => Promise<RPCErrorData>;
	group: LiteRPCGroup<Context, AnyMethod[]>;
}

export function createLiteRPC<Context = null>() {
	function app(config: LiteRPCAppConstructorOptions<Context>): LiteRPCApp<Context> {
		const instance: LiteRPCApp<Context> = {
			config,
			request: (request, ...context) => process(request, instance, ...context),
		};

		return instance;
	}

	function group<M extends Array<AnyMethod> = []>(
		methods: M = [] as unknown[] as M
	): LiteRPCGroup<Context, M> {
		return {
			methods,

			add: <
				Name extends string,
				Params extends JSONValue = null,
				R extends JSONStringifiableValue | void = void
			>(
				name: Name,
				...args: Params extends null
					? [handler: (data: MethodHandlerData<Context, Params>) => Promise<R>]
					: [
							schema: Parsable<Params>,
							handler: (data: MethodHandlerData<Context, Params>) => Promise<R>
					  ]
			) => {
				const existing = methods.some(m => m.name === name);

				if (existing) {
					throw new Error(
						`Cannot add method ${name} because a method with that name already exists.`
					);
				}

				const schema: Parsable<Params> =
					args.length === 2 ? (args[0] as Parsable<Params>) : { parse: () => null as Params };

				const handler: AnyMethod["handler"] = args.length === 2 ? args[1] : args[0];

				return group<[...M, Method<Context, Name, R extends void ? null : R, Params>]>([
					...methods,
					{
						name,
						schema,
						handler: async (data): Promise<R extends void ? null : R> => {
							const result = await handler(data);

							if (result === undefined) {
								return null as R extends void ? null : R;
							}

							return result as R extends void ? null : R;
						},
					},
				]);
			},

			merge: app => {
				return group([...methods, ...app.methods]);
			},
		};
	}

	return { group, app };
}

export const { group, app } = createLiteRPC<null>();
