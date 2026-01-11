const rateLimit = require('express-rate-limit');

/**
 * Globalny limiter - 100 requestów na 15 minut
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minut
  max: 100, // maksymalnie 100 requestów
  message: {
    error: 'Zbyt wiele requestów. Spróbuj ponownie za 15 minut.'
  },
  standardHeaders: true, // Zwraca info o limicie w headerach
  legacyHeaders: false,
});

/**
 * Limiter dla auth - 5 prób na minutę (ochrona przed brute-force)
 */
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuta
  max: 5, // maksymalnie 5 prób
  message: {
    error: 'Zbyt wiele prób logowania. Poczekaj minutę.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  globalLimiter,
  authLimiter
};