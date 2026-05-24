-- ==============================================
-- SETUP DO BANCO — Thalita Jantorno Fotografia
-- Execute este script no SQL Editor do Supabase
-- ==============================================

-- 1. TABELA DE EVENTOS
CREATE TABLE IF NOT EXISTS events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    date DATE,
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABELA DE FOTOS
CREATE TABLE IF NOT EXISTS photos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    url TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABELA DE PACOTES
CREATE TABLE IF NOT EXISTS packages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABELA DE PEDIDOS
CREATE TABLE IF NOT EXISTS orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    customer_notes TEXT,
    photo_ids JSONB NOT NULL DEFAULT '[]',
    package_id UUID REFERENCES packages(id),
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'delivered')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- ROW LEVEL SECURITY (RLS)
-- ==============================================

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- EVENTS: público pode ler, apenas autenticado pode escrever
CREATE POLICY "events_public_read" ON events
    FOR SELECT USING (active = true);

CREATE POLICY "events_admin_all" ON events
    FOR ALL USING (auth.role() = 'authenticated');

-- PHOTOS: público pode ler, apenas autenticado pode escrever
CREATE POLICY "photos_public_read" ON photos
    FOR SELECT USING (active = true);

CREATE POLICY "photos_admin_all" ON photos
    FOR ALL USING (auth.role() = 'authenticated');

-- PACKAGES: público pode ler, apenas autenticado pode escrever
CREATE POLICY "packages_public_read" ON packages
    FOR SELECT USING (active = true);

CREATE POLICY "packages_admin_all" ON packages
    FOR ALL USING (auth.role() = 'authenticated');

-- ORDERS: público pode inserir, apenas autenticado pode ler/alterar
CREATE POLICY "orders_public_insert" ON orders
    FOR INSERT WITH CHECK (true);

CREATE POLICY "orders_admin_all" ON orders
    FOR ALL USING (auth.role() = 'authenticated');

-- ==============================================
-- STORAGE BUCKET
-- Execute no painel Storage do Supabase:
--
-- 1. Crie um bucket chamado "photos"
-- 2. Marque como "Public bucket"
-- 3. Em Policies, adicione:
--    - SELECT: public (anyone can read)
--    - INSERT: authenticated only (admin uploads)
--    - DELETE: authenticated only
-- ==============================================

-- ==============================================
-- CRIAR CONTA ADMIN
-- No painel do Supabase: Authentication > Users
-- Clique "Invite user" e coloque o e-mail da Thalita
-- Ela receberá um link para definir a senha
-- ==============================================
