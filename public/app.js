const API = "";
let currentUser = localStorage.getItem("bek_username") || "";
let currentCategory = "Все";
let currentFeedType = "all";
let categories = ["Все"];

const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const avatarInput = document.getElementById("avatarInput");
const avatarBtn = document.getElementById("avatarBtn");
const bioInput = document.getElementById("bioInput");
const birthdayInput = document.getElementById("birthdayInput");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const createPostBtn = document.getElementById("createPostBtn");
const postContent = document.getElementById("postContent");
const postImage = document.getElementById("postImage");
const postCategory = document.getElementById("postCategory");
const postsEl = document.getElementById("posts");
const currentUserBox = document.getElementById("currentUserBox");
const profileName = document.getElementById("profileName");
const avatarPreview = document.getElementById("avatarPreview");
const authCard = document.getElementById("authCard");
const profileCard = document.getElementById("profileCard");
const postCard = document.getElementById("postCard");
const dialogsBadge = document.getElementById("dialogsBadge");
const followersBadge = document.getElementById("followersBadge");
const categoryFilters = document.getElementById("categoryFilters");
const feedTypeFilters = document.getElementById("feedTypeFilters");

registerBtn.addEventListener("click", register);
loginBtn.addEventListener("click", login);
logoutBtn.addEventListener("click", logout);
avatarBtn.addEventListener("click", uploadAvatar);
saveProfileBtn.addEventListener("click", saveProfile);
createPostBtn.addEventListener("click", createPost);

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    };
    return map[char];
  });
}

function updateUI() {
  if (currentUser) {
    currentUserBox.textContent = `@${currentUser}`;
    profileName.textContent = `@${currentUser}`;
    authCard.style.display = "none";
    profileCard.style.display = "block";
    postCard.style.display = "block";
    loadUnreadDialogsCount();
    loadUnreadFollowersCount();
  } else {
    currentUserBox.textContent = "Гость";
    profileName.textContent = "—";
    authCard.style.display = "block";
    profileCard.style.display = "none";
    postCard.style.display = "none";
    avatarPreview.removeAttribute("src");
    avatarPreview.style.display = "none";
    if (dialogsBadge) dialogsBadge.style.display = "none";
    if (followersBadge) followersBadge.style.display = "none";
    currentFeedType = "all";
    renderFeedTypeFilters();
  }
}

function renderCategorySelect() {
  if (!postCategory) return;

  const onlyRealCategories = categories.filter((item) => item !== "Все");
  postCategory.innerHTML = onlyRealCategories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("");
}

function renderCategoryFilters() {
  if (!categoryFilters) return;

  categoryFilters.innerHTML = categories.map((category) => `
    <button
      type="button"
      class="filter-chip ${currentCategory === category ? "active" : ""}"
      data-category="${escapeHtml(category)}"
    >
      ${escapeHtml(category)}
    </button>
  `).join("");

  categoryFilters.querySelectorAll(".filter-chip").forEach((btn) => {
    btn.addEventListener("click", async () => {
      currentCategory = btn.dataset.category;
      renderCategoryFilters();
      await loadPosts();
    });
  });
}

function renderFeedTypeFilters() {
  if (!feedTypeFilters) return;

  const items = [
    { key: "all", label: "Все посты" },
    { key: "following", label: "Подписки" }
  ];

  feedTypeFilters.innerHTML = items.map((item) => `
    <button
      type="button"
      class="filter-chip ${currentFeedType === item.key ? "active" : ""}"
      data-feed="${item.key}"
      ${item.key === "following" && !currentUser ? "disabled" : ""}
    >
      ${item.label}
    </button>
  `).join("");

  feedTypeFilters.querySelectorAll(".filter-chip").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      currentFeedType = btn.dataset.feed;
      renderFeedTypeFilters();
      await loadPosts();
    });
  });
}

async function loadCategories() {
  try {
    const res = await fetch(`${API}/api/categories`);
    const data = await res.json();

    if (!res.ok || !Array.isArray(data) || !data.length) {
      categories = ["Все", "Игры", "Семья", "История", "Юмор", "Другое"];
    } else {
      categories = ["Все", ...data];
    }
  } catch {
    categories = ["Все", "Игры", "Семья", "История", "Юмор", "Другое"];
  }

  renderCategorySelect();
  renderCategoryFilters();
  renderFeedTypeFilters();
}

async function register() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    alert("Введи ник и пароль.");
    return;
  }

  try {
    const res = await fetch(`${API}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Ошибка регистрации.");
      return;
    }

    currentUser = data.username;
    localStorage.setItem("bek_username", currentUser);

    usernameInput.value = "";
    passwordInput.value = "";

    updateUI();
    await loadCurrentProfile();
    await loadPosts();
  } catch {
    alert("Не удалось зарегистрироваться.");
  }
}

async function login() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    alert("Введи ник и пароль.");
    return;
  }

  try {
    const res = await fetch(`${API}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Ошибка входа.");
      return;
    }

    currentUser = data.username;
    localStorage.setItem("bek_username", currentUser);

    usernameInput.value = "";
    passwordInput.value = "";

    updateUI();
    await loadCurrentProfile();
    await loadPosts();
  } catch {
    alert("Не удалось войти.");
  }
}

