// routes/admin.js (lub tam gdzie masz swoje route'y)
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Middleware do weryfikacji tokenu
async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Brak tokenu autoryzacji' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: {
          headers: { Authorization: `Bearer ${token}` }
        }
      }
    );

    // Zweryfikuj token i pobierz użytkownika
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return res.status(401).json({ error: 'Nieprawidłowy token' });
    }

    req.user = user;
    req.supabase = supabase;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Błąd autoryzacji' });
  }
}

// Middleware do sprawdzenia czy użytkownik jest adminem
async function isAdmin(req, res, next) {
  try {
    const { data: profile, error } = await req.supabase
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (error || profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Brak uprawnień administratora' });
    }

    next();
  } catch (error) {
    return res.status(403).json({ error: 'Błąd sprawdzania uprawnień' });
  }
}

// Endpoint do pobierania użytkowników
router.get('/users', verifyToken, isAdmin, async (req, res) => {
  try {
    const { data: users, error } = await req.supabase
      .from('profiles')
      .select('id, email, role, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return res.status(200).json(users);
  } catch (error) {
    console.error('Błąd pobierania użytkowników:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;