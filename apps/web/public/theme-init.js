// Applies the saved theme before the first paint, so a dark-mode user never
// sees a white flash. The same key and attribute as src/stores/theme.ts.
;(function () {
  try {
    var mode = localStorage.getItem('apart-localizer-theme')
    if (mode === 'light' || mode === 'dark') {
      document.documentElement.setAttribute('data-theme', mode)
    }
  } catch (_error) {
    // Storage unavailable (private mode): the system preference applies.
  }
})()