function logout() {
  currentUser = "";
  localStorage.removeItem("bek_username");
  usernameInput.value = "";
  passwordInput.value = "";
  bioInput.value = "";
  birthdayInput.value = "";
  avatarInput.value = "";
  postContent.value = "";
  postImage.value = "";
  if (postCategory) postCategory.selectedIndex = 0;
  updateUI();
  loadPosts();
}

async function uploadAvatar() {
  if (!currentUser) {
    alert("Сначала войди.");
    return;
  }

  if (!avatarInput.files[0]) {
    alert("Выбери картинку.");
    return;
  }

  try {
    const formData = new FormData();
    formData.append("avatar", avatarInput.files[0]);
    formData.append("username", currentUser);

    const res = await fetch(`${API}/api/avatar`, {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Не удалось загрузить аватар.");
      return;
    }

    avatarInput.value = "";
    await loadCurrentProfile();
    await loadPosts();
  } catch {
    alert("Не удалось загрузить аватар.");
  }
}

async function saveProfile() {
  if (!currentUser) {
    alert("Сначала войди.");
    return;
  }

  try {
    const res = await fetch(`${API}/api/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: currentUser,
        bio: bioInput.value.trim(),
        birthday: birthdayInput.value
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Не удалось сохранить профиль.");
      return;
    }

    await loadCurrentProfile();
  } catch {
    alert("Не удалось сохранить профиль.");
  }
}

async function createPost() {
  if (!currentUser) {
    alert("Сначала войди.");
    return;
  }

  const content = postContent.value.trim();
  const category = postCategory.value;

  if (!content) {
    alert("Напиши текст поста.");
    return;
  }

  if (!category) {
    alert("Выбери категорию.");
    return;
  }

  try {
    const formData = new FormData();
    formData.append("username", currentUser);
    formData.append("content", content);
    formData.append("category", category);

    if (postImage.files[0]) {
      formData.append("image", postImage.files[0]);
    }

    const res = await fetch(`${API}/api/posts`, {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Не удалось создать пост.");
      return;
    }

    postContent.value = "";
    postImage.value = "";
    postCategory.selectedIndex = 0;
    await loadPosts();
    await loadCurrentProfile();
  } catch {
    alert("Не удалось создать пост.");
  }
}

async function loadCurrentProfile() {
  if (!currentUser) return;

  try {
    const res = await fetch(
      `${API}/api/users/${encodeURIComponent(currentUser)}?viewer=${encodeURIComponent(currentUser)}`
    );
    const data = await res.json();

    if (!res.ok) return;

    profileName.textContent = `@${data.username}`;
    bioInput.value = data.bio || "";
    birthdayInput.value = data.birthday || "";

    if (data.avatar) {
      avatarPreview.src = data.avatar;
      avatarPreview.style.display = "block";
    } else {
      avatarPreview.removeAttribute("src");
      avatarPreview.style.display = "none";
    }
  } catch {}
}

async function reactToPost(postId, reactionType) {
  if (!currentUser) {
    alert("Сначала войди.");
    return;
  }

  try {
    const res = await fetch(`${API}/api/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: currentUser,
        targetType: "post",
        targetId: postId,
        reactionType
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Ошибка реакции.");
      return;
    }

    await loadPosts();
  } catch {
    alert("Ошибка реакции.");
  }
}

async function addComment(postId, input) {
  if (!currentUser) {
    alert("Сначала войди.");
    return;
  }

  const content = input.value.trim();

  if (!content) {
    alert("Напиши комментарий.");
    return;
  }

  try {
    const res = await fetch(`${API}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: currentUser,
        postId,
        content
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Ошибка комментария.");
      return;
    }

    input.value = "";
    await loadPosts();
  } catch {
    alert("Ошибка комментария.");
  }
}

async function subscribeToUser(username) {
  if (!currentUser) {
    alert("Сначала войди.");
    return;
  }

  try {
    const res = await fetch(`${API}/api/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        follower: currentUser,
        following: username
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Не удалось подписаться.");
      return;
    }

    await loadPosts();
    await loadUnreadFollowersCount();
  } catch {
    alert("Не удалось подписаться.");
  }
}

async function loadUnreadDialogsCount() {
  if (!currentUser || !dialogsBadge) {
    if (dialogsBadge) dialogsBadge.style.display = "none";
    return;
  }

  try {
    const res = await fetch(`${API}/api/dialogs-unread/${encodeURIComponent(currentUser)}`);
    const data = await res.json();

    if (!res.ok) {
      dialogsBadge.style.display = "none";
      return;
    }

    const count = Number(data.unreadCount || 0);

    if (count > 0) {
      dialogsBadge.textContent = count > 99 ? "99+" : String(count);
      dialogsBadge.style.display = "inline-flex";
    } else {
      dialogsBadge.style.display = "none";
    }
  } catch {
    dialogsBadge.style.display = "none";
  }
}

async function loadUnreadFollowersCount() {
  if (!currentUser || !followersBadge) {
    if (followersBadge) followersBadge.style.display = "none";
    return;
  }

  try {
    const res = await fetch(`${API}/api/followers-unread/${encodeURIComponent(currentUser)}`);
    const data = await res.json();

    if (!res.ok) {
      followersBadge.style.display = "none";
      return;
    }

    const count = Number(data.count || 0);

    if (count > 0) {
      followersBadge.textContent = count > 99 ? "99+" : String(count);
      followersBadge.style.display = "inline-flex";
    } else {
      followersBadge.style.display = "none";
    }
  } catch {
    followersBadge.style.display = "none";
  }
}

async function loadPosts() {
  try {
    const query = new URLSearchParams({
      category: currentCategory,
      feed: currentFeedType
    });

    if (currentUser) {
      query.set("viewer", currentUser);
    }

    const res = await fetch(`${API}/api/posts?${query.toString()}`);
    const posts = await res.json();

    if (!res.ok) {
      postsEl.innerHTML = `<div class="empty">${escapeHtml(posts.error || "Не удалось загрузить посты.")}</div>`;
      return;
    }

    if (!posts.length) {
      postsEl.innerHTML = `<div class="empty">По этому фильтру постов пока нет.</div>`;
      return;
    }

    postsEl.innerHTML = "";

    posts.forEach((post) => {
      const postEl = document.createElement("div");
      postEl.className = "post";

      postEl.innerHTML = `
        <div class="post-head">
          ${post.avatar ? `<img class="avatar" src="${post.avatar}" alt="avatar">` : `<div class="avatar"></div>`}
          <div>
            <div class="post-user-name">
              <a class="post-user-link" href="/profile?u=${encodeURIComponent(post.username)}">@${escapeHtml(post.username)}</a>
            </div>
            <div class="muted">${escapeHtml(post.created_at || "")}</div>
          </div>
        </div>

        <div class="post-category-badge">${escapeHtml(post.category || "Другое")}</div>

        <div class="post-content">${escapeHtml(post.content)}</div>
        ${post.image ? `<img class="post-image" src="${post.image}" alt="post image">` : ""}

        <div class="post-actions">
          <button class="small-btn like-btn">👍 ${post.likes}</button>
          <button class="small-btn dislike-btn">👎 ${post.dislikes}</button>
          ${currentUser && currentUser !== post.username
            ? `<button class="small-btn subscribe-btn">Подписаться</button>
               <a class="chat-link action-link" href="/chat?u=${encodeURIComponent(post.username)}">Чат</a>`
            : ""}
        </div>

        <div class="comments">
          <h3>Комментарии</h3>
          <div class="comment-list">
            ${
              post.comments.length
                ? post.comments.map((comment) => `
                  <div class="comment">
                    <div class="comment-head">
                      ${comment.avatar ? `<img class="avatar" src="${comment.avatar}" alt="avatar">` : `<div class="avatar"></div>`}
                      <div>
                        <a class="post-user-link" href="/profile?u=${encodeURIComponent(comment.username)}">@${escapeHtml(comment.username)}</a>
                      </div>
                    </div>
                    <div>${escapeHtml(comment.content)}</div>
                  </div>
                `).join("")
                : `<div class="muted">Комментариев пока нет.</div>`
            }
          </div>

          ${
            currentUser
              ? `
                <div class="comment-box">
                  <input class="comment-input" type="text" placeholder="Напиши комментарий" />
                  <button class="small-btn comment-send-btn">Отправить</button>
                </div>
              `
              : `<div class="muted">Войди, чтобы комментировать.</div>`
          }
        </div>
      `;

      const likeBtn = postEl.querySelector(".like-btn");
      const dislikeBtn = postEl.querySelector(".dislike-btn");

      likeBtn.addEventListener("click", () => reactToPost(post.id, "like"));
      dislikeBtn.addEventListener("click", () => reactToPost(post.id, "dislike"));

      const subscribeBtn = postEl.querySelector(".subscribe-btn");
      if (subscribeBtn) {
        subscribeBtn.addEventListener("click", () => subscribeToUser(post.username));
      }

      const commentInput = postEl.querySelector(".comment-input");
      const commentSendBtn = postEl.querySelector(".comment-send-btn");

      if (commentInput && commentSendBtn) {
        commentSendBtn.addEventListener("click", () => addComment(post.id, commentInput));
        commentInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") addComment(post.id, commentInput);
        });
      }

      postsEl.appendChild(postEl);
    });
  } catch {
    postsEl.innerHTML = `<div class="empty">Ошибка соединения.</div>`;
  }
}

async function init() {
  updateUI();
  await loadCategories();
  await loadCurrentProfile();
  await loadPosts();
  await loadUnreadDialogsCount();
  await loadUnreadFollowersCount();

  setInterval(() => {
    loadUnreadDialogsCount();
    loadUnreadFollowersCount();
  }, 3000);
}

init();