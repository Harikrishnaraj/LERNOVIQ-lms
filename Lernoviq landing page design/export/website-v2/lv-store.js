// LERNOVIQ site store: sample catalogue, cart (localStorage) and integration settings.
// SAMPLE DATA — replace with live catalogue from the LMS (search_courses RPC) before launch.
(function () {
  var CONFIG = {
    // TO_CONFIRM: production LMS host (repo variable PROD_APP_HOST). Login/signup/course links use it.
    LMS_URL: 'https://lms.lernoviq.com',
    // TO_CONFIRM: Razorpay key id. Empty = preview mode (no payment is attempted).
    RAZORPAY_KEY_ID: ''
  };
  var I = 'assets/images/';
  var COURSES = [
    { id: 'c1', slug: 'banking-regulations-compliance', title: 'Banking Regulations and Compliance', subtitle: 'Core regulatory concepts for banking professionals.', category: 'Banking & Finance', level: 'intermediate', language: 'en', minutes: 200, inr: 349900, usd: 4900, rating: 4.6, ratings: 128, img: I + 'industries/industry-bfsi-learning.webp' },
    { id: 'c2', slug: 'risk-management-foundations', title: 'Risk Management Foundations', subtitle: 'Identify, assess, mitigate and monitor risk.', category: 'Compliance & Risk', level: 'beginner', language: 'en', minutes: 165, inr: 249900, usd: 3500, rating: 4.7, ratings: 214, img: I + 'lms/lms-learner-course-page.webp' },
    { id: 'c3', slug: 'aml-kyc-essentials', title: 'AML and KYC Essentials', subtitle: 'Anti-money laundering and customer due diligence.', category: 'Compliance & Risk', level: 'all_levels', language: 'en', minutes: 95, inr: 0, usd: 0, rating: 4.4, ratings: 302, img: I + 'industries/industry-government-learning.webp' },
    { id: 'c4', slug: 'leadership-financial-services', title: 'Leadership in Financial Services', subtitle: 'Lead teams through change and regulation.', category: 'Leadership', level: 'advanced', language: 'en', minutes: 165, inr: 449900, usd: 6500, rating: 4.5, ratings: 76, img: I + 'about/about-team-collaboration.webp' },
    { id: 'c5', slug: 'instructional-design-essentials', title: 'Instructional Design Essentials', subtitle: 'Storyboards, objectives and knowledge checks.', category: 'Learning Design', level: 'beginner', language: 'en', minutes: 240, inr: 299900, usd: 4200, rating: 4.8, ratings: 95, img: I + 'solutions/service-elearning-development.webp' },
    { id: 'c6', slug: 'digital-banking-fundamentals', title: 'Digital Banking Fundamentals', subtitle: 'Channels, payments and customer experience.', category: 'Banking & Finance', level: 'beginner', language: 'hi', minutes: 185, inr: 199900, usd: 2900, rating: 4.3, ratings: 141, img: I + 'solutions/service-lms-technology.webp' },
    { id: 'c7', slug: 'workplace-onboarding-toolkit', title: 'Workplace Onboarding Toolkit', subtitle: 'Design a first-90-days learning path.', category: 'Corporate L&D', level: 'all_levels', language: 'en', minutes: 50, inr: 0, usd: 0, rating: 4.2, ratings: 58, img: I + 'industries/industry-corporate-learning.webp' },
    { id: 'c8', slug: 'video-learning-localization', title: 'Video Learning and Localization', subtitle: 'Subtitles, voice-over and multilingual review.', category: 'Learning Design', level: 'intermediate', language: 'en', minutes: 130, inr: 279900, usd: 3900, rating: 4.6, ratings: 44, img: I + 'solutions/service-localization-video.webp' },
    { id: 'c9', slug: 'project-delivery-for-ld', title: 'Project Delivery for L&D Teams', subtitle: 'Milestones, QA and stakeholder governance.', category: 'Corporate L&D', level: 'intermediate', language: 'es', minutes: 150, inr: 329900, usd: 4500, rating: 3.9, ratings: 31, img: I + 'solutions/service-managed-learning.webp' }
  ];
  var CART_KEY = 'lernoviq_cart_v1', CUR_KEY = 'lernoviq_currency_v1', BUYER_KEY = 'lernoviq_buyer_v1';
  function read(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} window.dispatchEvent(new Event('lv-change')); }
  var LV = {
    config: CONFIG,
    courses: COURSES,
    byId: function (id) { for (var i = 0; i < COURSES.length; i++) if (COURSES[i].id === id) return COURSES[i]; return null; },
    lmsUrl: function (path) { return CONFIG.LMS_URL.replace(/\/$/, '') + path; },
    cart: function () { return read(CART_KEY, []); },
    count: function () { return read(CART_KEY, []).length; },
    has: function (id) { return read(CART_KEY, []).some(function (x) { return x.id === id; }); },
    add: function (id) { var c = read(CART_KEY, []); if (!c.some(function (x) { return x.id === id; })) c.push({ id: id, seats: 1 }); write(CART_KEY, c); },
    remove: function (id) { write(CART_KEY, read(CART_KEY, []).filter(function (x) { return x.id !== id; })); },
    setSeats: function (id, n) { write(CART_KEY, read(CART_KEY, []).map(function (x) { return x.id === id ? { id: id, seats: Math.max(1, Math.min(10000, n | 0)) } : x; })); },
    clear: function () { write(CART_KEY, []); },
    currency: function () { return read(CUR_KEY, 'INR'); },
    setCurrency: function (c) { write(CUR_KEY, c); },
    buyer: function () { return read(BUYER_KEY, 'individual'); },
    setBuyer: function (b) { write(BUYER_KEY, b); },
    price: function (course, cur) { return cur === 'USD' ? course.usd : course.inr; },
    fmt: function (minor, cur) {
      if (!minor) return 'Free';
      return new Intl.NumberFormat(cur === 'USD' ? 'en-US' : 'en-IN', { style: 'currency', currency: cur, maximumFractionDigits: cur === 'USD' ? 2 : 0 }).format(minor / 100);
    },
    duration: function (m) { if (m < 60) return m + ' min'; var h = Math.floor(m / 60), r = m % 60; return r ? h + ' h ' + r + ' min' : h + ' h'; }
  };
  window.LV = LV;
  window.addEventListener('storage', function () { window.dispatchEvent(new Event('lv-change')); });
})();
