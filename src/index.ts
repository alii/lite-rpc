import { RPCErrorCodes, type RPCErrorCode } from "./errors.ts";

export type RootJSONValue<T> = T | Array<T> | { [key in PropertyKey]: T };
export type JSONValue = RootJSONValue<string | boolean | number | null>;
export type JSONStringifiableValue = RootJSONValue<JSONValue | Date>;

export type AnyParams = [] | [params: JSONValue];

export interface Method<
	Name extends string,
	Params extends AnyParams,
	R extends JSONStringifiableValue
> {
	handler: (...params: Params) => Promise<R>;
	name: Name;
}

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
export async function process(
	request: RPCRequest,
	app: LiteRPCApp
): Promise<RPCResult<any> | null> {
	const method = app.config.group.methods.find(p => p.name === request.method);

	const params: AnyParams = request.params === undefined ? [] : [request.params];

	if (request.id === undefined) {
		try {
			if (method) {
				await method.handler(...params);
			}
		} catch {
			// Shouldn't do anything here - this is considered a failed "notification"
			// Which is part of the JSON-RPC spec. See 4.1 of the 2.0 spec
			// > "The Client would not be aware of any errors"
		}

		return null;
	}

	if (!method) {
		return reply({
			id: request.id,
			error: {
				code: RPCErrorCodes.METHOD_NOT_FOUND,
				message: "Could not find that method",
			},
		});
	}

	try {
		const result = await method.handler(...params);

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

export type AnyMethod = Method<string, any, any>;

export interface LiteRPCGroup<M extends Array<AnyMethod>> {
	/**
	 * Attach a new method to this app
	 * @param name The name of the method
	 * @param handler A handler for this method to run when called. This handler may only accept 0-1 arguments, and no more.
	 * @returns A method instance
	 */
	add: <Name extends string, Params extends AnyParams, R extends JSONStringifiableValue | void>(
		name: Name,
		handler: (...params: Params) => Promise<R>
	) => LiteRPCGroup<[...M, Method<Name, Params, R extends void ? null : R>]>;

	/**
	 * Array of all attached methods
	 */
	methods: M;

	merge: <N extends Array<AnyMethod>>(group: LiteRPCGroup<N>) => LiteRPCGroup<[...M, ...N]>;
}

export interface LiteRPCApp {
	config: LiteRPCAppConstructorOptions;

	/**
	 * Process an RPC request on a given app instance
	 * @param request The RPC Request to process
	 * @returns An RPC Result, or null if the request is considered a "notification"
	 */
	request: (request: RPCRequest) => Promise<RPCResult<any> | null>;
}

export interface LiteRPCAppConstructorOptions {
	onError: (value: Error) => Promise<RPCErrorData>;
	group: LiteRPCGroup<AnyMethod[]>;
}

export function app(config: LiteRPCAppConstructorOptions): LiteRPCApp {
	const instance: LiteRPCApp = {
		config,
		request: request => process(request, instance),
	};

	return instance;
}

export function group<M extends Array<AnyMethod> = []>(
	methods: M = [] as unknown[] as M
): LiteRPCGroup<M> {
	return {
		methods,

		add: <Name extends string, Params extends AnyParams, R extends JSONStringifiableValue | void>(
			name: Name,
			handler: (...params: Params) => Promise<R>
		) => {
			const existing = methods.some(m => m.name === name);

			if (existing) {
				throw new Error(
					`Cannot add method ${name} because a method with that name already exists.`
				);
			}

			const next = async (...args: Params): Promise<R extends void ? null : R> => {
				const result = await handler(...args);

				if (result === undefined) {
					return null as R extends void ? null : R;
				}

				return result as R extends void ? null : R;
			};

			return group<[...M, Method<Name, Params, R extends void ? null : R>]>([
				...methods,
				{
					name,
					handler: next,
				},
			]);
		},

		merge: app => {
			return group([...methods, ...app.methods]);
		},
	};
}

export type InferApp<T extends LiteRPCGroup<AnyMethod[]>> = {
	[Key in T["methods"][number]["name"]]: {
		params: Parameters<Extract<T["methods"][number], { name: Key }>["handler"]>;
		result: Awaited<ReturnType<Extract<T["methods"][number], { name: Key }>["handler"]>>;
	};
};
