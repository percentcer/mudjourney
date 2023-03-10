/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// bot invite
// https://discord.com/api/oauth2/authorize?client_id=1078189688533291070&permissions=328566156368&scope=bot%20applications.commands

import {
	APIInteraction,
	APIApplicationCommandInteraction,
	InteractionResponseType,
	InteractionType,
} from 'discord-api-types/v10';
import { handle } from './interactions';

// Convert a hex string to a byte array
function hexToBytes(hex: string) {
	for (var bytes = [], c = 0; c < hex.length; c += 2)
		bytes.push(parseInt(hex.substr(c, 2), 16));
	return bytes;
}

const public_key = "4e732bc086fa4af34d7cf1e1a4a36e9683189bdc4c6d662198761bcde6fd03b6";
const public_key_bytes = new Uint8Array(hexToBytes(public_key));

export interface Env {
	TREACHEROUS: KVNamespace;
	
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	
	DISCORD_BOT_TOKEN: string;
	OPENAI_SECRET: string;
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		// --------------------------------------------------------------------
		//  auth
		// --------------------------------------------------------------------
		const encoder = new TextEncoder();
		const signature = request.headers.get('X-Signature-Ed25519');
		const timestamp = request.headers.get('X-Signature-Timestamp');
		if (!signature) {
			return new Response('invalid request signature', { status: 401 });
		}
		const body = await request.text();
		const key = await crypto.subtle.importKey(
			'raw',
			public_key_bytes,
			{
				name: 'NODE-ED25519',
				namedCurve: 'NODE-ED25519'
			},
			true,
			['verify']
		);
		const isVerified = await crypto.subtle.verify(
			'NODE-ED25519',
			key,
			new Uint8Array(hexToBytes(signature)),
			encoder.encode(timestamp + body),
		);
		if (!isVerified) {
			return new Response('invalid request signature', { status: 401 });
		}
		const interaction: APIInteraction = JSON.parse(body);
		if (interaction.type === InteractionType.Ping) {
			return new Response(JSON.stringify({
				"type": InteractionResponseType.Pong
			}), {
				headers: {
					'content-type': 'application/json;charset=UTF-8',
				},
			});
		}

		// --------------------------------------------------------------------
		//  respond
		// --------------------------------------------------------------------
		ctx.waitUntil(handle(interaction as APIApplicationCommandInteraction, env, ctx));
		return new Response(JSON.stringify({
			type: InteractionResponseType.DeferredChannelMessageWithSource
		}), {
			headers: {
				'content-type': 'application/json;charset=UTF-8',
			},
		});
	},
};
