// WebSocket используется для отправки новых сообщений без перезагрузки страницы.
(function(window) {
  function buildUrl() {
    var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return protocol + '//' + window.location.host + '/ws';
  }

  function createClient(options) {
    var socket = null;
    var closedByUser = false;
    var reconnectTimer = null;
    var reconnectDelay = 2000;
    var reconnectLimit = 10000;
    var token = options.token || '';
    var authenticated = false;

    function emit(name, data) {
      if (typeof options[name] === 'function') {
        options[name](data || {});
      }
    }

    function send(payload) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(JSON.stringify(payload));
      return true;
    }

    function connect() {
      closedByUser = false;
      authenticated = false;
      emit('onStatus', { text: 'Подключение', type: 'sync' });

      try {
        socket = new WebSocket(buildUrl());
      } catch (error) {
        scheduleReconnect();
        return;
      }

      socket.addEventListener('open', function() {
        reconnectDelay = 2000;
        send({ type: 'auth', token: token });
      });

      socket.addEventListener('message', function(event) {
        var data;
        try {
          data = JSON.parse(event.data);
        } catch (error) {
          emit('onError', { message: 'Некорректный ответ WebSocket' });
          return;
        }

        if (data.type === 'auth' && data.success) {
          authenticated = true;
          emit('onStatus', { text: 'Онлайн', type: 'online' });
          emit('onAuth', data);
          return;
        }

        if (data.type === 'message_sent') {
          emit('onMessageSent', data.message);
          return;
        }

        if (data.type === 'new_message') {
          emit('onNewMessage', data.message);
          return;
        }

        if (data.type === 'error') {
          emit('onError', { message: data.message || 'Ошибка WebSocket' });
        }
      });

      socket.addEventListener('close', function() {
        authenticated = false;
        if (!closedByUser) {
          emit('onStatus', { text: 'Нет связи', type: 'offline' });
          scheduleReconnect();
        }
      });

      socket.addEventListener('error', function() {
        authenticated = false;
        emit('onStatus', { text: 'Ошибка связи', type: 'offline' });
      });
    }

    function scheduleReconnect() {
      if (closedByUser || reconnectTimer) {
        return;
      }
      emit('onStatus', { text: 'Повтор связи', type: 'sync' });
      reconnectTimer = window.setTimeout(function() {
        reconnectTimer = null;
        reconnectDelay = Math.min(reconnectDelay + 1000, reconnectLimit);
        connect();
      }, reconnectDelay);
    }

    return {
      connect: connect,
      close: function() {
        closedByUser = true;
        if (reconnectTimer) {
          window.clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        if (socket) {
          socket.close();
        }
      },
      sendMessage: function(receiverId, text) {
        return send({
          type: 'private_message',
          receiver_id: receiverId,
          text: text
        });
      },
      isReady: function() {
        return !!socket && socket.readyState === WebSocket.OPEN && authenticated;
      }
    };
  }

  window.WebDialogWs = {
    createClient: createClient
  };
})(window);
