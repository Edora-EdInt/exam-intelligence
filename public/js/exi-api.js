/* EdInt Intelligence - tiny fetch wrapper.
   All frontend data access goes through window.exiApi; pages never call
   fetch directly and never contain business logic. */
(function () {
  'use strict';

  function request(method, path, body) {
    var options = { method: method, headers: { Accept: 'application/json' } };
    if (body !== undefined && body !== null) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    return fetch(path, options).then(
      function (response) {
        return response.json().catch(function () {
          return null;
        }).then(function (body) {
          if (!response.ok) {
            var message =
              body && body.error && body.error.message
                ? body.error.message
                : method + ' ' + path + ' failed (' + response.status + ')';
            var error = new Error(message);
            error.status = response.status;
            error.body = body;
            throw error;
          }
          return body;
        });
      }
    );
  }

  window.exiApi = {
    get: function (path) {
      return request('GET', path);
    },
    post: function (path, body) {
      return request('POST', path, body);
    },
    request: request,
  };
})();
