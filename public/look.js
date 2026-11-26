// Sets the light or dark look before the page draws, so it doesn't flash the wrong one.
// Dark is the app's usual look; "system" follows the device. Saved per browser.
(function () {
  var look = 'dark';
  try {
    look = localStorage.getItem('mvc.look') || 'dark';
  } catch (e) {
    // storage blocked: keep the usual look
  }
  if (look !== 'light' && look !== 'system') look = 'dark';
  document.documentElement.setAttribute('data-look', look);
})();
