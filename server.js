const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'match_db', 
    password: 'password', 
    port: 5432,
});

pool.on('connect', () => {
    console.log('Успешное подключение к базе данных PostgreSQL.');
});

pool.on('error', (err) => {
    console.error('Ошибка запроса PostgreSQL:', err.message);
});

// таблицы
async function initializeDatabase() {
    const client = await pool.connect();
    try {
        // пользователи
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                phone VARCHAR(20) UNIQUE NOT NULL,
                fio TEXT DEFAULT '',
                password TEXT NOT NULL,
                balance NUMERIC(10, 2) DEFAULT 0.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Таблица users готова');

        // домики
        await client.query(`
            CREATE TABLE IF NOT EXISTS houses (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                slug VARCHAR(100) UNIQUE NOT NULL,
                type VARCHAR(50) NOT NULL,
                price INTEGER NOT NULL,
                capacity TEXT DEFAULT '',
                location TEXT DEFAULT '',
                beds TEXT DEFAULT '',
                feature TEXT DEFAULT '',
                image TEXT DEFAULT '',
                tags TEXT DEFAULT '',
                description TEXT DEFAULT '',
                is_available BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Таблица houses готова');
        
        await initializeHouses(client);

        // бронь
        await client.query(`
            CREATE TABLE IF NOT EXISTS bookings (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                fio TEXT NOT NULL,
                phone VARCHAR(20) NOT NULL,
                house_id INTEGER,
                house_type VARCHAR(50),
                house_name TEXT,
                checkin DATE NOT NULL,
                checkout DATE NOT NULL,
                total_price INTEGER DEFAULT 0,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE SET NULL
            )
        `);
        console.log('Таблица bookings готова');

    } catch (err) {
        console.error('Ошибка инициализации БД:', err.message);
    } finally {
        client.release();
    }
}

// наполнение домиков
async function initializeHouses(client) {
    const res = await client.query("SELECT COUNT(*) as count FROM houses");
    if (parseInt(res.rows[0].count) > 0) {
        console.log('Домики уже добавлены.');
        return;
    }

    console.log('Добавляем домики в базу...');
    const houses = [
        ['Лесной купол', 'lesnoy-kupol', 'sphere', 5000, '2-4 человека', 'Уютный домик в лесу', 'Двуспальная кровать king-size', 'Вид на озеро', 'image/сфера.svg', 'Wi-Fi,Сплит-система,Телевизор с плоским экраном,Дом-сфера', 'Сферический дом с панорамным видом на озеро.'],
        ['Лесная тишина', 'lesnaya-tishina', 'a-frame', 7500, '2-4 человека', 'Домик в лесу', 'Двуспальная кровать', 'Полное уединение в лесу', 'image/дом-в-лесу.png', 'Wi-Fi,Баня,Горы,Камин', 'Уютный А-фрейм в глубине леса.'],
        ['Лофт в бору', 'loft-v-boru', 'barrel', 6000, '7 человек', 'Дом на берегу', '2 двуспальные кровати', 'Деревянный чан с подогревом', 'image/дом-с-чаном.png', 'Wi-Fi,Smart-TV,Сплит-система,Персонализированный чан', 'Просторный дом-бочка на берегу.'],
        ['Лесная сказка', 'lesnaya-skazka', 'a-frame', 5000, '4 человека', 'Уютный домик в лесу', 'Двуспальная кровать', 'Два жилых этажа', 'image/А-фрейм.png', 'Wi-Fi,Сплит-система,Тишина,Дом А-фрейм', 'Двухэтажный А-фрейм с панорамными окнами.'],
        ['Кубический дом', 'kubicheskiy-dom', 'cube', 8000, '2-6 человек', 'На поляне', '2 двуспальные кровати', 'Панорамные окна', 'image/cube.svg', 'Wi-Fi,Камин,Терраса,Минимализм', 'Современный кубический дом.'],
        ['Дом на дереве', 'dom-na-dereve', 'treehouse', 9000, '2 человека', 'В кронах деревьев', 'Двуспальная кровать', 'Вид на лес с высоты', 'image/treehouse.svg', 'Wi-Fi,Терраса,Романтика,Уединение', 'Уникальный дом на дереве для двоих.'],
        ['Геодезический купол', 'geodezicheskiy-kupol', 'geo', 6500, '4-6 человек', 'На холме', '2 двуспальные кровати', 'Круговая панорама 360°', 'image/geo.svg', 'Wi-Fi,Купол,Панорама,Простор', 'Геодезический купол с обзором 360 градусов.']
    ];

    const queryText = `INSERT INTO houses 
        (name, slug, type, price, capacity, location, beds, feature, image, tags, description) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;

    for (const h of houses) {
        await client.query(queryText, h);
    }
    console.log(`Добавлено ${houses.length} домиков`);
}

// Запуск инициализации при старте
initializeDatabase();

// API

// ---------- РЕГИСТРАЦИЯ ----------
app.post('/api/register', async (req, res) => {
    const { phone, fio, password } = req.body;
    if (!phone || !password) return res.status(400).json({ success: false, error: 'Заполните телефон и пароль' });
    if (password.length < 6) return res.status(400).json({ success: false, error: 'Пароль минимум 6 символов' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const cleanPhone = phone.replace(/\D/g, '');
        
        const result = await pool.query(
            'INSERT INTO users (phone, fio, password) VALUES ($1, $2, $3) RETURNING id',
            [cleanPhone, fio || '', hashedPassword]
        );
        
        res.json({ success: true, userId: result.rows[0].id, message: 'Регистрация успешна' });
    } catch (error) {
        if (error.code === '23505') { // Ошибка уникального ограничения в PG
            return res.status(400).json({ success: false, error: 'Пользователь с таким телефоном уже существует' });
        }
        console.error(error);
        res.status(500).json({ success: false, error: 'Ошибка регистрации' });
    }
});

// вход
    app.post('/api/login', async (req, res) => {
    const { phone, password } = req.body;
    const cleanPhone = phone.replace(/\D/g, '');

    try {
        const result = await pool.query('SELECT * FROM users WHERE phone = $1', [cleanPhone]);
        const user = result.rows[0];
        
        if (!user) return res.status(404).json({ success: false, error: 'Пользователь не найден' });
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ success: false, error: 'Неверный пароль' });
        
        res.json({
            success: true,
            user: { id: user.id, phone: user.phone, fio: user.fio, balance: user.balance }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

// получение пользователя
app.get('/api/users/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, phone, fio, balance, created_at FROM users WHERE id = $1', [req.params.id]);
        const user = result.rows[0];
        if (!user) return res.status(404).json({ success: false, error: 'Пользователь не найден' });
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// список домиков
app.get('/api/houses', async (req, res) => {
    const { type, available_only } = req.query;
    let sql = 'SELECT * FROM houses WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (type && type !== 'all') {
        sql += ` AND type = $${paramCount}`;
        params.push(type);
        paramCount++;
    }
    if (available_only === 'true') {
        sql += ` AND is_available = true`;
    }
    sql += ' ORDER BY created_at DESC';

    try {
        const result = await pool.query(sql, params);
        res.json({ success: true, houses: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// домик
app.get('/api/houses/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM houses WHERE id = $1', [req.params.id]);
        const row = result.rows[0];
        if (!row) return res.status(404).json({ success: false, error: 'Домик не найден' });
        res.json({ success: true, house: row });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// создание брони
app.post('/api/bookings', async (req, res) => {
    const { user_id, fio, phone, house_id, house_type, checkin, checkout } = req.body;
    if (!fio || !phone || !checkin || !checkout) {
        return res.status(400).json({ success: false, error: 'Заполните все обязательные поля' });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const checkinDate = new Date(checkin);
    const checkoutDate = new Date(checkout);

    if (checkoutDate <= checkinDate) {
        return res.status(400).json({ success: false, error: 'Дата выезда должна быть позже даты заезда' });
    }

    try {
        let house = null;
        if (house_id) {
            const hRes = await pool.query('SELECT * FROM houses WHERE id = $1', [house_id]);
            house = hRes.rows[0];
        } else if (house_type) {
            const hRes = await pool.query('SELECT * FROM houses WHERE type = $1 LIMIT 1', [house_type]);
            house = hRes.rows[0];
        }

        const houseName = house ? house.name : '';
        const finalHouseId = house ? house.id : null;
        const finalHouseType = house ? house.type : (house_type || '');

        const nights = Math.ceil((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24));
        const totalPrice = house ? nights * house.price : 0;

        const result = await pool.query(
            `INSERT INTO bookings 
            (user_id, fio, phone, house_id, house_type, house_name, checkin, checkout, total_price, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending') RETURNING id`,
            [user_id || null, fio, cleanPhone, finalHouseId, finalHouseType, houseName, checkin, checkout, totalPrice]
        );

        res.json({
            success: true,
            message: 'Заявка на бронирование отправлена',
            booking_id: result.rows[0].id,
            total_price: totalPrice,
            nights: nights
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// бронирования пользователя
app.get('/api/bookings/:userId', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM bookings WHERE user_id = $1 ORDER BY checkin DESC', [req.params.userId]);
        res.json({ success: true, bookings: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// поездки
app.get('/api/bookings/upcoming/:userId', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    try {
        const result = await pool.query(
            `SELECT * FROM bookings WHERE user_id = $1 AND checkout >= $2 AND status != 'cancelled' ORDER BY checkin ASC`,
            [req.params.userId, today]
        );
        res.json({ success: true, bookings: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});



// гл стр
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

// запуск
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});
