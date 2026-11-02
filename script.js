  // Supabase client used by the public Reviews and Admission form sections
  // (the Admin portal's embedded app uses its own client with the same
  // project — see the "reviews" and "admissions" tables in Supabase).
  (function () {
    var SUPABASE_URL      = "https://mozopvfzfrxhvvofnsza.supabase.co";
    var SUPABASE_ANON_KEY = "sb_publishable_O-QAeTyqrmc4yuPWwHOwjQ_Yvzhmoie";
    try {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        window.gicDb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      }
    } catch (e) {
      console.error('Supabase init failed:', e);
    }
  })();

  // Smooth scroll to section — avoids external link popup in iframe viewers
  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el && !el.hidden) {
      const navHeight = document.querySelector('nav').offsetHeight;
      const top = el.getBoundingClientRect().top + window.scrollY - navHeight;
      window.scrollTo({ top, behavior: 'smooth' });
    }
    // Close mobile menu if open
    const mm = document.getElementById('mobileMenu');
    if (mm && mm.classList.contains('open')) toggleMenu(false);
  }

  // Hamburger menu + portal login are wired up here, immediately after
  // scrollToSection, on purpose — before any of the Supabase-backed
  // rendering below. If one of those later blocks throws (e.g. a slow or
  // blocked network request), everything wired up before the throw still
  // works: the nav, hamburger menu, and portal login buttons never go dead.
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileOverlay = document.getElementById('mobileOverlay');

  function toggleMenu(open) {
    hamburgerBtn.classList.toggle('open', open);
    mobileMenu.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }

  hamburgerBtn.addEventListener('click', () => {
    toggleMenu(!mobileMenu.classList.contains('open'));
  });
  mobileOverlay.addEventListener('click', () => toggleMenu(false));

  // Portals — login overlay + iframe into the school system
  var PORTAL_LABELS = { admin: 'Admin Portal', teacher: 'Teacher Portal', finance: 'Finance Portal', student: 'Student Portal' };
  function openPortal(role) {
    var overlay = document.getElementById('portalOverlay');
    var frame = document.getElementById('portalOverlayFrame');
    var loading = document.getElementById('portalLoading');
    loading.classList.remove('hidden');
    frame.style.visibility = 'hidden';
    frame.onload = function () {
      loading.classList.add('hidden');
      frame.style.visibility = 'visible';
    };
    frame.src = 'portal.html?portal=' + encodeURIComponent(role);
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (typeof toggleMenu === 'function') toggleMenu(false);
  }
  /* Exposed on window so the embedded portal app can call it directly
     (e.g. when the person logs out) to return to this website. */
  function closePortal() {
    var overlay = document.getElementById('portalOverlay');
    var frame = document.getElementById('portalOverlayFrame');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    frame.src = 'about:blank';
    document.getElementById('portalLoading').classList.remove('hidden');
    frame.style.visibility = 'hidden';
  }
  window.closePortal = closePortal;
  // The portal page lives in its own file, so it asks to be closed by message
  // (works even when the site is opened straight from a folder).
  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'kic-close-portal') closePortal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePortal();
  });

  // Desktop Portals dropdown — tap-to-open on touch devices (hover still works with a mouse)
  var navPortals = document.getElementById('navPortals');
  if (navPortals) {
    var navPortalsLink = navPortals.querySelector('a');
    navPortalsLink.addEventListener('click', function (e) {
      if (window.matchMedia('(hover: none)').matches) {
        e.preventDefault();
        navPortals.classList.toggle('open');
      }
    });
    document.addEventListener('click', function (e) {
      if (!navPortals.contains(e.target)) navPortals.classList.remove('open');
    });
  }

  // Scroll reveal — guarded so an unsupported/misbehaving IntersectionObserver
  // (some older Android WebViews) never leaves the page stuck at opacity:0.
  // A hard timeout below also force-reveals anything left hidden, no matter
  // what goes wrong above it.
  try {
    const reveals = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('visible'), i * 80);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    reveals.forEach(el => observer.observe(el));
  } catch (e) {
    console.error('Scroll-reveal setup failed, revealing everything:', e);
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  }
  setTimeout(function () {
    document.querySelectorAll('.reveal:not(.visible)').forEach(function (el) {
      el.classList.add('visible');
    });
  }, 2500);

  // Life at KIC videos: auto-play when scrolled into view, auto-pause when
  // scrolled out. Re-scans after dynamic content loads so videos added
  // from Admin get the same behavior as the ones already on the page.
  const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const vid = entry.target;
      if (entry.isIntersecting) {
        vid.play().catch(() => {});
      } else {
        vid.pause();
      }
    });
  }, { threshold: 0.5 });
  function observeCampusVideos() {
    document.querySelectorAll('.campus-video').forEach(v => videoObserver.observe(v));
  }
  observeCampusVideos();
  window.observeCampusVideos = observeCampusVideos;

  // Life at KIC videos: when the fullscreen (zoom) button is pressed, stay in
  // portrait instead of rotating the phone to landscape. Unlock on exit.
  function onCampusFullscreenChange() {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    const isCampusVideo = !!(fsEl && fsEl.classList && fsEl.classList.contains('campus-video'));
    if (!screen.orientation) return;
    try {
      if (isCampusVideo) {
        const lock = screen.orientation.lock && screen.orientation.lock('portrait');
        if (lock && lock.catch) lock.catch(() => {});
        setTimeout(function () {
          if (document.fullscreenElement || document.webkitFullscreenElement) {
            const again = screen.orientation.lock('portrait');
            if (again && again.catch) again.catch(() => {});
          }
        }, 150);
      } else if (screen.orientation.unlock) {
        screen.orientation.unlock();
      }
    } catch (e) { /* orientation lock not supported */ }
  }
  document.addEventListener('fullscreenchange', onCampusFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onCampusFullscreenChange);

  // Life at KIC mobile layout: wrap consecutive photo cards (skip any
  // video cards) into a horizontally-scrollable row, similar to the
  // Moments at KIC slider. On desktop this wrapper is invisible
  // (display:contents) so the original grid layout is unaffected.
  function groupCampusCards() {
    const grid = document.getElementById('campusGrid');
    if (!grid) return;
    // Unwrap any existing scroll groups first so we can regroup cleanly.
    grid.querySelectorAll('.campus-scroll').forEach(function (wrap) {
      while (wrap.firstChild) grid.insertBefore(wrap.firstChild, wrap);
      wrap.remove();
    });
    const cards = Array.prototype.slice.call(grid.children).filter(function (el) {
      return el.classList && el.classList.contains('campus-card');
    });
    let currentGroup = null;
    cards.forEach(function (card) {
      const isVideo = !!card.querySelector('.campus-video');
      if (isVideo) {
        currentGroup = null;
        grid.appendChild(card);
      } else {
        if (!currentGroup) {
          currentGroup = document.createElement('div');
          currentGroup.className = 'campus-scroll';
          grid.appendChild(currentGroup);
        }
        currentGroup.appendChild(card);
      }
    });
  }
  groupCampusCards();
  window.groupCampusCards = groupCampusCards;

  // Life at KIC media skeletons: show a shimmering placeholder over each
  // image/video card until the actual media has finished loading.
  function initCampusMediaSkeletons(root) {
    const scope = root || document;
    scope.querySelectorAll('.campus-card').forEach(function (card) {
      if (card.dataset.skeletonInit === '1') return;
      card.dataset.skeletonInit = '1';
      const markLoaded = function () { card.classList.add('media-loaded'); };
      // Safety net so a card never gets stuck shimmering forever.
      const fallback = setTimeout(markLoaded, 6000);
      const video = card.querySelector('.campus-video');
      if (video) {
        if (video.readyState >= 2) {
          clearTimeout(fallback); markLoaded();
        } else {
          video.addEventListener('loadeddata', function () { clearTimeout(fallback); markLoaded(); }, { once: true });
          video.addEventListener('error', function () { clearTimeout(fallback); markLoaded(); }, { once: true });
        }
        return;
      }
      const bg = card.style.backgroundImage;
      const match = bg && bg.match(/url\(["']?([^"')]+)["']?\)/);
      if (match && match[1]) {
        const img = new Image();
        img.onload = function () { clearTimeout(fallback); markLoaded(); };
        img.onerror = function () { clearTimeout(fallback); markLoaded(); };
        img.src = match[1];
      } else {
        clearTimeout(fallback); markLoaded();
      }
    });
  }
  initCampusMediaSkeletons();
  window.initCampusMediaSkeletons = initCampusMediaSkeletons;

  // Student reviews: write a review, star picker, show latest 4 (Supabase-backed)
  (function () {
    const SEED_REVIEWS = [
      {
        name: 'Fadumo Hassan',
        role: "Graduate, English Language '23",
        text: 'KIC gave me the confidence and communication skills I needed to pursue new opportunities. The quality of teaching and the supportive environment are truly exceptional.',
        stars: 5,
        ts: 3
      },
      {
        name: 'Abdirahman Omar',
        role: "Graduate, Computer Science '22",
        text: 'The Computer Science program at KIC is world-class. I now work as a web developer and owe my skills entirely to the dedicated faculty here.',
        stars: 5,
        ts: 2
      },
      {
        name: 'Hodan Mohamed',
        role: "Graduate, Health Science",
        text: 'Studying Health Science at KIC gave me real hands-on clinical training. The instructors are experienced practitioners, and the learning environment motivates you to do your best.',
        stars: 5,
        ts: 1
      }
    ];
    const REVIEWS_TO_SHOW = 4;

    function initials(name) {
      return (name || '?').trim().charAt(0).toUpperCase();
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str || '';
      return div.innerHTML;
    }

    let testiItems = [];
    let testiIndex = 0;
    function paintReviews(reviews) {
      const grid = document.getElementById('testiGrid');
      const dotsWrap = document.getElementById('testiDots');
      if (!grid) return;
      testiItems = reviews;
      testiIndex = 0;
      if (dotsWrap) {
        dotsWrap.innerHTML = reviews.map((_, i) => `<button type="button" class="testi-dot${i === 0 ? ' active' : ''}" data-dot="${i}" aria-label="Go to review ${i + 1}"></button>`).join('');
        dotsWrap.querySelectorAll('[data-dot]').forEach(function (b) {
          b.addEventListener('click', function () { showTesti(parseInt(b.dataset.dot, 10)); });
        });
      }
      showTesti(0);
    }
    function showTesti(i) {
      const grid = document.getElementById('testiGrid');
      if (!grid || !testiItems.length) return;
      testiIndex = (i + testiItems.length) % testiItems.length;
      const r = testiItems[testiIndex];
      grid.innerHTML = `
        <div class="testi-card reveal visible">
          <div class="testi-quote">"</div>
          <p class="testi-text">${escapeHtml(r.text)}</p>
          <div class="testi-author">
            <div class="testi-avatar">${escapeHtml(initials(r.name))}</div>
            <div>
              <div class="testi-stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</div>
              <div class="testi-name">${escapeHtml(r.name)}</div>
              <div class="testi-role">${escapeHtml(r.role || 'KIC Student')}</div>
            </div>
          </div>
        </div>
      `;
      document.querySelectorAll('#testiDots .testi-dot').forEach(function (d, idx) {
        d.classList.toggle('active', idx === testiIndex);
      });
    }
    const testiPrevBtn = document.getElementById('testiPrevBtn');
    const testiNextBtn = document.getElementById('testiNextBtn');
    if (testiPrevBtn) testiPrevBtn.addEventListener('click', function () { showTesti(testiIndex - 1); });
    if (testiNextBtn) testiNextBtn.addEventListener('click', function () { showTesti(testiIndex + 1); });

    // Fetch the latest 4 reviews from the "reviews" Supabase table.
    // Falls back to the seed reviews if Supabase isn't reachable yet
    // (e.g. the table hasn't been created) so the section never looks empty.
    async function renderReviews() {
      const db = window.gicDb;
      if (!db) { paintReviews(SEED_REVIEWS.slice(0, REVIEWS_TO_SHOW)); return; }
      try {
        const { data, error } = await db
          .from('reviews')
          .select('name, role, text, stars, created_at')
          .order('created_at', { ascending: false })
          .limit(REVIEWS_TO_SHOW);
        if (error || !data || !data.length) {
          paintReviews(SEED_REVIEWS.slice(0, REVIEWS_TO_SHOW));
          return;
        }
        paintReviews(data);
      } catch (e) {
        paintReviews(SEED_REVIEWS.slice(0, REVIEWS_TO_SHOW));
      }
    }

    renderReviews();

    // Toggle the write-review form
    const writeBtn = document.getElementById('testiWriteBtn');
    const formWrap = document.getElementById('reviewFormWrap');
    if (writeBtn && formWrap) {
      writeBtn.addEventListener('click', function () {
        formWrap.classList.toggle('open');
        if (formWrap.classList.contains('open')) {
          formWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }

    // Star picker
    let selectedStars = 0;
    const starPicker = document.getElementById('reviewStarPicker');
    if (starPicker) {
      const starButtons = Array.from(starPicker.querySelectorAll('button'));
      function paintStars(count) {
        starButtons.forEach(btn => {
          btn.classList.toggle('filled', Number(btn.dataset.star) <= count);
        });
      }
      starButtons.forEach(btn => {
        btn.addEventListener('click', function () {
          selectedStars = Number(btn.dataset.star);
          paintStars(selectedStars);
        });
        btn.addEventListener('mouseenter', function () {
          paintStars(Number(btn.dataset.star));
        });
      });
      starPicker.addEventListener('mouseleave', function () {
        paintStars(selectedStars);
      });
    }

    // Submit handler -> insert into Supabase "reviews" table
    const reviewForm = document.getElementById('reviewForm');
    const reviewFormStatus = document.getElementById('reviewFormStatus');
    if (reviewForm) {
      reviewForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        if (!selectedStars) {
          reviewFormStatus.textContent = 'Please select a star rating before submitting.';
          reviewFormStatus.style.display = 'block';
          reviewFormStatus.style.background = '#FDECEA';
          reviewFormStatus.style.color = '#B3261E';
          return;
        }

        const submitBtn = reviewForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        const formData = new FormData(reviewForm);
        const newReview = {
          name: (formData.get('reviewer_name') || '').toString().trim() || 'Anonymous',
          role: (formData.get('reviewer_role') || '').toString().trim(),
          text: (formData.get('reviewer_text') || '').toString().trim(),
          stars: selectedStars
        };

        const db = window.gicDb;
        let saveError = null;
        if (db) {
          const { error } = await db.from('reviews').insert(newReview);
          saveError = error;
        } else {
          saveError = new Error('Database unavailable');
        }

        if (submitBtn) submitBtn.disabled = false;

        if (saveError) {
          reviewFormStatus.textContent = 'Sorry, we could not save your review right now. Please try again shortly.';
          reviewFormStatus.style.display = 'block';
          reviewFormStatus.style.background = '#FDECEA';
          reviewFormStatus.style.color = '#B3261E';
          return;
        }

        renderReviews();

        reviewForm.reset();
        selectedStars = 0;
        if (starPicker) {
          Array.from(starPicker.querySelectorAll('button')).forEach(b => b.classList.remove('filled'));
        }

        reviewFormStatus.textContent = 'Thank you! Your review has been posted below. 🎉';
        reviewFormStatus.style.display = 'block';
        reviewFormStatus.style.background = '#E6F4EA';
        reviewFormStatus.style.color = '#007a00';

        setTimeout(() => {
          formWrap.classList.remove('open');
          reviewFormStatus.style.display = 'none';
        }, 2200);
      });
    }
  })();

  // Upcoming Events: loads the "site_events" Supabase table (managed from
  // Admin > Website Events). Falls back to seed events if the table isn't
  // reachable yet, so the section never looks empty.
  (function () {
    const SEED_EVENTS = [];
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str || '';
      return div.innerHTML;
    }

    function paintEvents(events) {
      const grid = document.getElementById('eventsGrid');
      if (!grid) return;
      if (!events.length) {
        grid.innerHTML = '<div class="event-card reveal visible"><div class="event-info"><p>No upcoming events right now — check back soon.</p></div></div>';
        return;
      }
      grid.innerHTML = events.map(function (ev) {
        var d = ev.event_date ? new Date(ev.event_date + 'T00:00:00') : null;
        var month = d ? MONTHS[d.getMonth()] : '';
        var day = d ? String(d.getDate()).padStart(2, '0') : '';
        return `
          <div class="event-card reveal visible">
            <div class="event-date">
              <div class="event-month">${escapeHtml(month)}</div>
              <div class="event-day">${escapeHtml(day)}</div>
            </div>
            <div class="event-info">
              <h3>${escapeHtml(ev.title)}</h3>
              <p>${escapeHtml(ev.description || '')}</p>
              ${ev.tag ? `<span class="event-tag">${escapeHtml(ev.tag)}</span>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    async function renderEvents() {
      const db = window.gicDb;
      if (!db) { paintEvents(SEED_EVENTS); return; }
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await db
          .from('site_events')
          .select('title, description, tag, event_date')
          .gte('event_date', today)
          .order('event_date', { ascending: true })
          .limit(8);
        if (error) { paintEvents(SEED_EVENTS); return; }
        paintEvents(data && data.length ? data : SEED_EVENTS);
      } catch (e) {
        paintEvents(SEED_EVENTS);
      }
    }

    renderEvents();
  })();

  // Moments Gallery, Faculty, and Life at KIC: each loads from its own
  // Supabase table (managed from Admin > Moments Gallery / Website Faculty /
  // Life at KIC). If a table isn't reachable (or is empty / offline), that
  // section simply stays hidden.
  (function () {
    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str || '';
      return div.innerHTML;
    }

    // Moments / Life at KIC only appear when real content has loaded from the
    // database — nothing is hardcoded, so offline visitors never see stale images.
    function setSectionVisible(id, visible) {
      var sec = document.getElementById(id);
      if (sec) sec.hidden = !visible;
      document.querySelectorAll('[onclick*="scrollToSection(\'' + id + '\')"]').forEach(function (a) {
        var li = a.closest('li') || a;
        li.style.display = visible ? '' : 'none';
      });
    }
    setSectionVisible('gallery', false);
    setSectionVisible('campus', false);

    async function renderGalleryPublic() {
      const db = window.gicDb;
      const grid = document.getElementById('galleryGrid');
      if (!db || !grid) return;
      try {
        const { data, error } = await db.from('site_gallery').select('image_data, caption')
          .order('sort_order', { ascending: true }).order('created_at', { ascending: false }).limit(12);
        if (error || !data || !data.length) return;
        grid.innerHTML = data.map(function (g) {
          return `<div class="gallery-card reveal visible"><img src="${g.image_data}" alt="${escapeHtml(g.caption || 'KIC College')}"></div>`;
        }).join('');
        setSectionVisible('gallery', true);
      } catch (e) { /* stay hidden */ }
    }

    async function renderFacultyPublic() {
      const db = window.gicDb;
      const grid = document.getElementById('facultyGrid');
      if (!grid) return;
      if (!db) { grid.innerHTML = '<div class="faculty-card"><div class="faculty-body"><div class="faculty-name" style="font-weight:500;color:var(--muted)">Our tutors will be listed here soon.</div></div></div>'; return; }
      try {
        const { data, error } = await db.from('site_faculty').select('name, role_title, department, photo_data')
          .order('sort_order', { ascending: true }).order('created_at', { ascending: true }).limit(24);
        if (error || !data || !data.length) { grid.innerHTML = '<div class="faculty-card"><div class="faculty-body"><div class="faculty-name" style="font-weight:500;color:var(--muted)">Our tutors will be listed here soon.</div></div></div>'; return; }
        grid.innerHTML = data.map(function (f) {
          return `
            <div class="faculty-card reveal visible">
              <div class="faculty-avatar-wrap"><div class="faculty-avatar"><img src="${f.photo_data}" alt="${escapeHtml(f.name)}"></div></div>
              <div class="faculty-body">
                <div class="faculty-name">${escapeHtml(f.name)}</div>
                <div class="faculty-title">${escapeHtml(f.role_title || '')}</div>
                <div class="faculty-dept">${escapeHtml(f.department || '')}</div>
              </div>
            </div>`;
        }).join('');
      } catch (e) { grid.innerHTML = '<div class="faculty-card"><div class="faculty-body"><div class="faculty-name" style="font-weight:500;color:var(--muted)">Our tutors will be listed here soon.</div></div></div>'; }
    }

    async function renderCampusPublic() {
      const db = window.gicDb;
      const grid = document.getElementById('campusGrid');
      if (!db || !grid) return;
      try {
        const { data, error } = await db.from('site_life_media').select('media_type, media_url, media_data, label')
          .order('media_type', { ascending: false }).order('sort_order', { ascending: true }).order('created_at', { ascending: false }).limit(12);
        if (error || !data || !data.length) return;
        grid.innerHTML = data.map(function (m) {
          if (m.media_type === 'video') {
            return `
              <div class="campus-card reveal visible">
                <div class="media-skeleton"></div>
                <video class="campus-video" autoplay muted loop playsinline controls controlsList="nodownload"><source src="${m.media_url}" type="video/mp4"></video>
                <div class="campus-label">${escapeHtml(m.label || '')}</div>
              </div>`;
          }
          return `
            <div class="campus-card reveal visible" style="background: url('${m.media_data}') center/cover no-repeat;">
              <div class="media-skeleton"></div>
              <div class="campus-label">${escapeHtml(m.label || '')}</div>
            </div>`;
        }).join('');
        if (typeof window.observeCampusVideos === 'function') window.observeCampusVideos();
        if (typeof window.groupCampusCards === 'function') window.groupCampusCards();
        if (typeof window.initCampusMediaSkeletons === 'function') window.initCampusMediaSkeletons(grid);
        setSectionVisible('campus', true);
      } catch (e) { /* stay hidden */ }
    }

    renderGalleryPublic();
    renderFacultyPublic();
    renderCampusPublic();
  })();

  // Admission form -> EmailJS
  // 1) Sign up free at https://www.emailjs.com and connect your Gmail as an "Email Service".
  // 2) Create an Email Template there (use variables like {{first_name}}, {{last_name}}, {{email}},
  //    {{phone}}, {{program}}, {{previous_school}}, {{level}}, {{message}}).
  // 3) Replace the three placeholder values below with your own Service ID, Template ID, and Public Key
  //    (found under Account > General in the EmailJS dashboard).
  const EMAILJS_PUBLIC_KEY  = '7DQ9ac0IVxJa0QJj0';
  const EMAILJS_SERVICE_ID  = 'service_l7lkppp';
  const EMAILJS_TEMPLATE_ID = 'template_gddavyt';

  if (window.emailjs) {
    emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  }

  const admissionForm = document.getElementById('admissionForm');
  const admissionStatus = document.getElementById('admissionStatus');
  const admissionSubmitBtn = document.getElementById('admissionSubmitBtn');

  function showAdmissionStatus(message, type) {
    admissionStatus.textContent = message;
    admissionStatus.style.display = 'block';
    if (type === 'error') {
      admissionStatus.style.background = '#FDECEA';
      admissionStatus.style.color = '#B3261E';
    } else if (type === 'success') {
      admissionStatus.style.background = '#E6F4EA';
      admissionStatus.style.color = '#007a00';
    } else {
      admissionStatus.style.background = '#ecebf8';
      admissionStatus.style.color = '#282058';
    }
  }

  if (admissionForm) {
    admissionForm.addEventListener('submit', function (e) {
      e.preventDefault();

      const originalBtnText = admissionSubmitBtn.textContent;
      admissionSubmitBtn.disabled = true;
      admissionSubmitBtn.textContent = 'Sending...';
      showAdmissionStatus('Sending your application...', 'info');

      const formData = new FormData(admissionForm);
      const application = {
        first_name: (formData.get('first_name') || '').toString().trim(),
        last_name: (formData.get('last_name') || '').toString().trim(),
        email: (formData.get('email') || '').toString().trim(),
        phone: (formData.get('phone') || '').toString().trim(),
        program: (formData.get('program') || '').toString().trim(),
        previous_school: (formData.get('previous_school') || '').toString().trim(),
        level: (formData.get('level') || '').toString().trim(),
        message: (formData.get('message') || '').toString().trim()
      };

      // Save to the "admissions" table so Admin can see it in the portal,
      // then also email the admissions office via EmailJS (if configured).
      const db = window.gicDb;
      const savePromise = db
        ? db.from('admissions').insert(application)
        : Promise.resolve({ error: new Error('Database unavailable') });

      savePromise.then(function (result) {
        if (result && result.error) {
          console.error('Supabase admissions insert error:', result.error);
        }

        const canEmail = window.emailjs && EMAILJS_SERVICE_ID !== 'YOUR_SERVICE_ID';
        const emailPromise = canEmail
          ? emailjs.sendForm(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, admissionForm)
          : Promise.resolve();

        emailPromise
          .catch(function (err) {
            console.error('EmailJS error:', err);
          })
          .finally(function () {
            if (result && result.error && !canEmail) {
              showAdmissionStatus('Something went wrong submitting your application. Please try again or call us directly.', 'error');
            } else {
              showAdmissionStatus('Thank you for applying! Our admissions team will contact you within 48 hours. 🎓', 'success');
              admissionForm.reset();
            }
            admissionSubmitBtn.disabled = false;
            admissionSubmitBtn.textContent = originalBtnText;
          });
      });
    });
  }


  document.querySelectorAll('.mobile-link').forEach(link => {
    link.addEventListener('click', () => toggleMenu(false));
  });
  window.addEventListener('scroll', () => {
    const nav = document.querySelector('nav');
    if (window.scrollY > 100) {
      nav.style.boxShadow = '0 12px 36px rgba(28,22,69,0.18)';
    } else {
      nav.style.boxShadow = '';
    }
  });
