document.addEventListener('DOMContentLoaded', () => {
  const apiRequest = async (endpoint, options = {}) => {
    const requestOptions = {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    };
    const response = await fetch(endpoint, requestOptions);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error('O servidor retornou uma resposta inválida.');
    }
    if (!response.ok) {
      const error = new Error(payload.error || 'Não foi possível concluir a solicitação.');
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  // Alternar Visibilidade da Senha
  const togglePassword = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('password');

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {
      const isPassword = passwordInput.getAttribute('type') === 'password';
      passwordInput.setAttribute('type', isPassword ? 'text' : 'password');

      togglePassword.classList.toggle('password-visible', isPassword);
      togglePassword.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
      togglePassword.setAttribute('aria-pressed', String(isPassword));
    });
  }

  // Alternar entre Abas (Entrar / Cadastrar-se)
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const btnSubmit = document.querySelector('.btn-submit');
  const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');
  const confirmPasswordInput = document.getElementById('confirmPassword');
  const displayNameGroup = document.getElementById('displayNameGroup');
  const displayNameInput = document.getElementById('displayName');
  const loginStatus = document.getElementById('loginStatus');
  const forgotPasswordLink = document.querySelector('.forgot-password');
  let isRegistering = false;

  if (tabLogin && tabRegister && btnSubmit) {
    const updatePasswordMatch = () => {
      if (!confirmPasswordInput) return;
      const passwordsMatch = passwordInput && passwordInput.value === confirmPasswordInput.value;
      confirmPasswordInput.setCustomValidity(
        isRegistering && confirmPasswordInput.value && !passwordsMatch
          ? 'As senhas não conferem.'
          : ''
      );
    };

    const setRegistrationMode = (registering) => {
      isRegistering = registering;
      if (confirmPasswordGroup) confirmPasswordGroup.hidden = !registering;
      if (displayNameGroup) displayNameGroup.hidden = !registering;
      if (displayNameInput) {
        displayNameInput.disabled = !registering;
        displayNameInput.required = registering;
        if (!registering) displayNameInput.value = '';
      }
      if (confirmPasswordInput) {
        confirmPasswordInput.disabled = !registering;
        confirmPasswordInput.required = registering;
        if (!registering) confirmPasswordInput.value = '';
        updatePasswordMatch();
      }
      if (passwordInput) {
        passwordInput.autocomplete = registering ? 'new-password' : 'current-password';
      }
      if (forgotPasswordLink) forgotPasswordLink.hidden = registering;
      btnSubmit.innerHTML = registering
        ? 'Criar Conta no Fisga <span aria-hidden="true">→</span>'
        : 'Entrar no Fisga <span aria-hidden="true">→</span>';
    };

    tabLogin.addEventListener('click', () => {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      tabLogin.setAttribute('aria-selected', 'true');
      tabRegister.setAttribute('aria-selected', 'false');
      setRegistrationMode(false);
    });

    tabRegister.addEventListener('click', () => {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      tabRegister.setAttribute('aria-selected', 'true');
      tabLogin.setAttribute('aria-selected', 'false');
      setRegistrationMode(true);
    });

    if (passwordInput) passwordInput.addEventListener('input', updatePasswordMatch);
    if (confirmPasswordInput) confirmPasswordInput.addEventListener('input', updatePasswordMatch);
  }

  // Evento de Envio do Formulário
  const loginForm = document.getElementById('loginForm');

  if (loginForm) {
    const ensureLegacyAccount = async (credentials) => {
      try {
        return await apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify(credentials)
        });
      } catch (loginError) {
        if (loginError.status !== 401) throw loginError;
        try {
          return await apiRequest('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
              ...credentials,
              name: credentials.name || credentials.email.split('@')[0]
            })
          });
        } catch (registerError) {
          if (registerError.status !== 409) throw registerError;
          return apiRequest('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials)
          });
        }
      }
    };

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (loginStatus) {
        loginStatus.textContent = '';
        loginStatus.dataset.state = '';
      }
      const submitButton = loginForm.querySelector('.btn-submit');
      if (submitButton) submitButton.disabled = true;
      try {
        const auth = window.FisgaSupabaseChat;
        if (!auth) throw new Error('O módulo de autenticação Supabase não carregou. Verifique a conexão com a internet.');
        const payload = {
          email: document.getElementById('email')?.value || '',
          password: passwordInput?.value || ''
        };
        if (isRegistering) {
          payload.name = displayNameInput?.value.trim() || '';
          if (payload.password.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
          const result = await auth.registerWithSupabase(payload.email, payload.password, payload.name);
          if (!result.session) {
            if (loginStatus) {
              loginStatus.dataset.state = 'success';
              loginStatus.textContent = 'Conta criada. Confirme seu e-mail e depois entre para continuar.';
            }
            return;
          }
          await ensureLegacyAccount(payload);
        } else {
          try {
            await auth.signInWithSupabase(payload.email, payload.password);
          } catch (supabaseError) {
            let legacyLogin;
            try {
              legacyLogin = await apiRequest('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify(payload)
              });
            } catch (legacyError) {
              if (legacyError.status === 401) throw supabaseError;
              throw legacyError;
            }

            let migration;
            try {
              migration = await auth.registerWithSupabase(
                payload.email,
                payload.password,
                legacyLogin.user?.name || payload.email.split('@')[0]
              );
            } catch (migrationError) {
              throw new Error(`Sua conta antiga foi validada, mas não foi possível habilitar o chat Supabase: ${migrationError.message}`);
            }
            if (!migration.session) {
              if (loginStatus) {
                loginStatus.dataset.state = 'success';
                loginStatus.textContent = 'Conta antiga vinculada. Confirme seu e-mail e entre novamente para abrir o chat.';
              }
              return;
            }
          }
          await ensureLegacyAccount(payload);
        }
        window.location.assign('/');
      } catch (error) {
        if (loginStatus) loginStatus.textContent = error.message;
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  const tideCalendarToggle = document.getElementById('tideCalendarToggle');
  const tideCalendar = document.getElementById('tideCalendar');
  const tideCalendarMonth = document.getElementById('tideCalendarMonth');
  const tideCalendarDays = document.getElementById('tideCalendarDays');
  const tideSelectedDate = document.getElementById('tideSelectedDate');
  const previousTideMonth = document.getElementById('previousTideMonth');
  const nextTideMonth = document.getElementById('nextTideMonth');
  const tideCalendarToday = document.getElementById('tideCalendarToday');
  const previousTideDay = document.getElementById('previousTideDay');
  const nextTideDay = document.getElementById('nextTideDay');

  if (
    tideCalendarToggle &&
    tideCalendar &&
    tideCalendarMonth &&
    tideCalendarDays &&
    tideSelectedDate &&
    previousTideMonth &&
    nextTideMonth &&
    tideCalendarToday &&
    previousTideDay &&
    nextTideDay
  ) {
    const formatTime = (minutes) => {
      const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
      return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
    };

    const selectedDate = new Date();
    selectedDate.setHours(0, 0, 0, 0);
    const calendarMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    const monthFormatter = new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
      year: 'numeric'
    });
    const fullDateFormatter = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'full'
    });

    const renderCalendar = () => {
      tideCalendarMonth.textContent = monthFormatter.format(calendarMonth);
      tideSelectedDate.textContent = shortDateFormatter.format(selectedDate).replace(/\./g, '');

      const year = calendarMonth.getFullYear();
      const month = calendarMonth.getMonth();
      const firstWeekday = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const cells = [];

      for (let index = 0; index < firstWeekday; index += 1) {
        const emptyCell = document.createElement('span');
        emptyCell.className = 'tide-calendar-empty';
        emptyCell.setAttribute('aria-hidden', 'true');
        cells.push(emptyCell);
      }

      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(year, month, day);
        const isSelected = date.getTime() === selectedDate.getTime();
        const isToday = date.getTime() === new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          new Date().getDate()
        ).getTime();
        const dayButton = document.createElement('button');
        dayButton.className = 'tide-calendar-day';
        dayButton.type = 'button';
        dayButton.textContent = String(day);
        dayButton.setAttribute('role', 'gridcell');
        dayButton.setAttribute('aria-label', fullDateFormatter.format(date));
        dayButton.setAttribute('aria-selected', String(isSelected));
        dayButton.tabIndex = isSelected ? 0 : -1;
        if (isSelected) dayButton.classList.add('selected');
        if (isToday) dayButton.classList.add('today');
        dayButton.addEventListener('click', () => {
          selectedDate.setFullYear(year, month, day);
          calendarMonth.setFullYear(year, month, 1);
          renderTideDay();
          closeCalendar();
        });
        cells.push(dayButton);
      }

      tideCalendarDays.replaceChildren(...cells);
      tideCalendarDays.setAttribute('aria-label', monthFormatter.format(calendarMonth));
    };

    const closeCalendar = () => {
      tideCalendar.hidden = true;
      tideCalendarToggle.setAttribute('aria-expanded', 'false');
    };

    const tideLocationSelect = document.getElementById('tideLocationSelect');
    const headerLocationLabel = document.getElementById('headerLocationLabel');
    const climateLocationLabel = document.getElementById('climateLocationLabel');
    const tideDateBadge = document.getElementById('tideDateBadge');
    const tideStationLabel = document.getElementById('tideStationLabel');
    const tideDataNote = document.getElementById('tideDataNote');
    const tideChart = document.getElementById('tideChart');
    const tideEvents = document.getElementById('tideEvents');
    const tideLine = document.getElementById('tideLine');
    const tideArea = document.getElementById('tideArea');
    const tideEventList = document.getElementById('tideEventList');
    const fishActivityMarkers = document.getElementById('fishActivityMarkers');
    const sunriseTime = document.getElementById('sunriseTime');
    const sunsetTime = document.getElementById('sunsetTime');
    const sunMarkers = document.getElementById('sunMarkers');
    const peakTideHeight = document.getElementById('peakTideHeight');
    const fishActivityScore = document.getElementById('fishActivityScore');
    const fishActivityTrack = document.getElementById('fishActivityTrack');
    const fishActivityPeriods = document.getElementById('fishActivityPeriods');
    const chartWidth = 320;
    const chartTop = 12;
    const chartBottom = 126;
    let selectedLocation = null;
    const locations = [];
    let tideRequestController = null;
    let tideRequestId = 0;

    const dateToIso = (date) => (
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    );
    const normalizeDegrees = (degrees) => ((degrees % 360) + 360) % 360;
    const normalizeHours = (hours) => ((hours % 24) + 24) % 24;
    const degreesToRadians = (degrees) => degrees * Math.PI / 180;
    const radiansToDegrees = (radians) => radians * 180 / Math.PI;

    const solarTimeForDate = (date, location, isSunrise) => {
      const yearStart = Date.UTC(date.getFullYear(), 0, 0);
      const dateUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
      const dayOfYear = Math.floor((dateUtc - yearStart) / 86400000);
      const longitudeHour = location.longitude / 15;
      const approximateTime = dayOfYear + ((isSunrise ? 6 : 18) - longitudeHour) / 24;
      const meanAnomaly = 0.9856 * approximateTime - 3.289;
      const trueLongitude = normalizeDegrees(
        meanAnomaly +
        1.916 * Math.sin(degreesToRadians(meanAnomaly)) +
        0.02 * Math.sin(2 * degreesToRadians(meanAnomaly)) +
        282.634
      );
      let rightAscension = radiansToDegrees(
        Math.atan(0.91764 * Math.tan(degreesToRadians(trueLongitude)))
      );
      rightAscension += Math.floor(trueLongitude / 90) * 90 - Math.floor(rightAscension / 90) * 90;
      rightAscension /= 15;

      const sinDeclination = 0.39782 * Math.sin(degreesToRadians(trueLongitude));
      const cosDeclination = Math.cos(Math.asin(sinDeclination));
      const cosineHourAngle = (
        Math.cos(degreesToRadians(90.833)) -
        sinDeclination * Math.sin(degreesToRadians(location.latitude))
      ) / (cosDeclination * Math.cos(degreesToRadians(location.latitude)));
      if (cosineHourAngle < -1 || cosineHourAngle > 1) return null;

      const hourAngle = isSunrise
        ? 360 - radiansToDegrees(Math.acos(cosineHourAngle))
        : radiansToDegrees(Math.acos(cosineHourAngle));
      const localMeanTime = hourAngle / 15 + rightAscension - 0.06571 * approximateTime - 6.622;
      return normalizeHours(localMeanTime - longitudeHour + location.utcOffset) * 60;
    };

    const clearTideDisplay = () => {
      if (tideStationLabel) tideStationLabel.textContent = '';
      if (tideLine) tideLine.setAttribute('d', '');
      if (tideArea) tideArea.setAttribute('d', '');
      if (tideEvents) tideEvents.replaceChildren();
      if (fishActivityMarkers) fishActivityMarkers.replaceChildren();
      if (tideEventList) tideEventList.replaceChildren();
      if (peakTideHeight) peakTideHeight.textContent = '—';
      if (fishActivityScore) fishActivityScore.textContent = 'Indisponível';
      if (fishActivityTrack) fishActivityTrack.replaceChildren();
      if (fishActivityPeriods) fishActivityPeriods.replaceChildren();
    };

    const renderSolarEstimates = () => {
      if (!selectedLocation) return;
      const sunriseMinutes = solarTimeForDate(selectedDate, selectedLocation, true);
      const sunsetMinutes = solarTimeForDate(selectedDate, selectedLocation, false);
      if (sunriseTime) sunriseTime.textContent = sunriseMinutes === null ? '—' : formatTime(sunriseMinutes);
      if (sunsetTime) sunsetTime.textContent = sunsetMinutes === null ? '—' : formatTime(sunsetMinutes);
      if (sunMarkers) {
        const markers = [sunriseMinutes, sunsetMinutes]
          .filter((minutes) => minutes !== null)
          .map((minutes) => {
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            const x = (minutes / 1440) * chartWidth;
            marker.setAttribute('x1', x.toFixed(1));
            marker.setAttribute('x2', x.toFixed(1));
            marker.setAttribute('y1', String(chartTop));
            marker.setAttribute('y2', String(chartBottom));
            marker.setAttribute('class', 'sun-chart-marker');
            return marker;
          });
        sunMarkers.replaceChildren(...markers);
      }
    };

    const classifyTideEvents = (events) => events.map((event, index) => {
      const previous = events[index - 1];
      const next = events[index + 1];
      const isHigh = previous && next
        ? event.height >= previous.height && event.height >= next.height
        : next
          ? event.height > next.height
          : previous
            ? event.height > previous.height
            : false;
      return { ...event, type: isHigh ? 'alta' : 'baixa', label: isHigh ? 'Maré alta' : 'Maré baixa' };
    });

    const getEventMinutes = (event, selectedDay) => {
      const eventDate = new Date(`${event.date}T00:00:00Z`);
      const dayOffset = Math.round((eventDate.getTime() - selectedDay.getTime()) / 86400000);
      const [hour, minute] = event.time.split(':').map(Number);
      return dayOffset * 1440 + hour * 60 + minute;
    };

    const renderTideDay = async () => {
      renderCalendar();
      renderSolarEstimates();
      if (!selectedLocation) return;

      if (tideRequestController) tideRequestController.abort();
      tideRequestController = new AbortController();
      const requestId = ++tideRequestId;
      const dateValue = dateToIso(selectedDate);
      const selectedDay = new Date(`${dateValue}T00:00:00Z`);
      if (tideDateBadge) {
        tideDateBadge.textContent = dateValue === dateToIso(new Date())
          ? 'Hoje'
          : shortDateFormatter.format(selectedDate).replace(/\./g, '');
      }
      const query = new URLSearchParams({ location: selectedLocation.id, date: dateValue });
      clearTideDisplay();
      if (tideChart) tideChart.classList.add('is-loading');
      if (tideChart) tideChart.setAttribute('aria-busy', 'true');
      if (tideDataNote) {
        tideDataNote.textContent = 'Consultando tábua oficial de marés…';
        tideDataNote.dataset.state = 'loading';
      }

      try {
        const response = await fetch(`/api/tides?${query}`, { signal: tideRequestController.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `Falha ao consultar as marés (HTTP ${response.status}).`);
        if (requestId !== tideRequestId) return;

        const contextEvents = payload.events
          .filter((event) => Number.isFinite(Number(event.height)) && /^\d{4}-\d{2}-\d{2}$/.test(event.date))
          .map((event) => ({
            ...event,
            height: Number(event.height),
            minutes: getEventMinutes(event, selectedDay)
          }))
          .sort((left, right) => left.minutes - right.minutes);
        const datedEvents = payload.events
          .filter((event) => event.date === dateValue)
          .map((event) => ({
            ...event,
            height: Number(event.height),
            minutes: getEventMinutes(event, selectedDay)
          }));
        const events = classifyTideEvents(datedEvents);
        const xForMinute = (minutes) => (minutes / 1440) * chartWidth;
        const yForHeight = (height) => chartBottom - (Math.max(0, Math.min(3, height)) / 3) * (chartBottom - chartTop);
        const heightAtMinute = (minutes) => {
          const upperIndex = contextEvents.findIndex((event) => event.minutes >= minutes);
          if (upperIndex === 0) {
            return contextEvents[0].minutes === minutes ? contextEvents[0].height : null;
          }
          if (upperIndex < 0) return null;
          const lower = contextEvents[upperIndex - 1];
          const upper = contextEvents[upperIndex];
          const interval = upper.minutes - lower.minutes;
          if (interval <= 0) return null;
          const progress = (minutes - lower.minutes) / interval;
          return lower.height + (upper.height - lower.height) * (1 - Math.cos(Math.PI * progress)) / 2;
        };

        const firstContextMinute = contextEvents.length ? contextEvents[0].minutes : 0;
        const lastContextMinute = contextEvents.length ? contextEvents[contextEvents.length - 1].minutes : 1440;
        const chartStart = Math.max(0, firstContextMinute);
        const chartEnd = Math.min(1440, lastContextMinute);
        if (contextEvents.length > 1 && chartEnd > chartStart) {
          const sampleMinutes = [chartStart];
          for (let minute = Math.ceil(chartStart / 15) * 15; minute < chartEnd; minute += 15) {
            if (minute > chartStart) sampleMinutes.push(minute);
          }
          sampleMinutes.push(chartEnd);
          const coordinates = sampleMinutes
            .map((minute) => {
              const height = heightAtMinute(minute);
              return height === null
                ? null
                : `${xForMinute(minute).toFixed(1)} ${yForHeight(height).toFixed(1)}`;
            })
            .filter(Boolean);
          const points = coordinates.map((coordinate, index) => `${index === 0 ? 'M' : 'L'} ${coordinate}`);
          if (points.length > 1) {
            const linePath = points.join(' ');
            if (tideLine) tideLine.setAttribute('d', linePath);
            if (tideArea) tideArea.setAttribute('d', `${linePath} L ${xForMinute(chartEnd).toFixed(1)} ${chartBottom} L ${xForMinute(chartStart).toFixed(1)} ${chartBottom} Z`);
          }
        }

        if (peakTideHeight) {
          const highTides = events.filter((event) => event.type === 'alta');
          peakTideHeight.textContent = highTides.length
            ? `${Math.max(...highTides.map((event) => event.height)).toFixed(1).replace('.', ',')} m`
            : '—';
        }

        if (tideEvents) {
          tideEvents.replaceChildren(...events.map((event) => {
            const minutes = getEventMinutes(event, selectedDay);
            const x = xForMinute(minutes);
            const y = yForHeight(event.height);
            const markerColor = event.type === 'alta' ? '#54d5ff' : '#f47a83';
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            title.textContent = `${event.label}: ${formatTime(minutes)}, ${event.height.toFixed(2)} m`;

            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            marker.setAttribute('cx', x.toFixed(1));
            marker.setAttribute('cy', y.toFixed(1));
            marker.setAttribute('r', '4.5');
            marker.setAttribute('fill', markerColor);

            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', x.toFixed(1));
            label.setAttribute('y', String(Math.max(10, y - 9)));
            label.setAttribute('text-anchor', x < 20 ? 'start' : x > 300 ? 'end' : 'middle');
            label.setAttribute('fill', markerColor);
            label.textContent = formatTime(minutes);
            group.append(title, marker, label);
            return group;
          }));
        }

        if (tideEventList) {
          tideEventList.replaceChildren(...events.map((event) => {
            const minutes = getEventMinutes(event, selectedDay);
            const item = document.createElement('div');
            item.className = 'tide-event-item';
            const marker = document.createElement('span');
            marker.className = `tide-event-dot ${event.type}`;
            const time = document.createElement('time');
            time.textContent = formatTime(minutes);
            const height = document.createElement('strong');
            height.textContent = `${event.height.toFixed(2).replace('.', ',')} m`;
            const label = document.createElement('span');
            label.textContent = event.label;
            item.append(marker, time, height, label);
            return item;
          }));
        }

        const highTides = events.filter((event) => event.type === 'alta');
        const dayOffset = Math.round((selectedDay.getTime() - Date.UTC(
          new Date().getFullYear(),
          new Date().getMonth(),
          new Date().getDate()
        )) / 86400000);
        const score = Math.round(68 + 21 * (0.5 + 0.5 * Math.sin((dayOffset + 2) * 0.8)));
        const activityLabel = score >= 80 ? 'Muito alta' : score >= 65 ? 'Alta' : 'Moderada';
        if (fishActivityScore) {
          fishActivityScore.textContent = highTides.length ? `${activityLabel} · ${score}% (estimativa)` : 'Indisponível';
        }

        const activityWindows = events.map((event) => ({
          start: Math.max(0, event.minutes - 90) / 1440 * 100,
          width: (Math.min(1440, event.minutes + 90) - Math.max(0, event.minutes - 90)) / 1440 * 100,
          type: event.type
        }));
        if (fishActivityTrack) {
          fishActivityTrack.replaceChildren(...activityWindows.map((window) => {
            const segment = document.createElement('span');
            segment.className = `fish-activity-window ${window.type}`;
            segment.style.left = `${window.start}%`;
            segment.style.width = `${window.width}%`;
            return segment;
          }));
          fishActivityTrack.setAttribute('aria-label', `Atividade estimada: ${activityLabel}, ${score}%`);
        }

        if (fishActivityMarkers) {
          const markers = highTides.flatMap((event) => {
            const start = Math.max(0, event.minutes - 90);
            const end = Math.min(1440, event.minutes + 90);
            if (end <= start) return [];
            const window = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            window.setAttribute('x', xForMinute(start).toFixed(1));
            window.setAttribute('y', String(chartTop));
            window.setAttribute('width', (xForMinute(end) - xForMinute(start)).toFixed(1));
            window.setAttribute('height', String(chartBottom - chartTop));
            window.setAttribute('rx', '4');
            window.setAttribute('class', 'fish-activity-chart-window');
            const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            title.textContent = `Atividade estimada: ${formatTime(event.minutes - 90)}–${formatTime(event.minutes + 90)}`;
            window.append(title);
            const icons = [];
            for (let x = xForMinute(start) + 4; x < xForMinute(end) - 10; x += 13) {
              const fish = document.createElementNS('http://www.w3.org/2000/svg', 'g');
              fish.setAttribute('transform', `translate(${x.toFixed(1)} ${chartBottom - 9}) scale(1.2)`);
              fish.setAttribute('class', 'fish-activity-chart-icon');
              const body = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              body.setAttribute('d', 'M0 0 L-3 -2 L-3 2 Z M0 0 C2 -3 6 -3 8 0 C6 3 2 3 0 0 Z');
              const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
              eye.setAttribute('cx', '6');
              eye.setAttribute('cy', '-0.8');
              eye.setAttribute('r', '0.6');
              fish.append(body, eye);
              icons.push(fish);
            }
            return [window, ...icons];
          });
          fishActivityMarkers.replaceChildren(...markers);
        }

        if (fishActivityPeriods) {
          fishActivityPeriods.replaceChildren(...highTides.map((event) => {
            const period = document.createElement('span');
            period.textContent = `${formatTime(event.minutes - 90)}–${formatTime(event.minutes + 90)}`;
            return period;
          }));
        }

        if (tideStationLabel) {
          tideStationLabel.textContent = `Porto mais próximo usado: ${payload.station} · ${payload.institution}`;
        }
        if (tideDataNote) {
          tideDataNote.textContent = `Dados de maré atualizados para ${fullDateFormatter.format(selectedDate)}.`;
          tideDataNote.dataset.state = 'ready';
        }
      } catch (error) {
        if (error.name === 'AbortError' || requestId !== tideRequestId) return;
        clearTideDisplay();
        if (tideDataNote) {
          tideDataNote.textContent = error.message || 'Não foi possível carregar os dados de maré.';
          tideDataNote.dataset.state = 'error';
        }
      } finally {
        if (requestId === tideRequestId) {
          if (tideChart) tideChart.classList.remove('is-loading');
          if (tideChart) tideChart.setAttribute('aria-busy', 'false');
        }
      }
    };

    const updateLocationLabels = () => {
      if (!selectedLocation) return;
      if (headerLocationLabel) headerLocationLabel.textContent = `${selectedLocation.name}, PE`;
      if (climateLocationLabel) climateLocationLabel.textContent = selectedLocation.name;
    };

    tideCalendarToggle.addEventListener('click', () => {
      const isOpening = tideCalendar.hidden;
      tideCalendar.hidden = !isOpening;
      tideCalendarToggle.setAttribute('aria-expanded', String(isOpening));
      if (isOpening) {
        calendarMonth.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        renderCalendar();
      }
    });
    previousTideMonth.addEventListener('click', () => {
      calendarMonth.setMonth(calendarMonth.getMonth() - 1);
      renderCalendar();
    });
    nextTideMonth.addEventListener('click', () => {
      calendarMonth.setMonth(calendarMonth.getMonth() + 1);
      renderCalendar();
    });
    tideCalendarToday.addEventListener('click', () => {
      selectedDate.setTime(new Date().setHours(0, 0, 0, 0));
      calendarMonth.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      renderTideDay();
      closeCalendar();
    });
    document.addEventListener('click', (event) => {
      if (event.target instanceof Node && !tideCalendarToggle.parentElement.contains(event.target)) {
        closeCalendar();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !tideCalendar.hidden) {
        closeCalendar();
        tideCalendarToggle.focus();
      }
    });
    previousTideDay.addEventListener('click', () => {
      selectedDate.setDate(selectedDate.getDate() - 1);
      calendarMonth.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      renderTideDay();
    });
    nextTideDay.addEventListener('click', () => {
      selectedDate.setDate(selectedDate.getDate() + 1);
      calendarMonth.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      renderTideDay();
    });
    if (tideLocationSelect) {
      tideLocationSelect.addEventListener('change', () => {
        selectedLocation = locations.find((location) => location.id === tideLocationSelect.value);
        updateLocationLabels();
        renderTideDay();
      });
    }
    const initializeLocations = async () => {
      try {
        const response = await fetch('/api/locations');
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.data) || !payload.data.length) {
          throw new Error(payload.error || 'Não foi possível carregar as localidades.');
        }
        locations.push(...payload.data);
        if (tideLocationSelect) {
          tideLocationSelect.replaceChildren(...locations.map((location) => {
            const option = document.createElement('option');
            option.value = location.id;
            option.textContent = location.name;
            return option;
          }));
        }
        selectedLocation = locations.find((location) => location.id === 'recife') || locations[0];
        if (tideLocationSelect) tideLocationSelect.value = selectedLocation.id;
        updateLocationLabels();
        renderTideDay();
      } catch (error) {
        if (tideDataNote) {
          tideDataNote.textContent = error.message || 'Não foi possível carregar as localidades.';
          tideDataNote.dataset.state = 'error';
        }
      }
    };
    initializeLocations();
  }

  // ============================================================
  //  NAVEGAÇÃO POR ABAS (menu inferior)
  // ============================================================
  const tabButtons = document.querySelectorAll('.item-menu[data-tab]');
  const menuNavigation = document.querySelector('.menu-navegacao-inferior');
  const mainContent = document.querySelector('.conteudo-principal > .container-conteudo');
  const paineis = {
    inicio:   null,
    locais:   document.getElementById('painel-locais'),
    capturas: document.getElementById('painel-capturas'),
    conquistas: document.getElementById('painel-conquistas'),
    chat:     document.getElementById('painel-chat'),
    perfil:   document.getElementById('painel-perfil'),
  };

  // Coleta todos os painéis de aba
  const todosOsPaineis = Object.values(paineis).filter(Boolean);

  const ativarTab = (tabId) => {
    // Atualiza botões do menu
    tabButtons.forEach((btn) => {
      btn.classList.toggle('ativo', btn.dataset.tab === tabId);
      btn.setAttribute('aria-current', btn.dataset.tab === tabId ? 'page' : 'false');
    });

    if (tabId === 'inicio') {
      // Mostra conteúdo original (inclui o FAB)
      if (mainContent) mainContent.hidden = false;
      todosOsPaineis.forEach((p) => { p.hidden = true; });
    } else {
      // Esconde conteúdo de início (inclui o FAB)
      if (mainContent) mainContent.hidden = true;

      // Esconde todos e mostra o painel correto
      todosOsPaineis.forEach((p) => { p.hidden = true; });
      const painel = paineis[tabId];
      if (painel) {
        painel.hidden = false;
        // Re-dispara animação
        painel.style.animation = 'none';
        requestAnimationFrame(() => {
          painel.style.animation = '';
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  menuNavigation?.addEventListener('click', (event) => {
    const button = event.target.closest('.item-menu[data-tab]');
    if (!button || !menuNavigation.contains(button)) return;
    event.preventDefault();
    ativarTab(button.dataset.tab);
  });
  document.getElementById('viewAllAchievements')?.addEventListener('click', () => {
    ativarTab('conquistas');
  });

  // ============================================================
  //  FILTROS CHIP – Locais
  // ============================================================
  const filtroChips = document.querySelectorAll('.filtro-chip');
  filtroChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      filtroChips.forEach((c) => c.classList.remove('ativo'));
      chip.classList.add('ativo');
    });
  });

  // ============================================================
  //  NAVEGAÇÃO DE MÊS – Capturas
  // ============================================================
  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  let mesAtual = new Date().getMonth();
  let anoAtual = new Date().getFullYear();
  const mesAtualLabel = document.getElementById('mesAtualLabel');
  const mesBtnAnterior = document.getElementById('mesBtnAnterior');
  const mesBtnProximo  = document.getElementById('mesBtnProximo');

  const atualizarMesLabel = () => {
    if (mesAtualLabel) mesAtualLabel.textContent = `${meses[mesAtual]} ${anoAtual}`;
  };
  atualizarMesLabel();

  if (mesBtnAnterior) {
    mesBtnAnterior.addEventListener('click', () => {
      mesAtual -= 1;
      if (mesAtual < 0) { mesAtual = 11; anoAtual -= 1; }
      atualizarMesLabel();
    });
  }
  if (mesBtnProximo) {
    mesBtnProximo.addEventListener('click', () => {
      mesAtual += 1;
      if (mesAtual > 11) { mesAtual = 0; anoAtual += 1; }
      atualizarMesLabel();
    });
  }

  const appNavigation = document.getElementById('tab-inicio');
  if (!appNavigation) return;

  const fisherSearch = document.getElementById('fisherSearch');
  const fisherResults = document.getElementById('fisherResults');
  const fisherProfile = document.getElementById('fisherProfile');
  const chatFisherSearch = document.getElementById('chatFisherSearch');
  const chatFisherResults = document.getElementById('chatFisherResults');
  const friendshipResults = document.getElementById('friendshipResults');
  const friendshipStatus = document.getElementById('friendshipStatus');
  const leaderboardResults = document.getElementById('leaderboardResults');
  const conversationList = document.getElementById('conversationList');
  const groupMemberOptions = document.getElementById('groupMemberOptions');
  const newGroupForm = document.getElementById('newGroupForm');
  const groupFormStatus = document.getElementById('groupFormStatus');
  const chatEmptyState = document.getElementById('chatEmptyState');
  const chatActive = document.getElementById('chatActive');
  const chatMessages = document.getElementById('chatMessages');
  const chatMessageForm = document.getElementById('chatMessageForm');
  const catchDialog = document.getElementById('catchDialog');
  const catchForm = document.getElementById('catchForm');
  const catchFormStatus = document.getElementById('catchFormStatus');
  let currentUser = null;
  let currentSupabaseUser = null;
  let currentFriendships = [];
  let activeConversationId = null;
  let closeActiveRoom = null;
  let groupFishersLoaded = false;
  let searchTimer = null;
  let chatSearchTimer = null;
  let rankingTimer = null;
  let chatRefreshInProgress = false;

  const setStatus = (element, message, state = '') => {
    if (!element) return;
    element.textContent = message;
    element.dataset.state = state;
  };

  const createElement = (tagName, className, text) => {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const showEmpty = (parent, message) => {
    parent.replaceChildren(createElement('p', 'community-empty', message));
  };

  const formatCatchDate = (value) => new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium'
  }).format(new Date(value));

  const renderCatchCards = (parent, catches) => {
    if (!catches.length) {
      showEmpty(parent, 'Ainda não há capturas registradas.');
      return;
    }
    const cards = catches.map((record) => {
      const card = createElement('article', 'card-captura');
      let image;
      if (record.imagePath) {
        image = createElement('img', 'captura-img');
        image.src = window.FisgaSupabaseChat.getCatchPhotoUrl(record.imagePath);
        image.alt = `Peixe pescado: ${record.species}`;
        image.loading = 'lazy';
        image.addEventListener('error', () => {
          const placeholder = createElement('div', 'captura-img captura-img-placeholder');
          placeholder.append(createElement('span', 'material-symbols-outlined text-[32px] text-slate-300', 'phishing'));
          image.replaceWith(placeholder);
        }, { once: true });
      } else {
        image = createElement('div', 'captura-img captura-img-placeholder');
        image.append(createElement('span', 'material-symbols-outlined text-[32px] text-slate-300', 'phishing'));
      }
      const info = createElement('div', 'captura-info');
      info.append(
        createElement('strong', 'captura-especie', record.species),
        createElement('span', 'captura-medida', `${record.length} cm • ${record.weight} kg`),
        createElement('span', 'captura-data', `${formatCatchDate(record.createdAt)}${record.location ? ` • ${record.location}` : ''}`)
      );
      card.append(image, info);
      return card;
    });
    parent.replaceChildren(...cards);
  };

  const loadMyCatches = async () => {
    const response = await apiRequest('/api/community/catches');
    const catchList = document.getElementById('userCatchList');
    const profileCatchList = document.getElementById('profileCatchList');
    if (catchList) renderCatchCards(catchList, response.data);
    if (profileCatchList) renderCatchCards(profileCatchList, response.data);
    const profileStats = document.querySelectorAll('.perfil-stats-grid .perfil-stat-numero');
    if (profileStats[0]) profileStats[0].textContent = String(response.data.length);
    if (profileStats[1]) profileStats[1].textContent = String(new Set(response.data.map((record) => record.species.toLocaleLowerCase('pt-BR'))).size);
  };

  const startDirectConversation = async (fisher) => {
    try {
      const roomId = await window.FisgaSupabaseChat.createDirectRoom(fisher.id);
      await loadConversations(roomId);
      ativarTab('chat');
    } catch (error) {
      showEmpty(chatFisherResults, error.message);
    }
  };

  const searchChatByName = (name) => {
    ativarTab('chat');
    chatFisherSearch.value = name;
    loadChatFishers(name);
  };

  const renderFriendships = () => {
    if (!currentFriendships.length) {
      showEmpty(friendshipResults, 'Você ainda não tem amigos ou solicitações.');
      return;
    }

    const items = currentFriendships.map((friendship) => {
      const row = createElement('article', 'community-result chat-fisher-result');
      const copy = createElement('div', 'community-result-copy');
      const relationshipLabel = friendship.status === 'aceita'
        ? 'Amigo'
        : friendship.direction === 'received'
          ? 'Solicitação recebida'
          : 'Solicitação enviada';
      copy.append(
        createElement('strong', '', friendship.name),
        createElement('span', '', relationshipLabel)
      );
      const actions = createElement('div', 'community-actions');

      const addAction = (label, action, className = 'community-action') => {
        const button = createElement('button', className, label);
        button.type = 'button';
        button.addEventListener('click', () => changeFriendship(friendship.userId, action));
        actions.append(button);
      };

      if (friendship.status === 'aceita') {
        addAction('Remover', 'remove');
      } else if (friendship.direction === 'received') {
        addAction('Aceitar', 'accept');
        addAction('Recusar', 'reject');
      } else {
        addAction('Cancelar', 'remove');
      }

      row.append(copy, actions);
      return row;
    });
    friendshipResults.replaceChildren(...items);
  };

  const loadFriendships = async () => {
    currentFriendships = await window.FisgaSupabaseChat.listSupabaseFriendships();
    renderFriendships();
  };

  document.getElementById('tab-chat')?.addEventListener('click', () => {
    if (currentSupabaseUser) {
      loadFriendships().catch((error) => setStatus(friendshipStatus, error.message, 'error'));
    }
  });

  const changeFriendship = async (userId, action) => {
    try {
      let successMessage;
      if (action === 'request') {
        const status = await window.FisgaSupabaseChat.requestSupabaseFriendship(userId);
        successMessage = status === 'aceita'
          ? 'Vocês agora são amigos.'
          : 'Solicitação de amizade enviada.';
      } else if (action === 'accept' || action === 'reject') {
        await window.FisgaSupabaseChat.respondSupabaseFriendship(userId, action === 'accept');
        successMessage = action === 'accept' ? 'Solicitação aceita.' : 'Solicitação recusada.';
      } else {
        await window.FisgaSupabaseChat.removeSupabaseFriendship(userId);
        successMessage = 'Amizade ou solicitação removida.';
      }

      await loadFriendships();
      await loadChatFishers(chatFisherSearch?.value || '');
      setStatus(friendshipStatus, successMessage, 'success');
    } catch (error) {
      setStatus(friendshipStatus, error.message, 'error');
    }
  };

  const renderFisherProfile = (fisher, catches) => {
    if (!fisherProfile) return;
    fisherProfile.hidden = false;
    fisherProfile.replaceChildren();
    const heading = createElement('div', 'social-section-heading');
    const headingCopy = createElement('div');
    headingCopy.append(
      createElement('h4', '', fisher.name),
      createElement('p', '', `${catches.length} captura${catches.length === 1 ? '' : 's'} registrada${catches.length === 1 ? '' : 's'}`)
    );
    const messageButton = createElement('button', 'community-action', 'Conversar');
    messageButton.type = 'button';
    messageButton.addEventListener('click', () => searchChatByName(fisher.name));
    headingCopy.append(messageButton);
    heading.append(headingCopy);
    fisherProfile.append(heading);
    renderCatchCards(fisherProfile, catches);
  };

  const loadFisherProfile = async (fisherId) => {
    try {
      const response = await apiRequest(`/api/community/fishers/${encodeURIComponent(fisherId)}/catches`);
      renderFisherProfile(response.fisher, response.data);
    } catch (error) {
      showEmpty(fisherProfile, error.message);
    }
  };

  const populateGroupMembers = (fishers) => {
    if (!groupMemberOptions) return;
    if (!fishers.length) {
      showEmpty(groupMemberOptions, 'Nenhum outro pescador cadastrado no Supabase.');
      return;
    }
    const options = fishers.map((fisher) => {
      const label = createElement('label', 'group-member-option');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'memberIds';
      checkbox.value = fisher.id;
      label.append(checkbox, document.createTextNode(fisher.nome_usuario));
      return label;
    });
    groupMemberOptions.replaceChildren(...options);
  };

  const loadFishers = async (query = '') => {
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      const response = await apiRequest(`/api/community/fishers?${params}`);
      if (!response.data.length) {
        showEmpty(fisherResults, query ? 'Nenhum pescador encontrado com esse nome.' : 'Ainda não há outros pescadores cadastrados.');
        return;
      }
      const results = response.data.map((fisher) => {
        const row = createElement('article', 'community-result');
        const copy = createElement('div', 'community-result-copy');
        copy.append(
          createElement('strong', '', fisher.name),
          createElement('span', '', `${fisher.catchesCount} captura${fisher.catchesCount === 1 ? '' : 's'}`)
        );
        const actions = createElement('div', 'community-actions');
        const profileButton = createElement('button', 'community-action', 'Ver peixes');
        profileButton.type = 'button';
        profileButton.addEventListener('click', () => loadFisherProfile(fisher.id));
        const chatButton = createElement('button', 'community-action', 'Chat');
        chatButton.type = 'button';
        chatButton.addEventListener('click', () => searchChatByName(fisher.name));
        actions.append(profileButton, chatButton);
        row.append(copy, actions);
        return row;
      });
      fisherResults.replaceChildren(...results);
    } catch (error) {
      showEmpty(fisherResults, error.message);
      setStatus(groupFormStatus, error.message, 'error');
    }
  };

  const loadChatFishers = async (query = '', populateGroups = false) => {
    try {
      const fishers = await window.FisgaSupabaseChat.searchSupabaseFishers(query);
      const otherFishers = fishers.filter((fisher) => fisher.id !== currentSupabaseUser?.id);
      if (populateGroups) {
        const groupFishers = query
          ? await window.FisgaSupabaseChat.searchSupabaseFishers()
          : otherFishers;
        populateGroupMembers(groupFishers.filter((fisher) => fisher.id !== currentSupabaseUser?.id));
        groupFishersLoaded = true;
      }
      if (!otherFishers.length) {
        showEmpty(chatFisherResults, query ? 'Nenhum pescador encontrado com esse nome.' : 'Ainda não há outros pescadores cadastrados.');
        return;
      }
      const results = otherFishers.map((fisher) => {
        const row = createElement('article', 'community-result chat-fisher-result');
        const copy = createElement('div', 'community-result-copy');
        copy.append(createElement('strong', '', fisher.nome_usuario));
        const actions = createElement('div', 'community-actions');
        const friendship = currentFriendships.find((item) => item.userId === fisher.id);
        const friendButton = createElement(
          'button',
          'community-action',
          friendship
            ? friendship.status === 'aceita'
              ? 'Amigos'
              : friendship.direction === 'received'
                ? 'Aceitar'
                : 'Solicitado'
            : 'Adicionar amigo'
        );
        friendButton.type = 'button';
        if (friendship?.status === 'aceita' || (friendship?.status === 'pendente' && friendship.direction === 'sent')) {
          friendButton.disabled = true;
        } else {
          friendButton.addEventListener('click', () => changeFriendship(
            fisher.id,
            friendship?.direction === 'received' ? 'accept' : 'request'
          ));
        }
        const chatButton = createElement('button', 'community-action', 'Conversar');
        chatButton.type = 'button';
        chatButton.addEventListener('click', () => startDirectConversation({
          id: fisher.id,
          name: fisher.nome_usuario
        }));
        actions.append(friendButton, chatButton);
        row.append(copy, actions);
        return row;
      });
      chatFisherResults.replaceChildren(...results);
    } catch (error) {
      showEmpty(chatFisherResults, error.message);
    }
  };

  const loadLeaderboard = async () => {
    const params = new URLSearchParams();
    const values = {
      q: document.getElementById('leaderboardSearch')?.value,
      minWeight: document.getElementById('leaderboardMinWeight')?.value,
      maxWeight: document.getElementById('leaderboardMaxWeight')?.value,
      minLength: document.getElementById('leaderboardMinLength')?.value,
      maxLength: document.getElementById('leaderboardMaxLength')?.value
    };
    Object.entries(values).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    try {
      const response = await apiRequest(`/api/community/leaderboard?${params}`);
      if (!response.data.length) {
        showEmpty(leaderboardResults, 'Nenhuma captura corresponde aos filtros. Registre uma captura para iniciar o ranking.');
        return;
      }
      const rows = response.data.map((record, index) => {
        const row = createElement('article', 'leaderboard-result');
        const copy = createElement('div', 'leaderboard-result-copy');
        copy.append(
          createElement('strong', '', `${index + 1}. ${record.species} • ${record.weight} kg • ${record.length} cm`),
          createElement('span', '', `${record.fisher?.name || 'Pescador'}${record.location ? ` • ${record.location}` : ''}`)
        );
        row.append(copy);
        return row;
      });
      leaderboardResults.replaceChildren(...rows);
    } catch (error) {
      showEmpty(leaderboardResults, error.message);
    }
  };

  const loadConversations = async (selectedId = activeConversationId) => {
    const conversations = await window.FisgaSupabaseChat.listSupabaseRooms();
    if (!conversations.length) {
      if (closeActiveRoom) {
        await closeActiveRoom();
        closeActiveRoom = null;
      }
      activeConversationId = null;
      showEmpty(conversationList, 'Suas conversas aparecerão aqui.');
      chatMessages.replaceChildren();
      chatEmptyState.hidden = false;
      chatActive.hidden = true;
      return;
    }
    const items = conversations.map((conversation) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `conversation-item${conversation.id === selectedId ? ' active' : ''}`;
      const otherMembers = conversation.members
        .filter((member) => member.id !== currentSupabaseUser.id)
        .map((member) => member.name);
      const title = conversation.type === 'group' ? conversation.name : (otherMembers[0] || 'Conversa');
      item.append(
        createElement('strong', '', title),
        createElement('span', '', conversation.latestMessage?.conteudo || `${conversation.members.length} participante${conversation.members.length === 1 ? '' : 's'}`)
      );
      item.addEventListener('click', () => loadConversations(conversation.id)
        .catch((error) => setStatus(document.getElementById('chatStatus'), error.message, 'error')));
      return item;
    });
    conversationList.replaceChildren(...items);

    const previousRoomId = activeConversationId;
    const selected = conversations.find((conversation) => conversation.id === selectedId) || conversations[0];
    const selectedItem = items[conversations.indexOf(selected)];
    selectedItem.classList.add('active');
    const otherMembers = selected.members.filter((member) => member.id !== currentSupabaseUser.id);
    document.getElementById('chatConversationTitle').textContent = selected.type === 'group'
      ? selected.name
      : (otherMembers[0]?.name || 'Conversa');
    document.getElementById('chatConversationMembers').textContent = selected.type === 'group'
      ? `${selected.members.length} participantes`
      : 'Conversa privada';
    chatEmptyState.hidden = true;
    chatActive.hidden = false;
    if (selected.id !== previousRoomId || !closeActiveRoom) {
      if (closeActiveRoom) {
        await closeActiveRoom();
        closeActiveRoom = null;
      }
      activeConversationId = selected.id;
      setStatus(document.getElementById('chatStatus'), '');
      try {
        closeActiveRoom = await window.FisgaSupabaseChat.openRoomChat(selected.id, chatMessages);
      } catch (error) {
        activeConversationId = null;
        closeActiveRoom = null;
        setStatus(document.getElementById('chatStatus'), error.message, 'error');
        throw error;
      }
    }
  };

  const initializeApp = async () => {
    try {
      const supabaseAuth = window.FisgaSupabaseChat;
      if (!supabaseAuth) throw new Error('O módulo Supabase não carregou. Verifique a conexão e a configuração.');
      currentSupabaseUser = await supabaseAuth.getSupabaseUser();
      if (!currentSupabaseUser) {
        window.location.replace('/login/login.html');
        return;
      }
      const response = await apiRequest('/api/community/me');
      currentUser = response.user;
      const profileName = document.querySelector('.perfil-nome');
      if (profileName) profileName.textContent = currentUser.name;
      const greeting = document.querySelector('.texto-ola');
      if (greeting) greeting.textContent = `Olá, ${currentUser.name}!`;
      await loadFriendships();
      await Promise.all([loadMyCatches(), loadFishers(), loadChatFishers('', true), loadLeaderboard(), loadConversations()]);
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('/login/login.html');
        return;
      }
      showEmpty(fisherResults, error.message);
      showEmpty(leaderboardResults, error.message);
      showEmpty(conversationList, error.message);
      setStatus(document.getElementById('chatStatus'), error.message, 'error');
      setStatus(friendshipStatus, error.message, 'error');
    }
  };

  if (fisherSearch) {
    fisherSearch.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadFishers(fisherSearch.value), 250);
    });
  }

  if (chatFisherSearch) {
    chatFisherSearch.addEventListener('input', () => {
      clearTimeout(chatSearchTimer);
      chatSearchTimer = setTimeout(() => loadChatFishers(chatFisherSearch.value), 250);
    });
  }

  ['leaderboardSearch', 'leaderboardMinWeight', 'leaderboardMaxWeight', 'leaderboardMinLength', 'leaderboardMaxLength']
    .forEach((id) => {
      document.getElementById(id)?.addEventListener('input', () => {
        clearTimeout(rankingTimer);
        rankingTimer = setTimeout(loadLeaderboard, 250);
      });
    });

  document.getElementById('newGroupToggle')?.addEventListener('click', () => {
    newGroupForm.hidden = !newGroupForm.hidden;
    if (!newGroupForm.hidden && !groupFishersLoaded) loadChatFishers('', true);
  });

  newGroupForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(groupFormStatus, '');
    const memberIds = [...newGroupForm.querySelectorAll('input[name="memberIds"]:checked')].map((input) => input.value);
    try {
      const roomId = await window.FisgaSupabaseChat.createGroupRoom(
        document.getElementById('groupName').value,
        memberIds
      );
      newGroupForm.reset();
      newGroupForm.hidden = true;
      setStatus(groupFormStatus, 'Grupo criado.', 'success');
      await loadConversations(roomId);
    } catch (error) {
      setStatus(groupFormStatus, error.message, 'error');
    }
  });

  window.FisgaSupabaseChat.bindRoomMessageForm({
    form: chatMessageForm,
    input: document.getElementById('chatMessageInput'),
    getRoomId: () => activeConversationId,
    statusElement: document.getElementById('chatStatus')
  });

  if (catchDialog && catchForm) {
    const openCatchDialog = () => {
      setStatus(catchFormStatus, '');
      catchDialog.showModal();
    };
    ['btnNovaCaptura', 'btnRegistrarFisgaCapturas', 'cardNovaCaptura'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', openCatchDialog);
    });
    document.getElementById('closeCatchDialog')?.addEventListener('click', () => catchDialog.close());
    document.getElementById('profileNewCatch')?.addEventListener('click', openCatchDialog);
    catchForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(catchForm);
      const photo = formData.get('photo');
      let imagePath = null;
      try {
        if (photo instanceof File && photo.name) {
          imagePath = await window.FisgaSupabaseChat.uploadCatchPhoto(photo);
        }
        try {
          await apiRequest('/api/community/catches', {
            method: 'POST',
            body: JSON.stringify({
              species: formData.get('species'),
              weight: Number(formData.get('weight')),
              length: Number(formData.get('length')),
              location: formData.get('location'),
              imagePath
            })
          });
        } catch (error) {
          if (imagePath) {
            try {
              await window.FisgaSupabaseChat.removeCatchPhoto(imagePath);
            } catch (cleanupError) {
              throw new Error(`${error.message} Não foi possível remover a foto enviada; tente novamente mais tarde.`);
            }
          }
          throw error;
        }
        catchForm.reset();
        catchDialog.close();
        await Promise.all([loadMyCatches(), loadLeaderboard()]);
      } catch (error) {
        setStatus(catchFormStatus, error.message, 'error');
      }
    });
  }

  document.getElementById('logoutButton')?.addEventListener('click', async () => {
    try {
      const results = await Promise.allSettled([
        window.FisgaSupabaseChat.signOutFromSupabase(),
        apiRequest('/api/auth/logout', { method: 'POST' })
      ]);
      const failure = results.find((result) => result.status === 'rejected');
      if (failure) throw failure.reason;
      window.location.assign('/login/login.html');
    } catch (error) {
      window.alert(error.message);
    }
  });

  window.setInterval(async () => {
    if (document.hidden || !currentSupabaseUser || chatRefreshInProgress) return;
    chatRefreshInProgress = true;
    try {
      await loadConversations(activeConversationId);
    } catch (error) {
      if (chatMessages) {
        setStatus(document.getElementById('chatStatus'), `Não foi possível atualizar o chat: ${error.message}`, 'error');
      }
    } finally {
      chatRefreshInProgress = false;
    }
  }, 5000);

  initializeApp();
});