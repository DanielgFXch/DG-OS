/* DG OS routed in-app navigation — History API + dedicated screens. */
(() => {
  'use strict';

  const ROUTES = {
    home: { target: 'personalHome', title: 'Heute' },
    calendar: { target: 'personalCalendar', title: 'Kalender' },
    health: { target: 'personalHealth', title: 'Gesundheit' },
    social: { target: 'personalSocial', title: 'Social Media' },
    trading: { target: 'tradingWorkspace', title: 'Trading' }
  };

  const TARGET_TO_ROUTE = Object.fromEntries(
    Object.entries(ROUTES).map(([route, cfg]) => [cfg.target, route])
  );

  const $ = id => document.getElementById(id);
  const routeBar = $('dgosRouteBar');
  const routeTitle = $('dgosRouteTitle');
  const backButton = $('dgosRouteBack');

  function routeFromLocation() {
    const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    return ROUTES[hash] ? hash : 'home';
  }

  function setActiveNav(route) {
    document.querySelectorAll('.bottom-nav button[data-target]').forEach(button => {
      const buttonRoute = TARGET_TO_ROUTE[button.dataset.target] || 'home';
      button.classList.toggle('active', buttonRoute === route);
      button.setAttribute('aria-current', buttonRoute === route ? 'page' : 'false');
    });
  }

  function closeTransientWorkspaces(route) {
    const email = $('personalEmailWorkspace');
    if (email && route !== 'email') email.classList.add('hidden');

    const social = $('socialWorkspace');
    if (social) {
      if (route === 'social') {
        social.classList.remove('hidden');
        document.body.classList.remove('social-workspace-open');
      } else {
        social.classList.add('hidden');
        document.body.classList.remove('social-workspace-open');
      }
    }
  }

  function applyRoute(route, { scroll = true } = {}) {
    if (!ROUTES[route]) route = 'home';

    document.body.dataset.dgosRoute = route;
    setActiveNav(route);
    closeTransientWorkspaces(route);

    const isHome = route === 'home';
    routeBar.classList.toggle('hidden', isHome);
    routeTitle.textContent = ROUTES[route].title;

    if (route === 'trading') {
      const trading = $('tradingWorkspace');
      if (trading) trading.open = true;
    }

    if (route === 'social') {
      const socialOpener = $('openSocialHub');
      const socialWorkspace = $('socialWorkspace');
      // Render/account state is already initialized by social.js. The routed
      // screen reuses that live workspace instead of duplicating state.
      if (socialWorkspace) socialWorkspace.classList.remove('hidden');
      else if (socialOpener) socialOpener.click();
    }

    document.documentElement.classList.add('dgos-route-changing');
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('dgos-route-changing');
    });

    if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function routeUrl(route) {
    const base = window.location.pathname + window.location.search;
    return route === 'home' ? base : base + '#' + route;
  }

  function navigate(route, { replace = false } = {}) {
    if (!ROUTES[route]) route = 'home';
    const current = routeFromLocation();
    if (route === current && document.body.dataset.dgosRoute === route) return;

    const state = { dgosRoute: route };
    if (replace) history.replaceState(state, '', routeUrl(route));
    else history.pushState(state, '', routeUrl(route));

    applyRoute(route);
  }

  document.querySelectorAll('.bottom-nav button[data-target]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      const route = TARGET_TO_ROUTE[button.dataset.target];
      if (route) navigate(route);
    });
  });

  // Cards inside the Today dashboard can still open the dedicated screen.
  const socialCard = $('openSocialHub');
  if (socialCard) {
    socialCard.addEventListener('click', event => {
      if (document.body.dataset.dgosRoute === 'social') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      navigate('social');
    }, true);
  }

  document.querySelectorAll('[data-social-open]').forEach(button => {
    button.addEventListener('click', event => {
      if (document.body.dataset.dgosRoute === 'social') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      navigate('social');
    }, true);
  });

  backButton.addEventListener('click', () => {
    const current = routeFromLocation();
    if (current === 'home') return;

    // Use real browser history when possible, with a safe home fallback.
    if (history.length > 1) {
      history.back();
      setTimeout(() => {
        if (routeFromLocation() === current) navigate('home', { replace: true });
      }, 350);
    } else {
      navigate('home', { replace: true });
    }
  });

  window.addEventListener('popstate', () => {
    applyRoute(routeFromLocation());
  });

  window.addEventListener('hashchange', () => {
    applyRoute(routeFromLocation(), { scroll: false });
  });

  // Normalize the first entry so browser back/forward stays inside DG OS.
  const initial = routeFromLocation();
  history.replaceState({ dgosRoute: initial }, '', routeUrl(initial));
  applyRoute(initial, { scroll: false });
})();
