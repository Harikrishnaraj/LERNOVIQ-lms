// LERNOVIQ site settings (ADR-043). Shared by the header, footer and contact form.
// Courses, cart and checkout live in LERNOVIQ LMS; nothing here is sample catalogue data.
(function () {
  var CONFIG = {
    // Production LMS host. Login, signup, course and cart links point here.
    LMS_URL: 'https://lms.lernoviq.com'
  };
  window.LV = {
    config: CONFIG,
    lmsUrl: function (path) { return CONFIG.LMS_URL.replace(/\/$/, '') + path; }
  };
})();
