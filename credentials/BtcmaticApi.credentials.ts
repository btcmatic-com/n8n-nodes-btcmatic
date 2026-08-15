import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class BtcmaticApi implements ICredentialType {
	name = 'btcmaticApi';

	displayName = 'BTCMatic API';

	icon: Icon = {
		light: 'file:../nodes/Btcmatic/btcmatic.svg',
		dark: 'file:../nodes/Btcmatic/btcmatic.dark.svg',
	};

	documentationUrl = 'https://btcmatic.com/integrations/n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'A BTCMatic API key (starts with btcm_). Create one in the BTCMatic web app under Settings → API keys. API keys are management + dry-run scoped: they can never create or enable live order rules.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.btcmatic.com',
			description: 'BTCMatic API origin. Only change this if you were told to use a different environment.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/me',
		},
	};
}
