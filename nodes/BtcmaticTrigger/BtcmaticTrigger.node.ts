import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { btcmaticApiRequest, verifyBtcmaticSignature } from '../Btcmatic/GenericFunctions';

interface WebhookEndpointRow {
	id: string;
	url: string;
	created_at: string;
}

export class BtcmaticTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'BTCMatic Trigger',
		name: 'btcmaticTrigger',
		icon: { light: 'file:../Btcmatic/btcmatic.svg', dark: 'file:../Btcmatic/btcmatic.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: 'on rule fire',
		description: 'Starts a workflow when a BTCMatic rule fires and delivers a webhook',
		usableAsTool: true,
		defaults: {
			name: 'BTCMatic Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'btcmaticApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'This node registers its URL as a BTCMatic webhook endpoint. To receive fires, add a webhook action pointing at this URL to one of your BTCMatic rules (the rule editor lists registered endpoints). Deliveries are HMAC-signed and verified automatically.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Allow Unsigned Deliveries',
						name: 'allowUnsigned',
						type: 'boolean',
						default: false,
						description:
							'Whether to accept deliveries that fail signature verification. Leave disabled unless you are debugging: with this enabled anyone who knows the URL can trigger the workflow.',
					},
					{
						displayName: 'Signature Tolerance (Seconds)',
						name: 'toleranceSeconds',
						type: 'number',
						typeOptions: { minValue: 30, maxValue: 3600 },
						default: 300,
						description:
							'Maximum allowed age of the signature timestamp. BTCMatic signs at send time, so retries always carry a fresh signature; 300 seconds matches the server default.',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const staticData = this.getWorkflowStaticData('node');

				const response = await btcmaticApiRequest.call(this, 'GET', '/webhook-endpoints', undefined, {
					url: webhookUrl,
				});
				const endpoints = (response.endpoints as WebhookEndpointRow[] | undefined) ?? [];
				const existing = endpoints.find((endpoint) => endpoint.url === webhookUrl);

				if (existing === undefined) {
					delete staticData.webhookId;
					delete staticData.webhookSecret;
					return false;
				}

				if (staticData.webhookId === existing.id && typeof staticData.webhookSecret === 'string') {
					return true;
				}

				// The endpoint exists but we no longer hold its one-time signing
				// secret (BTCMatic never returns it again). Revoke and recreate so
				// signature verification keeps working.
				try {
					await btcmaticApiRequest.call(this, 'DELETE', `/webhook-endpoints/${existing.id}`);
				} catch (error) {
					// Already revoked elsewhere — creating a fresh one is still correct.
					this.logger.warn(
						`BTCMatic: could not revoke stale webhook endpoint ${existing.id}: ${(error as Error).message}`,
					);
				}
				delete staticData.webhookId;
				delete staticData.webhookSecret;
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const staticData = this.getWorkflowStaticData('node');

				const response = await btcmaticApiRequest.call(this, 'POST', '/webhook-endpoints', {
					url: webhookUrl,
				});

				staticData.webhookId = response.id as string;
				staticData.webhookSecret = response.secret as string;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const webhookId = staticData.webhookId as string | undefined;

				if (webhookId !== undefined) {
					try {
						await btcmaticApiRequest.call(this, 'DELETE', `/webhook-endpoints/${webhookId}`);
					} catch (error) {
						// 404 = already revoked; nothing to clean up server-side.
						this.logger.warn(
							`BTCMatic: could not revoke webhook endpoint ${webhookId}: ${(error as Error).message}`,
						);
					}
				}
				delete staticData.webhookId;
				delete staticData.webhookSecret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const res = this.getResponseObject();
		const options = this.getNodeParameter('options', {}) as {
			allowUnsigned?: boolean;
			toleranceSeconds?: number;
		};
		const staticData = this.getWorkflowStaticData('node');
		const secret = staticData.webhookSecret as string | undefined;

		const signatureHeader = req.headers['x-btcmatic-signature'] as string | undefined;
		const rawBody =
			(req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));

		const signatureValid =
			secret !== undefined &&
			verifyBtcmaticSignature(secret, signatureHeader, rawBody, options.toleranceSeconds ?? 300);

		if (!signatureValid && options.allowUnsigned !== true) {
			res.status(401).json({ code: 'signature_invalid', message: 'signature verification failed' });
			return { noWebhookResponse: true };
		}

		const body = this.getBodyData() as IDataObject;
		const deliveryKey = (req.headers['x-btcmatic-delivery'] as string | undefined) ?? null;

		return {
			workflowData: [
				this.helpers.returnJsonArray([
					{
						...body,
						delivery_key: deliveryKey,
						signature_valid: signatureValid,
					},
				]),
			],
		};
	}
}
