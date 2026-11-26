import config from "../../shared/config/config.json" with { type: "json" };

const DB_URL = config.server_url.db_server;
const USER_PATH = "/internal/v1/=/users";

function getServiceToken() {
  const token = process.env.DB_SERVICE_TOKEN;
  if (!token) {
    const error = new Error("DB_SERVICE_TOKEN is not configured.");
    error.status = 503;
    throw error;
  }
  return token;
}

function parseUser(value) {
  const user =
    typeof value === "object" && value !== null && "user" in value
      ? value.user
      : value;

  if (
    typeof user !== "object" ||
    user === null ||
    typeof user.id !== "string" ||
    typeof user.email !== "string" ||
    typeof user.password_hash !== "string" ||
    typeof user.credential_version !== "number" ||
    typeof user.role !== "string"
  ) {
    const error = new Error(
      "DB server returned an invalid authentication record.",
    );
    error.status = 502;
    throw error;
  }

  const displayName =
    typeof user.display_name === "string"
      ? user.display_name
      : typeof user.name === "string"
        ? user.name
        : "";
  if (!displayName) {
    const error = new Error(
      "DB server returned an invalid authentication record.",
    );
    error.status = 502;
    throw error;
  }

  return {
    id: user.id,
    email: user.email,
    passwordHash: user.password_hash,
    credentialVersion: user.credential_version,
    displayName,
    role: user.role,
  };
}

export function createUserRepository({
  fetchImpl = fetch,
  dbUrl = DB_URL,
  serviceToken = getServiceToken,
} = {}) {
  async function request(path, init = {}) {
    const token = serviceToken();
    const response = await fetchImpl(`${dbUrl}${path}`, {
      ...init,
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      const error = new Error(`DB server request failed (${response.status}).`);
      error.status = response.status === 409 ? 409 : 502;
      throw error;
    }

    if (response.status === 204) return null;
    return response.json();
  }

  return {
    async findByEmail(email) {
      const p = `${USER_PATH}/by-email/${encodeURIComponent(email)}`;
      const user = await request(p);

      return user === null ? null : parseUser(user);
    },

    async findById(id) {
      const user = await request(`${USER_PATH}/${encodeURIComponent(id)}`);
      return user === null ? null : parseUser(user);
    },

    async createFromLinkedIn({ identity, passwordHash }) {
      const value = await request("/internal/v1/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          identity: {
            linkedin_sub: identity.sub,
            email: identity.email,
            email_verified: true,
            name: identity.name,
            given_name: identity.given_name,
            family_name: identity.family_name,
          },
          password_hash: passwordHash,
        }),
      });
      return parseUser(value);
    },
  };
}
