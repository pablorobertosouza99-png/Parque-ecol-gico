# Back-end | Parque Ecológico Teresópolis

API REST inicial com Node.js, Express e SQLite. Inclui login administrativo com senha criptografada, token JWT, armazenamento de conteúdo e CRUD básico de comunicados.

## Requisitos
- Node.js 20 ou superior
- Um terminal (PowerShell, CMD ou terminal do VS Code)

## Instalação no Windows

1. Extraia a pasta `parque-ecologico-backend`.
2. Abra o terminal dentro dela.
3. Instale as dependências:

   ```bash
   npm install
   ```

4. Copie `.env.example` para `.env`.
5. Edite `.env`. Use uma senha de administrador nova e um segredo JWT aleatório com pelo menos 32 caracteres. Não publique o `.env`.
6. Se usar a extensão Live Server do VS Code, confirme a porta em que o front-end está rodando e ajuste `FRONTEND_ORIGIN`. Exemplo: `http://127.0.0.1:5500`. Se usar outra porta, atualize o valor.
7. Inicie o servidor:

   ```bash
   npm start
   ```

8. Abra `http://localhost:3000/api/health`. Deve aparecer `{"status":"ok","service":"Parque Ecológico API"}`.

O banco SQLite é criado automaticamente em `data/parque.db`.

## Rotas

| Método | Rota | Acesso | Finalidade |
|---|---|---|---|
| GET | `/api/health` | Público | Verificar se a API está ativa |
| POST | `/api/auth/login` | Público | Entrar e receber token |
| GET | `/api/content` | Público | Ler conteúdo publicado |
| PUT | `/api/content/:key` | Administrador | Salvar conteúdo por chave |
| GET | `/api/announcements` | Público | Listar comunicados |
| POST | `/api/announcements` | Administrador | Criar comunicado |
| DELETE | `/api/announcements/:id` | Administrador | Excluir comunicado |

Para rotas administrativas, envie `Authorization: Bearer SEU_TOKEN`.

## Exemplos de integração com o front-end

Crie `js/api.js` no front-end:

```js
const API_URL = "http://localhost:3000/api";
let adminToken = sessionStorage.getItem("parque_admin_token");

async function apiRequest(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Falha na requisição");
  return data;
}

async function loginAdmin(username, password) {
  const data = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  adminToken = data.token;
  sessionStorage.setItem("parque_admin_token", adminToken);
  return data;
}

function logoutAdmin() {
  adminToken = null;
  sessionStorage.removeItem("parque_admin_token");
}

async function saveContent(key, value) {
  return apiRequest(`/content/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ value })
  });
}

async function getContent() {
  return apiRequest("/content");
}

async function getAnnouncements() {
  return apiRequest("/announcements");
}

async function createAnnouncement(item) {
  return apiRequest("/announcements", {
    method: "POST",
    body: JSON.stringify(item)
  });
}

async function removeAnnouncement(id) {
  return apiRequest(`/announcements/${id}`, { method: "DELETE" });
}
```

Inclua o arquivo antes do script principal do site:

```html
<script src="js/api.js"></script>
<script src="js/script.js"></script>
```

Adapte os caminhos aos nomes reais dos seus arquivos.

### Exemplo: trocar o login local por login da API

No `adminLogin(event)` do seu front-end, substitua a comparação com `ADMIN_CREDENTIALS` por:

```js
async function adminLogin(event) {
  event.preventDefault();
  const username = document.getElementById("admin-username").value;
  const password = document.getElementById("admin-password").value;
  try {
    await loginAdmin(username, password);
    isLoggedIn = true;
    closeLoginModal();
    document.getElementById("admin").style.display = "block";
    document.getElementById("dashboard").classList.add("active");
    showToast("Login realizado com sucesso!", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}
```

### Exemplo: salvar um slide no banco

Dentro da função `updateSlide`, depois de recolher os campos, substitua a gravação atual via `window.dataSdk` por:

```js
await saveContent(`slide-${slideNumber}`, {
  title, description, info1, info2, info3, imageUrl
});
```

Para carregar esses dados ao iniciar a página, use `getContent()` e aplique os valores ao DOM. Faça isso depois que o HTML estiver carregado.

### Exemplo: comunicados

- Listar: `const items = await getAnnouncements()`
- Criar: `await createAnnouncement({ title, content, type, priority })`
- Excluir: `await removeAnnouncement(id)`

O ID de comunicado agora é numérico e vem do banco. Ajuste o `renderAnnouncements()` para usar `announcement.id`.

## Observações importantes

- Remova as credenciais de demonstração do HTML. A senha não deve ficar no front-end.
- O token fica em `sessionStorage` neste exemplo, o que é simples para um projeto didático, mas não elimina riscos de XSS. Para produção, prefira cookies `HttpOnly`, `Secure`, `SameSite`, HTTPS, proteção contra tentativas repetidas de login e uma política de implantação adequada.
- SQLite é ótimo para desenvolvimento e projetos pequenos. Para hospedagem com vários usuários ou escalabilidade, considere PostgreSQL.
- Esta API salva conteúdo genérico por chave e comunicados. Para integrar todos os campos do site, adapte as funções de atualização e inicialização conforme os IDs existentes no HTML.
- Se o navegador informar erro de CORS, ajuste `FRONTEND_ORIGIN` para a origem exata do front-end e reinicie o servidor.
