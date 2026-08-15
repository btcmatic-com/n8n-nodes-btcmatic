import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { btcmaticApiRequest, signBtcmaticPayload } from './GenericFunctions';

export class Btcmatic implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'BTCMatic',
		name: 'btcmatic',
		icon: { light: 'file:btcmatic.svg', dark: 'file:btcmatic.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Manage BTCMatic rules, read fires and orders, run backtests and send events into webhook-triggered rules',
		defaults: {
			name: 'BTCMatic',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'btcmaticApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Backtest', value: 'backtest' },
					{ name: 'Fire', value: 'fire' },
					{ name: 'Inbound Hook', value: 'inboundHook' },
					{ name: 'Order', value: 'order' },
					{ name: 'Rule', value: 'rule' },
				],
				default: 'rule',
			},

			// ─── Rule operations ─────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['rule'] } },
				options: [
					{
						name: 'Create',
						value: 'create',
						description:
							'Create a rule. Order rules created via API key always start in dry-run mode.',
						action: 'Create a rule',
					},
					{
						name: 'Delete',
						value: 'delete',
						description: 'Permanently delete a rule',
						action: 'Delete a rule',
					},
					{
						name: 'Disable',
						value: 'disable',
						description: 'Pause a rule (legal from any state)',
						action: 'Disable a rule',
					},
					{
						name: 'Enable',
						value: 'enable',
						description: 'Resume a disabled rule',
						action: 'Enable a rule',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get a single rule',
						action: 'Get a rule',
					},
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'List all rules',
						action: 'Get many rules',
					},
					{
						name: 'Reactivate',
						value: 'reactivate',
						description: 'Clear a suspended state (e.g. after fixing exchange keys)',
						action: 'Reactivate a rule',
					},
					{
						name: 'Update',
						value: 'update',
						description: 'Replace a rule document (full PUT)',
						action: 'Update a rule',
					},
				],
				default: 'getMany',
			},

			// ─── Fire / Order operations ─────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['fire'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'List rule fires with their evaluation traces, newest first',
						action: 'Get many fires',
					},
				],
				default: 'getMany',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['order'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'List orders (live and simulated), newest first',
						action: 'Get many orders',
					},
				],
				default: 'getMany',
			},

			// ─── Backtest operations ─────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['backtest'] } },
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Queue a backtest run (returns immediately; poll with Get)',
						action: 'Create a backtest',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get backtest status and report',
						action: 'Get a backtest',
					},
				],
				default: 'create',
			},

			// ─── Inbound hook operations ─────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['inboundHook'] } },
				options: [
					{
						name: 'Create',
						value: 'create',
						description:
							'Create an inbound hook. The delivery path and signing secret are returned exactly once — store them.',
						action: 'Create an inbound hook',
					},
					{
						name: 'Delete',
						value: 'delete',
						description: 'Revoke an inbound hook (deliveries 404 afterwards)',
						action: 'Delete an inbound hook',
					},
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'List inbound hooks (tokens and secrets are never returned)',
						action: 'Get many inbound hooks',
					},
					{
						name: 'Send Event',
						value: 'sendEvent',
						description:
							'Post an event to an inbound hook so webhook-triggered BTCMatic rules can evaluate it',
						action: 'Send an event to an inbound hook',
					},
				],
				default: 'sendEvent',
			},

			// ─── Rule fields ─────────────────────────────────────────────────
			{
				displayName: 'Rule ID',
				name: 'ruleId',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'rul_01hxyz…',
				displayOptions: {
					show: {
						resource: ['rule'],
						operation: ['delete', 'disable', 'enable', 'get', 'reactivate', 'update'],
					},
				},
			},
			{
				displayName: 'Rule Document',
				name: 'ruleJson',
				type: 'json',
				required: true,
				default: '',
				description:
					'The full rule document (name, trigger, condition, action, …) as accepted by POST /rules — see the OpenAPI spec at api.btcmatic.com/docs. Setting mode "live" on an exchange-order rule is rejected for API keys; omit mode and promote the rule in the web app instead.',
				displayOptions: { show: { resource: ['rule'], operation: ['create', 'update'] } },
			},

			// ─── Fire / order fields ─────────────────────────────────────────
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 200 },
				default: 50,
				description: 'Max number of results to return',
				displayOptions: { show: { resource: ['fire', 'order'], operation: ['getMany'] } },
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add filter',
				default: {},
				displayOptions: { show: { resource: ['fire', 'order'], operation: ['getMany'] } },
				options: [
					{
						displayName: 'Before',
						name: 'before',
						type: 'dateTime',
						default: '',
						description:
							'Only results before this timestamp (keyset pagination cursor — feed next_before back in here)',
					},
					{
						displayName: 'Rule ID',
						name: 'ruleId',
						type: 'string',
						default: '',
						description: 'Only results for this rule',
					},
				],
			},

			// ─── Backtest fields ─────────────────────────────────────────────
			{
				displayName: 'Rule Source',
				name: 'ruleSource',
				type: 'options',
				options: [
					{ name: 'Existing Rule', value: 'ruleId' },
					{ name: 'Inline Rule Document', value: 'ruleDoc' },
				],
				default: 'ruleId',
				displayOptions: { show: { resource: ['backtest'], operation: ['create'] } },
			},
			{
				displayName: 'Rule ID',
				name: 'ruleId',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'rul_01hxyz…',
				displayOptions: {
					show: { resource: ['backtest'], operation: ['create'], ruleSource: ['ruleId'] },
				},
			},
			{
				displayName: 'Rule Document',
				name: 'ruleJson',
				type: 'json',
				required: true,
				default: '',
				description:
					'Inline rule document to backtest without saving it. Only price_tick, fee_estimate, schedule and macro_event triggers are replayable.',
				displayOptions: {
					show: { resource: ['backtest'], operation: ['create'], ruleSource: ['ruleDoc'] },
				},
			},
			{
				displayName: 'From',
				name: 'from',
				type: 'dateTime',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['backtest'], operation: ['create'] } },
			},
			{
				displayName: 'To',
				name: 'to',
				type: 'dateTime',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['backtest'], operation: ['create'] } },
			},
			{
				displayName: 'Parameters',
				name: 'params',
				type: 'json',
				default: '',
				description: 'Optional backtest parameters (slippage, fee tier, sampling) as JSON',
				displayOptions: { show: { resource: ['backtest'], operation: ['create'] } },
			},
			{
				displayName: 'Backtest ID',
				name: 'backtestId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['backtest'], operation: ['get'] } },
			},

			// ─── Inbound hook fields ─────────────────────────────────────────
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g. TradingView alerts',
				displayOptions: { show: { resource: ['inboundHook'], operation: ['create'] } },
			},
			{
				displayName: 'Hook ID',
				name: 'hookId',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'whi_01hxyz…',
				displayOptions: { show: { resource: ['inboundHook'], operation: ['delete'] } },
			},
			{
				displayName: 'Hook URL',
				name: 'hookUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://api.btcmatic.com/hooks/whi_…/…  or  /hooks/whi_…/…',
				description:
					'The delivery URL (or path) returned once when the hook was created. A path is resolved against the credential base URL.',
				displayOptions: { show: { resource: ['inboundHook'], operation: ['sendEvent'] } },
			},
			{
				displayName: 'Fields',
				name: 'fields',
				type: 'json',
				required: true,
				default: '',
				description:
					'Flat JSON object of event fields (max 32 keys, snake_case, string or number values only — no nesting). These become metrics your webhook-triggered rule conditions can reference.',
				displayOptions: { show: { resource: ['inboundHook'], operation: ['sendEvent'] } },
			},
			{
				displayName: 'Options',
				name: 'sendOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { resource: ['inboundHook'], operation: ['sendEvent'] } },
				options: [
					{
						displayName: 'Idempotency Key',
						name: 'idempotencyKey',
						type: 'string',
						default: '',
						description:
							'Sent as X-BTCMatic-Idempotency (max 128 chars). Two deliveries with the same key deduplicate; defaults to a hash of the body.',
					},
					{
						displayName: 'Signing Secret',
						name: 'signingSecret',
						type: 'string',
						typeOptions: { password: true },
						default: '',
						description:
							'The hook signing secret (shown once at creation). When set, the delivery is HMAC-signed with the X-BTCMatic-Signature header.',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		const parseJsonParameter = (raw: unknown, itemIndex: number, label: string): IDataObject => {
			if (typeof raw === 'object' && raw !== null) return raw as IDataObject;
			try {
				return JSON.parse(raw as string) as IDataObject;
			} catch {
				throw new NodeOperationError(this.getNode(), `${label} is not valid JSON`, { itemIndex });
			}
		};

		for (let i = 0; i < items.length; i++) {
			try {
				let responseData: IDataObject | IDataObject[] = {};

				if (resource === 'rule') {
					if (operation === 'getMany') {
						const response = await btcmaticApiRequest.call(this, 'GET', '/rules');
						responseData = (response.rules as IDataObject[]) ?? [];
					} else if (operation === 'get') {
						const ruleId = this.getNodeParameter('ruleId', i) as string;
						responseData = await btcmaticApiRequest.call(this, 'GET', `/rules/${ruleId}`);
					} else if (operation === 'create') {
						const rule = parseJsonParameter(
							this.getNodeParameter('ruleJson', i),
							i,
							'Rule Document',
						);
						responseData = await btcmaticApiRequest.call(this, 'POST', '/rules', rule);
					} else if (operation === 'update') {
						const ruleId = this.getNodeParameter('ruleId', i) as string;
						const rule = parseJsonParameter(
							this.getNodeParameter('ruleJson', i),
							i,
							'Rule Document',
						);
						responseData = await btcmaticApiRequest.call(this, 'PUT', `/rules/${ruleId}`, rule);
					} else if (operation === 'delete') {
						const ruleId = this.getNodeParameter('ruleId', i) as string;
						await btcmaticApiRequest.call(this, 'DELETE', `/rules/${ruleId}`);
						responseData = { deleted: true, rule_id: ruleId };
					} else {
						// enable | disable | reactivate
						const ruleId = this.getNodeParameter('ruleId', i) as string;
						responseData = await btcmaticApiRequest.call(
							this,
							'POST',
							`/rules/${ruleId}/${operation}`,
						);
					}
				} else if (resource === 'fire' || resource === 'order') {
					const limit = this.getNodeParameter('limit', i) as number;
					const filters = this.getNodeParameter('filters', i) as {
						ruleId?: string;
						before?: string;
					};
					const qs: IDataObject = { limit };
					if (filters.ruleId) qs.rule_id = filters.ruleId;
					if (filters.before) qs.before = new Date(filters.before).toISOString();
					const endpoint = resource === 'fire' ? '/fires' : '/orders';
					const response = await btcmaticApiRequest.call(this, 'GET', endpoint, undefined, qs);
					const rows =
						((resource === 'fire' ? response.fires : response.orders) as IDataObject[]) ?? [];
					responseData = rows.map((row) => ({ ...row, next_before: response.next_before ?? null }));
				} else if (resource === 'backtest') {
					if (operation === 'create') {
						const body: IDataObject = {
							from: new Date(this.getNodeParameter('from', i) as string).toISOString(),
							to: new Date(this.getNodeParameter('to', i) as string).toISOString(),
						};
						const ruleSource = this.getNodeParameter('ruleSource', i) as string;
						if (ruleSource === 'ruleId') {
							body.rule_id = this.getNodeParameter('ruleId', i) as string;
						} else {
							body.rule_doc = parseJsonParameter(
								this.getNodeParameter('ruleJson', i),
								i,
								'Rule Document',
							);
						}
						const paramsRaw = this.getNodeParameter('params', i, '') as unknown;
						if (paramsRaw !== '' && paramsRaw !== null && paramsRaw !== undefined) {
							body.params = parseJsonParameter(paramsRaw, i, 'Parameters');
						}
						responseData = await btcmaticApiRequest.call(this, 'POST', '/backtests', body);
					} else {
						const backtestId = this.getNodeParameter('backtestId', i) as string;
						responseData = await btcmaticApiRequest.call(this, 'GET', `/backtests/${backtestId}`);
					}
				} else if (resource === 'inboundHook') {
					if (operation === 'getMany') {
						const response = await btcmaticApiRequest.call(this, 'GET', '/inbound-hooks');
						responseData = (response.hooks as IDataObject[]) ?? [];
					} else if (operation === 'create') {
						const name = this.getNodeParameter('name', i) as string;
						responseData = await btcmaticApiRequest.call(this, 'POST', '/inbound-hooks', { name });
					} else if (operation === 'delete') {
						const hookId = this.getNodeParameter('hookId', i) as string;
						await btcmaticApiRequest.call(this, 'DELETE', `/inbound-hooks/${hookId}`);
						responseData = { deleted: true, hook_id: hookId };
					} else {
						// sendEvent — the ingest endpoint is public (token in URL), so this
						// deliberately does not attach the API-key credential.
						const hookUrlRaw = (this.getNodeParameter('hookUrl', i) as string).trim();
						const fields = parseJsonParameter(this.getNodeParameter('fields', i), i, 'Fields');
						const sendOptions = this.getNodeParameter('sendOptions', i) as {
							signingSecret?: string;
							idempotencyKey?: string;
						};

						let url = hookUrlRaw;
						if (url.startsWith('/')) {
							const credentials = await this.getCredentials('btcmaticApi');
							const baseUrl = ((credentials.baseUrl as string) || 'https://api.btcmatic.com').replace(
								/\/+$/,
								'',
							);
							url = `${baseUrl}${url}`;
						}

						const rawBody = JSON.stringify(fields);
						const headers: IDataObject = { 'content-type': 'application/json' };
						if (sendOptions.signingSecret) {
							headers['x-btcmatic-signature'] = signBtcmaticPayload(
								sendOptions.signingSecret,
								rawBody,
							);
						}
						if (sendOptions.idempotencyKey) {
							headers['x-btcmatic-idempotency'] = sendOptions.idempotencyKey;
						}

						// The ingest endpoint itself is public (the token lives in the URL);
						// the credential is used here only for consistent transport and
						// base-URL resolution. The extra Authorization header is ignored.
						const requestOptions: IHttpRequestOptions = {
							method: 'POST',
							url,
							headers,
							body: rawBody,
						};
						const response = (await this.helpers.httpRequestWithAuthentication.call(
							this,
							'btcmaticApi',
							requestOptions,
						)) as IDataObject | string;
						responseData = typeof response === 'string' ? { raw: response } : response;
					}
				}

				const asArray = Array.isArray(responseData) ? responseData : [responseData];
				for (const entry of asArray) {
					returnData.push({ json: entry, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error instanceof Error ? error.message : String(error) },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
