(function(window, document) {
  var api = window.WebDialogApi;
  var ws = window.WebDialogWs;
  var state = {
    token: '',
    currentUser: null,
    selectedUser: null,
    users: [],
    dialogUsers: [],
    socket: null,
    messages: [],
    unreadCounts: {},
    unreadMessageIds: {},
    handledRealtimeMessageIds: {},
    pendingRealtimeKeys: {},
    usersReady: false,
    usersLoading: false,
    usersRefreshPromise: null,
    lastUsersRefreshAt: 0,
    searchRefreshTimer: null,
    pendingRealtimeMessages: []
  };



  function clearLegacyUnreadStorage() {
    try {
      var keys = [];
      for (var i = 0; i < window.localStorage.length; i++) {
        var key = window.localStorage.key(i);
        if (key && key.indexOf('webdialog_unread_') === 0) {
          keys.push(key);
        }
      }
      keys.forEach(function(key) {
        window.localStorage.removeItem(key);
      });
    } catch (error) {}
  }

  function loadChatPrefs() {
    clearLegacyUnreadStorage();
    state.unreadCounts = {};
    state.unreadMessageIds = {};
    state.handledRealtimeMessageIds = {};
    state.pendingRealtimeKeys = {};
  }

  function idKey(userOrId) {
    return String(typeof userOrId === 'object' ? userOrId.id : userOrId);
  }

  function getUnreadCount(userOrId) {
    return Number(state.unreadCounts[idKey(userOrId)] || 0);
  }

  function getMessageStorageKey(message) {
    if (message && message.id) {
      return 'id:' + String(message.id);
    }
    return [
      message && message.sender_id,
      message && message.receiver_id,
      message && message.created_at,
      message && message.text
    ].join('|');
  }

  function setUnreadCount(userOrId, count) {
    var key = idKey(userOrId);
    var next = Math.max(0, Number(count) || 0);

    if (next > 0) {
      state.unreadCounts[key] = next;
    } else {
      delete state.unreadCounts[key];
      delete state.unreadMessageIds[key];
    }
  }

  function increaseUnreadCount(userOrId, message) {
    var userKey = idKey(userOrId);
    var messageKey = getMessageStorageKey(message);

    if (!messageKey) {
      return;
    }

    var list = Array.isArray(state.unreadMessageIds[userKey]) ? state.unreadMessageIds[userKey].slice() : [];
    if (list.indexOf(messageKey) === -1) {
      list.push(messageKey);
    }
    state.unreadMessageIds[userKey] = list;
    state.unreadCounts[userKey] = list.length;
  }

  function markRealtimeMessageHandled(message) {
    var key = getMessageStorageKey(message);
    if (!key) {
      return true;
    }
    if (state.handledRealtimeMessageIds[key]) {
      return false;
    }
    state.handledRealtimeMessageIds[key] = true;
    return true;
  }

  function parseMessageTime(value) {
    var time = new Date(String(value || '').replace(' ', 'T')).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  function initials(name) {
    return String(name || '?').split(' ').filter(Boolean).map(function(part) {
      return part[0];
    }).join('').slice(0, 2).toUpperCase() || '?';
  }

  function formatTime(value) {
    if (!value) {
      return '';
    }
    var date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function isMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
  }

  function setMobileView(view) {
    document.body.dataset.mobileView = view;
  }

  function showStatus(text, type) {
    var chip = document.querySelector('[data-connection-status]');
    if (!chip) {
      return;
    }
    chip.dataset.status = type || 'online';
    chip.innerHTML = '<span></span>' + text;
  }

  function showNotice(text, type) {
    var stack = document.querySelector('[data-message-stack]');
    if (!stack) {
      return;
    }
    var notice = stack.querySelector('[data-chat-notice]');
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'connection-alert';
      notice.dataset.chatNotice = 'true';
      stack.appendChild(notice);
    }
    notice.dataset.status = type || 'sync';
    notice.textContent = text;
  }

  function removeNotice() {
    var notice = document.querySelector('[data-chat-notice]');
    if (notice) {
      notice.remove();
    }
  }

  function setCurrentUser(user) {
    var name = document.querySelector('[data-current-user-name]');
    var avatar = document.querySelector('[data-current-user-avatar]');
    if (name) {
      name.textContent = user.name;
    }
    if (avatar) {
      avatar.textContent = initials(user.name);
    }
  }

  // Служебный диалог для сообщений самому себе.
  function createSelfDialog() {
    return {
      id: state.currentUser ? state.currentUser.id : 0,
      name: 'Избранное',
      email: state.currentUser ? state.currentUser.email : '',
      subtitle: 'Сообщения себе',
      isSelfDialog: true
    };
  }

  function isSameUser(a, b) {
    return Number(a && a.id) === Number(b && b.id);
  }

  function hasDialogUser(user) {
    return state.dialogUsers.some(function(item) {
      return isSameUser(item, user);
    });
  }

  function addDialogUser(user) {
    if (!user || user.isSelfDialog || isSameUser(user, state.currentUser)) {
      return;
    }
    if (!hasDialogUser(user)) {
      state.dialogUsers.push(user);
    }
    renderContacts();
  }

  function refreshContacts() {
    var search = document.querySelector('[data-user-search]');
    if (search && search.value.trim()) {
      renderSearchResults(search.value);
      return;
    }
    renderContacts();
  }

  function mergeUsers(users) {
    var map = {};

    state.users.forEach(function(user) {
      if (user && user.id && !isSameUser(user, state.currentUser)) {
        map[idKey(user)] = user;
      }
    });

    (users || []).forEach(function(user) {
      if (user && user.id && !isSameUser(user, state.currentUser)) {
        map[idKey(user)] = user;
      }
    });

    state.users = Object.keys(map).map(function(key) {
      return map[key];
    });

    state.dialogUsers = state.dialogUsers.map(function(dialogUser) {
      if (!dialogUser || dialogUser.isSelfDialog) {
        return dialogUser;
      }
      return map[idKey(dialogUser)] || dialogUser;
    });

    if (state.selectedUser && !state.selectedUser.isSelfDialog) {
      var freshSelected = map[idKey(state.selectedUser)];
      if (freshSelected) {
        state.selectedUser = Object.assign({}, freshSelected, {
          isSearchResult: !!state.selectedUser.isSearchResult
        });
        setSelectedUserHeader(state.selectedUser);
      }
    }
  }

  function refreshUsersFromServer(force) {
    var now = Date.now();

    if (!state.token || typeof api.getUsers !== 'function') {
      return Promise.resolve(false);
    }

    if (state.usersRefreshPromise) {
      return state.usersRefreshPromise;
    }

    if (!force && state.lastUsersRefreshAt && now - state.lastUsersRefreshAt < 3000) {
      return Promise.resolve(false);
    }

    state.usersLoading = true;
    state.usersRefreshPromise = api.getUsers(state.token).then(function(result) {
      state.lastUsersRefreshAt = Date.now();

      if (!result || !result.success) {
        return false;
      }

      mergeUsers(result.users || []);
      state.usersReady = true;
      return true;
    }).catch(function() {
      return false;
    }).finally(function() {
      state.usersLoading = false;
      state.usersRefreshPromise = null;
    });

    return state.usersRefreshPromise;
  }

  function refreshUsersAndProcessPending() {
    return refreshUsersFromServer(true).then(function() {
      processPendingRealtimeMessages();
      refreshContacts();
    });
  }

  function scheduleSearchUsersRefresh(query) {
    var value = String(query || '').trim();

    if (state.searchRefreshTimer) {
      window.clearTimeout(state.searchRefreshTimer);
      state.searchRefreshTimer = null;
    }

    if (!value) {
      return;
    }

    state.searchRefreshTimer = window.setTimeout(function() {
      var search = document.querySelector('[data-user-search]');
      var currentValue = search ? search.value.trim() : '';

      if (!currentValue) {
        return;
      }

      refreshUsersFromServer(true).then(function() {
        if (search && search.value.trim() === currentValue) {
          renderSearchResults(currentValue);
        }
        processPendingRealtimeMessages();
      });
    }, 250);
  }

  function queuePendingRealtimeMessage(message) {
    var key = getMessageStorageKey(message);
    if (key && state.pendingRealtimeKeys[key]) {
      return;
    }
    if (key) {
      state.pendingRealtimeKeys[key] = true;
    }
    state.pendingRealtimeMessages.push(message);
  }

  function processPendingRealtimeMessages() {
    if (!state.pendingRealtimeMessages.length || !state.usersReady) {
      return;
    }
    var messages = state.pendingRealtimeMessages.slice();
    state.pendingRealtimeMessages = [];
    state.pendingRealtimeKeys = {};
    messages.forEach(function(message) {
      handleRealtimeMessage(message, { allowUserRefresh: false });
    });
  }

  function findUserById(userId) {
    var id = Number(userId);
    if (state.currentUser && Number(state.currentUser.id) === id) {
      return createSelfDialog();
    }
    return state.users.find(function(user) {
      return Number(user.id) === id;
    }) || null;
  }

  function renderContactButton(user, active) {
    var item = document.createElement('div');
    item.className = 'contact-item user-item' + (user.isSelfDialog ? ' favorite-dialog self-dialog' : '') + (user.isSearchResult ? ' search-result-dialog' : '') + (active ? ' active' : '');
    item.dataset.userId = String(user.id);
    var unread = !user.isSearchResult ? getUnreadCount(user) : 0;
    var unreadBadge = unread > 0 ? '<em class="unread-badge" data-unread-badge>' + (unread > 99 ? '99+' : String(unread)) + '</em>' : '';
    item.innerHTML = '<button type="button" class="contact-main" data-dialog-open>' +
      '<div class="avatar ' + (user.isSelfDialog ? 'avatar-favorite avatar-self' : 'avatar-green') + '">' + (user.isSelfDialog ? '★' : initials(user.name)) + '</div>' +
      '<div class="contact-text"><strong></strong><span></span></div>' + unreadBadge +
      '</button>';
    item.querySelector('strong').textContent = user.name;
    item.querySelector('span').textContent = user.isSelfDialog ? user.subtitle : (user.isSearchResult ? 'Найденный контакт' : 'Диалог');
    if (!user.isSelfDialog && !user.isSearchResult) {
      item.querySelector('span').className = 'online';
    }
    item.querySelector('[data-dialog-open]').addEventListener('click', function() {
      selectUser(user);
    });
    return item;
  }

  function getVisibleContacts() {
    var items = [createSelfDialog()];
    var dialogs = state.dialogUsers.filter(function(user) {
      return !isSameUser(user, state.currentUser);
    }).slice();
    dialogs.sort(function(a, b) {
      var au = getUnreadCount(a);
      var bu = getUnreadCount(b);
      if (au !== bu) {
        return bu - au;
      }
      return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
    });
    dialogs.forEach(function(user) {
      items.push(user);
    });
    if (state.selectedUser && !state.selectedUser.isSelfDialog && !hasDialogUser(state.selectedUser)) {
      var selectedCopy = Object.assign({}, state.selectedUser, { isSearchResult: true });
      items.push(selectedCopy);
    }
    return items;
  }

  function splitSearchTokens(value) {
    return String(value || '')
      .toLowerCase()
      .split(/[\s@._+\-]+/)
      .map(function(part) {
        return part.trim();
      })
      .filter(Boolean);
  }

  // Поиск работает по началу имени или части email.
  function matchesUserSearch(user, query) {
    var value = String(query || '').trim().toLowerCase();
    if (!value) {
      return false;
    }
    var tokens = splitSearchTokens((user.name || '') + ' ' + (user.email || ''));
    return tokens.some(function(token) {
      return token.indexOf(value) === 0;
    });
  }

  function renderContacts() {
    var list = document.querySelector('[data-users-list]');
    var search = document.querySelector('[data-user-search]');
    if (!list) {
      return;
    }

    var contacts = getVisibleContacts();
    list.innerHTML = '';

    if (search) {
      search.disabled = false;
    }

    contacts.forEach(function(user, index) {
      var active = state.selectedUser ? isSameUser(user, state.selectedUser) : index === 0;
      list.appendChild(renderContactButton(user, active));
    });

    if (!state.selectedUser && contacts.length) {
      if (!isMobile()) {
        selectUser(contacts[0]);
      } else {
        setMobileView('users');
        setSelectedUserHeader(contacts[0]);
        renderMessages([]);
      }
    }
  }

  function renderSearchResults(query) {
    var list = document.querySelector('[data-users-list]');
    if (!list) {
      return;
    }
    var value = String(query || '').trim().toLowerCase();
    renderContacts();

    var oldTitle = list.querySelector('[data-search-title]');
    if (oldTitle) {
      oldTitle.remove();
    }

    if (!value) {
      return;
    }

    var title = document.createElement('div');
    title.className = 'contacts-section-title';
    title.dataset.searchTitle = 'true';
    title.textContent = 'Найденные контакты';
    list.appendChild(title);

    var found = state.users.filter(function(user) {
      if (isSameUser(user, state.currentUser) || hasDialogUser(user)) {
        return false;
      }
      return matchesUserSearch(user, value);
    });

    if (!found.length) {
      var empty = document.createElement('div');
      empty.className = 'chat-empty-note';
      empty.textContent = 'Пользователь не найден.';
      list.appendChild(empty);
      return;
    }

    found.forEach(function(user) {
      list.appendChild(renderContactButton(Object.assign({}, user, { isSearchResult: true }), false));
    });
  }

  function loadDialogUsers(users) {
    var candidates = (users || []).filter(function(user) {
      return !isSameUser(user, state.currentUser);
    });

    return Promise.all(candidates.map(function(user) {
      return api.getMessages(state.token, user.id, 1).then(function(result) {
        if (result.success && result.messages && result.messages.length) {
          return user;
        }
        return null;
      }).catch(function() {
        return null;
      });
    })).then(function(items) {
      var merged = {};
      state.dialogUsers.concat(items.filter(Boolean)).forEach(function(user) {
        if (user && !isSameUser(user, state.currentUser)) {
          merged[idKey(user)] = user;
        }
      });
      state.dialogUsers = Object.keys(merged).map(function(key) {
        return merged[key];
      });
      renderContacts();
    });
  }

  function setSelectedUserHeader(user) {
    var chatName = document.querySelector('[data-chat-name]');
    var chatAvatar = document.querySelector('[data-chat-avatar]');
    var chatSubtitle = document.querySelector('[data-chat-subtitle]');
    var mobileName = document.querySelector('[data-mobile-chat-name]');
    var mobileAvatar = document.querySelector('[data-mobile-chat-avatar]');
    var mobileSubtitle = document.querySelector('[data-mobile-chat-subtitle]');
    var subtitle = user.isSelfDialog ? 'Сообщения себе' : 'онлайн';

    if (chatName) {
      chatName.textContent = user.name;
    }
    if (chatAvatar) {
      chatAvatar.textContent = user.isSelfDialog ? '★' : initials(user.name);
      chatAvatar.classList.toggle('avatar-favorite', !!user.isSelfDialog);
      chatAvatar.classList.toggle('avatar-self', !!user.isSelfDialog);
      chatAvatar.classList.toggle('avatar-green', !user.isSelfDialog);
    }
    if (chatSubtitle) {
      chatSubtitle.textContent = subtitle;
      chatSubtitle.classList.toggle('online', !user.isSelfDialog);
    }
    if (mobileName) {
      mobileName.textContent = user.name;
    }
    if (mobileAvatar) {
      mobileAvatar.textContent = user.isSelfDialog ? '★' : initials(user.name);
      mobileAvatar.classList.toggle('avatar-favorite', !!user.isSelfDialog);
      mobileAvatar.classList.toggle('avatar-self', !!user.isSelfDialog);
      mobileAvatar.classList.toggle('avatar-green', !user.isSelfDialog);
    }
    if (mobileSubtitle) {
      mobileSubtitle.textContent = subtitle;
      mobileSubtitle.classList.toggle('online', !user.isSelfDialog);
    }
  }

  function selectUser(user) {
    state.selectedUser = user;
    setUnreadCount(user, 0);
    document.querySelectorAll('[data-user-id]').forEach(function(button) {
      button.classList.toggle('active', Number(button.dataset.userId) === Number(user.id));
    });
    setSelectedUserHeader(user);
    if (isMobile()) {
      setMobileView('chat');
    }
    loadMessages(user.id);
    renderContacts();
  }

  function createMessageRow(message) {
    var mine = state.currentUser && Number(message.sender_id) === Number(state.currentUser.id);
    var row = document.createElement('div');
    row.className = 'message-row ' + (mine ? 'message-row-out' : 'message-row-in');
    var box = document.createElement('div');
    box.className = 'message ' + (mine ? 'message-out' : 'message-in') + ' message-bubble';
    var paragraph = document.createElement('p');
    var time = document.createElement('time');
    paragraph.textContent = message.text || '';
    time.textContent = formatTime(message.created_at) + (mine ? ' ✓' : '');
    box.appendChild(paragraph);
    box.appendChild(time);
    row.appendChild(box);
    return row;
  }

  function renderMessages(messages) {
    var stack = document.querySelector('[data-message-stack]');
    if (!stack) {
      return;
    }
    state.messages = messages || [];
    stack.innerHTML = '<div class="date-pill">Сегодня</div>';

    if (!state.messages.length) {
      if (state.selectedUser && state.selectedUser.isSelfDialog) {
        showNotice('Здесь пока нет сообщений. Можно написать себе заметку.', 'sync');
      } else if (state.selectedUser) {
        showNotice('История сообщений пока пустая. Напишите первое сообщение.', 'sync');
      } else {
        showNotice('Выберите диалог из списка.', 'sync');
      }
      return;
    }

    state.messages.forEach(function(message) {
      stack.appendChild(createMessageRow(message));
    });
    scrollMessagesToEnd();
  }

  function appendMessage(message) {
    var stack = document.querySelector('[data-message-stack]');
    if (!stack || !message) {
      return;
    }
    if (message.id && state.messages.some(function(item) { return Number(item.id) === Number(message.id); })) {
      return;
    }
    removeNotice();
    state.messages.push(message);
    stack.appendChild(createMessageRow(message));
    scrollMessagesToEnd();
  }

  function messageKey(message) {
    if (message && message.id) {
      return 'id:' + String(message.id);
    }
    return [message.sender_id, message.receiver_id, message.created_at, message.text].join('|');
  }

  function sortMessages(messages) {
    return messages.slice().sort(function(a, b) {
      var timeDiff = parseMessageTime(a.created_at) - parseMessageTime(b.created_at);
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return Number(a.id || 0) - Number(b.id || 0);
    });
  }

  function mergeMessages(baseMessages, extraMessages) {
    var map = {};
    (baseMessages || []).concat(extraMessages || []).forEach(function(message) {
      if (!message) {
        return;
      }
      map[messageKey(message)] = message;
    });
    return sortMessages(Object.keys(map).map(function(key) {
      return map[key];
    }));
  }

  function messageBelongsToSelectedDialog(message) {
    if (!state.currentUser || !state.selectedUser || !message) {
      return false;
    }
    var currentId = Number(state.currentUser.id);
    var selectedId = Number(state.selectedUser.id);
    var senderId = Number(message.sender_id);
    var receiverId = Number(message.receiver_id);
    return (senderId === currentId && receiverId === selectedId) || (senderId === selectedId && receiverId === currentId);
  }

  function scrollMessagesToEnd() {
    var area = document.querySelector('.chat-messages');
    if (area) {
      area.scrollTop = area.scrollHeight;
    }
  }

  function loadMessages(userId) {
    var requestedUserId = Number(userId);
    showStatus('Загрузка истории', 'sync');
    api.getMessages(state.token, userId, 50).then(function(result) {
      if (!state.selectedUser || Number(state.selectedUser.id) !== requestedUserId) {
        return;
      }
      if (!result.success) {
        showStatus('Ошибка SOAP', 'offline');
        renderMessages([]);
        showNotice(result.message || 'Не удалось загрузить историю сообщений', 'offline');
        return;
      }
      var loadedMessages = result.messages || [];
      var liveMessages = state.messages.filter(function(message) {
        return messageBelongsToSelectedDialog(message);
      });
      renderMessages(mergeMessages(loadedMessages, liveMessages));
      if (!state.socket || !state.socket.isReady()) {
        showStatus('Подключение', 'sync');
      } else {
        showStatus('Онлайн', 'online');
      }
    });
  }

  function handleRealtimeMessage(message, options) {
    var allowUserRefresh = !options || options.allowUserRefresh !== false;

    if (!message || !state.currentUser) {
      return;
    }

    if (!state.usersReady) {
      queuePendingRealtimeMessage(message);
      if (allowUserRefresh) {
        refreshUsersAndProcessPending();
      }
      return;
    }

    var currentId = Number(state.currentUser.id);
    var senderId = Number(message.sender_id);
    var receiverId = Number(message.receiver_id);
    var otherUserId = senderId === currentId ? receiverId : senderId;
    var otherUser = findUserById(otherUserId);

    if (!otherUser) {
      queuePendingRealtimeMessage(message);
      if (allowUserRefresh) {
        refreshUsersAndProcessPending();
      }
      return;
    }

    if (!markRealtimeMessageHandled(message)) {
      return;
    }

    if (!otherUser.isSelfDialog && !hasDialogUser(otherUser)) {
      state.dialogUsers.push(otherUser);
    }

    if (messageBelongsToSelectedDialog(message)) {
      appendMessage(message);
      if (state.selectedUser) {
        setUnreadCount(state.selectedUser, 0);
      }
    } else if (senderId !== currentId) {
      increaseUnreadCount(otherUser, message);
    }

    refreshContacts();
  }

  function initWebSocket() {
    if (!ws || state.socket) {
      return;
    }

    state.socket = ws.createClient({
      token: state.token,
      onStatus: function(status) {
        showStatus(status.text, status.type);
        if (status.type === 'offline') {
          showNotice('WebSocket-соединение потеряно. Выполняется повторное подключение.', 'offline');
        }
      },
      onAuth: function() {
        showStatus('Онлайн', 'online');
        removeNotice();
        refreshUsersAndProcessPending();
      },
      onMessageSent: function(message) {
        handleRealtimeMessage(message);
        showStatus('Онлайн', 'online');
      },
      onNewMessage: function(message) {
        handleRealtimeMessage(message);
      },
      onError: function(error) {
        showNotice(error.message || 'Ошибка WebSocket', 'offline');
      }
    });

    state.socket.connect();
  }


  function initLogout() {
    document.querySelectorAll('[data-logout]').forEach(function(link) {
      link.addEventListener('click', function(event) {
        event.preventDefault();
        if (state.socket) {
          state.socket.close();
        }
        api.logout(state.token).finally(function() {
          api.clearSession();
          window.location.href = 'login.html';
        });
      });
    });
  }

  function initSendForm() {
    var form = document.querySelector('[data-chat-form]');
    if (!form) {
      return;
    }
    form.addEventListener('submit', function(event) {
      event.preventDefault();
      var input = form.querySelector('[name="message"]');
      var text = input.value.trim().replace(/\s+/g, ' ');
      if (!text) {
        showNotice('Сообщение не может быть пустым.', 'offline');
        return;
      }
      if (text.length > 1000) {
        showNotice('Сообщение не должно быть длиннее 1000 символов.', 'offline');
        return;
      }
      if (!state.selectedUser) {
        showNotice('Сначала выберите диалог.', 'offline');
        return;
      }
      if (!state.socket || !state.socket.isReady()) {
        showNotice('Нет WebSocket-соединения. Дождитесь подключения.', 'offline');
        return;
      }
      var sent = state.socket.sendMessage(state.selectedUser.id, text);
      if (!sent) {
        showNotice('Сообщение не отправлено. WebSocket недоступен.', 'offline');
        return;
      }
      input.value = '';
      showStatus('Отправка', 'sync');
    });
  }

  function initSearch() {
    var search = document.querySelector('[data-user-search]');
    if (!search) {
      return;
    }
    search.addEventListener('input', function() {
      renderSearchResults(search.value);
      scheduleSearchUsersRefresh(search.value);
    });
  }

  function initMobileBack() {
    var back = document.querySelector('[data-mobile-back]');
    if (!back) {
      return;
    }
    back.addEventListener('click', function(event) {
      event.preventDefault();
      setMobileView('users');
    });
  }


  function setAppReady() {
    document.body.dataset.authState = 'ready';
  }

  function boot() {
    if (!document.body.dataset.page || document.body.dataset.page !== 'chat') {
      return;
    }

    state.token = api.getToken();
    if (!state.token) {
      window.location.href = 'login.html';
      return;
    }

    state.currentUser = api.getSavedUser();
    if (state.currentUser) {
      setCurrentUser(state.currentUser);
    }

    initLogout();
    initSendForm();
    initSearch();
    initMobileBack();
    showStatus('Проверка входа', 'sync');

    api.getCurrentUser(state.token).then(function(currentResult) {
      if (!currentResult.success) {
        api.clearSession();
        window.location.href = 'login.html';
        return;
      }

      state.currentUser = currentResult.user;
      api.saveSession({ token: state.token, user: state.currentUser });
      setCurrentUser(state.currentUser);
      loadChatPrefs();
      initWebSocket();

      return api.getUsers(state.token).then(function(usersResult) {
        if (!usersResult.success) {
          showStatus('Ошибка SOAP', 'offline');
          state.dialogUsers = [];
          renderContacts();
          setAppReady();
          return;
        }
        state.users = [];
        mergeUsers(usersResult.users || []);
        state.usersReady = true;
        state.lastUsersRefreshAt = Date.now();
        return loadDialogUsers(state.users).then(function() {
          processPendingRealtimeMessages();
          setAppReady();
        });
      });
    }).catch(function() {
      showStatus('Ошибка загрузки', 'offline');
      showNotice('Не удалось загрузить чат. Обновите страницу или войдите заново.', 'offline');
      setAppReady();
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})(window, document);
