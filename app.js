// ⚠️ SENTRY MUSI BYĆ NA SAMYM POCZĄTKU
require("./instrument.js");

// All other imports below
// Import with `import * as Sentry from "@sentry/node"` if you are using ESM
const express = require("express");

const { initSentry, Sentry } = require('./infrastructure/monitoring/sentry');
initSentry();

const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const { globalLimiter, authLimiter } = require('./infrastructure/middleware/rateLimit');
require('dotenv').config();

const app = express();



// ======================
// MIDDLEWARE (w kolejności!)
// ======================

// 📊 1. SENTRY - Request Handler (MUSI być pierwszy!)
app.use(Sentry.Handlers.requestHandler());

// 🛡️ 2. HELMET - zabezpieczenia HTTP headers
app.use(helmet());

// 4. Body parser - parsowanie JSON z limitem rozmiaru (max 1MB)
app.use(express.json({ limit: '1mb' }));

// 🚦 3. RATE LIMITING - TYLKO dla endpointów wymagających ochrony
// NIE dla /health, /debug-sentry
const protectedPaths = ['/tasks', '/admin'];
app.use((req, res, next) => {
  // Pomiń rate limiting dla endpointów testowych i health
  if (req.path === '/health' || req.path === '/debug-sentry') {
    return next();
  }
  globalLimiter(req, res, next);
});

// Osobny, ostrzejszy limit dla /auth (5 req/min)
app.use('/auth', authLimiter);

// ======================
// ROUTES
// ======================

// ✅ Health check endpoint (bez rate limiting)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 🧪 ENDPOINT TESTOWY - USUŃ PO TESTACH (bez rate limiting)
app.get('/debug-sentry', () => {
  throw new Error('Testowy błąd Sentry!');
});

// ======================
// AUTH ENDPOINTS
// ======================

// Endpoint rejestracji
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email i hasło są wymagane' 
      });
    }

    // Walidacja hasła
    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Hasło musi mieć minimum 6 znaków' 
      });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(201).json({ 
      user: data.user,
      message: 'Konto utworzone. Sprawdź email w celu weryfikacji.' 
    });
  } catch (error) {
    console.error('REGISTER ERROR:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Endpoint logowania
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email i hasło są wymagane' 
      });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    return res.json({ 
      user: data.user,
      session: data.session,
      access_token: data.session.access_token
    });
  } catch (error) {
    console.error('LOGIN ERROR:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ======================
// MIDDLEWARE WERYFIKACJI TOKENA
// ======================

async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Brak tokenu autoryzacji' });
    }

    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: `Bearer ${token}` } }
      }
    );

    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return res.status(401).json({ 
        error: 'Nieprawidłowy lub wygasły token'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Błąd weryfikacji tokena' });
  }
}

// ======================
// TASKS ENDPOINTS (chronione tokenem)
// ======================

// GET /tasks - lista zadań użytkownika
app.get('/tasks', verifyToken, async (req, res) => {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: req.headers.authorization } }
      }
    );

    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json(tasks || []);
  } catch (error) {
    console.error('GET TASKS ERROR:', error);
    return res.status(500).json({ error: error.message });
  }
});

// POST /tasks - utworzenie zadania
app.post('/tasks', verifyToken, async (req, res) => {
  try {
    const { title, description } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Tytuł jest wymagany' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: req.headers.authorization } }
      }
    );

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        title,
        description: description || null,
        user_id: req.user.id,
        completed: false
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json(task);
  } catch (error) {
    console.error('CREATE TASK ERROR:', error);
    return res.status(500).json({ error: error.message });
  }
});

// GET /tasks/:id - pojedyncze zadanie
app.get('/tasks/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: req.headers.authorization } }
      }
    );

    const { data: task, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Zadanie nie znalezione' });
      }
      throw error;
    }

    return res.json(task);
  } catch (error) {
    console.error('GET TASK ERROR:', error);
    return res.status(500).json({ error: error.message });
  }
});

// PUT /tasks/:id - aktualizacja zadania
app.put('/tasks/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, completed } = req.body;

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: req.headers.authorization } }
      }
    );

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (completed !== undefined) updateData.completed = completed;

    const { data: task, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Zadanie nie znalezione' });
      }
      throw error;
    }

    return res.json(task);
  } catch (error) {
    console.error('UPDATE TASK ERROR:', error);
    return res.status(500).json({ error: error.message });
  }
});

// DELETE /tasks/:id - usunięcie zadania
app.delete('/tasks/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: req.headers.authorization } }
      }
    );

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;

    return res.status(204).send();
  } catch (error) {
    console.error('DELETE TASK ERROR:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ======================
// ADMIN ENDPOINTS
// ======================

// Route do zarządzania użytkownikami
app.get('/admin/users', verifyToken, async (req, res) => {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: req.headers.authorization } }
      }
    );

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Brak uprawnień administratora' });
    }

    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, role, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json(users);
  } catch (error) {
    console.error('ADMIN ERROR:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ======================
// ERROR HANDLERS
// ======================

// 404 - nieznane endpointy
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint nie znaleziony',
    path: req.path 
  });
});

// 📊 SENTRY - Error Handler (MUSI być przed Twoim error handlerem!)
app.use(Sentry.Handlers.errorHandler());

// Główny error handler
app.use((err, req, res, next) => {
  console.error('Błąd aplikacji:', err);
  
  // Jeśli to błąd PayloadTooLargeError
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ 
      error: 'Payload zbyt duży. Maksymalny rozmiar: 1MB' 
    });
  }
  
  res.status(500).json({ 
    error: 'Wewnętrzny błąd serwera',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ======================
// START SERWERA
// ======================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  🚀 Serwer uruchomiony                 ║
║  📍 http://localhost:${PORT}            ║
║  🛡️  Helmet: ✅ AKTYWNY                ║
║  🚦 Rate Limiting: ✅ AKTYWNY          ║
║     • Global: 100 req/15min           ║
║     • Auth (/auth/*): 5 req/min       ║
║  📊 Sentry: ${process.env.SENTRY_DSN ? '✅ AKTYWNY' : '⚠️  WYŁĄCZONY'}              ║
║  ✅ Endpoints:                         ║
║     • GET  /health                    ║
║     • POST /auth/register             ║
║     • POST /auth/login                ║
║     • GET  /tasks                     ║
║     • POST /tasks                     ║
║     • GET  /tasks/:id                 ║
║     • PUT  /tasks/:id                 ║
║     • DELETE /tasks/:id               ║
║     • GET  /admin/users               ║
╚════════════════════════════════════════╝
  `);
});