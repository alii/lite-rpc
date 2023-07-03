export const RPCErrorCodes = {
	PARSE_ERROR: -32700,
	INVALID_REQUEST: -32600,
	METHOD_NOT_FOUND: -32601,
	INVALID_PARAMS: -32602,
	INTERNAL_ERROR: -32603,
} as const;

export type RPCErrorCode = (typeof RPCErrorCodes)[keyof typeof RPCErrorCodes] | number;

export const RPCErrorDescriptions = {
	"-32700": {
		name: "Parse error",
		description: "Invalid JSON was received by the server.",
	},

	"-32600": {
		name: "Invalid Request",
		description: "The JSON sent is not a valid Request object.",
	},

	"-32601": {
		title: "Method not found",
		description: "The method does not exist / is not available.",
	},

	"-32602": {
		title: "Invalid params",
		description: "Invalid method parameter(s).",
	},

	"-32603": {
		title: "Internal error",
		description: "Internal JSON-RPC error.",
	},
};
