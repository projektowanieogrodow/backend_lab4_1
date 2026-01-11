const Sentry = require('@sentry/node');

/**
 * Inicjalizacja Sentry - monitoring błędów
 */
function initSentry() {
  // Inicjalizuj tylko jeśli mamy DSN
  if (!process.env.SENTRY_DSN) {
    console.log('⚠️  Sentry: brak DSN, monitoring wyłączony');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 1.0, // 100% requestów w development
  });

  console.log('✅ Sentry: monitoring włączony');
}

// Mock handlers dla przypadku gdy Sentry nie jest skonfigurowany
// Dzięki temu aplikacja działa nawet bez DSN
const mockHandlers = {
  requestHandler: () => (req, res, next) => next(),
  errorHandler: () => (err, req, res, next) => next(err)
};

// Eksportuj Sentry z fallback na mock handlers
const sentryHandlers = process.env.SENTRY_DSN ? Sentry.Handlers : mockHandlers;

module.exports = {
  initSentry,
  Sentry: {
    ...Sentry,
    Handlers: sentryHandlers
  }
};