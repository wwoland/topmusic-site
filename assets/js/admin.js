(() => {
  const REPO = 'wwoland/topmusic-site';
  const API = `https://api.github.com/repos/${REPO}`;
  const BRANCH = 'main';
  const MAX_FILE_BYTES = 50 * 1024 * 1024;
  const ACCEPTED = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mp3', 'm4a', 'wav', 'pdf']);
  const SERVICE_TITLES = {
    pesnya: 'Ваша песня под ключ', 'sozdanie-pesni': 'Песня с нуля под ключ', zapis: 'Почасовая работа в студии',
    aranzhirovka: 'Аранжировка', svedenie: 'Сведение PRO', 'svedenie-golos': 'Сведение голоса с минусовкой',
    mastering: 'Мастеринг', 'analog-mastering': 'Аналоговый мастеринг', 'soprovoditelnaya-muzyka': 'Сопровождающая музыка',
    'svedenie-show': 'Сведение шоу', ozvuchka: 'Озвучка', dizain: 'Дизайн обложки', 'social-design': 'Дизайн соцсетей',
    'reels-shoot': 'Съёмка рилс', site: 'Сайт', video: 'Клип', ghostwriting: 'Гострайтинг', songwriting: 'Сонграйтинг'
  };
  const SITE_PAGES = [
    { id: 'home', label: 'Главная', path: 'index.html' },
    { id: 'label', label: 'Лейбл', path: 'pages/label.html' },
    { id: 'production', label: 'Продакшн', path: 'pages/services.html' },
    { id: 'studio', label: 'Студия', path: 'pages/studio.html' }
  ];
  const SITE_SECTIONS = [
    { id: 'contact', label: 'Главная → Связаться', path: 'index.html', hash: '#contact' },
    { id: 'artists', label: 'Главная → С кем мы работаем', path: 'index.html', hash: '#artists' },
    { id: 'reviews', label: 'Главная → Отзывы', path: 'index.html', hash: '#reviews' },
    { id: 'partnership', label: 'Лейбл → Партнёрство', path: 'pages/label.html', hash: '#partnership' },
    { id: 'booking', label: 'Студия → Бронирование', path: 'pages/studio.html', hash: '#booking' }
  ];
  const $ = id => document.getElementById(id);
  let token = '';
  let tab = 'pages';
  let fieldFilter = 'all';
  let pagePath = 'index.html';
  let pageSha = '';
  let pageDoc = null;
  let artistSha = '';
  let artistGroups = null;
  let serviceSha = '';
  let serviceDetails = null;
  let dirty = false;
  let toastTimer;

  function message(text, error = false) {
    const box = $('status');
    box.textContent = text;
    box.classList.toggle('error', error);
    box.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.style.display = 'none'; }, 7000);
  }

  function setDirty(value) {
    dirty = value;
    $('dirtyMark').textContent = value ? 'Есть неопубликованные правки' : 'Все изменения сохранены';
    $('dirtyMark').classList.toggle('is-dirty', value);
    $('publish').disabled = !value;
  }

  function ensureSaved() {
    return !dirty || confirm('Есть несохранённые изменения. Отменить их и перейти дальше?');
  }

  function pathUrl(path) {
    return `${API}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      },
      cache: 'no-store'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reasons = {
        401: 'Токен недействителен. Проверьте его и войдите снова.',
        403: 'Нет прав на публикацию. Нужен доступ Contents: read and write к этому репозиторию.',
        404: 'Файл или репозиторий не найден. Проверьте права токена.',
        409: 'Файл изменился после открытия админки. Перезагрузите страницу перед повторной публикацией.'
      };
      throw new Error(reasons[response.status] || result.message || `Ошибка GitHub: ${response.status}`);
    }
    return result;
  }

  function decodeBase64(base64) {
    const bytes = Uint8Array.from(atob(base64.replace(/\s/g, '')), char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function encodeBytes(bytes) {
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function readFile(path) {
    const file = await request(`${pathUrl(path)}?ref=${BRANCH}`);
    if (file.type !== 'file' || !file.content) throw new Error(`Не удалось прочитать ${path}`);
    return { sha: file.sha, text: decodeBase64(file.content) };
  }

  async function writeFile(path, bytes, sha, label) {
    const body = {
      message: `Update ${label} via Top Music admin`,
      content: encodeBytes(bytes),
      branch: BRANCH
    };
    if (sha) body.sha = sha;
    return request(pathUrl(path), { method: 'PUT', body: JSON.stringify(body) });
  }

  function textBytes(text) { return new TextEncoder().encode(text); }

  async function login(event) {
    event.preventDefault();
    const candidate = $('token').value.trim();
    if (!candidate) return;
    token = candidate;
    const submit = $('loginForm').querySelector('[type=submit]');
    submit.disabled = true;
    submit.textContent = 'Проверяем доступ…';
    try {
      const user = await request('https://api.github.com/user');
      const repo = await request(API);
      if (!repo.permissions?.push) throw new Error('У этого аккаунта нет права записи в репозиторий. Добавьте клиента как соавтора.');
      $('token').value = '';
      $('token').type = 'password';
      $('toggleToken').textContent = 'Показать';
      $('toggleToken').setAttribute('aria-pressed', 'false');
      $('currentUser').textContent = `@${user.login}`;
      $('currentUser').hidden = false;
      $('loginPanel').hidden = true;
      $('editorPanel').hidden = false;
      $('logout').hidden = false;
      if (await loadPage(pagePath)) message('Доступ подтверждён. Можно редактировать сайт.');
    } catch (error) {
      token = '';
      message(error.message, true);
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Открыть редактор <span aria-hidden="true">↗</span>';
    }
  }

  async function loadPage(path) {
    $('pageFields').textContent = 'Загружаем страницу…';
    try {
      const file = await readFile(path);
      const doc = new DOMParser().parseFromString(file.text, 'text/html');
      if (doc.querySelector('parsererror')) throw new Error('Не удалось прочитать HTML страницы');
      pagePath = path;
      pageSha = file.sha;
      pageDoc = doc;
      $('previewLink').href = path;
      renderPage();
      setDirty(false);
      return true;
    } catch (error) {
      $('pageFields').textContent = '';
      $('pageSelect').value = pagePath;
      message(error.message, true);
      return false;
    }
  }

  function makeField(title, description, control, kind = 'text') {
    const row = document.createElement('div');
    row.className = 'field';
    row.dataset.kind = kind;
    const heading = document.createElement('div');
    heading.className = 'field-title';
    const strong = document.createElement('strong');
    strong.textContent = title;
    const preview = document.createElement('span');
    preview.className = 'field-description';
    preview.textContent = description || title;
    heading.append(strong, preview);
    const side = document.createElement('div');
    side.className = 'field-control';
    const editable = control.matches?.('input,textarea') ? control : control.querySelector('input:not([type=file]),textarea');
    if (editable && !editable.hasAttribute('aria-label')) editable.setAttribute('aria-label', `${title}: ${description || title}`);
    side.append(control);
    row.append(heading, side);
    return row;
  }

  function groupName(element) {
    const section = element.closest('section') || element.closest('header,nav,footer,main');
    if (!section) return 'Дополнительные элементы';
    if (section.tagName === 'NAV') return 'Меню сайта';
    if (section.tagName === 'FOOTER') return 'Нижняя часть сайта';
    if (section.id === 'hero' || section.classList.contains('hero')) return 'Первый экран';
    const heading = section.querySelector('h1,h2,h3');
    return heading?.textContent.trim().slice(0, 70) || section.id || section.className?.toString().split(' ')[0] || 'Дополнительные элементы';
  }

  function addGroup(groups, name) {
    if (!groups.has(name)) groups.set(name, []);
    return groups.get(name);
  }

  function pageLink(path, hash = '') {
    const relative = pagePath.startsWith('pages/')
      ? path === 'index.html' ? '../index.html' : path.replace(/^pages\//, '')
      : path;
    return relative + hash;
  }

  function linkDestinations() {
    const items = [
      ...SITE_PAGES.map(page => ({ id: `page:${page.id}`, label: page.label, href: pageLink(page.path) })),
      ...SITE_SECTIONS.map(section => ({ id: `section:${section.id}`, label: section.label, href: pageLink(section.path, section.hash) }))
    ];
    for (const anchor of pageDoc.body.querySelectorAll('a[href^="#"]')) {
      const hash = anchor.getAttribute('href');
      if (hash.length < 2 || items.some(item => item.href === hash || item.href.endsWith(hash) && item.href.startsWith(pageLink(pagePath)))) continue;
      const target = pageDoc.getElementById(hash.slice(1));
      if (!target) continue;
      const heading = target.matches('h1,h2,h3') ? target : target.querySelector('h1,h2,h3');
      const label = heading?.textContent.trim().slice(0, 55) || anchor.textContent.trim().slice(0, 55) || hash.slice(1);
      items.push({ id: `local:${hash.slice(1)}`, label: `Этот экран · ${label}`, href: hash });
    }
    return items;
  }

  function destinationFor(href, items) {
    if (href === '#') return 'top';
    if (/^tel:/i.test(href)) return 'phone';
    if (/^mailto:/i.test(href)) return 'email';
    if (/^https?:\/\//i.test(href) && !/^https?:\/\/(?:www\.)?topmusic\.studio\//i.test(href)) return 'external';
    try {
      const base = new URL(pagePath, new URL('.', location.href));
      const target = new URL(href, base);
      const found = items.find(item => {
        const option = new URL(item.href, base);
        return option.pathname === target.pathname && option.hash === target.hash;
      });
      if (found) return found.id;
    } catch (_) { /* Keep unknown addresses editable. */ }
    return 'custom';
  }

  function makeLinkControl(element, items) {
    const wrap = document.createElement('div');
    wrap.className = 'link-editor';
    const label = document.createElement('label');
    label.textContent = 'Куда ведёт';
    const select = document.createElement('select');
    select.className = 'link-destination';
    const addOptions = (title, options) => {
      const group = document.createElement('optgroup');
      group.label = title;
      for (const item of options) group.append(new Option(item.label, item.id));
      select.append(group);
    };
    addOptions('Страницы сайта', items.filter(item => item.id.startsWith('page:')));
    addOptions('Разделы сайта', items.filter(item => !item.id.startsWith('page:')));
    addOptions('Другие варианты', [
      { id: 'external', label: 'Внешний сайт или соцсеть' },
      { id: 'phone', label: 'Позвонить по телефону' },
      { id: 'email', label: 'Написать на почту' },
      { id: 'top', label: 'Наверх этой страницы' },
      { id: 'custom', label: 'Другой адрес (для специалиста)' }
    ]);
    label.append(select);
    const custom = document.createElement('label');
    custom.className = 'link-custom';
    const customTitle = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    const hint = document.createElement('p');
    hint.className = 'link-hint';
    const verify = document.createElement('a');
    verify.className = 'link-verify';
    verify.textContent = 'Проверить переход ↗';
    verify.target = '_blank';
    verify.rel = 'noopener noreferrer';
    custom.append(customTitle, input);
    wrap.append(label, custom, hint, verify);

    const initialHref = element.getAttribute('href') || '';
    select.value = destinationFor(initialHref, items);
    const customValues = {
      external: /^https?:\/\//i.test(initialHref) ? initialHref : '',
      phone: /^tel:/i.test(initialHref) ? initialHref.slice(4) : '',
      email: /^mailto:/i.test(initialHref) ? initialHref.slice(7) : '',
      custom: initialHref
    };
    function updateView() {
      const choice = select.value;
      const manual = ['external', 'phone', 'email', 'custom'].includes(choice);
      custom.hidden = !manual;
      if (manual) {
        customTitle.textContent = { external: 'Адрес сайта', phone: 'Номер телефона', email: 'Адрес почты', custom: 'Адрес ссылки' }[choice];
        input.placeholder = { external: 'https://example.com', phone: '+7 999 123-45-67', email: 'name@example.com', custom: 'Адрес' }[choice];
        if (input.value !== (customValues[choice] || '')) input.value = customValues[choice] || '';
      }
      const selected = items.find(item => item.id === choice);
      hint.textContent = selected ? `Посетитель перейдёт: ${selected.label}` : {
        external: 'Вставьте полный адрес из браузера, начиная с https://',
        phone: 'При нажатии откроется звонок на этот номер.',
        email: 'При нажатии откроется письмо на этот адрес.',
        top: 'При нажатии страница прокрутится к началу.',
        custom: 'Используйте этот вариант, если нужного раздела нет в списке.'
      }[choice];
      const current = element.getAttribute('href') || '';
      try {
        const canVerify = current && current !== '#' && !/^(?:javascript|data|vbscript|tel|mailto):/i.test(current);
        const url = canVerify && new URL(current, new URL(pagePath, new URL('.', location.href)));
        verify.hidden = !url;
        if (url) verify.href = url.href;
      } catch (_) { verify.hidden = true; }
    }
    select.addEventListener('change', () => {
      const selected = items.find(item => item.id === select.value);
      const value = selected?.href || (select.value === 'top' ? '#' : '');
      element.setAttribute('href', value);
      setDirty(true);
      updateView();
    });
    input.addEventListener('input', () => {
      customValues[select.value] = input.value;
      const value = select.value === 'phone' ? `tel:${input.value.replace(/[^+\d]/g, '')}`
        : select.value === 'email' ? `mailto:${input.value.trim()}` : input.value.trim();
      element.setAttribute('href', value);
      setDirty(true);
      updateView();
    });
    updateView();
    return wrap;
  }

  function renderPage() {
    if (!pageDoc) return;
    const groups = new Map();
    const walker = pageDoc.createTreeWalker(pageDoc.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      const value = node.nodeValue.trim();
      if (!parent || !value || value.length < 2 || /^[\d\s↗↘→←©/.,·—-]+$/u.test(value)) continue;
      if (parent.closest('script,style,svg,noscript,template')) continue;
      const input = document.createElement(value.length > 80 ? 'textarea' : 'input');
      input.value = value;
      const original = node.nodeValue;
      const leading = original.match(/^\s*/)?.[0] || '';
      const trailing = original.match(/\s*$/)?.[0] || '';
      input.addEventListener('input', () => {
        node.nodeValue = leading + input.value + trailing;
        setDirty(true);
      });
      addGroup(groups, groupName(parent)).push(makeField('Текст на странице', value.slice(0, 95), input, 'text'));
    }

    const destinations = linkDestinations();
    for (const element of pageDoc.body.querySelectorAll('a[href]')) {
      const name = element.textContent.trim().slice(0, 95) || element.querySelector('img')?.getAttribute('alt') || 'Логотип или иконка';
      addGroup(groups, groupName(element)).push(makeField('Переход по нажатию', name, makeLinkControl(element, destinations), 'link'));
    }

    for (const element of pageDoc.body.querySelectorAll('img[src],source[src],video[poster]')) {
      const attribute = element.hasAttribute('src') ? 'src' : 'poster';
      const current = element.getAttribute(attribute);
      const wrapper = document.createElement('div');
      wrapper.className = 'media-editor';
      const currentLabel = document.createElement('p');
      currentLabel.className = 'media-current';
      currentLabel.textContent = current ? `Сейчас используется: ${decodeURIComponent(current.split('/').pop().split('?')[0])}` : 'Файл ещё не выбран';
      const input = document.createElement('input');
      input.value = current;
      input.addEventListener('input', () => {
        element.setAttribute(attribute, input.value.trim());
        currentLabel.textContent = input.value.trim() ? 'Указан новый адрес файла' : 'Файл ещё не выбран';
        setDirty(true);
      });
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'small-button';
      button.textContent = 'Заменить файл ↑';
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/wav';
      picker.addEventListener('change', async () => {
        if (!picker.files?.[0]) return;
        button.disabled = true;
        try {
          const path = await upload(picker.files[0]);
          const relative = pagePath.startsWith('pages/') ? `../${path}` : path;
          input.value = relative;
          element.setAttribute(attribute, relative);
          currentLabel.textContent = `Выбран новый файл: ${picker.files[0].name}`;
          setDirty(true);
          message('Файл загружен. Нажмите «Опубликовать», чтобы поставить его на страницу.');
        } catch (error) { message(error.message, true); }
        finally { button.disabled = false; picker.value = ''; }
      });
      button.addEventListener('click', () => picker.click());
      const advanced = document.createElement('details');
      advanced.className = 'media-advanced';
      const summary = document.createElement('summary');
      summary.textContent = 'Указать адрес файла вручную';
      const note = document.createElement('p');
      note.textContent = 'Если файл уже в интернете, вставьте его полный адрес, начиная с https://';
      advanced.append(summary, note, input);
      wrapper.append(currentLabel, button, picker, advanced);
      const description = element.getAttribute('alt') || (current.includes('logo') ? 'Логотип сайта' : 'Фото или видео в этом блоке');
      addGroup(groups, groupName(element)).push(makeField('Фото или видео', description, wrapper, 'media'));
    }

    const container = $('pageFields');
    container.replaceChildren();
    const entries = [...groups].sort(([a], [b]) => Number(a === 'Дополнительные элементы') - Number(b === 'Дополнительные элементы'));
    const selector = $('sectionSelect');
    selector.replaceChildren(new Option('Все блоки страницы', 'all'));
    for (const [name, fields] of entries) {
      selector.add(new Option(name, name));
      const details = document.createElement('details');
      details.className = 'field-group';
      details.dataset.group = name;
      const summary = document.createElement('summary');
      const title = document.createElement('span');
      title.className = 'group-title';
      title.textContent = name;
      const count = document.createElement('span');
      count.className = 'group-count';
      count.textContent = `${fields.length} полей`;
      summary.append(title, count);
      const body = document.createElement('div');
      body.className = 'field-group-body';
      body.append(...fields);
      details.append(summary, body);
      container.append(details);
    }
    const preferred = entries.find(([name]) => name === 'Первый экран')
      || entries.find(([name]) => !['Меню сайта', 'Нижняя часть сайта', 'Дополнительные элементы'].includes(name));
    selector.value = preferred?.[0] || entries[0]?.[0] || 'all';
    filterFields();
  }

  function filterFields() {
    const query = $('fieldSearch').value.trim().toLocaleLowerCase('ru');
    let visibleTotal = 0;
    let allTotal = 0;
    let visibleGroups = 0;
    for (const group of $('pageFields').querySelectorAll('.field-group')) {
      let visible = 0;
      const fields = group.querySelectorAll('.field');
      for (const field of fields) {
        allTotal++;
        const fieldText = field.querySelector('.field-title')?.textContent || '';
        const values = [...field.querySelectorAll('input,textarea')].map(input => input.value).join(' ');
        const selected = field.querySelector('.link-destination')?.selectedOptions[0]?.textContent || '';
        const match = (fieldFilter === 'all' || field.dataset.kind === fieldFilter)
          && (!query || `${fieldText} ${values} ${selected}`.toLocaleLowerCase('ru').includes(query));
        field.hidden = !match;
        if (match) visible++;
      }
      group.querySelector('.group-count').textContent = visible === fields.length
        ? `${visible} полей` : `${visible} из ${fields.length} полей`;
      const inSection = query || $('sectionSelect').value === 'all' || group.dataset.group === $('sectionSelect').value;
      group.hidden = !visible || !inSection;
      if (!group.hidden) {
        visibleTotal += visible;
        visibleGroups++;
        if (query || $('sectionSelect').value !== 'all') group.open = true;
      }
    }
    $('fieldSearchSummary').textContent = query ? `Найдено ${visibleTotal} на странице`
      : $('sectionSelect').value === 'all' ? `Показано ${visibleTotal} из ${allTotal}`
        : `${visibleTotal} полей в блоке`;
    $('fieldEmpty').hidden = visibleTotal > 0;
    $('toggleGroups').hidden = visibleGroups < 2;
  }

  function validLinks() {
    for (const element of pageDoc.body.querySelectorAll('a[href],img[src],source[src],video[poster]')) {
      const value = element.getAttribute(element.hasAttribute('href') ? 'href' : element.hasAttribute('src') ? 'src' : 'poster');
      const label = element.textContent.trim().slice(0, 55) || element.getAttribute('alt') || 'элемента без подписи';
      if ((!value && element.tagName === 'A') || /^(tel|mailto):\s*$/i.test(value || '')) throw new Error(`У кнопки «${label}» не указан адрес. Выберите, куда она ведёт.`);
      if (value && /^(javascript|data|vbscript):/i.test(value.trim())) throw new Error(`У элемента «${label}» недопустимый адрес. Укажите другой.`);
      if (value && /^https?:/i.test(value)) {
        try { new URL(value); } catch (_) { throw new Error(`Проверьте адрес у «${label}»: он должен начинаться с https:// и содержать название сайта.`); }
      }
    }
  }

  async function publish() {
    if (!dirty) return;
    const button = $('publish');
    button.disabled = true;
    try {
      if (tab === 'pages') {
        validLinks();
        const html = '<!DOCTYPE html>\n' + pageDoc.documentElement.outerHTML + '\n';
        const result = await writeFile(pagePath, textBytes(html), pageSha, pagePath);
        pageSha = result.content.sha;
      } else if (tab === 'artists') {
        for (const group of artistGroups) {
          if (!group.length) throw new Error('В каждом блоке должен быть хотя бы один артист.');
          for (const artist of group) {
            if (!artist.name.trim() || !/^https:\/\//.test(artist.url) || !(/^(https?:\/\/|assets\/media\/uploads\/)/.test(artist.image))) throw new Error('Заполните имя и корректные ссылки артиста и фото.');
          }
        }
        const result = await writeFile('assets/data/artists.json', textBytes(JSON.stringify(artistGroups, null, 2) + '\n'), artistSha, 'artists');
        artistSha = result.content.sha;
      } else if (tab === 'services') {
        for (const detail of Object.values(serviceDetails)) {
          if (!detail.intro.trim() || !detail.result.trim() || !detail.points.length) throw new Error('Заполните вступление, результат и хотя бы один пункт каждой услуги.');
        }
        const result = await writeFile('assets/data/service-details.json', textBytes(JSON.stringify(serviceDetails, null, 2) + '\n'), serviceSha, 'service details');
        serviceSha = result.content.sha;
      }
      setDirty(false);
      message('Опубликовано в main. GitHub Pages обновит сайт через несколько минут.');
    } catch (error) { message(error.message, true); }
    finally { button.disabled = !dirty; }
  }

  async function loadArtists() {
    $('artistPools').textContent = 'Загружаем артистов…';
    try {
      const file = await readFile('assets/data/artists.json');
      artistSha = file.sha;
      artistGroups = JSON.parse(file.text);
      if (!Array.isArray(artistGroups)) throw new Error('Неверный формат списка артистов');
      renderArtists();
      setDirty(false);
    } catch (error) { $('artistPools').textContent = ''; message(error.message, true); }
  }

  async function loadServices() {
    $('serviceDetails').textContent = 'Загружаем описания услуг…';
    try {
      const file = await readFile('assets/data/service-details.json');
      serviceSha = file.sha;
      serviceDetails = JSON.parse(file.text);
      renderServices();
      setDirty(false);
    } catch (error) { $('serviceDetails').textContent = ''; message(error.message, true); }
  }

  function renderServices() {
    const root = $('serviceDetails');
    root.replaceChildren();
    for (const [id, detail] of Object.entries(serviceDetails)) {
      const section = document.createElement('details');
      section.className = 'field-group';
      const summary = document.createElement('summary');
      summary.textContent = SERVICE_TITLES[id] || id.replaceAll('-', ' ');
      const body = document.createElement('div');
      body.className = 'field-group-body';
      for (const [key, label] of [['intro', 'Вступление'], ['points', 'Что входит — по одному пункту на строке'], ['note', 'Примечание'], ['result', 'Итог']]) {
        const input = document.createElement('textarea');
        input.value = key === 'points' ? detail.points.join('\n') : detail[key] || '';
        input.addEventListener('input', () => {
          if (key === 'points') detail.points = input.value.split('\n').map(line => line.trim()).filter(Boolean);
          else detail[key] = input.value;
          setDirty(true);
        });
        body.append(makeField(label, '', input));
      }
      section.append(summary, body);
      root.append(section);
    }
  }

  function renderArtists() {
    const root = $('artistPools');
    root.replaceChildren();
    artistGroups.forEach((group, poolIndex) => {
      const card = document.createElement('div');
      card.className = 'card pool';
      const head = document.createElement('div');
      head.className = 'pool-head';
      const title = document.createElement('h2');
      title.textContent = `Карточка ${poolIndex + 1}`;
      const add = document.createElement('button');
      add.type = 'button'; add.className = 'small-button'; add.textContent = '+ Добавить артиста';
      add.addEventListener('click', () => { group.push({ name: '', url: '', image: '' }); renderArtists(); setDirty(true); });
      head.append(title, add); card.append(head);
      group.forEach((artist, index) => {
        const row = document.createElement('div');
        row.className = 'artist-row';
        for (const [key, label] of [['name', 'Имя'], ['url', 'Яндекс Музыка'], ['image', 'Фото']]) {
          const wrapper = document.createElement('label');
          wrapper.textContent = label;
          const input = document.createElement('input');
          input.value = artist[key] || '';
          input.addEventListener('input', () => { artist[key] = input.value.trim(); setDirty(true); });
          wrapper.append(input);
          if (key === 'image') {
            const uploadButton = document.createElement('button');
            uploadButton.type = 'button'; uploadButton.className = 'small-button'; uploadButton.textContent = 'Загрузить фото';
            const picker = document.createElement('input');
            picker.type = 'file'; picker.accept = 'image/jpeg,image/png,image/webp,image/gif'; picker.hidden = true;
            uploadButton.addEventListener('click', () => picker.click());
            picker.addEventListener('change', async () => {
              if (!picker.files?.[0]) return;
              uploadButton.disabled = true;
              try {
                const path = await upload(picker.files[0]);
                artist.image = path;
                input.value = path;
                setDirty(true);
                message('Фото загружено. Нажмите «Опубликовать», чтобы обновить карточку.');
              } catch (error) { message(error.message, true); }
              finally { uploadButton.disabled = false; picker.value = ''; }
            });
            wrapper.append(uploadButton, picker);
          }
          row.append(wrapper);
        }
        const actions = document.createElement('div');
        actions.className = 'artist-actions';
        for (const [symbol, offset] of [['↑', -1], ['↓', 1]]) {
          const move = document.createElement('button');
          move.type = 'button'; move.className = 'small-button'; move.textContent = symbol;
          move.setAttribute('aria-label', `Переместить ${artist.name || 'артиста'} ${offset < 0 ? 'выше' : 'ниже'}`);
          move.disabled = index + offset < 0 || index + offset >= group.length;
          move.addEventListener('click', () => { [group[index], group[index + offset]] = [group[index + offset], group[index]]; renderArtists(); setDirty(true); });
          actions.append(move);
        }
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'small-button'; remove.textContent = 'Убрать';
        remove.addEventListener('click', () => { if (group.length < 2) return message('В карточке нужен хотя бы один артист.', true); group.splice(index, 1); renderArtists(); setDirty(true); });
        actions.append(remove); row.append(actions); card.append(row);
      });
      root.append(card);
    });
  }

  async function upload(file) {
    const extension = file.name.split('.').at(-1).toLowerCase();
    if (!ACCEPTED.has(extension)) throw new Error('Допустимы JPG, PNG, WebP, GIF, MP4, WebM, MP3, M4A, WAV и PDF.');
    if (file.size > MAX_FILE_BYTES) throw new Error('Файл больше 50 МБ. Сожмите его перед загрузкой.');
    const base = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'file';
    const path = `assets/media/uploads/${Date.now()}-${base}.${extension}`;
    await writeFile(path, new Uint8Array(await file.arrayBuffer()), null, path);
    return path;
  }

  async function uploadStandalone() {
    const file = $('standaloneFile').files?.[0];
    if (!file) return message('Сначала выберите файл.', true);
    const button = $('uploadStandalone');
    button.disabled = true;
    try {
      const path = await upload(file);
      const link = new URL(path, location.href).href;
      $('uploadedPath').textContent = link;
      message('Файл загружен. Скопируйте ссылку из поля ниже.');
    } catch (error) { message(error.message, true); }
    finally { button.disabled = false; }
  }

  async function changeTab(next) {
    if (next === tab || !ensureSaved()) return;
    tab = next;
    setDirty(false);
    for (const button of document.querySelectorAll('[data-tab]')) {
      const active = button.dataset.tab === next;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    }
    for (const name of ['pages', 'services', 'artists', 'files']) $(`${name}Tab`).hidden = name !== next;
    if (next === 'artists') await loadArtists();
    if (next === 'services') await loadServices();
    if (next === 'pages') await loadPage(pagePath);
  }

  $('loginForm').addEventListener('submit', login);
  $('logout').addEventListener('click', () => { token = ''; location.reload(); });
  $('publish').addEventListener('click', publish);
  $('fieldSearch').addEventListener('input', filterFields);
  $('sectionSelect').addEventListener('change', () => {
    $('fieldSearch').value = '';
    filterFields();
  });
  document.querySelectorAll('[data-field-filter]').forEach(button => button.addEventListener('click', () => {
    fieldFilter = button.dataset.fieldFilter;
    document.querySelectorAll('[data-field-filter]').forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    filterFields();
  }));
  $('toggleGroups').addEventListener('click', () => {
    const groups = [...$('pageFields').querySelectorAll('.field-group:not([hidden])')];
    const expand = groups.some(group => !group.open);
    groups.forEach(group => { group.open = expand; });
    $('toggleGroups').textContent = expand ? 'Свернуть все ↑' : 'Развернуть все ↓';
  });
  $('toggleToken').addEventListener('click', () => {
    const visible = $('token').type === 'password';
    $('token').type = visible ? 'text' : 'password';
    $('toggleToken').textContent = visible ? 'Скрыть' : 'Показать';
    $('toggleToken').setAttribute('aria-pressed', String(visible));
    $('toggleToken').setAttribute('aria-label', visible ? 'Скрыть токен' : 'Показать токен');
  });
  $('uploadStandalone').addEventListener('click', uploadStandalone);
  $('pageSelect').addEventListener('change', async event => {
    const next = event.target.value;
    if (!ensureSaved()) { event.target.value = pagePath; return; }
    setDirty(false);
    $('fieldSearch').value = '';
    await loadPage(next);
  });
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => changeTab(button.dataset.tab)));
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
})();
