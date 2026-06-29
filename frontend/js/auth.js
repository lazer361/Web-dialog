(function(window, document) {
  var api = window.WebDialogApi;

  function findField(form, name) {
    return form.querySelector('[name="' + name + '"]');
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function setError(form, message, success) {
    var error = form.querySelector('[data-form-error]');
    if (!error) {
      return;
    }
    error.textContent = message || '';
    error.classList.toggle('hidden', !message);
    error.classList.toggle('form-message-success', !!success && !!message);
    error.classList.toggle('form-message-error', !success && !!message);
  }

  function clearFieldStates(form) {
    form.querySelectorAll('input').forEach(function(input) {
      input.classList.remove('auth-input-error', 'auth-input-weak', 'auth-input-medium', 'auth-input-strong');
      input.removeAttribute('aria-invalid');
    });
  }

  function markField(form, name, state) {
    var input = findField(form, name);
    if (!input) {
      return;
    }
    input.classList.add(state || 'auth-input-error');
    if ((state || 'auth-input-error') === 'auth-input-error') {
      input.setAttribute('aria-invalid', 'true');
    }
  }

  function clearFieldOnInput(form) {
    form.querySelectorAll('input').forEach(function(input) {
      input.addEventListener('input', function() {
        input.classList.remove('auth-input-error');
        input.removeAttribute('aria-invalid');
        if (form.querySelector('.auth-input-error')) {
          return;
        }
        var error = form.querySelector('[data-form-error]');
        if (error && error.classList.contains('form-message-error')) {
          setError(form, '');
        }
      });
    });
  }

  function getPasswordStrength(value) {
    var password = String(value || '');
    if (!password) {
      return { name: '', label: '', score: 0 };
    }

    var score = 0;
    if (password.length >= 6) score += 1;
    if (password.length >= 8) score += 1;
    if (/[A-Za-zА-Яа-яЁё]/.test(password) && /\d/.test(password)) score += 1;
    if (/[^A-Za-zА-Яа-яЁё0-9]/.test(password)) score += 1;

    if (score <= 1) {
      return { name: 'weak', label: 'Слабый пароль', score: 1 };
    }
    if (score <= 3) {
      return { name: 'medium', label: 'Средний пароль', score: 2 };
    }
    return { name: 'strong', label: 'Хороший пароль', score: 3 };
  }

  function updatePasswordStrength(form) {
    var input = findField(form, 'password');
    var line = form.querySelector('[data-password-strength]');
    if (!input || !line) {
      return;
    }

    var strength = getPasswordStrength(input.value);
    input.classList.remove('auth-input-weak', 'auth-input-medium', 'auth-input-strong');
    line.classList.remove('is-visible', 'is-weak', 'is-medium', 'is-strong');

    if (!strength.name) {
      line.removeAttribute('title');
      return;
    }

    input.classList.add('auth-input-' + strength.name);
    line.classList.add('is-visible', 'is-' + strength.name);
    line.setAttribute('title', strength.label);
  }

  function setSubmitDisabled(form, disabled, text) {
    var button = form.querySelector('[type="submit"]');
    if (!button) {
      return;
    }
    if (!button.dataset.defaultText) {
      button.dataset.defaultText = button.textContent.trim();
    }
    button.disabled = disabled;
    button.textContent = disabled && text ? text : button.dataset.defaultText;
    button.classList.toggle('opacity-60', disabled);
    button.classList.toggle('cursor-not-allowed', disabled);
  }

  function login(form) {
    clearFieldStates(form);

    var email = normalizeEmail(findField(form, 'email').value);
    var password = findField(form, 'password').value;

    if (!email || !password) {
      if (!email) markField(form, 'email');
      if (!password) markField(form, 'password');
      setError(form, 'Заполните email и пароль');
      return;
    }

    if (!isEmail(email)) {
      markField(form, 'email');
      setError(form, 'Введите корректный email');
      return;
    }

    setError(form, '');
    setSubmitDisabled(form, true, 'Вход...');

    api.login(email, password).then(function(result) {
      if (!result.success) {
        markField(form, 'email');
        markField(form, 'password');
        setError(form, result.message || 'Неверный email или пароль');
        return;
      }
      api.saveSession(result);
      window.location.href = 'index.html';
    }).finally(function() {
      setSubmitDisabled(form, false);
    });
  }

  function register(form) {
    clearFieldStates(form);
    updatePasswordStrength(form);

    var name = findField(form, 'name').value.trim().replace(/\s+/g, ' ');
    var email = normalizeEmail(findField(form, 'email').value);
    var password = findField(form, 'password').value;
    var passwordRepeat = findField(form, 'password_repeat').value;

    if (!name || !email || !password || !passwordRepeat) {
      if (!name) markField(form, 'name');
      if (!email) markField(form, 'email');
      if (!password) markField(form, 'password');
      if (!passwordRepeat) markField(form, 'password_repeat');
      setError(form, 'Заполните все поля');
      return;
    }

    if (name.length > 100) {
      markField(form, 'name');
      setError(form, 'Имя не должно быть длиннее 100 символов');
      return;
    }

    if (!isEmail(email)) {
      markField(form, 'email');
      setError(form, 'Введите корректный email');
      return;
    }

    if (password.length < 6) {
      markField(form, 'password');
      setError(form, 'Пароль должен быть не короче 6 символов');
      return;
    }

    if (password !== passwordRepeat) {
      markField(form, 'password');
      markField(form, 'password_repeat');
      setError(form, 'Пароли не совпадают');
      return;
    }

    setError(form, '');
    setSubmitDisabled(form, true, 'Регистрация...');

    api.register(name, email, password).then(function(result) {
      if (!result.success) {
        if (/email/i.test(result.message || '')) {
          markField(form, 'email');
        }
        setError(form, result.message || 'Не удалось зарегистрироваться');
        return;
      }
      window.location.href = 'login.html?registered=1';
    }).finally(function() {
      setSubmitDisabled(form, false);
    });
  }

  function showRegisteredMessage(form) {
    if (window.location.search.indexOf('registered=1') === -1) {
      return;
    }
    setError(form, 'Регистрация выполнена. Теперь войдите в аккаунт.', true);
  }

  function initPasswordToggles() {
    document.querySelectorAll('.password-toggle').forEach(function(button) {
      button.addEventListener('click', function() {
        var wrap = button.closest('.relative');
        var input = wrap ? wrap.querySelector('input') : null;
        if (!input) {
          return;
        }
        var visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        button.textContent = visible ? 'Показать' : 'Скрыть';
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    initPasswordToggles();

    var loginForm = document.querySelector('[data-auth-form="login"]');
    if (loginForm) {
      showRegisteredMessage(loginForm);
      clearFieldOnInput(loginForm);
      loginForm.addEventListener('submit', function(event) {
        event.preventDefault();
        login(loginForm);
      });
    }

    var registerForm = document.querySelector('[data-auth-form="register"]');
    if (registerForm) {
      clearFieldOnInput(registerForm);
      var password = findField(registerForm, 'password');
      if (password) {
        password.addEventListener('input', function() {
          updatePasswordStrength(registerForm);
        });
      }
      registerForm.addEventListener('submit', function(event) {
        event.preventDefault();
        register(registerForm);
      });
    }
  });
})(window, document);
