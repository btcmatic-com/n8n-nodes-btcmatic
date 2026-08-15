import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IWebhookFunctions,
} from 'n8n-workflow';

/**
 * Authenticated request against the BTCMatic API (Bearer btcm_… key).
 * The body is left off entirely when not provided: the API rejects
 * requests that send `content-type: application/json` with an empty body.
 */
export async function btcmaticApiRequest(
	this: IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions | IWebhookFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<IDataObject> {
	const credentials = await this.getCredentials('btcmaticApi');
	const baseUrl = ((credentials.baseUrl as string) || 'https://api.btcmatic.com').replace(/\/+$/, '');

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${endpoint}`,
		json: true,
	};
	if (body !== undefined) options.body = body;
	if (qs !== undefined && Object.keys(qs).length > 0) options.qs = qs;

	return (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'btcmaticApi',
		options,
	)) as IDataObject;
}

/**
 * Verify a BTCMatic webhook signature header.
 * Format (frozen): `t=<unix seconds>,v1=<hex hmac-sha256 of "<t>.<rawBody>">`,
 * default tolerance ±300 seconds.
 */
export function verifyBtcmaticSignature(
	secret: string,
	header: string | undefined,
	rawBody: Buffer | string,
	toleranceSeconds = 300,
	nowMs = Date.now(),
): boolean {
	if (!header) return false;
	const match = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(header.trim());
	if (match === null) return false;
	const t = Number(match[1]);
	if (!Number.isFinite(t) || Math.abs(nowMs / 1000 - t) > toleranceSeconds) return false;
	const expected = createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest();
	const given = Buffer.from(match[2], 'hex');
	return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Build the signature header for an outgoing inbound-hook delivery. */
export function signBtcmaticPayload(secret: string, rawBody: string, nowMs = Date.now()): string {
	const t = Math.floor(nowMs / 1000);
	const v1 = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
	return `t=${t},v1=${v1}`;
}
