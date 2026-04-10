const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const rootDir = __dirname;
const uploadsDir = path.join(rootDir, "uploads");
const chatUploadsDir = path.join(uploadsDir, "chat");
const publicDir = path.join(rootDir, "public");
const dbPath = path.join(rootDir, "bek.db");

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(chatUploadsDir)) fs.mkdirSync(chatUploadsDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);

app.use("/uploads", express.static(uploadsDir));
app.use(express.static(publicDir));

const db = new sqlite3.Database(dbPath);

const POST_CATEGORIES = [
  "Все",
  "Игры",
  "Семья",
  "История",
  "Юмор",
  "Путешествия",
  "Новости",
  "Музыка",
  "Фильмы",
  "Аниме",
  "Спорт",
  "Технологии",
  "Другое"
];

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (error) {
      if (error) {
        reject(error);
        return;
      }
      resolve(this);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row || null);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows || []);
    });
  });
}

async function ensureColumn(table, column, definition) {
  const columns = await allAsync(`PRAGMA table_info(${table})`);
  const exists = columns.some((col) => col.name === column);
  if (!exists) {
    await runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      birthday TEXT DEFAULT ''
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      image TEXT DEFAULT '',
      category TEXT DEFAULT 'Другое',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (post_id) REFERENCES posts(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      reaction_type TEXT NOT NULL,
      UNIQUE(user_id, target_type, target_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      text TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (from_user_id) REFERENCES users(id),
      FOREIGN KEY (to_user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      follower_id INTEGER NOT NULL,
      following_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_new INTEGER DEFAULT 1,
      UNIQUE(follower_id, following_id),
      FOREIGN KEY (follower_id) REFERENCES users(id),
      FOREIGN KEY (following_id) REFERENCES users(id)
    )
  `);
});

(async () => {
  try {
    await ensureColumn("messages", "file_path", "TEXT DEFAULT ''");
    await ensureColumn("messages", "file_name", "TEXT DEFAULT ''");
    await ensureColumn("messages", "file_type", "TEXT DEFAULT ''");
    await ensureColumn("subscriptions", "is_new", "INTEGER DEFAULT 1");
    await ensureColumn("posts", "category", "TEXT DEFAULT 'Другое'");
  } catch (error) {
    console.error("Ошибка обновления структуры базы:", error);
  }
})();

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, chatUploadsDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const uploadAvatar = multer({ storage: avatarStorage });
const uploadChatFile = multer({ storage: chatStorage });

app.get("/api/categories", (req, res) => {
  return res.json(POST_CATEGORIES.filter((item) => item !== "Все"));
});

app.post("/api/register", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "").trim();

    if (username.length < 3) {
      return res.status(400).json({ error: "Ник должен быть минимум 3 символа." });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: "Пароль должен быть минимум 4 символа." });
    }

    await runAsync(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, password]);

    return res.json({ success: true, username });
  } catch {
    return res.status(400).json({ error: "Этот ник уже занят." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "").trim();

    if (!username || !password) {
      return res.status(400).json({ error: "Введите ник и пароль." });
    }

    const user = await getAsync(
      `SELECT id, username, password, avatar, bio, birthday FROM users WHERE username = ?`,
      [username]
    );

    if (!user) {
      return res.status(404).json({ error: "Аккаунт не найден." });
    }

    if (user.password !== password) {
      return res.status(400).json({ error: "Неверный пароль." });
    }

    return res.json({
      success: true,
      username: user.username,
      avatar: user.avatar,
      bio: user.bio,
      birthday: user.birthday
    });
  } catch {
    return res.status(500).json({ error: "Ошибка сервера." });
  }
});

app.get("/api/search-users", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const viewer = String(req.query.viewer || "").trim();

    if (!q) {
      return res.json([]);
    }

    const viewerUser = viewer
      ? await getAsync(`SELECT id FROM users WHERE username = ?`, [viewer])
      : null;

    const rows = await allAsync(
      `
      SELECT id, username, avatar, bio
      FROM users
      WHERE username LIKE ?
      ORDER BY username ASC
      LIMIT 20
      `,
      [`%${q}%`]
    );

    const result = [];

    for (const user of rows) {
      let isSubscribed = false;

      if (viewerUser && viewer !== user.username) {
        const row = await getAsync(
          `SELECT id FROM subscriptions WHERE follower_id = ? AND following_id = ?`,
          [viewerUser.id, user.id]
        );
        isSubscribed = !!row;
      }

      result.push({
        username: user.username,
        avatar: user.avatar || "",
        bio: user.bio || "",
        isSubscribed
      });
    }

    return res.json(result);
  } catch {
    return res.status(500).json({ error: "Ошибка поиска." });
  }
});

app.get("/api/users/:username", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    const viewer = String(req.query.viewer || "").trim();

    const user = await getAsync(
      `SELECT id, username, avatar, bio, birthday FROM users WHERE username = ?`,
      [username]
    );

    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    const postCountRow = await getAsync(
      `SELECT COUNT(*) AS postCount FROM posts WHERE user_id = ?`,
      [user.id]
    );

    const followersRow = await getAsync(
      `SELECT COUNT(*) AS followersCount FROM subscriptions WHERE following_id = ?`,
      [user.id]
    );

    const followingRow = await getAsync(
      `SELECT COUNT(*) AS followingCount FROM subscriptions WHERE follower_id = ?`,
      [user.id]
    );

    let isSubscribed = false;

    if (viewer && viewer !== username) {
      const viewerUser = await getAsync(`SELECT id FROM users WHERE username = ?`, [viewer]);

      if (viewerUser) {
        const row = await getAsync(
          `SELECT id FROM subscriptions WHERE follower_id = ? AND following_id = ?`,
          [viewerUser.id, user.id]
        );
        isSubscribed = !!row;
      }
    }

    return res.json({
      ...user,
      postCount: postCountRow ? postCountRow.postCount : 0,
      followersCount: followersRow ? followersRow.followersCount : 0,
      followingCount: followingRow ? followingRow.followingCount : 0,
      isSubscribed
    });
  } catch {
    return res.status(500).json({ error: "Ошибка сервера." });
  }
});

app.get("/api/user/:username", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();

    const user = await getAsync(
      `SELECT id, username, avatar, bio, birthday FROM users WHERE username = ?`,
      [username]
    );

    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    const followersRow = await getAsync(
      `SELECT COUNT(*) AS followersCount FROM subscriptions WHERE following_id = ?`,
      [user.id]
    );

    const followingRow = await getAsync(
      `SELECT COUNT(*) AS followingCount FROM subscriptions WHERE follower_id = ?`,
      [user.id]
    );

    const posts = await allAsync(
      `
      SELECT posts.id, posts.content, posts.image, posts.category, posts.created_at
      FROM posts
      WHERE posts.user_id = ?
      ORDER BY posts.id DESC
      `,
      [user.id]
    );

    return res.json({
      user: {
        ...user,
        followersCount: followersRow ? followersRow.followersCount : 0,
        followingCount: followingRow ? followingRow.followingCount : 0
      },
      posts
    });
  } catch {
    return res.status(500).json({ error: "Ошибка сервера." });
  }
});

app.post("/api/profile", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const bio = String(req.body.bio || "").trim();
    const birthday = String(req.body.birthday || "").trim();

    if (!username) {
      return res.status(400).json({ error: "Нужен username." });
    }

    await runAsync(`UPDATE users SET bio = ?, birthday = ? WHERE username = ?`, [
      bio,
      birthday,
      username
    ]);

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Не удалось сохранить профиль." });
  }
});

app.post("/api/avatar", uploadAvatar.single("avatar"), async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();

    if (!username) {
      return res.status(400).json({ error: "Нужен username." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Выбери файл." });
    }

    const avatarPath = `/uploads/${req.file.filename}`;

    await runAsync(`UPDATE users SET avatar = ? WHERE username = ?`, [avatarPath, username]);

    return res.json({ success: true, avatar: avatarPath });
  } catch {
    return res.status(500).json({ error: "Не удалось загрузить аватар." });
  }
});

app.post("/api/posts", uploadAvatar.single("image"), async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const content = String(req.body.content || "").trim();
    const category = String(req.body.category || "Другое").trim();

    if (!username) {
      return res.status(400).json({ error: "Нужен username." });
    }

    if (!content) {
      return res.status(400).json({ error: "Напиши текст поста." });
    }

    const safeCategory = POST_CATEGORIES.includes(category) && category !== "Все"
      ? category
      : "Другое";

    const user = await getAsync(`SELECT id FROM users WHERE username = ?`, [username]);

    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    const imagePath = req.file ? `/uploads/${req.file.filename}` : "";

    await runAsync(
      `INSERT INTO posts (user_id, content, image, category) VALUES (?, ?, ?, ?)`,
      [user.id, content, imagePath, safeCategory]
    );

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Не удалось создать пост." });
  }
});

app.get("/api/posts", async (req, res) => {
  try {
    const viewer = String(req.query.viewer || "").trim();
    const category = String(req.query.category || "Все").trim();
    const feed = String(req.query.feed || "all").trim();

    let viewerUser = null;

    if (viewer) {
      viewerUser = await getAsync(`SELECT id FROM users WHERE username = ?`, [viewer]);
    }

    const params = [];
    const whereParts = [];

    if (category && category !== "Все") {
      whereParts.push(`posts.category = ?`);
      params.push(category);
    }

    if (feed === "following") {
      if (!viewerUser) {
        return res.json([]);
      }

      whereParts.push(`
        posts.user_id IN (
          SELECT following_id
          FROM subscriptions
          WHERE follower_id = ?
        )
      `);
      params.push(viewerUser.id);
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

    const posts = await allAsync(
      `
      SELECT
        posts.id,
        posts.content,
        posts.image,
        posts.category,
        posts.created_at,
        users.username,
        users.avatar
      FROM posts
      JOIN users ON users.id = posts.user_id
      ${whereSql}
      ORDER BY posts.id DESC
      `,
      params
    );

    const result = [];

    for (const post of posts) {
      const likesRow = await getAsync(
        `SELECT COUNT(*) AS count FROM reactions WHERE target_type = 'post' AND target_id = ? AND reaction_type = 'like'`,
        [post.id]
      );

      const dislikesRow = await getAsync(
        `SELECT COUNT(*) AS count FROM reactions WHERE target_type = 'post' AND target_id = ? AND reaction_type = 'dislike'`,
        [post.id]
      );

      const comments = await allAsync(
        `
        SELECT comments.id, comments.content, comments.created_at, users.username, users.avatar
        FROM comments
        JOIN users ON users.id = comments.user_id
        WHERE comments.post_id = ?
        ORDER BY comments.id ASC
        `,
        [post.id]
      );

      result.push({
        ...post,
        likes: likesRow ? likesRow.count : 0,
        dislikes: dislikesRow ? dislikesRow.count : 0,
        comments
      });
    }

    return res.json(result);
  } catch {
    return res.status(500).json({ error: "Не удалось загрузить посты." });
  }
});

app.post("/api/comments", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const postId = Number(req.body.postId);
    const content = String(req.body.content || "").trim();

    if (!username || !postId || !content) {
      return res.status(400).json({ error: "Недостаточно данных." });
    }

    const user = await getAsync(`SELECT id FROM users WHERE username = ?`, [username]);

    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    await runAsync(`INSERT INTO comments (user_id, post_id, content) VALUES (?, ?, ?)`, [
      user.id,
      postId,
      content
    ]);

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Не удалось добавить комментарий." });
  }
});

app.post("/api/reactions", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const targetType = String(req.body.targetType || "").trim();
    const targetId = Number(req.body.targetId);
    const reactionType = String(req.body.reactionType || "").trim();

    if (!username || !targetType || !targetId || !reactionType) {
      return res.status(400).json({ error: "Недостаточно данных." });
    }

    if (!["like", "dislike"].includes(reactionType)) {
      return res.status(400).json({ error: "Неверная реакция." });
    }

    const user = await getAsync(`SELECT id FROM users WHERE username = ?`, [username]);

    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    const existing = await getAsync(
      `SELECT id, reaction_type FROM reactions WHERE user_id = ? AND target_type = ? AND target_id = ?`,
      [user.id, targetType, targetId]
    );

    if (!existing) {
      await runAsync(
        `INSERT INTO reactions (user_id, target_type, target_id, reaction_type) VALUES (?, ?, ?, ?)`,
        [user.id, targetType, targetId, reactionType]
      );
    } else if (existing.reaction_type === reactionType) {
      await runAsync(`DELETE FROM reactions WHERE id = ?`, [existing.id]);
    } else {
      await runAsync(`UPDATE reactions SET reaction_type = ? WHERE id = ?`, [
        reactionType,
        existing.id
      ]);
    }

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Не удалось поставить реакцию." });
  }
});

app.post("/api/subscribe", async (req, res) => {
  try {
    const follower = String(req.body.follower || "").trim();
    const following = String(req.body.following || "").trim();

    if (!follower || !following) {
      return res.status(400).json({ error: "Недостаточно данных." });
    }

    if (follower === following) {
      return res.status(400).json({ error: "Нельзя подписаться на себя." });
    }

    const followerUser = await getAsync(`SELECT id FROM users WHERE username = ?`, [follower]);
    const followingUser = await getAsync(`SELECT id FROM users WHERE username = ?`, [following]);

    if (!followerUser || !followingUser) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    const existing = await getAsync(
      `SELECT id FROM subscriptions WHERE follower_id = ? AND following_id = ?`,
      [followerUser.id, followingUser.id]
    );

    if (!existing) {
      await runAsync(
        `INSERT INTO subscriptions (follower_id, following_id, is_new) VALUES (?, ?, 1)`,
        [followerUser.id, followingUser.id]
      );
    }

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Не удалось подписаться." });
  }
});

app.post("/api/unsubscribe", async (req, res) => {
  try {
    const follower = String(req.body.follower || "").trim();
    const following = String(req.body.following || "").trim();

    if (!follower || !following) {
      return res.status(400).json({ error: "Недостаточно данных." });
    }

    const followerUser = await getAsync(`SELECT id FROM users WHERE username = ?`, [follower]);
    const followingUser = await getAsync(`SELECT id FROM users WHERE username = ?`, [following]);

    if (!followerUser || !followingUser) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    await runAsync(
      `DELETE FROM subscriptions WHERE follower_id = ? AND following_id = ?`,
      [followerUser.id, followingUser.id]
    );

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Не удалось отписаться." });
  }
});

app.get("/api/subscriptions/:username", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();

    const user = await getAsync(`SELECT id FROM users WHERE username = ?`, [username]);

    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    const following = await allAsync(
      `
      SELECT users.username, users.avatar, users.bio
      FROM subscriptions
      JOIN users ON users.id = subscriptions.following_id
      WHERE subscriptions.follower_id = ?
      ORDER BY subscriptions.id DESC
      `,
      [user.id]
    );

    const followers = await allAsync(
      `
      SELECT users.username, users.avatar, users.bio, subscriptions.is_new
      FROM subscriptions
      JOIN users ON users.id = subscriptions.follower_id
      WHERE subscriptions.following_id = ?
      ORDER BY subscriptions.id DESC
      `,
      [user.id]
    );

    return res.json({
      following,
      followers
    });
  } catch {
    return res.status(500).json({ error: "Не удалось загрузить подписки." });
  }
});

app.get("/api/followers-unread/:username", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();

    const user = await getAsync(`SELECT id FROM users WHERE username = ?`, [username]);

    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    const row = await getAsync(
      `SELECT COUNT(*) AS count FROM subscriptions WHERE following_id = ? AND is_new = 1`,
      [user.id]
    );

    return res.json({
      count: row ? row.count : 0
    });
  } catch {
    return res.status(500).json({ error: "Ошибка уведомлений." });
  }
});

app.post("/api/followers-read", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();

    const user = await getAsync(`SELECT id FROM users WHERE username = ?`, [username]);

    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    await runAsync(
      `UPDATE subscriptions SET is_new = 0 WHERE following_id = ?`,
      [user.id]
    );

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Не удалось убрать уведомления." });
  }
});

app.post("/api/send", uploadChatFile.single("file"), async (req, res) => {
  try {
    const from = String(req.body.from || "").trim();
    const to = String(req.body.to || "").trim();
    const text = String(req.body.text || "").trim();

    if (!from || !to) {
      return res.status(400).json({ error: "Недостаточно данных." });
    }

    if (from === to) {
      return res.status(400).json({ error: "Нельзя писать самому себе." });
    }

    if (!text && !req.file) {
      return res.status(400).json({ error: "Напиши сообщение или выбери файл." });
    }

    const fromUser = await getAsync(`SELECT id FROM users WHERE username = ?`, [from]);
    const toUser = await getAsync(`SELECT id FROM users WHERE username = ?`, [to]);

    if (!fromUser || !toUser) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    const filePath = req.file ? `/uploads/chat/${req.file.filename}` : "";
    const fileName = req.file ? req.file.originalname : "";
    const fileType = req.file ? req.file.mimetype : "";

    await runAsync(
      `INSERT INTO messages (from_user_id, to_user_id, text, file_path, file_name, file_type) VALUES (?, ?, ?, ?, ?, ?)`,
      [fromUser.id, toUser.id, text, filePath, fileName, fileType]
    );

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Ошибка отправки сообщения." });
  }
});

app.get("/api/chat", async (req, res) => {
  try {
    const u1 = String(req.query.u1 || "").trim();
    const u2 = String(req.query.u2 || "").trim();

    if (!u1 || !u2) {
      return res.status(400).json({ error: "Не указаны пользователи." });
    }

    const user1 = await getAsync(`SELECT id, username FROM users WHERE username = ?`, [u1]);
    const user2 = await getAsync(`SELECT id, username FROM users WHERE username = ?`, [u2]);

    if (!user1 || !user2) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    const messages = await allAsync(
      `
      SELECT
        m.id,
        m.text,
        m.file_path,
        m.file_name,
        m.file_type,
        m.created_at,
        u.username AS from_user
      FROM messages m
      JOIN users u ON u.id = m.from_user_id
      WHERE (m.from_user_id = ? AND m.to_user_id = ?)
         OR (m.from_user_id = ? AND m.to_user_id = ?)
      ORDER BY m.id ASC
      `,
      [user1.id, user2.id, user2.id, user1.id]
    );

    return res.json(messages);
  } catch {
    return res.status(500).json({ error: "Ошибка загрузки чата." });
  }
});

app.get("/api/dialogs/:username", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();

    if (!username) {
      return res.status(400).json({ error: "Нужен username." });
    }

    const currentUser = await getAsync(`SELECT id FROM users WHERE username = ?`, [username]);

    if (!currentUser) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    const dialogs = await allAsync(
      `
      SELECT
        CASE
          WHEN messages.from_user_id = ? THEN messages.to_user_id
          ELSE messages.from_user_id
        END AS other_user_id,
        MAX(messages.id) AS last_message_id
      FROM messages
      WHERE messages.from_user_id = ? OR messages.to_user_id = ?
      GROUP BY other_user_id
      ORDER BY last_message_id DESC
      `,
      [currentUser.id, currentUser.id, currentUser.id]
    );

    const result = [];

    for (const dialog of dialogs) {
      const otherUser = await getAsync(
        `SELECT id, username, avatar FROM users WHERE id = ?`,
        [dialog.other_user_id]
      );

      const lastMessage = await getAsync(
        `
        SELECT
          messages.text,
          messages.file_name,
          messages.file_type,
          sender.username AS from_user
        FROM messages
        JOIN users AS sender ON sender.id = messages.from_user_id
        WHERE messages.id = ?
        `,
        [dialog.last_message_id]
      );

      const unreadRow = await getAsync(
        `
        SELECT COUNT(*) AS unreadCount
        FROM messages
        WHERE from_user_id = ? AND to_user_id = ?
        `,
        [dialog.other_user_id, currentUser.id]
      );

      let previewText = lastMessage ? lastMessage.text : "";

      if (!previewText && lastMessage && lastMessage.file_name) {
        if ((lastMessage.file_type || "").startsWith("image/")) {
          previewText = "📷 Фото";
        } else {
          previewText = `📎 ${lastMessage.file_name}`;
        }
      }

      if (otherUser && lastMessage) {
        result.push({
          username: otherUser.username,
          avatar: otherUser.avatar || "",
          lastText: previewText,
          lastFromUser: lastMessage.from_user,
          unreadCount: unreadRow ? unreadRow.unreadCount : 0
        });
      }
    }

    return res.json(result);
  } catch {
    return res.status(500).json({ error: "Не удалось загрузить диалоги." });
  }
});

app.get("/api/dialogs-unread/:username", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();

    if (!username) {
      return res.status(400).json({ error: "Нужен username." });
    }

    const currentUser = await getAsync(`SELECT id FROM users WHERE username = ?`, [username]);

    if (!currentUser) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    const row = await getAsync(
      `
      SELECT COUNT(*) AS unreadCount
      FROM messages
      WHERE to_user_id = ? AND from_user_id != ?
      `,
      [currentUser.id, currentUser.id]
    );

    return res.json({
      unreadCount: row ? row.unreadCount : 0
    });
  } catch {
    return res.status(500).json({ error: "Не удалось загрузить уведомления." });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/profile", (req, res) => {
  res.sendFile(path.join(publicDir, "profile.html"));
});

app.get("/chat", (req, res) => {
  res.sendFile(path.join(publicDir, "chat.html"));
});

app.get("/dialogs", (req, res) => {
  res.sendFile(path.join(publicDir, "dialogs.html"));
});

app.get("/subscriptions", (req, res) => {
  res.sendFile(path.join(publicDir, "subscriptions.html"));
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});