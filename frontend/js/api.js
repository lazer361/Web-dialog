// Небольшой клиент для SOAP-запросов к серверу.
(function(window) {
  var TOKEN_KEY = 'webdialog_token';
  var USER_KEY = 'webdialog_user';
  var SOAP_URL = '/api/soap.php';
  var NS = 'http://localhost/webdialog/messenger';

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function buildEnvelope(method, params) {
    var body = Object.keys(params || {}).map(function(key) {
      return '<' + key + '>' + escapeXml(params[key]) + '</' + key + '>';
    }).join('');

    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="' + NS + '">' +
      '<soapenv:Body>' +
      '<tns:' + method + '>' + body + '</tns:' + method + '>' +
      '</soapenv:Body>' +
      '</soapenv:Envelope>';
  }

  function textFrom(parent, tagName) {
    if (!parent) {
      return '';
    }
    var items = parent.getElementsByTagName(tagName);
    if (!items.length) {
      return '';
    }
    return items[0].textContent || '';
  }

  function boolValue(value) {
    return value === 'true' || value === '1';
  }

  function parseUser(node) {
    if (!node) {
      return null;
    }
    return {
      id: Number(textFrom(node, 'id')) || 0,
      name: textFrom(node, 'name'),
      email: textFrom(node, 'email'),
      created_at: textFrom(node, 'created_at')
    };
  }

  function parseMessage(node) {
    return {
      id: Number(textFrom(node, 'id')) || 0,
      sender_id: Number(textFrom(node, 'sender_id')) || 0,
      receiver_id: Number(textFrom(node, 'receiver_id')) || 0,
      text: textFrom(node, 'text'),
      created_at: textFrom(node, 'created_at'),
      is_read: boolValue(textFrom(node, 'is_read'))
    };
  }

  function parseResponse(xmlText) {
    var documentXml = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (documentXml.getElementsByTagName('parsererror').length) {
      return { success: false, message: 'Сервер вернул некорректный XML-ответ' };
    }

    var fault = documentXml.getElementsByTagName('faultstring')[0];
    if (fault) {
      return { success: false, message: fault.textContent || 'Ошибка SOAP-запроса' };
    }

    var returnNode = documentXml.getElementsByTagName('return')[0];
    if (!returnNode) {
      return { success: false, message: 'Сервер вернул пустой SOAP-ответ' };
    }

    var result = {
      success: boolValue(textFrom(returnNode, 'success')),
      message: textFrom(returnNode, 'message')
    };

    var token = textFrom(returnNode, 'token');
    if (token) {
      result.token = token;
    }

    var expiresAt = textFrom(returnNode, 'expires_at');
    if (expiresAt) {
      result.expires_at = expiresAt;
    }

    var userNode = returnNode.getElementsByTagName('user')[0];
    if (userNode) {
      result.user = parseUser(userNode);
    }

    var usersNode = returnNode.getElementsByTagName('users')[0];
    if (usersNode) {
      result.users = Array.prototype.map.call(usersNode.getElementsByTagName('item'), parseUser);
    }

    var messagesNode = returnNode.getElementsByTagName('messages')[0];
    if (messagesNode) {
      result.messages = Array.prototype.map.call(messagesNode.getElementsByTagName('item'), parseMessage);
    }

    return result;
  }

  function soap(method, params) {
    return fetch(SOAP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': method
      },
      body: buildEnvelope(method, params || {})
    }).then(function(response) {
      return response.text().then(function(text) {
        if (!response.ok) {
          return { success: false, message: 'Ошибка сервера: ' + response.status };
        }
        return parseResponse(text);
      });
    }).catch(function() {
      return { success: false, message: 'Сервер недоступен. Проверьте запуск проекта.' };
    });
  }

  function saveSession(data) {
    if (data.token) {
      localStorage.setItem(TOKEN_KEY, data.token);
    }
    if (data.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    }
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function getSavedUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch (error) {
      return null;
    }
  }

  window.WebDialogApi = {
    register: function(name, email, password) {
      return soap('Register', { name: name, email: email, password: password });
    },
    login: function(email, password) {
      return soap('Login', { email: email, password: password });
    },
    logout: function(token) {
      return soap('Logout', { token: token });
    },
    getCurrentUser: function(token) {
      return soap('GetCurrentUser', { token: token });
    },
    getUsers: function(token) {
      return soap('GetUsers', { token: token });
    },
    getMessages: function(token, otherUserId, limit) {
      return soap('GetMessages', { token: token, otherUserId: otherUserId, limit: limit || 50 });
    },
    saveSession: saveSession,
    clearSession: clearSession,
    getToken: getToken,
    getSavedUser: getSavedUser
  };
})(window);
