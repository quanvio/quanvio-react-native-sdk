// Copyright 2021 The casbin Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the 'License');
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an 'AS IS' BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import AsyncStorage from '@react-native-async-storage/async-storage';
import jwtDecode from 'jwt-decode';
import pkceChallenge from 'pkce-challenge';

export interface QuanvioConfig {
    serverUrl: string, // your Quanvio One server URL, e.g., 'https://one.quanvio.com'
    clientId: string, // the Client ID of your Quanvio One application, e.g., 'b800a86702dd4d29ec4d'
    appName: string, // the name of your Quanvio One application, e.g., 'app-example'
    organizationName: string // the name of the organization connected with your Quanvio One application, e.g., 'quanvio'
    redirectPath?: string // the redirect URI for your Quanvio One application, e.g., 'myapp://callback' (for Expo use AuthSession.makeRedirectUri()), will be '/callback' if not provided
    signinPath?: string // the path of the signin URL for your Quanvio One application, will be '/api/signin' if not provided
}

// reference: https://github.com/casdoor/casdoor-go-sdk/blob/90fcd5646ec63d733472c5e7ce526f3447f99f1f/auth/jwt.go#L19-L32
export interface Account {
    organization: string,
    username: string,
    type: string,
    name: string,
    avatar: string,
    email: string,
    phone: string,
    affiliation: string,
    tag: string,
    language: string,
    score: number,
    isAdmin: boolean,
    accessToken: string
}

// the result returned by an in-app auth browser, e.g., WebBrowser.openAuthSessionAsync() from expo-web-browser
export interface AuthSessionResult {
    type: string, // 'success' when the browser was redirected back to redirectUri, otherwise 'cancel', 'dismiss', etc.
    url?: string // the redirect URL with code and state, only present when type is 'success'
}

export type OpenAuthSession = (url: string, redirectUri: string) => Promise<AuthSessionResult>;

class QuanvioSdk {
    private config: QuanvioConfig

    constructor(config: QuanvioConfig) {
        this.config = config
        if (config.redirectPath === undefined || config.redirectPath === null) {
            this.config.redirectPath = '/callback';
        }
    }

    // The PKCE pair is kept in AsyncStorage (localStorage on the web) instead of memory, so the code verifier
    // survives the page redirect to Quanvio One and back, and is found by a new QuanvioSdk instance after the redirect.
    private async getPkce(): Promise<{ code_challenge: string; code_verifier: string }> {
        const savedPkce = await AsyncStorage.getItem('quanvio-pkce');
        if (savedPkce !== null) {
            return JSON.parse(savedPkce);
        }
        const pkce = await pkceChallenge();
        await AsyncStorage.setItem('quanvio-pkce', JSON.stringify(pkce));
        return pkce;
    }

    public async getSignupUrl(enablePassword: boolean = true): Promise<string> {
        const signinUrl = await this.getSigninUrl();
        if (enablePassword) {
            AsyncStorage.setItem('signinUrl', signinUrl);
            return `${this.config.serverUrl.trim()}/signup/${this.config.appName}`;
        } else {
            return signinUrl.replace('/login/oauth/authorize', '/signup/oauth/authorize');
        }
    }

    async getOrSaveState(): Promise<string> {
        const state = await AsyncStorage.getItem('quanvio-state');
        if (state !== null) {
            return state;
        } else {
            const state = Math.random().toString(36).slice(2);
            AsyncStorage.setItem('quanvio-state', state);
            return state;
        }
    }

    clearState() {
        AsyncStorage.removeItem('quanvio-state');
        AsyncStorage.removeItem('quanvio-pkce');
    }

    public getRedirectUri(): string {
        const redirectPath = this.config.redirectPath ?? '/callback';
        if (redirectPath.includes('://') || typeof window === 'undefined' || !window.location) {
            return redirectPath;
        }
        return `${window.location.origin}${redirectPath}`;
    }

    public async getSigninUrl(): Promise<string> {
        const redirectUri = this.getRedirectUri();
        const scope = 'read';
        const state = await this.getOrSaveState();
        const pkce = await this.getPkce();
        return `${this.config.serverUrl.trim()}/login/oauth/authorize?client_id=${this.config.clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}&code_challenge=${pkce.code_challenge}&code_challenge_method=S256`;
    }

