/**
 *
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var PASSWORD_LOGIN = 'password';
var GOOGLE_SIGNIN  = 'https://accounts.google.com';
var FACEBOOK_LOGIN = 'https://www.facebook.com';
var DEFAULT_IMG    = '/images/default_img.png';

/*
  Although this sample app is using Polymer, most of the interactions are
  handled using regular APIs so you don't have to learn about it.
 */
var app = document.querySelector('#app');
app.cmaEnabled = !!navigator.credentials;
// `selected` is used to show a portion of our page
app.selected = 0;
// User profile automatically show up when an object is set.
app.userProfile = null;
// Set an event listener to show a toast. (Polymer)
app.listeners = {
  'show-toast': 'showToast'
};

/**
 * Let users sign-in without typing credentials
 * @param  {Boolean} unmediated Determines if user mediation is required.
 * @return {Promise} Resolves if credential info is available.
 */
app._autoSignIn = function(unmediated) {
  if (navigator.credentials) {
    // Actual Credential Management API call to get credential object
    return navigator.credentials.get({
      password: true,
      federated: {
        providers: [GOOGLE_SIGNIN, FACEBOOK_LOGIN]
      },
      unmediated: unmediated
    }).then(function(cred) {
      // If credential object is available
      if (cred) {
        console.log('auto sign-in performed');

        switch (cred.type) {
          case 'password':
            // Change form `id` name to `email`
            cred.idName = 'email';
            // Include CSRF token in the credential object
            var csrf_token = new FormData();
            csrf_token.append('csrf_token',
                document.querySelector('#csrf_token').value);
            // `.additionalData` accepts `FormData`
            // You can include CSRF token etc.
            cred.additionalData = csrf_token;
            // Return Promise from `pwSignIn`
            return app.pwSignIn(cred);
          case 'federated':
            switch (cred.provider) {
              case GOOGLE_SIGNIN:
                // Return Promise from `gSignIn`
                return app.gSignIn(cred.id);
              case FACEBOOK_LOGIN:
                // Return Promise from `fbSignIn`
                return app.fbSignIn();
            }
            break;
        }
      } else {
        console.log('auto sign-in not performed');

        // Resolve if credential object is not available
        return Promise.resolve();
      }
    });
  } else {
    // Resolve if Credential Management API is not available
    return Promise.resolve();
  }
};

/**
 * Authentication flow with our own server
 * @param  {String} provider Credential type string.
 * @param  {FormData} form FormData to POST to the server
 * @return {Promise} Resolves when successfully authenticated
 */
app._authenticateWithServer = function(provider, form) {
  var url = '';
  switch (provider) {
    case FACEBOOK_LOGIN:
      url = '/auth/facebook';
      break;
    case GOOGLE_SIGNIN:
      url = '/auth/google';
      break;
    case PASSWORD_LOGIN:
      url = '/auth/password';
      break;
  }

  return fetch(url, {
    method:      'POST',
    // `credentials:'include'` is required to include cookies on `fetch`
    credentials: 'include',
    body:        form
  }).then(function(res) {
    // Convert JSON string to an object
    if (res.status === 200) {
      return res.json();
    } else {
      return Promise.reject();
    }
  }).then(app.signedIn);
};

/**
 * When password sign-in button is pressed.
 * @return {void}
 */
app.onPwSignIn = function(e) {
  e.preventDefault();

  var signinForm = e.target;

  // Polymer `iron-form` feature to validate the form
  if (!signinForm.validate()) return;

  if (navigator.credentials) {
    // Construct `FormData` object from actual `form`
    var cred = new PasswordCredential(signinForm);

    // Sign-In with our own server
    app.pwSignIn(cred)
    .then(function(profile) {
      app.$.dialog.close();

      // `profile` may involve user name returned by the server
      cred.name = profile.name;
      // Store credential information before posting
      navigator.credentials.store(cred);
      app.fire('show-toast', {
        text: 'You are signed in'
      });
    }, function() {
      // Polymer event to notice user that 'Authentication failed'.
      app.fire('show-toast', {
        text: 'Authentication failed'
      });
    });
  } else {
    app._authenticateWithServer(PASSWORD_LOGIN, new FormData(signinForm))
    .then(function() {
      app.$.dialog.close();

      app.fire('show-toast', {
        text: 'You are signed in'
      });
    }, function() {
      app.fire('show-toast', {
        text: 'Authentication failed'
      });
    });
  }
};

/**
 * Let user sign-in using id/password
 * @param  {CredentialObject} cred FormData or CredentialObject
 * @return {Promise} Returns result of `_authenticateWithServer()`
 */
