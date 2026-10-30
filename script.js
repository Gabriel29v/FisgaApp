document.addEventListener('DOMContentLoaded', () => {
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
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('email');
      const email = emailInput ? emailInput.value : '';
      alert(`Tentativa de acesso com: ${email}`);
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
  const mainContent = document.querySelector('.conteudo-principal > .container-conteudo');
  const paineis = {
    inicio:   null,
    locais:   document.getElementById('painel-locais'),
    capturas: document.getElementById('painel-capturas'),
    perfil:   document.getElementById('painel-perfil'),
  };

  // Coleta todos os painéis de aba
  const todosOsPaineis = Object.values(paineis).filter(Boolean);

  const ativarTab = (tabId) => {
    // Atualiza botões do menu
    tabButtons.forEach((btn) => {
      btn.classList.toggle('ativo', btn.dataset.tab === tabId);
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

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      ativarTab(btn.dataset.tab);
    });
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
});