# quanvio-react-native-sdk

This is Quanvio's SDK for react-native will allow you to easily connect your application to the Quanvio One authentication system (https://one.quanvio.com) without having to implement it from scratch.
Quanvio SDK is very simple to use. We will show you the steps below.

## Usage in NPM environment

### Installation

~~~shell script
# NPM
npm i quanvio-react-native-sdk @react-native-async-storage/async-storage

# Yarn
yarn add quanvio-react-native-sdk @react-native-async-storage/async-storage
~~~

### Init SDK

Initialization requires 7 parameters, which are all string type:

| Name (in order)  | Must | Description                                         |
| ---------------- | ---- | --------------------------------------------------- |
| serverUrl  | Yes  | your Quanvio One server URL, e.g. `https://one.quanvio.com` |
| clientId         | Yes  | the Client ID of your Quanvio One application|
| appName           | Yes  | the name of your Quanvio One application |
| organizationName     | Yes  | the name of the organization connected with your Quanvio One application                    |
| redirectPath     | No  | the redirect URL for your Quanvio One application, e.g., `myapp://callback`; a path like `/callback` is prefixed with the current origin on the web, will be `/callback` if not provided              |
| signinPath     | No  | the path of the signin URL for your Quanvio One application, will be `/api/signin` if not provided              |

```typescript
import SDK from 'quanvio-react-native-sdk'

const sdkConfig = {
  serverUrl: 'https://one.quanvio.com',
  clientId: 'b800a86702dd4d29ec4d',
  appName: 'app-example',
  organizationName: 'quanvio',
  redirectPath: 'http://localhost:5000/callback',
  signinPath: '/api/signin',
};
const sdk = new SDK(sdkConfig)
// call sdk to handle
```

## Usage in Expo

The SDK works in the Expo managed workflow without `react-native-webview` or manual deep-link handling: `signin()` opens the Quanvio One login page in the system auth browser and returns the access token after the redirect.

### Installation

~~~shell script
npx expo install quanvio-react-native-sdk @react-native-async-storage/async-storage expo-auth-session expo-web-browser expo-crypto react-native-get-random-values
~~~

### Configure the redirect URI

1. Add a scheme to `app.json`, so that the app can be opened by the redirect URI:

```json
{
  "expo": {
    "scheme": "myapp"
  }
}
```

2. Add the redirect URI to the **Redirect URLs** of your application in Quanvio One. `AuthSession.makeRedirectUri({ path: 'callback' })` returns `myapp://callback` in a standalone or development build, and `exp://<your-ip>:8081/--/callback` in Expo Go; add the one you use.

### Sign in

```typescript
// must be imported before the SDK: the PKCE code is generated with crypto.getRandomValues(), which Hermes does not provide
import 'react-native-get-random-values';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import SDK from 'quanvio-react-native-sdk';

WebBrowser.maybeCompleteAuthSession();

const sdk = new SDK({
  serverUrl: 'https://one.quanvio.com',
  clientId: 'b800a86702dd4d29ec4d',
  appName: 'app-example',
  organizationName: 'quanvio',
  redirectPath: AuthSession.makeRedirectUri({ path: 'callback' }),
});

const login = async () => {
  const token = await sdk.signin(WebBrowser.openAuthSessionAsync);
  if (token) {
    const user = sdk.JwtDecode(token);
  }
};
```

`silentSignin()` relies on a hidden iframe and only works on the web; in native apps it calls `onFailure`.

## Usage in vanilla Javascript

### Import and init SDK

Initialization parameters are consistent with the previous node.js section:

```javascript
<!--init the SDK-->
  import SDK from 'quanvio-react-native-sdk'
  const sdkConfig = {
    serverUrl: 'https://one.quanvio.com',
    clientId: 'b800a86702dd4d29ec4d',
    appName: 'app-example',
    organizationName: 'quanvio',
    redirectPath: 'http://localhost:5000/callback',
    signinPath: '/api/signin',
  };
  const sdk = new SDK(sdkConfig)
```

### Call functions in SDK

```javascript
  // call sdk to handle
  sdk.getSignupUrl();
```

## API reference interface

#### Get sign up url

```typescript
getSignupUrl()
```

Return the Quanvio One url that navigates to the registration screen

#### Get sign in url

```typescript
getSigninUrl()
```

Return the Quanvio One url that navigates to the login screen

#### Get user profile page url

```typescript
getUserProfileUrl(userName, account)
```

Return the url to navigate to a specific user's Quanvio One personal page

#### Get my profile page url

```typescript
getMyProfileUrl(account)
```

#### signin

```typescript
signin(openAuthSession) // e.g., sdk.signin(WebBrowser.openAuthSessionAsync)
```

Open the login page with `openAuthSession(url, redirectUri)`, which should resolve to `{ type: 'success', url }` after the browser is redirected back, and return the access token. Return `undefined` if the user cancels the login.

#### getAccessToken

```typescript
getAccessToken(redirectUrl); // http://localhost:5000/callback?code=b75bc5c5ac65ffa516e5&state=gjmfdgqf498
```

Handle the callback url from Quanvio One, call the back-end api to complete the login process

#### Determine whether silent sign-in is being used

```typescript
isSilentSigninRequested()
```

We usually use this method to determine if silent login is being used. By default, if the silentSignin parameter is included in the URL and equals one, this method will return true. Of course, you can also use any method you prefer.

#### silentSignin

````typescript
silentSignin(onSuccess, onFailure)
````

First, let's explain the two parameters of this method, which are the callback methods for successful and failed login. Next, I will describe the execution process of this method. We will create a hidden "iframe" element to redirect to the login page for authentication, thereby achieving the effect of silent sign-in.

#### JwtDecode

````typescript
JwtDecode(jwtToken)
````


## License

[Apache-2.0](LICENSE)