app.pwSignIn = function(cred) {
  // POST-ing credential object will be converted to FormData object
  return fetch('/auth/password', {
    method:       'POST',
    // Include the credential object as `credentials`
    credentials:  cred
  }).then(function(res) {
    // Convert JSON string to an object
    if (res.status === 200) {
      return res.json();
    } else {
      return Promise.reject();
    }
  }).then(app.signedIn);
};

/**
 * When google sign-in button is pressed.
 * @return {void}
 */
app.onGSignIn = function() {
  app.gSignIn()
  .then(function(profile) {
    app.$.dialog.close();

    if (navigator.credentials) {
      // Create `Credential` object for federation
      var cred = new FederatedCredential({
        id:       profile.email,
        name:     profile.name,
        iconURL:  profile.imageUrl || DEFAULT_IMG,
        provider: GOOGLE_SIGNIN
      });
      // Store credential information after successful authentication
      navigator.credentials.store(cred);
    }
    app.fire('show-toast', {
      text: 'You are signed in'
    });
  }, function() {
    // Polymer event to notice user that 'Authentication failed'.
    app.fire('show-toast', {
      text: 'Authentication failed'
    });
  });
};

/**
 * Let user sign-in using Google Sign-in
 * @param  {String} id Preferred Gmail address for user to sign-in
 * @return {Promise} Returns result of authFlow
 */
app.gSignIn = function(id) {
  // Return Promise after Facebook Login dance.
  return (function() {
    var auth2 = gapi.auth2.getAuthInstance();
    if (auth2.isSignedIn.get()) {
      // Check if currently signed in user is the same as intended.
      var googleUser = auth2.currentUser.get();
      if (googleUser.getBasicProfile().getEmail() === id) {
        return Promise.resolve(googleUser);
      }
    }
    // If the user is not signed in with expected account, let sign in.
    return auth2.signIn({
      // Set `login_hint` to specify an intended user account,
      // otherwise user selection dialog will popup.
      login_hint: id || ''
    });
  })().then(function(googleUser) {
    // Now user is successfully authenticated with Google.
    // Send ID Token to the server to authenticate with our server.
    form = new FormData();
    form.append('id_token', googleUser.getAuthResponse().id_token);
    // Don't forget to include the CSRF Token.
    form.append('csrf_token', document.querySelector('#csrf_token').value);
    return app._authenticateWithServer(GOOGLE_SIGNIN, form);
  }).then(app.signedIn);
};

/**
 * When facebook login button is pressed.
 * @return {void}
 */
app.onFbSignIn = function() {
  app.fbSignIn()
  .then(function(profile) {
    app.$.dialog.close();

    if (navigator.credentials) {
      // Create `Credential` object for federation
      var cred = new FederatedCredential({
        id:       profile.email,
        name:     profile.name,
        iconURL:  profile.imageUrl || DEFAULT_IMG,
        provider: FACEBOOK_LOGIN
      });
      // Store credential information after successful authentication
      navigator.credentials.store(cred);
    }
    app.fire('show-toast', {
      text: 'You are signed in'
    });
  }, function() {
    // Polymer event to notice user that 'Authentication failed'.
    app.fire('show-toast', {
      text: 'Authentication failed'
    });
  });
};

/**
 * Let user sign-in using Facebook Login
 * @return {Promise} Returns result of authFlow
 */
app.fbSignIn = function() {
  // Return Promise after Facebook Login dance.
  return (function() {
    return new Promise(function(resolve) {
      FB.getLoginStatus(function(res) {
        if (res.status == 'connected') {
          resolve(res);
        } else {
          FB.login(resolve, {scope: 'email'});
        }
      });
    });
  })().then(function(res) {
    // On successful authentication with Facebook
    if (res.status == 'connected') {
      var form = new FormData();
      // For Facebook, we use the Access Token to authenticate.
      form.append('access_token', res.authResponse.accessToken);
      // Don't forget to include the CSRF Token.
      form.append('csrf_token', document.querySelector('#csrf_token').value);
      return app._authenticateWithServer(FACEBOOK_LOGIN, form);
    } else {
      // When authentication was rejected by Facebook
      return Promise.reject();
    }
  }).then(app.signedIn);
};

/**
 * Invoked when 'Register' button is pressed, performs registration flow
 * and let user sign-in.
 * @return {void}
 */