    // Opens the Quanvio One login page with the given auth browser, e.g., WebBrowser.openAuthSessionAsync for Expo,
    // and exchanges the returned code for an access token. Returns undefined if the user cancels the login.
    public async signin(openAuthSession: OpenAuthSession): Promise<string | undefined> {
        const signinUrl = await this.getSigninUrl();
        const result = await openAuthSession(signinUrl, this.getRedirectUri());
        if (result.type !== 'success' || !result.url) {
            return undefined;
        }
        return this.getAccessToken(result.url);
    }

    public getUserProfileUrl(userName: string, account: Account): string {
        let param = '';
        if (account !== undefined && account !== null) {
            param = `?access_token=${account.accessToken}`;
        }
        return `${this.config.serverUrl.trim()}/users/${this.config.organizationName}/${userName}${param}`;
    }

    public getMyProfileUrl(account: Account, returnUrl: String = ''): string {
        let params = '';
        if (account !== undefined && account !== null) {
            params = `?access_token=${account.accessToken}`;
            if (returnUrl !== '') {
                params += `&returnUrl=${returnUrl}`;
            }
        } else if (returnUrl !== '') {
            params = `?returnUrl=${returnUrl}`;
        }
        return `${this.config.serverUrl.trim()}/account${params}`;
    }

    public JwtDecode(token: string) {
        return jwtDecode(token);
    }

    // URLSearchParams is not fully implemented in React Native, so parse the query string by hand
    private static getQueryParam(url: string, name: string): string | null {
        const query = url.split('#')[0].split('?')[1];
        if (!query) {
            return null;
        }
        for (const pair of query.split('&')) {
            const [key, value = ''] = pair.split('=');
            if (decodeURIComponent(key) === name) {
                return decodeURIComponent(value.replace(/\+/g, ' '));
            }
        }
        return null;
    }

    public async getAccessToken(redirectUrl: string): Promise<any> {
        const redirectUri = this.getRedirectUri();
        if (redirectUrl.startsWith(redirectUri)) {
            const code = QuanvioSdk.getQueryParam(redirectUrl, 'code');
            if (code === null) {
                console.error('Error during Signin Request:', QuanvioSdk.getQueryParam(redirectUrl, 'error') ?? redirectUrl);
                return;
            }
            const state = QuanvioSdk.getQueryParam(redirectUrl, 'state');
            if (state !== null) {
                await AsyncStorage.setItem('quanvio-state', state);
            }
            const codeVerifier = (await this.getPkce()).code_verifier;
            try {
                const response = await fetch(`${this.config.serverUrl.trim()}/api/login/oauth/access_token`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: `client_id=${this.config.clientId}&grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}&code_verifier=${codeVerifier}`,
                    credentials: 'include',
                });
                if (response.ok) {
                    const responseData = await response.json();
                    const token = responseData.access_token;
                    return token;
                } else {
                    console.error('Error during AccessToken Request:', response);
                }
            } catch (error) {
                console.error('Error during Signin Request:', error);
            } finally {
                // a code verifier is only valid for one authorization code, the next signin gets a new one
                await AsyncStorage.removeItem('quanvio-pkce');
            }
        }
    }

    public isSilentSigninRequested(): boolean {
        if (typeof window === 'undefined' || !window.location) {
            return false;
        }
        const params = new URLSearchParams(window.location.search);
        return params.get('silentSignin') === '1';
    }

    public silentSignin(onSuccess: (message: any) => void, onFailure: (message: any) => void) {
        if (typeof document === 'undefined') {
            onFailure({ tag: 'Casdoor', type: 'SilentSignin', data: 'silentSignin is not supported in React Native' });
            return;
        }
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        this.getSigninUrl().then(signinUrl => {
            iframe.src = `${signinUrl}&silentSignin=1`;
            document.body.appendChild(iframe);
        });
        const handleMessage = (event: MessageEvent) => {
            if (window !== window.parent) {
                return null;
            }

            const message = event.data;
            if (message.tag !== 'Casdoor' || message.type !== 'SilentSignin') {
                return;
            }
            if (message.data === 'success') {
                onSuccess(message);
            } else {
                onFailure(message);
            }
        };
        window.addEventListener('message', handleMessage);
    }

}

export default QuanvioSdk;