app.onRegister = function(e) {
  e.preventDefault();

  var regForm = e.target;

  // Polymer `iron-form` feature to validate the form
  if (!regForm.validate()) return;

  fetch('/register', {
    method:       'POST',
    // `credentials:'include'` is required to include cookie on `fetch`
    credentials:  'include',
    body:         new FormData(regForm)
  }).then(function(res) {
    if (res.status == 200) {
      return res.json();
    } else {
      return Promise.reject();
    }
  })
  .then(app.signedIn)
  .then(function(profile) {
    app.fire('show-toast', {
      text: 'Thanks for signing up!'
    });

    if (navigator.credentials) {
      // Create password credential
      var cred = new PasswordCredential(regForm);
      cred.idName = 'email';
      cred.name = profile.name;
      cred.iconURL = profile.imageUrl;

      // Store user information as this is registration using id/password
      navigator.credentials.store(cred);
    }
  }).catch(function() {
    app.fire('show-toast', {
      text: 'Registration failed'
    });
  });
};

/**
 * Invoked when 'Unregister' button is pressed, unregisters user.
 * @return {[type]} [description]
 */
app.onUnregister = function() {
  var form = new FormData();
  // POST `id` to `/unregister` to unregister the user
  form.append('id', app.userProfile.id);
  // Don't forget to include the CSRF Token.
  form.append('csrf_token', document.querySelector('#csrf_token').value);

  fetch('/unregister', {
    method:       'POST',
    // `credentials:'include'` is required to include cookie on `fetch`
    credentials:  'include',
    body:         form
  }).then(function(res) {
    if (res.status != 200) {
      throw 'Could not unregister';
    }
    if (navigator.credentials) {
      // Turn on the mediation mode so auto sign-in won't happen
      // until next time user intended to do so.
      navigator.credentials.requireUserMediation();
    }
    app.userProfile = null;
    app.fire('show-toast', {
      text: "You're unregistered."
    });
    app.selected = 0;
  }).catch(function() {
    app.fire('show-toast', {
      text: 'Failed to unregister'
    });
  });
};

/**
 * Invoked when 'Sign-out' button is pressed, performs sign-out.
 * @return {void}
 */
app.signOut = function() {
  var form = new FormData();
  // Don't forget to include the CSRF Token.
  form.append('csrf_token', document.querySelector('#csrf_token').value);

  fetch('/signout', {
    method:       'POST',
    // `credentials:'include'` is required to include cookie on `fetch`
    credentials:  'include',
    body:         form
  }).then(function() {
    if (navigator.credentials) {
      // Turn on the mediation mode so auto sign-in won't happen
      // until next time user intended to do so.
      navigator.credentials.requireUserMediation();
    }
    app.userProfile = null;
    app.fire('show-toast', {
      text: "You're signed out."
    });
  }, function() {
    app.fire('show-toast', {
      text: 'Failed to sign out'
    });
  });
};

/**
 * User is signed in. Fill user info.
 * @param  {Object} profile Profile information object
 * @return {Promise} Resolves when authentication succeeded.
 */
app.signedIn = function(profile) {
  if (profile && profile.name && profile.email) {
    app.userProfile = {
      id:       profile.id,
      name:     profile.name,
      email:    profile.email,
      imageUrl: profile.imageUrl || DEFAULT_IMG
    };
    return Promise.resolve(profile);
  } else {
    return Promise.reject();
  }
};

/**
 * Polymer event handler to show a toast.
 * @param  {Event} e Polymer custom event object
 * @return {void}
 */
app.showToast = function(e) {
  this.$.toast.text = e.detail.text;
  this.$.toast.show();
};

/**
 * Invoked when 'Sign-In' button is pressed, perform auto-sign-in and
 * open dialog if it fails.
 * @return {void}
 */
app.openDialog = function() {
  // Try auto sign-in before opening the dialog
  app._autoSignIn(false)
  .then(function(profile) {
    // When auto sign-in didn't resolve with a profile
    // it's failed to get credential information.
    // Open the form so the user can enter id/password
    // or select federated login manually
    if (!profile) {
      app.$.dialog.open();
    }
  }, function() {
    app.$.dialog.open();
    // When rejected, authentication was performed but failed.
    app.fire('show-toast', {
      text: 'Authentication failed'
    });
  });
};

// Initialise Facebook Login
FB.init({
  // Replace this with your own App ID
  appId:    FB_APPID,
  cookie:   true,
  xfbml:    false,
  version:  'v2.5'
});

// Initialise Google Sign-In
gapi.load('auth2', function() {
  gapi.auth2.init().then(function() {
    if (navigator.credentials) {
      // Try auto sign-in performance after initialization
      app._autoSignIn(true);
    }
  });
});
